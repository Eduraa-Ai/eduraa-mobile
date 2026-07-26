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

export function getAvailableBookCountCandidates(
  requestedCount: number,
): number[] {
  const normalizedCount = Math.max(0, Math.floor(requestedCount));
  return Array.from(
    { length: Math.max(0, normalizedCount - 1) },
    (_, index) => normalizedCount - index - 1,
  );
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
