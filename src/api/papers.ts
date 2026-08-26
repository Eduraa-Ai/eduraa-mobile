/**
 * Eduraa Mobile — Papers API
 */

import apiClient from "./client";
import { normalizeStandardValue } from "../data/authOptions";
import type { DownloadedPdf } from "../utils/pdfDownload";
import { normalizeQuestionVisualPayload } from "../utils/questionVisual";
import type {
  Paper,
  PaperListItem,
  PaperGenerateRequest,
  PaperSubmissionCreate,
  PaperSubmissionRead,
  PaperAttemptsResponse,
  PaperOptions,
  PaginatedResponse,
  Chapter,
} from "../types";

type JeeSyllabusResponse = {
  chapters?: Array<{
    key: string;
    title: string;
    standard?: string | null;
    subtopics?: string[];
  }>;
};

type JeeGenerateFormPaperResponse = {
  paper_id: string | null;
  draft_id: string;
  job_id: string;
  status: string;
  failed_count?: number;
  error?: string | null;
};

export type JeeGenerateFormPaperRequest = {
  exam_type: string;
  subject: string;
  chapter_keys: string[];
  count: number;
  question_marks: number;
  subtopic?: string;
  title: string;
  duration_minutes: number | null;
};

/**
 * Shape a standard for the `/chapters` query the way the web client does.
 * Numeric standards become `Std 11`; `Std 11` stays put; exam labels such as
 * `JEE (Mains & Advanced)` normalise to their stored form. Mirrors
 * `standardRequestValue` in the web's BlueprintExamMode.
 */
function standardRequestValue(value?: string | null): string | undefined {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return undefined;
  if (/^std\.?\s*/i.test(trimmed)) {
    const withoutPrefix = trimmed.replace(/^std\.?\s*/i, "").trim();
    return /^\d+$/.test(withoutPrefix)
      ? `Std ${withoutPrefix}`
      : normalizeStandardValue(withoutPrefix);
  }
  if (/^\d+$/.test(trimmed)) return `Std ${trimmed}`;
  return normalizeStandardValue(trimmed);
}

function downloadFilename(contentDisposition: unknown, fallback: string) {
  if (typeof contentDisposition !== "string") return fallback;
  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return contentDisposition.match(/filename="?([^";]+)"?/i)?.[1] || fallback;
}

function normalizePaperQuestionVisuals(paper: Paper): Paper {
  return {
    ...paper,
    questions: paper.questions.map((question) => ({
      ...question,
      visual_payload: normalizeQuestionVisualPayload(question),
    })),
  };
}

