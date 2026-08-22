import type { CheckedPaperProcessingBlocker } from '../../types'

export type StaffScanUploadMode = 'ai_generation_system' | 'custom_paper'

export function isPaperAvailableForUploadMode(
  sourceType: string | null | undefined,
  mode: StaffScanUploadMode,
) {
  return mode === 'custom_paper' && sourceType === 'custom_paper'
}

export function resolveScanUploadLink({
  isStaff,
  mode,
  selectedPaperId,
  selectedExamId,
}: {
  isStaff: boolean
  mode: StaffScanUploadMode
  selectedPaperId?: string | null
  selectedExamId?: string | null
}) {
  if (!isStaff) {
    return {
      paperId: selectedPaperId || null,
      examId: null,
      uploadMode: null,
    }
  }

  if (mode === 'custom_paper') {
    return {
      paperId: selectedPaperId || null,
      examId: null,
      uploadMode: mode,
    }
  }

  return {
    paperId: null,
    examId: selectedExamId || null,
    uploadMode: mode,
  }
}

export function resolveScanUploadStudentId({
  isStaff,
  selectedStudentId,
  authenticatedUserId,
}: {
  isStaff: boolean
  selectedStudentId?: string | null
  authenticatedUserId?: string | null
}) {
  return isStaff ? selectedStudentId || null : authenticatedUserId || null
}

// Mirrors the backend's V2 manifest pipeline status groupings exactly — do not
// invent new groupings client-side, since the backend can add stages between
// releases and any client-side reclassification would silently drift from it.
export const CHECKED_PAPER_COMPLETED_STATUSES = new Set([
  'graded',
  'auto_assessed',
  'pending_question_review',
])

export const CHECKED_PAPER_ACTIVE_STATUSES = new Set([
  'uploaded',
  'pending',
  'integrity_pending',
  'integrity_running',
  'integrity_verified',
  'evidence_pending',
  'evidence_inventory',
  'evidence_grouping',
  'attempt_grouping',
  'evidence_ready',
  'mapping_pending',
  'blind_mapping',
  'mapping_ready',
  'grading_pending',
  'grading',
  'rubric_grading',
  'policy_ready',
  'release_evaluation_pending',
  'completeness_challenge',
])

export const CHECKED_PAPER_STATUS_POLL_INTERVAL_MS = 3000

export function isCheckedPaperStatusCompleted(status?: string | null) {
  return CHECKED_PAPER_COMPLETED_STATUSES.has(String(status ?? ''))
}

export function isCheckedPaperStatusActive(status?: string | null) {
  return CHECKED_PAPER_ACTIVE_STATUSES.has(String(status ?? ''))
}

export function isCheckedPaperStatusBlocked(status?: string | null) {
  const value = String(status ?? '')
  return value.includes('needs_review') || value.includes('failed')
}

export type CheckedPaperExperienceStatus = 'checking' | 'ready_for_review' | 'needs_input' | 'published'

export function checkedPaperExperienceStatus(paper: {
  status?: string | null
  release_status?: string | null
  results_published?: boolean | null
  needs_review?: boolean | null
  manual_review_requested?: boolean | null
}): CheckedPaperExperienceStatus {
  if (paper.results_published || paper.release_status === 'published') return 'published'
  if (!paper.status) return 'checking'
  if (isCheckedPaperStatusActive(paper.status)) return 'checking'
  if (
    paper.needs_review
    || paper.manual_review_requested
    ||
    isCheckedPaperStatusBlocked(paper.status)
    || paper.status === 'pending_manual_review'
    || paper.status === 'needs_review'
    || paper.status === 'pending_question_review'
  ) return 'needs_input'
  return 'ready_for_review'
}

export const CHECKED_PAPER_EXPERIENCE_LABELS: Record<CheckedPaperExperienceStatus, string> = {
  checking: 'Checking',
  ready_for_review: 'Ready for review',
  needs_input: 'Needs your input',
  published: 'Published',
}

export function friendlyStage(status?: string | null) {
  return CHECKED_PAPER_EXPERIENCE_LABELS[checkedPaperExperienceStatus({ status })]
}

export function canContinueAsException(blockers: CheckedPaperProcessingBlocker[]) {
  return blockers.length > 0 && blockers.every((blocker) => blocker.resolvable_by_teacher)
}

export function normalizeStandard(value?: string | number | null) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/^(CLASS|STD)\.?\s*/, '')
    .replace(/^0+(?=\d)/, '')
}

export function normalizeDivision(value?: string | number | null) {
  return String(value ?? '').trim().toUpperCase()
}

export function matchesStandardDivision(
  student: { standard?: string | number | null; division?: string | number | null },
  target: { standard?: string | number | null; division?: string | number | null },
) {
  const standardTarget = normalizeStandard(target.standard)
  if (standardTarget && normalizeStandard(student.standard) !== standardTarget) return false
  const divisionTarget = normalizeDivision(target.division)
  if (divisionTarget && normalizeDivision(student.division) !== divisionTarget) return false
  return true
}

const UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  checked_paper_upload_mode_invalid: 'Choose "AI generated exam" or "Custom paper" before uploading.',
  checked_paper_upload_mode_mismatch: 'The selected paper does not match the chosen upload mode. Pick the paper again.',
  checked_paper_expected_page_count_invalid: 'Expected page count must be between 1 and 60.',
  CHECKED_PAPER_V2_MANIFEST_REQUIRED: 'This paper needs its answer key confirmed before it can be checked. Confirm the paper first.',
  GENERATED_PAPER_NOT_READY_FOR_CHECKING: 'This paper is not ready to be checked yet. Confirm the paper first.',
  CHECKED_PAPER_LEGACY_READ_ONLY: 'This older checked paper is read-only.',
  checked_paper_v2_b2c_integrity_unavailable: 'Checking is not available for this paper yet. No grading was started.',
}

export function friendlyUploadError(detail?: string | null, fallback = 'Unable to upload this scan.') {
  if (!detail) return fallback
  return UPLOAD_ERROR_MESSAGES[detail] || detail
}

export function generateIdempotencyKey() {
  let seed = Date.now() + Math.random() * 1_000_000_000
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
  return template.replace(/[xy]/g, (character) => {
    const random = (seed + Math.random() * 16) % 16 | 0
    seed = Math.floor(seed / 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}
