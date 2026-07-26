import type { PaperGenerateRequest } from "../types";

const BOOK_SHORTAGE_MESSAGE = "not enough questions in the book";

function errorDetail(error: unknown): string {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";

  const candidate = error as {
    message?: unknown;
    response?: { data?: { detail?: unknown } };
  };
  const detail = candidate.response?.data?.detail;
  if (typeof detail === "string") return detail;
  return typeof candidate.message === "string" ? candidate.message : "";
}

export function isBookQuestionShortage(error: unknown): boolean {
  return errorDetail(error).toLowerCase().includes(BOOK_SHORTAGE_MESSAGE);
}

/**
 * Largest-first candidate counts to try below `requestedCount`.
 *
 * Never yields 0 — a paper with no questions is not a useful fallback.
 */
export function getAvailableBookCountCandidates(
  requestedCount: number,
): number[] {
  const normalizedCount = Math.max(0, Math.floor(requestedCount));
  return Array.from(
    { length: Math.max(0, normalizedCount - 1) },
    (_, index) => normalizedCount - index - 1,
  ).filter((count) => count > 0);
}

export type BookAttemptResult<T> = { count: number; result: T };

/**
 * Find the largest question count the book bank can actually fill.
 *
 * The backend exposes no "how many approved questions do you have" endpoint, so
 * the count has to be probed. Availability is monotonic — if the bank can fill
 * `k` questions it can fill `k - 1` — which makes this a binary search over
 * `[1, requestedCount - 1]` rather than a walk down every count. For a 10
 * question request that is ~3 calls instead of 9.
 *
 * Only book-shortage errors narrow the search; anything else (auth, network,
 * validation) propagates immediately so real failures are not misreported as
 * an empty bank. Resolves `null` when even a single question is unavailable.
 */
export async function findLargestAvailableBookCount<T>(
  requestedCount: number,
  attempt: (count: number) => Promise<T>,
): Promise<BookAttemptResult<T> | null> {
  let low = 1;
  let high = Math.max(0, Math.floor(requestedCount)) - 1;
  let best: BookAttemptResult<T> | null = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    try {
      best = { count: mid, result: await attempt(mid) };
      low = mid + 1;
    } catch (error) {
      if (!isBookQuestionShortage(error)) throw error;
      high = mid - 1;
    }
  }

  return best;
}

export function withBookMcqCount(
  payload: PaperGenerateRequest,
  count: number,
): PaperGenerateRequest {
  const normalizedCount = Math.max(0, Math.floor(count));
  return {
    ...payload,
    mcq_count: normalizedCount,
    blueprint_header: payload.blueprint_header
      ? {
          ...payload.blueprint_header,
          target_marks: normalizedCount * (payload.marks_per_mcq ?? 1),
        }
      : undefined,
    blueprint_sections: payload.blueprint_sections?.map((section) =>
      section.question_type === "mcq"
        ? { ...section, slots: section.slots.slice(0, normalizedCount) }
        : section,
    ),
  };
}