export const papersApi = {
  getOptions: async (): Promise<PaperOptions> => {
    const response = await apiClient.get<PaperOptions>("/papers/options");
    return response.data;
  },

  /**
   * Chapters for a subject — GET /chapters?subject_id=...&board=...&standard=...&indexed_only=true
   *
   * `board` and `standard` are load-bearing, not cosmetic. The backend only
   * narrows to books that actually hold questions once BOTH are present:
   * `indexed_only` + a non-class standard turns on its static-bank fallback,
   * which keeps only chapters with approved book MCQs and matches JEE books on
   * `board LIKE '%jee%'` (so a "JEE Mains" learner still reaches the
   * JEE-Advanced-labelled bank). Sending `subject_id` alone returns every
   * chapter of every book for that subject — including empty decoy chapters
   * that can never fill a book paper.
   */
  getChapters: async (
    subjectId: string,
    options?: { board?: string; standard?: string; indexedOnly?: boolean },
  ): Promise<Chapter[]> => {
    const board = options?.board?.trim() || undefined;
    const standard = standardRequestValue(options?.standard);
    const response = await apiClient.get<Chapter[]>("/chapters", {
      params: {
        subject_id: subjectId,
        board,
        standard,
        indexed_only: options?.indexedOnly ?? true,
      },
    });
    return response.data;
  },

  generate: async (data: PaperGenerateRequest): Promise<Paper> => {
    const response = await apiClient.post<Paper>("/papers/generate", data);
    return normalizePaperQuestionVisuals(response.data);
  },

  getJeeSyllabus: async (params: {
    exam_type: string;
    subject: string;
  }): Promise<JeeSyllabusResponse> => {
    const response = await apiClient.get<JeeSyllabusResponse>(
      "/ai/jee/syllabus",
      { params },
    );
    return response.data;
  },

  generateJeeFormPaper: async (
    data: JeeGenerateFormPaperRequest,
  ): Promise<JeeGenerateFormPaperResponse> => {
    const response = await apiClient.post<JeeGenerateFormPaperResponse>(
      "/ai/jee/generate-form-paper",
      data,
      { timeout: 240000 },
    );
    return response.data;
  },

  // Backend uses skip/limit (not page/size)
  list: async (params?: {
    skip?: number;
    limit?: number;
    subject_id?: string;
    status?: string;
    scope?: "mine";
  }): Promise<PaginatedResponse<PaperListItem>> => {
    const response = await apiClient.get<PaginatedResponse<PaperListItem>>(
      "/papers",
      { params },
    );
    return response.data;
  },

  getById: async (paperId: string): Promise<Paper> => {
    const response = await apiClient.get<Paper>(`/papers/${paperId}`);
    return normalizePaperQuestionVisuals(response.data);
  },

  submit: async (
    paperId: string,
    data: PaperSubmissionCreate,
  ): Promise<PaperSubmissionRead> => {
    const response = await apiClient.post<PaperSubmissionRead>(
      `/papers/${paperId}/submit`,
      data,
    );
    return response.data;
  },

  createAttempt: async (
    paperId: string,
    data?: { exam_id?: string; reason?: string },
  ): Promise<PaperSubmissionRead> => {
    const response = await apiClient.post<PaperSubmissionRead>(
      `/papers/${paperId}/attempts`,
      data,
    );
    return response.data;
  },

  listAttempts: async (
    paperId: string,
    params?: { exam_id?: string },
  ): Promise<PaperAttemptsResponse> => {
    const response = await apiClient.get<PaperAttemptsResponse>(
      `/papers/${paperId}/attempts`,
      { params },
    );
    return response.data;
  },

  getSubmission: async (
    paperId: string,
    params?: { exam_id?: string; attempt_id?: string },
  ): Promise<PaperSubmissionRead> => {
    const response = await apiClient.get<PaperSubmissionRead>(
      `/papers/${paperId}/submission`,
      { params },
    );
    return response.data;
  },

  downloadPdf: async (
    paperId: string,
    options?: { includeAnswers?: boolean },
  ): Promise<DownloadedPdf> => {
    const includeAnswers = options?.includeAnswers ?? false;
    const response = await apiClient.get<ArrayBuffer>(
      `/papers/${paperId}/export/pdf`,
      {
        params: { include_answers: includeAnswers },
        responseType: "arraybuffer",
        timeout: 120000,
      },
    );
    return {
      bytes: response.data,
      filename: downloadFilename(
        response.headers["content-disposition"],
        includeAnswers
          ? `eduraa-paper-${paperId}-answer-key.pdf`
          : `eduraa-paper-${paperId}.pdf`,
      ),
    };
  },

  delete: async (paperId: string): Promise<void> => {
    await apiClient.delete(`/papers/${paperId}`);
  },

  publish: async (paperId: string): Promise<Paper> => {
    const response = await apiClient.post<Paper>(`/papers/${paperId}/publish`);
    return normalizePaperQuestionVisuals(response.data);
  },
  // Returns the paper without its questions, so callers should refresh the
  // detail rather than replacing a cached paper with this response.
  updateTitle: async (paperId: string, title: string): Promise<void> => {
    await apiClient.patch(`/papers/${paperId}/title`, { title });
  },
  getInteractiveAssist: async (
    paperId: string,
    data: {
      question_id: string;
      mode: "hint" | "explain" | "mistake";
      student_answer?: string;
    },
  ): Promise<{ content: string }> => {
    const response = await apiClient.post(
      `/papers/${paperId}/interactive/assist`,
      data,
    );
    return response.data;
  },
};
