import type { GradingResultItem } from '../../types'

export type ReviewHighlight = {
  page: number
  bboxPercent: { left: number; top: number; width: number; height: number }
  confidence?: number
  uncertain: boolean
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function finite(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeRegion(value: unknown, legacy = false): ReviewHighlight | null {
  const region = record(value)
  if (!region) return null
  const bbox = legacy
    ? {
        left: region.left_percent,
        top: region.top_percent,
        width: region.width_percent,
        height: region.height_percent,
      }
    : record(region.bbox_percent ?? region.bbox)
  if (!bbox) return null

  const page = finite(region.page ?? region.page_number)
  let left = finite(bbox.left)
  let top = finite(bbox.top)
  let width = finite(bbox.width)
  let height = finite(bbox.height)
  if ([page, left, top, width, height].some((item) => item == null) || (page as number) < 1) return null

  // Manifest evidence may use normalized 0..1 boxes; review highlights use percentages.
  if ((left as number) <= 1 && (top as number) <= 1 && (width as number) <= 1 && (height as number) <= 1) {
    left = (left as number) * 100
    top = (top as number) * 100
    width = (width as number) * 100
    height = (height as number) * 100
  }
  if ((left as number) > 100 || (top as number) > 100 || (width as number) > 100 || (height as number) > 100) return null
  if ((width as number) < 0.2 || (height as number) < 0.2) return null

  const safeLeft = Math.max(0, Math.min(100, left as number))
  const safeTop = Math.max(0, Math.min(100, top as number))
  const right = Math.max(safeLeft + 0.2, Math.min(100, (left as number) + (width as number)))
  const bottom = Math.max(safeTop + 0.2, Math.min(100, (top as number) + (height as number)))
  const confidence = finite(region.confidence) ?? undefined
  return {
    page: Math.round(page as number),
    bboxPercent: { left: safeLeft, top: safeTop, width: right - safeLeft, height: bottom - safeTop },
    confidence,
    uncertain: region.is_uncertain === true || region.verification_passed === false || (confidence != null && confidence < 0.5),
  }
}

export function questionReviewHighlight(item?: GradingResultItem | null): ReviewHighlight | null {
  if (!item) return null
  const direct = record(item.highlight_region)
  const candidates: unknown[] = [
    direct?.primary_region,
    direct,
    ...(Array.isArray(item.highlight_regions) ? item.highlight_regions : []),
    ...(Array.isArray(item.evidence_citations) ? item.evidence_citations : []),
  ]
  for (const candidate of candidates) {
    const normalized = normalizeRegion(candidate)
    if (normalized) return normalized
  }
  return normalizeRegion(item.answer_image_bbox, true)
}

export function initialQuestionIndex(
  questions: readonly GradingResultItem[],
  questionId?: string,
  questionIndex?: number,
) {
  if (questionId) {
    const match = questions.findIndex((item) => item.question_id === questionId || item.result_id === questionId)
    if (match >= 0) return match
  }
  if (typeof questionIndex === 'number' && questionIndex >= 0 && questionIndex < questions.length) return questionIndex
  const pendingReview = questions.findIndex((item) => item.manual_review_requested && !item.manual_review_completed)
  if (pendingReview >= 0) return pendingReview
  return 0
}

export function clampReviewScore(value: number, maxScore?: number | null) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, maxScore != null && maxScore >= 0 ? Math.min(maxScore, value) : value)
}

export function questionWorkspaceLabel(item: GradingResultItem, index: number) {
  return `Q${item.question_number ?? index + 1}`
}

export function formatCheckedPaperDuration(seconds?: number | null) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  const wholeSeconds = Math.round(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const remaining = wholeSeconds % 60
  return `${minutes}m ${remaining.toString().padStart(2, '0')}s`
}

export function isLearningSupportInProgress(status?: string | null) {
  return status === 'pending' || status === 'running'
}
