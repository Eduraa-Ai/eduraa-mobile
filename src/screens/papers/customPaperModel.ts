export type ManifestPhase =
  | 'extracting'
  | 'needs_confirmation'
  | 'failed'
  | 'confirmed'

export type ManifestIssueLike = {
  code: string
  message: string
  severity?: 'error' | 'warning'
  occurrence_id?: string | null
}

export type ManifestLike = {
  status?: string
  revision?: number
  manifest_sha256?: string | null
  validation_status?: string
  validation_report?: {
    errors?: ManifestIssueLike[]
    warnings?: ManifestIssueLike[]
    calculated_total_marks?: number | string | null
  }
  unresolved_items?: ManifestIssueLike[]
  extraction_metadata?: Record<string, unknown>
  occurrences?: Array<{
    occurrence_id?: string
    parent_occurrence_id?: string | null
    display_label?: string
    section_label?: string | null
    max_marks?: number | string | null
    resolution_status?: string
    question_content?: { question_text?: string | null; question_type?: string | null }
    issues?: ManifestIssueLike[]
  }>
}

export type ManifestReview = {
  phase: ManifestPhase
  isPolling: boolean
  canConfirm: boolean
  canRetry: boolean
  questionCount: number
  totalMarks: number | null
  errorCount: number
  warningCount: number
  unresolvedCount: number
  issues: ManifestIssueLike[]
}

export const CUSTOM_PDF_MAX_BYTES = 50 * 1024 * 1024

export type CustomPaperFileLike = {
  uri?: string
  name: string
  type?: string | null
  size?: number | null
  lastModified?: number | null
}

export type CustomPaperDraftIdentity = {
  titleLine1: string
  standard: string
  division: string
  subjectId: string
  questionPaper: CustomPaperFileLike
  answerKey: CustomPaperFileLike
}

export function validateCustomPaperFile(
  file: CustomPaperFileLike,
  label: string,
): string | null {
  const name = file.name.trim()
  const type = String(file.type ?? '').trim().toLowerCase()
  const hasPdfName = name.toLowerCase().endsWith('.pdf')
  const hasPdfType =
    !type || type === 'application/pdf' || type === 'application/octet-stream'

  if (!hasPdfName || !hasPdfType) return `${label} must be a PDF file.`
  if (file.size != null && file.size <= 0) {
    return `${label} is empty. Choose a PDF that contains at least one page.`
  }
  if (file.size != null && file.size > CUSTOM_PDF_MAX_BYTES) {
    return `${label} is larger than 50 MB. Choose a smaller PDF.`
  }
  return null
}

export function customPaperFilesMatch(
  first: CustomPaperFileLike,
  second: CustomPaperFileLike,
) {
  if (first.uri && second.uri && first.uri === second.uri) return true
  return Boolean(
    first.name === second.name &&
      first.size != null &&
      second.size != null &&
      first.size === second.size &&
      first.lastModified != null &&
      second.lastModified != null &&
      first.lastModified === second.lastModified,
  )
}

export function formatCustomPaperFileSize(size?: number | null) {
  if (!Number.isFinite(size) || Number(size) <= 0) return 'PDF selected'
  const bytes = Number(size)
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function customPaperDraftFingerprint(input: CustomPaperDraftIdentity) {
  const fileIdentity = (file: CustomPaperFileLike) => ({
    uri: file.uri ?? '',
    name: file.name,
    size: file.size ?? null,
    lastModified: file.lastModified ?? null,
  })
  return JSON.stringify({
    titleLine1: input.titleLine1.trim(),
    standard: input.standard.trim(),
    division: input.division.trim(),
    subjectId: input.subjectId.trim(),
    questionPaper: fileIdentity(input.questionPaper),
    answerKey: fileIdentity(input.answerKey),
  })
}

export function manifestProcessingStatus(manifest?: ManifestLike | null) {
  return String(manifest?.extraction_metadata?.processing_status ?? '').trim()
}

/**
 * Collapse the manifest's three issue channels into one de-duplicated list.
 *
 * The backend reports the same problem through `validation_report.errors`,
 * `warnings`, and `unresolved_items`, so a naive concatenation shows duplicates.
 */
export function manifestIssues(manifest?: ManifestLike | null): ManifestIssueLike[] {
  const report = manifest?.validation_report ?? {}
  const items = [
    ...(report.errors ?? []),
    ...(report.warnings ?? []),
    ...(manifest?.unresolved_items ?? []),
  ]
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.code}:${item.occurrence_id ?? ''}:${item.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function describeManifest(manifest?: ManifestLike | null): ManifestReview {
  const processing = manifestProcessingStatus(manifest)
  const confirmed = manifest?.status === 'confirmed'
  const reviewPrepared =
    processing === 'needs_confirmation' && Boolean(manifest?.manifest_sha256)
  const phase: ManifestPhase = confirmed
    ? 'confirmed'
    : processing === 'failed'
      ? 'failed'
      : reviewPrepared
        ? 'needs_confirmation'
        : 'extracting'

  const issues = manifestIssues(manifest)
  // Sub-parts carry their own occurrence rows, so only leaves are questions.
  const occurrences = manifest?.occurrences ?? []
  const parentIds = new Set(
    occurrences
      .map((item) => item.parent_occurrence_id)
      .filter((value): value is string => Boolean(value)),
  )
  const questionCount = occurrences.filter(
    (item) => !item.occurrence_id || !parentIds.has(item.occurrence_id),
  ).length
  const errorCount = issues.filter((item) => item.severity !== 'warning').length

  return {
    phase,
    isPolling: phase === 'extracting',
    canConfirm:
      phase === 'needs_confirmation' &&
      manifest?.validation_status === 'valid' &&
      occurrences.length > 0 &&
      errorCount === 0,
    canRetry:
      phase === 'failed' ||
      (phase === 'needs_confirmation' && manifest?.validation_status === 'invalid'),
    questionCount,
    totalMarks: toNumber(manifest?.validation_report?.calculated_total_marks),
    errorCount,
    warningCount: issues.filter((item) => item.severity === 'warning').length,
    unresolvedCount: occurrences.filter(
      (item) => item.resolution_status && item.resolution_status !== 'resolved',
    ).length,
    issues,
  }
}

/**
 * RFC 4122 v4 identifier for request fencing.
 *
 * React Native has no `crypto.randomUUID`, and these keys only need to be
 * unique per upload attempt rather than cryptographically strong.
 */
export function createIdempotencyKey(
  random: () => number = Math.random,
): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(random() * 16)
    const resolved = char === 'x' ? value : (value & 0x3) | 0x8
    return resolved.toString(16)
  })
}
