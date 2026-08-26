export const DEFAULT_SCAN_UPLOAD_LIMITS = {
  maxFiles: 20,
  maxFileBytes: 50 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
} as const

export type ScanUploadLimits = {
  maxFiles: number
  maxFileBytes: number
  maxTotalBytes: number
}

export type ScanFileDescriptor = {
  uri: string
  name: string
  type: string
  size?: number | null
}

export type ScanUploadReadinessInput = {
  isStudent: boolean
  assessmentSelected: boolean
  studentSelected: boolean
  subjectResolved: boolean
  fileCount: number
  fileIssue?: string | null
}

export function scanUploadReadiness(input: ScanUploadReadinessInput) {
  if (!input.assessmentSelected) return { ready: false, message: 'Choose the paper or exam first.' }
  if (!input.isStudent && !input.studentSelected) return { ready: false, message: 'Choose the student.' }
  if (!input.subjectResolved) return { ready: false, message: 'This assessment is missing its subject.' }
  if (!input.fileCount) return { ready: false, message: 'Add at least one PDF or page image.' }
  if (input.fileIssue) return { ready: false, message: input.fileIssue }
  return { ready: true, message: 'Ready to upload securely.' }
}

function normalizedName(value: string) {
  return value.trim().toLocaleLowerCase()
}

export function scanFileIdentity(file: Pick<ScanFileDescriptor, 'name' | 'size'>) {
  return `${normalizedName(file.name)}:${file.size ?? 'unknown'}`
}

export function validateAndMergeScanFiles<T extends ScanFileDescriptor>(
  current: readonly T[],
  incoming: readonly T[],
  limits: ScanUploadLimits = DEFAULT_SCAN_UPLOAD_LIMITS,
) {
  const accepted = [...current]
  const identities = new Set(current.map(scanFileIdentity))
  const rejected: Array<{ file: T; reason: string }> = []
  let totalBytes = current.reduce((total, file) => total + Math.max(0, file.size ?? 0), 0)

  for (const file of incoming) {
    if (accepted.length >= limits.maxFiles) {
      rejected.push({ file, reason: `Only ${limits.maxFiles} files can be uploaded at once.` })
      continue
    }

    const identity = scanFileIdentity(file)
    if (identities.has(identity)) {
      rejected.push({ file, reason: 'This file is already in the page list.' })
      continue
    }

    if (typeof file.size === 'number' && file.size > limits.maxFileBytes) {
      rejected.push({ file, reason: `Each file must be ${formatBytes(limits.maxFileBytes)} or smaller.` })
      continue
    }

    const nextTotal = totalBytes + Math.max(0, file.size ?? 0)
    if (nextTotal > limits.maxTotalBytes) {
      rejected.push({ file, reason: `The combined upload must be ${formatBytes(limits.maxTotalBytes)} or smaller.` })
      continue
    }

    accepted.push(file)
    identities.add(identity)
    totalBytes = nextTotal
  }

  return { files: accepted, rejected, totalBytes }
}

export function moveScanFile<T>(files: readonly T[], fromIndex: number, toIndex: number) {
  if (
    fromIndex < 0
    || fromIndex >= files.length
    || toIndex < 0
    || toIndex >= files.length
    || fromIndex === toIndex
  ) return [...files]

  const next = [...files]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

export function replaceScanFile<T extends ScanFileDescriptor>(
  files: readonly T[],
  index: number,
  replacement: T,
  limits: ScanUploadLimits = DEFAULT_SCAN_UPLOAD_LIMITS,
) {
  if (index < 0 || index >= files.length) {
    return { files: [...files], rejected: [{ file: replacement, reason: 'The page to replace is no longer available.' }] }
  }
  const withoutTarget = files.filter((_, itemIndex) => itemIndex !== index)
  const result = validateAndMergeScanFiles(withoutTarget, [replacement], limits)
  if (result.rejected.length) return { files: [...files], rejected: result.rejected }
  const next = [...result.files]
  const inserted = next.pop() as T
  next.splice(index, 0, inserted)
  return { files: next, rejected: [] as Array<{ file: T; reason: string }> }
}

export function formatBytes(bytes?: number | null) {
  if (!bytes) return 'Size unavailable'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

export function uploadIssueMessage(rejected: ReadonlyArray<{ file: { name: string }; reason: string }>) {
  if (!rejected.length) return null
  const first = rejected[0]
  const extra = rejected.length > 1 ? ` ${rejected.length - 1} more file${rejected.length === 2 ? '' : 's'} were not added.` : ''
  return `${first.file.name}: ${first.reason}${extra}`
}
