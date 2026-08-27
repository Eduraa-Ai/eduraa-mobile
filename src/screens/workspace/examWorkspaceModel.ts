type AttemptStatus = {
  id: string
  grading_status?: string
  results_visible_to_student?: boolean
}

export type ExamSetupSubject = {
  id: string
  name: string
}

export type ExamSetupSection = {
  standard: string
  division: string
  subjects: ExamSetupSubject[]
}

type PaperDefaults = {
  title: string
  subject_id?: string | null
  standard?: string | null
  division?: string | null
  semester?: string | null
  duration_minutes?: number | null
}

export type ExamSetupDraft = {
  name: string
  subjectId: string
  standard: string
  division: string
  semester: string
  durationMinutes: string
}

function normalized(value: string) {
  return value.trim().toLowerCase()
}

function unique(values: readonly string[]) {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = normalized(value)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function intersectOrFallback(candidates: string[], allowed: readonly string[]) {
  const cleanAllowed = unique(allowed)
  if (cleanAllowed.length === 0) return unique(candidates)
  if (candidates.length === 0) return cleanAllowed
  const candidateKeys = new Set(candidates.map(normalized))
  return cleanAllowed.filter((value) => candidateKeys.has(normalized(value)))
}

export function filterSubjectsForTeacher<T extends ExamSetupSubject>(
  subjects: readonly T[],
  taughtSubjectNames: readonly string[],
) {
  const taught = new Set(taughtSubjectNames.map(normalized).filter(Boolean))
  if (taught.size === 0) return [...subjects]
  return subjects.filter((subject) => taught.has(normalized(subject.name)))
}

export function deriveExamSetupOptions(
  sections: readonly ExamSetupSection[],
  subjectId: string,
  standard: string,
  allowedStandards: readonly string[],
  allowedDivisions: readonly string[],
) {
  const subjectSections = subjectId
    ? sections.filter((section) => section.subjects.some((subject) => subject.id === subjectId))
    : [...sections]
  const standards = intersectOrFallback(subjectSections.map((section) => section.standard), allowedStandards)
  const standardKey = normalized(standard)
  const classSections = standardKey
    ? subjectSections.filter((section) => normalized(section.standard) === standardKey)
    : subjectSections
  const divisions = intersectOrFallback(classSections.map((section) => section.division), allowedDivisions)
  return { standards, divisions }
}

export function keepOrSelectOnly(value: string, options: readonly string[]) {
  const match = options.find((option) => normalized(option) === normalized(value))
  if (match) return match
  return options.length === 1 ? options[0] : ''
}

export function applyPaperDefaults<T extends ExamSetupDraft>(draft: T, paper: PaperDefaults): T {
  return {
    ...draft,
    name: draft.name.trim() ? draft.name : paper.title,
    subjectId: draft.subjectId || paper.subject_id || '',
    standard: draft.standard || paper.standard || '',
    division: draft.division || paper.division || '',
    semester: draft.semester || paper.semester || '',
    durationMinutes: draft.durationMinutes.trim()
      ? draft.durationMinutes
      : paper.duration_minutes
        ? String(paper.duration_minutes)
        : '',
  }
}

const pendingDownloadStatuses = new Set(['in_progress', 'submitted', 'checking', 'failed'])

export function isRetestableAttempt(attempt: AttemptStatus) {
  return String(attempt.grading_status || 'checked').toLowerCase() !== 'in_progress'
}

export function selectNewestRetestableAttempt<T extends AttemptStatus>(
  attempts: readonly T[],
): T | undefined {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (isRetestableAttempt(attempts[index])) return attempts[index]
  }
  return undefined
}

export function selectNewestDownloadableAttempt<T extends AttemptStatus>(
  attempts: readonly T[],
): T | undefined {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index]
    const status = String(attempt.grading_status || 'checked').toLowerCase()
    if (
      attempt.results_visible_to_student !== false
      && !pendingDownloadStatuses.has(status)
    ) {
      return attempt
    }
  }
  return undefined
}
