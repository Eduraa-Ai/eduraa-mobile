import type { CheckedPaper, CheckedPaperProcessingBlocker } from '../../types'

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

export function hasCheckedPaperReviewPayload(paper: {
  grading_results?: readonly unknown[] | null
  total_score?: number | null
  max_score?: number | null
}) {
  return Boolean(
    paper.grading_results?.length
    && typeof paper.total_score === 'number'
    && Number.isFinite(paper.total_score)
    && typeof paper.max_score === 'number'
    && Number.isFinite(paper.max_score)
    && paper.max_score > 0,
  )
}

export function checkedPaperReviewExperienceStatus(paper: {
  status?: string | null
  release_status?: string | null
  results_published?: boolean | null
  needs_review?: boolean | null
  manual_review_requested?: boolean | null
  grading_results?: readonly unknown[] | null
  total_score?: number | null
  max_score?: number | null
}): CheckedPaperExperienceStatus {
  const status = checkedPaperExperienceStatus(paper)
  if ((status === 'ready_for_review' || status === 'published') && !hasCheckedPaperReviewPayload(paper)) {
    return 'checking'
  }
  return status
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

export function checkedPaperBlockerMessage(blocker: CheckedPaperProcessingBlocker) {
  if (blocker.code === 'no_candidate_response_detected') {
    return 'Eduraa could not detect answer regions on the uploaded pages. Review the scan and set the final marks; a zero is not automatic.'
  }
  if (blocker.code === 'subject_identity_missing') {
    return 'Eduraa could not verify the subject for automatic release. Review the suggested marks and confirm the result.'
  }
  if (blocker.code === 'question_type_missing') {
    return 'Eduraa could not verify a question type for automatic release. Review the suggested marks and confirm the result.'
  }
  if (blocker.code === 'slice_not_calibrated') {
    return 'This question type needs teacher confirmation before release. Its suggested marks are ready to review.'
  }
  if (blocker.message?.trim()) return blocker.message.trim()
  return 'Eduraa needs a teacher to review this flag before the result can be approved.'
}

export function isReleaseConfidenceBlocker(blocker: CheckedPaperProcessingBlocker) {
  return [
    'subject_identity_missing',
    'question_type_missing',
    'slice_not_calibrated',
  ].includes(blocker.code)
}

export function uniqueCheckedPaperBlockers(
  blockers: CheckedPaperProcessingBlocker[] | null | undefined,
) {
  const seen = new Set<string>()
  return (blockers ?? []).filter((blocker) => {
    if (blocker.code === 'language_identity_missing') return false
    const key = blocker.issue_id || [
      blocker.code,
      checkedPaperBlockerMessage(blocker).toLocaleLowerCase(),
      ...(blocker.page_ids ?? []),
      ...(blocker.page_numbers ?? []),
      ...(blocker.occurrence_ids ?? []),
      ...(blocker.question_ids ?? []),
      ...(blocker.attempt_ids ?? []),
    ].join(':')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function checkingStageLabel(status?: string | null, processingStage?: string | null) {
  const token = String(processingStage || status || '').toLocaleLowerCase().replace(/[\s-]+/g, '_')
  if (token.includes('integrity')) return 'Checking page integrity'
  if (token.includes('evidence') || token.includes('inventory') || token.includes('grouping')) return 'Reading answer evidence'
  if (token.includes('mapping')) return 'Matching answers to questions'
  if (token.includes('grading') || token.includes('rubric') || token.includes('policy')) return 'Applying the marking rubric'
  if (token.includes('release') || token.includes('completeness')) return 'Running final checks'
  if (token.includes('uploaded') || token.includes('pending') || token.includes('queued')) return 'Queued for checking'
  return 'Checking the paper'
}

export function studentResponseSummaryFromFeedback(value: unknown) {
  const feedback = typeof value === 'string' ? value : ''
  const section = feedback.match(
    /\*\*Student response\*\*\s*([\s\S]*?)\s*\*\*Rubric evaluation\*\*/i,
  )?.[1]
  if (!section) return null
  const bullets = Array.from(section.matchAll(/^\s*[-*]\s+(.+?)\s*$/gm))
    .map((match) => match[1].replace(/`([^`]*)`/g, '$1').trim())
    .filter(Boolean)
  return bullets.length ? bullets.join('\n') : null
}

export type TeacherPaperDecision = {
  issueCount: number
  statusLabel: string
  title: string
  body: string
  actionLabel: string
  hasSuggestedResult: boolean
}

export function buildTeacherPaperDecision(
  paper: Pick<
    CheckedPaper,
    'status' | 'needs_review' | 'processing_blockers' | 'grading_results' | 'total_score' | 'max_score' | 'can_save_review'
  >,
): TeacherPaperDecision {
  const issues = uniqueCheckedPaperBlockers(paper.processing_blockers)
  const issueCount = issues.length
  const effectiveIssueCount = issueCount || 1
  const questionCount = paper.grading_results?.length ?? 0
  const hasSuggestedResult = questionCount > 0
    && typeof paper.total_score === 'number'
    && typeof paper.max_score === 'number'
  const issueLabel = `${effectiveIssueCount} check${effectiveIssueCount === 1 ? '' : 's'}`

  if (hasSuggestedResult && paper.needs_review && paper.can_save_review) {
    return {
      issueCount,
      statusLabel: issueLabel,
      title: `${issueLabel} need${effectiveIssueCount === 1 ? 's' : ''} confirmation`,
      body: `Eduraa graded all ${questionCount} questions and suggests ${paper.total_score}/${paper.max_score}. Review the checks, change any mark if needed, then confirm your result.`,
      actionLabel: issueCount ? `Review ${issueLabel}` : 'Review suggested result',
      hasSuggestedResult,
    }
  }

  if (String(paper.status).includes('failed')) {
    return {
      issueCount,
      statusLabel: 'Check failed',
      title: 'Checking could not finish',
      body: 'Your upload is safe. Open the scan issue to see what failed and the available recovery action.',
      actionLabel: 'Review scan issue',
      hasSuggestedResult,
    }
  }

  if (paper.needs_review) {
    return {
      issueCount,
      statusLabel: issueLabel,
      title: issueCount ? `${issueLabel} need${effectiveIssueCount === 1 ? 's' : ''} confirmation` : 'Check the uploaded script',
      body: 'Eduraa needs a teacher to verify the highlighted scan evidence before checking can continue.',
      actionLabel: 'Review scan issue',
      hasSuggestedResult,
    }
  }

  return {
    issueCount,
    statusLabel: 'Ready for review',
    title: 'Suggested result is ready',
    body: 'Review the suggested marks, make any corrections, then approve when the result reflects your decision.',
    actionLabel: 'Review suggested result',
    hasSuggestedResult,
  }
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
