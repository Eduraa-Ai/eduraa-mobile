import type { CheckedPaperProcessingBlocker } from '../../types'

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

const FRIENDLY_STAGE_LABELS: Record<string, string> = {
  uploaded: 'Scan received',
  pending: 'Queued for checking',
  integrity_pending: 'Queued for script integrity check',
  integrity_running: 'Checking script integrity',
  integrity_verified: 'Script integrity verified',
  integrity_needs_review: 'Script integrity needs your review',
  integrity_failed: 'Script integrity check failed',
  evidence_pending: 'Queued for answer reading',
  evidence_inventory: 'Reading answer pages',
  evidence_grouping: 'Grouping answer attempts',
  attempt_grouping: 'Grouping answer attempts',
  evidence_ready: 'Answer reading complete',
  evidence_needs_review: 'Answer reading needs your review',
  evidence_failed: 'Answer reading failed',
  mapping_pending: 'Queued for answer mapping',
  blind_mapping: 'Mapping answers to questions',
  mapping_ready: 'Answer mapping complete',
  mapping_needs_review: 'Answer mapping needs your review',
  mapping_failed: 'Answer mapping failed',
  grading_pending: 'Queued for grading',
  grading: 'Grading answers',
  rubric_grading: 'Grading answers',
  policy_ready: 'Grading complete, applying policy',
  grading_needs_review: 'Grading needs your review',
  grading_failed: 'Grading failed',
  release_evaluation_pending: 'Preparing results',
  completeness_challenge: 'Verifying completeness',
  release_evaluation_failed: 'Results preparation failed',
  auto_assessed: 'Auto-assessed',
  pending_question_review: 'Awaiting question review',
  graded: 'Graded',
  pending_manual_review: 'Pending manual review',
}

export function friendlyStage(status?: string | null) {
  const value = String(status ?? '')
  return FRIENDLY_STAGE_LABELS[value] || (value ? value.replace(/_/g, ' ') : 'Processing')
}

export function canContinueAsException(blockers: CheckedPaperProcessingBlocker[]) {
  return blockers.length > 0 && blockers.every((blocker) => blocker.resolvable_by_teacher)
}

export function canRetryEvidence(status?: string | null, blockers: CheckedPaperProcessingBlocker[] = []) {
  return status === 'evidence_failed' && blockers.some((blocker) => blocker.stage === 'answer_reading')
}

export function canRetryGrading(status?: string | null, blockers: CheckedPaperProcessingBlocker[] = []) {
  return status === 'grading_failed' && blockers.some((blocker) => blocker.stage === 'rubric_grading')
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
  CHECKED_PAPER_LEGACY_READ_ONLY: 'This checked paper is on the legacy pipeline and is read-only.',
  checked_paper_v2_b2c_integrity_unavailable: 'This account type does not support the new checking pipeline yet.',
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
