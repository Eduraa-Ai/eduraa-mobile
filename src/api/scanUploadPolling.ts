export interface ScanUploadReceipt {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  checked_paper_id?: string | null
  error_code?: string | null
  error_message?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export const SCAN_UPLOAD_POLL_INTERVAL_MS = 2000
export const SCAN_UPLOAD_POLL_TIMEOUT_MS = 10 * 60 * 1000

export class AcceptedScanUploadError extends Error {
  readonly accepted = true

  constructor(
    message: string,
    readonly terminal: boolean,
  ) {
    super(message)
    this.name = 'AcceptedScanUploadError'
  }
}

export function isAcceptedScanUploadError(error: unknown): error is AcceptedScanUploadError {
  return error instanceof AcceptedScanUploadError
}

const receiptStatuses = new Set<ScanUploadReceipt['status']>([
  'pending',
  'processing',
  'completed',
  'failed',
])
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseScanUploadReceipt(value: unknown): ScanUploadReceipt | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ScanUploadReceipt>
  if (
    typeof candidate.id !== 'string'
    || !uuidPattern.test(candidate.id)
    || !candidate.status
    || !receiptStatuses.has(candidate.status)
  ) return null
  if (
    candidate.checked_paper_id != null
    && (typeof candidate.checked_paper_id !== 'string' || !uuidPattern.test(candidate.checked_paper_id))
  ) return null
  return {
    id: candidate.id,
    status: candidate.status,
    checked_paper_id: candidate.checked_paper_id ?? null,
    error_code: typeof candidate.error_code === 'string' ? candidate.error_code : null,
    error_message: typeof candidate.error_message === 'string' ? candidate.error_message : null,
    created_at: typeof candidate.created_at === 'string' ? candidate.created_at : null,
    updated_at: typeof candidate.updated_at === 'string' ? candidate.updated_at : null,
  }
}

function acceptedUploadError(receipt: ScanUploadReceipt) {
  if (receipt.status === 'failed') {
    return new AcceptedScanUploadError(
      receipt.error_message || 'The scan could not be checked. Please try the upload again.',
      true,
    )
  }
  if (receipt.status === 'completed' && !receipt.checked_paper_id) {
    return new AcceptedScanUploadError(
      'Your pages were processed, but the result could not be opened yet. Resume checking shortly.',
      false,
    )
  }
  return null
}

function waitForNextPoll(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AcceptedScanUploadError(
        'You stopped waiting, but your pages are saved and checking continues in the background.',
        false,
      ))
      return
    }

    const timer = setTimeout(finish, milliseconds)
    signal?.addEventListener('abort', cancel, { once: true })

    function finish() {
      signal?.removeEventListener('abort', cancel)
      resolve()
    }

    function cancel() {
      clearTimeout(timer)
      reject(new AcceptedScanUploadError(
        'You stopped waiting, but your pages are saved and checking continues in the background.',
        false,
      ))
    }
  })
}

export async function pollScanUpload(
  initial: ScanUploadReceipt,
  options: {
    load: (uploadId: string) => Promise<ScanUploadReceipt>
    signal?: AbortSignal
    intervalMs?: number
    timeoutMs?: number
  },
) {
  const deadline = Date.now() + (options.timeoutMs ?? SCAN_UPLOAD_POLL_TIMEOUT_MS)
  const interval = options.intervalMs ?? SCAN_UPLOAD_POLL_INTERVAL_MS
  let current = initial

  while (true) {
    if (current.status === 'completed' && current.checked_paper_id) {
      return current.checked_paper_id
    }
    const stateError = acceptedUploadError(current)
    if (stateError) throw stateError
    if (Date.now() >= deadline) {
      throw new AcceptedScanUploadError(
        'Checking is taking longer than usual. Your pages are saved and checking continues in the background.',
        false,
      )
    }

    await waitForNextPoll(interval, options.signal)
    try {
      current = await options.load(initial.id)
    } catch (error) {
      if (options.signal?.aborted) {
        throw new AcceptedScanUploadError(
          'You stopped waiting, but your pages are saved and checking continues in the background.',
          false,
        )
      }
      const responseStatus = (error as { response?: { status?: unknown } }).response?.status
      if (responseStatus === 403 || responseStatus === 404) {
        throw new AcceptedScanUploadError(
          'This saved upload is no longer available. Please upload the pages again.',
          true,
        )
      }
      // A network interruption cannot undo an accepted upload. Keep polling
      // instead of sending the user back into a duplicate submission.
      if (Date.now() >= deadline) {
        throw new AcceptedScanUploadError(
          'We could not refresh the status, but your pages are saved and checking continues in the background.',
          false,
        )
      }
    }
  }
}