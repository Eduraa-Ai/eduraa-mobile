type PaperAttemptSummary = {
  id: string
  grading_status?: string
  results_visible_to_student?: boolean
  total_score?: number
  max_score?: number
}

const pendingStatuses = new Set(['submitted', 'checking'])

function normalizedStatus(attempt: PaperAttemptSummary) {
  return String(attempt.grading_status || 'checked').trim().toLowerCase()
}

export function selectNewestStartedAttempt<T extends PaperAttemptSummary>(
  attempts: readonly T[],
): T | undefined {
  return attempts.at(-1)
}

export function selectNewestSubmittedAttempt<T extends PaperAttemptSummary>(
  attempts: readonly T[],
): T | undefined {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (normalizedStatus(attempts[index]) !== 'in_progress') return attempts[index]
  }
  return undefined
}

export function isAttemptChecking(attempt?: PaperAttemptSummary) {
  return Boolean(attempt && pendingStatuses.has(normalizedStatus(attempt)))
}

export function isAttemptCheckDelayed(attempt?: PaperAttemptSummary) {
  return Boolean(attempt && normalizedStatus(attempt) === 'failed')
}

export function hasVisibleAttemptResult(attempt?: PaperAttemptSummary) {
  if (!attempt || attempt.results_visible_to_student === false) return false
  const status = normalizedStatus(attempt)
  return status !== 'in_progress' && !pendingStatuses.has(status) && status !== 'failed'
}

export function paperPrimaryAction(
  attempts: readonly PaperAttemptSummary[],
): 'attempt' | 'continue' | 'attempt_again' | 'view_results' {
  const submitted = selectNewestSubmittedAttempt(attempts)
  if (hasVisibleAttemptResult(submitted)) return 'view_results'
  if (submitted) return 'attempt_again'
  return normalizedStatus(selectNewestStartedAttempt(attempts) || { id: '' }) === 'in_progress'
    ? 'continue'
    : 'attempt'
}

export function visibleScore(attempt?: PaperAttemptSummary) {
  if (!hasVisibleAttemptResult(attempt)) return null
  if (
    typeof attempt?.total_score !== 'number'
    || typeof attempt.max_score !== 'number'
    || attempt.max_score <= 0
  ) {
    return null
  }
  return `${attempt.total_score} / ${attempt.max_score}`
}
