import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  isPaperGenerationActive,
  paperGenerationJobsApi,
  type PaperGenerationJob,
} from "../../api/paperGenerationJobs";
import type { PaperGenerateRequest } from "../../types";

const POLL_INTERVAL_MS = 2000;

type Options = {
  onCompleted: (paperId: string) => void;
  onFailed: (message: string) => void;
};

/**
 * Track one background paper-generation job through to a saved paper.
 *
 * The job outlives the request that queued it, so a job that is already running
 * is adopted on mount and whenever the app returns to the foreground. That keeps
 * a backgrounded phone, a dropped connection, or a 409 from a duplicate start
 * from stranding a paper the worker is still writing.
 */
export function usePaperGenerationJob({ onCompleted, onFailed }: Options) {
  const [job, setJob] = useState<PaperGenerationJob | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const jobIdRef = useRef<string | null>(null);
  const settledRef = useRef(false);
  const callbacks = useRef({ onCompleted, onFailed });
  callbacks.current = { onCompleted, onFailed };

  const settle = useCallback((next: PaperGenerationJob) => {
    if (settledRef.current) return;
    settledRef.current = true;
    jobIdRef.current = null;
    if (next.status === "completed" && next.paper_id) {
      callbacks.current.onCompleted(next.paper_id);
      return;
    }
    callbacks.current.onFailed(
      next.error_message?.trim() ||
        next.message?.trim() ||
        "The generator could not finish this paper. Adjust the scope and try again.",
    );
  }, []);

  const adopt = useCallback(
    (next: PaperGenerationJob | null) => {
      if (!next) return;
      settledRef.current = false;
      jobIdRef.current = next.job_id;
      setJob(next);
      if (!isPaperGenerationActive(next.status)) settle(next);
    },
    [settle],
  );

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      const jobId = jobIdRef.current;
      if (!jobId) return;
      try {
        const next = await paperGenerationJobsApi.getById(jobId);
        if (cancelled || jobIdRef.current !== jobId) return;
        setJob(next);
        if (!isPaperGenerationActive(next.status)) settle(next);
      } catch {
        // A dropped poll is recoverable; the next tick retries the same job.
      }
    };

    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [settle]);

  // Reconnect to a job the worker kept running while the app was backgrounded.
  useEffect(() => {
    const resume = () => {
      if (jobIdRef.current) return;
      void paperGenerationJobsApi
        .getActive()
        .then((active) => {
          if (active && isPaperGenerationActive(active.status)) adopt(active);
        })
        .catch(() => undefined);
    };

    resume();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") resume();
    });
    return () => subscription.remove();
  }, [adopt]);

  const start = useCallback(
    async (payload: PaperGenerateRequest) => {
      setIsStarting(true);
      try {
        adopt(await paperGenerationJobsApi.create(payload));
      } catch (error: any) {
        if (error?.response?.status === 409) {
          const active = await paperGenerationJobsApi
            .getActive()
            .catch(() => null);
          if (active) {
            adopt(active);
            return;
          }
        }
        throw error;
      } finally {
        setIsStarting(false);
      }
    },
    [adopt],
  );

  const reset = useCallback(() => {
    jobIdRef.current = null;
    settledRef.current = false;
    setJob(null);
  }, []);

  return {
    job,
    isStarting,
    isRunning: isPaperGenerationActive(job?.status),
    start,
    reset,
  };
}
