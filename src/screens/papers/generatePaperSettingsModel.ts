export type PaperDurationResult = {
  minutes: number | null
  error: string | null
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
