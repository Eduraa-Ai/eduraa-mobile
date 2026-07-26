type AttemptStatus = {
  id: string
  grading_status?: string
  results_visible_to_student?: boolean
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
