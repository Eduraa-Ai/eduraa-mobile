export function selectNewestInProgressAttempt<T extends { grading_status?: string }>(
  attempts: readonly T[],
): T | undefined {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (attempts[index]?.grading_status === 'in_progress') return attempts[index]
  }
  return undefined
}

export function toggleSelectableAnswer(
  answers: Readonly<Record<string, string>>,
  questionId: string,
  value: string,
): Record<string, string> {
  const nextAnswers = { ...answers }
  if (nextAnswers[questionId] === value) {
    delete nextAnswers[questionId]
  } else {
    nextAnswers[questionId] = value
  }
  return nextAnswers
}

export function clampCheckingProgress(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(100, Math.max(0, Math.round(value)))
}
