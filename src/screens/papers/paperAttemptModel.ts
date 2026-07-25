export function selectNewestInProgressAttempt<T extends { grading_status?: string }>(
  attempts: readonly T[],
): T | undefined {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (attempts[index]?.grading_status === 'in_progress') return attempts[index]
  }
  return undefined
}
