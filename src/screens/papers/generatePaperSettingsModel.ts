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

export type PaperGenerationStatus =
  | 'idle'
  | 'queued'
  | 'preparing'
  | 'generating'
  | 'validating'
  | 'saving'
  | 'completed'
  | 'failed'
  | 'cancelled'

type SubjectOption = { id: string; name: string }
type SectionOption = {
  standard: string
  division: string
  subjects: SubjectOption[]
}

export type ScopedPaperOptions = {
  divisions: string[]
  subjects: SubjectOption[]
}

const activeGenerationStatuses = new Set<PaperGenerationStatus>([
  'queued',
  'preparing',
  'generating',
  'validating',
  'saving',
])

function scopeKey(value?: string | null) {
  return String(value ?? '')
    .trim()
    .replace(/^std\.?\s*/i, '')
    .toLocaleLowerCase()
}

function uniqueBy<T>(items: T[], key: (item: T) => string) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const value = key(item)
    if (!value || seen.has(value)) return false
    seen.add(value)
    return true
  })
}

export function getScopedPaperOptions(
  sections: SectionOption[] | null | undefined,
  fallbackDivisions: string[],
  fallbackSubjects: SubjectOption[],
  standard: string,
  division: string,
): ScopedPaperOptions {
  if (!sections?.length) {
    return {
      divisions: uniqueBy(fallbackDivisions, scopeKey),
      subjects: uniqueBy(fallbackSubjects, (item) => item.id),
    }
  }

  const standardSections = standard
    ? sections.filter((section) => scopeKey(section.standard) === scopeKey(standard))
    : sections
  const divisions = uniqueBy(
    standardSections.map((section) => section.division),
    scopeKey,
  )
  const divisionSections = division
    ? standardSections.filter((section) => scopeKey(section.division) === scopeKey(division))
    : standardSections

  return {
    divisions,
    subjects: uniqueBy(
      divisionSections.flatMap((section) => section.subjects ?? []),
      (item) => item.id,
    ),
  }
}

export function isPaperGenerationActive(status?: PaperGenerationStatus | null) {
  return Boolean(status && activeGenerationStatuses.has(status))
}

export function generationProgressValue(progress?: number | null) {
  if (!Number.isFinite(progress)) return 0
  return Math.min(100, Math.max(0, Math.round(Number(progress))))
}

export function generationStatusLabel(status?: PaperGenerationStatus | null) {
  switch (status) {
    case 'queued':
      return 'Waiting for a generation worker'
    case 'preparing':
      return 'Preparing your paper structure'
    case 'generating':
      return 'Drafting questions from your school content'
    case 'validating':
      return 'Checking question order and marks'
    case 'saving':
      return 'Saving the canonical paper'
    case 'completed':
      return 'Paper ready'
    case 'cancelled':
      return 'Generation cancelled'
    case 'failed':
      return 'Generation stopped'
    default:
      return 'Reconnecting to paper generation'
  }
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
