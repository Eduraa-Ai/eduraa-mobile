export type PaperDurationResult = {
  minutes: number | null
  error: string | null
}

export type AiPaperGenerationInput = {
  examType: string
  subject: string
  chapterKeys: string[]
  count: number
  marks: number
  subtopic?: string
  title: string
}

const DURATION_ERROR = 'Enter a positive whole number of minutes.'

export function parsePaperDuration(value: string): PaperDurationResult {
  const trimmed = value.trim()
  if (!trimmed) return { minutes: null, error: null }
  if (!/^\d+$/.test(trimmed)) {
    return { minutes: null, error: DURATION_ERROR }
  }

  const minutes = Number(trimmed)
  if (!Number.isSafeInteger(minutes) || minutes <= 0) {
    return { minutes: null, error: DURATION_ERROR }
  }

  return { minutes, error: null }
}

export function buildJeeFormPaperRequest(
  input: AiPaperGenerationInput,
  durationMinutes: number | null,
) {
  return {
    exam_type: input.examType,
    subject: input.subject,
    chapter_keys: input.chapterKeys,
    count: input.count,
    question_marks: input.marks,
    subtopic: input.subtopic,
    title: input.title,
    duration_minutes: durationMinutes,
  }
}
