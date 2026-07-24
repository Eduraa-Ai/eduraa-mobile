import axios from 'axios'

const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429])

export function getHttpStatus(error: unknown) {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}

export function isDefinitiveAuthFailure(error: unknown) {
  const status = getHttpStatus(error)
  return status === 400 || status === 401 || status === 403
}

/**
 * Retry reads only when another attempt can reasonably succeed. Client errors
 * such as 404 are deterministic and should reach the recovery UI immediately.
 */
export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 2) return false
  if (!axios.isAxiosError(error)) return failureCount < 1
  if (error.code === 'ERR_CANCELED') return false

  const status = error.response?.status
  if (status == null) return true
  return RETRYABLE_HTTP_STATUSES.has(status) || status >= 500
}

export function queryRetryDelay(attemptIndex: number) {
  return Math.min(1000 * 2 ** attemptIndex, 8000)
}
