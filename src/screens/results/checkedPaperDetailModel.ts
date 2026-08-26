import type { CheckedPaper, GradingResultItem } from '../../types'
import { normalizeMathContent } from '../../utils/mathContent'
import { hasCheckedPaperReviewPayload } from '../workspace/checkedPaperPipelineModel'

export type QuestionEvidenceTab = 'feedback' | 'details' | 'review'
export type CheckedPaperQuestionStatus = 'correct' | 'wrong' | 'missed' | 'pending'
export type QuestionOptionContextStatus = 'not_applicable' | 'complete' | 'partial' | 'unavailable'

export const CHECKED_PAPER_POLL_INTERVAL_MS = 3000

export interface QuestionReviewOption {
  key: string
  text: string
  imageUrl: string | null
  selected: boolean
  expected: boolean
}

export interface QuestionOptionContext {
  status: QuestionOptionContextStatus
  expectedCount: number | null
  actualCount: number
}

export interface QuestionReviewFigure {
  imageUrl: string
  altText: string
}

export interface DetailedExplanationSection {
  key: 'why_marks_cut' | 'potential_solutions' | 'hints' | 'easy_example' | 'recommendation'
  title: string
  content: string[]
  list: boolean
}

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  mcq: 'MCQ',
  short_answer: 'Short answer',
  long_answer: 'Long answer',
  fill_blank: 'Fill blank',
  match_columns: 'Match columns',
  true_false: 'True / false',
}

function legacyReadableMathText(value?: string | null) {
  if (!value) return ''
  return String(value)
    .replace(/\$\$([\s\S]*?)\$\$/g, ' $1 ')
    .replace(/\$([^$]*?)\$/g, ' $1 ')
    .replace(/\\(?:dfrac|tfrac|frac)\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)')
    .replace(/\\(?:mathrm|text|operatorname)\{([^{}]+)\}/g, '$1')
    .replace(/\\left|\\right/g, '')
    .replace(/\\times/g, 'x')
    .replace(/\\cdot/g, '·')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\%/g, '%')
    .replace(/[{}]/g, '')
    .replace(/\\([A-Za-z]+)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function unicodeReadableMathText(value?: string | null) {
  const symbols: Record<string, string> = {
    alpha: 'α',
    beta: 'β',
    gamma: 'γ',
    delta: 'δ',
    theta: 'θ',
    lambda: 'λ',
    mu: 'μ',
    pi: 'π',
    rho: 'ρ',
    sigma: 'σ',
    phi: 'φ',
    omega: 'ω',
  }
  let source = String(value || '')
  Object.entries(symbols).forEach(([name, symbol]) => {
    source = source.replace(new RegExp(`\\\\${name}\\b`, 'g'), symbol)
  })
  let next = legacyReadableMathText(source)
  const superscripts: Record<string, string> = {
    '0': '⁰',
    '1': '¹',
    '2': '²',
    '3': '³',
    '4': '⁴',
    '5': '⁵',
    '6': '⁶',
    '7': '⁷',
    '8': '⁸',
    '9': '⁹',
    '+': '⁺',
    '-': '⁻',
  }
  const subscripts: Record<string, string> = {
    '0': '₀',
    '1': '₁',
    '2': '₂',
    '3': '₃',
    '4': '₄',
    '5': '₅',
    '6': '₆',
    '7': '₇',
    '8': '₈',
    '9': '₉',
    '+': '₊',
    '-': '₋',
    '=': '₌',
    '(': '₍',
    ')': '₎',
    a: 'ₐ',
    e: 'ₑ',
    h: 'ₕ',
    i: 'ᵢ',
    j: 'ⱼ',
    k: 'ₖ',
    l: 'ₗ',
    m: 'ₘ',
    n: 'ₙ',
    o: 'ₒ',
    p: 'ₚ',
    r: 'ᵣ',
    s: 'ₛ',
    t: 'ₜ',
    u: 'ᵤ',
    v: 'ᵥ',
    x: 'ₓ',
  }

  Object.entries(symbols).forEach(([name, symbol]) => {
    next = next.replace(new RegExp(`\\b${name}\\b`, 'g'), symbol)
  })

  return next
    .replace(/\bsqrt\(([^)]+)\)/g, '√($1)')
    .replace(/_([A-Za-z0-9()+\-=]+)/g, (_match, subscript: string) => (
      subscript.split('').map((char) => subscripts[char] || char).join('')
    ))
    .replace(/\^\{?([0-9+-]+)\}?/g, (_match, exponent: string) => (
      exponent.split('').map((char) => superscripts[char] || char).join('')
    ))
}

export function readableMathText(value?: string | null) {
  const normalized = normalizeMathContent(value)
  return normalized.text || unicodeReadableMathText(value)
}

function normalizedToken(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
}

function recordValue(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  for (const key of keys) {
    if (record[key] != null) return record[key]
  }
  return undefined
}

export function hasMeaningfulAnswer(value: unknown): boolean {
  if (value == null) return false
  if (Array.isArray(value)) return value.some(hasMeaningfulAnswer)
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasMeaningfulAnswer)
  const token = normalizedToken(value)
  return Boolean(token && !['null', 'undefined', 'not answered', 'unanswered'].includes(token))
}

export function answerDisplay(value: unknown): string {
  if (!hasMeaningfulAnswer(value)) return ''
  if (Array.isArray(value)) return value.map(answerDisplay).filter(Boolean).join(', ')
  if (typeof value === 'object') {
    const display = recordValue(value, ['text', 'label', 'key', 'id', 'value', 'answer'])
    return display == null ? '' : answerDisplay(display)
  }
  return String(value).trim()
}

function toStringList(value: unknown) {
  if (Array.isArray(value)) return value.map(answerDisplay).filter(Boolean)
  const text = answerDisplay(value)
  return text ? text.split(/\r?\n/).map((line) => line.replace(/^[\s•*-]+/, '').trim()).filter(Boolean) : []
}

export function normalizeCheckedPaperStatus(value: unknown): CheckedPaperQuestionStatus | null {
  const token = normalizedToken(value).replace(/[\s-]+/g, '_')
  if (!token) return null
  if (['correct', 'fully_correct', 'right'].includes(token)) return 'correct'
  if (['partial', 'partially_correct', 'incorrect', 'wrong'].includes(token)) return 'wrong'
  if (['missed', 'unanswered', 'skipped', 'no_answer'].includes(token)) return 'missed'
  if (['pending', 'ungraded', 'processing'].includes(token)) return 'pending'
  return null
}

export function formatReportDate(value?: string | null) {
  if (!value) return 'Recent'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recent'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function checkedPaperTitle(paper: CheckedPaper) {
  return paper.exam_name || paper.subject_name || paper.identifier_text || 'Checked paper'
}

export function questionTypeLabel(item: GradingResultItem) {
  const raw = item.question_type || ''
  return QUESTION_TYPE_LABELS[raw] || raw.replace(/_/g, ' ') || 'Question'
}

// V2 manifest pipeline stages report a blocked state via a "_failed" or
// "_needs_review" suffix (e.g. "integrity_failed", "evidence_needs_review").
// Matching that substring keeps this detail screen in sync with those stages
// without having to enumerate every one here.
function isBlockedStatus(status: string) {
  return ['failed', 'error', 'grading_failed', 'checking_failed'].includes(status)
    || status.includes('needs_review')
    || status.includes('failed')
}

export function isCheckedPaperChecking(paper: CheckedPaper) {
  const status = normalizedToken(paper.status).replace(/[\s-]+/g, '_')
  if (isBlockedStatus(status)) return false
  if (paper.results_published || paper.release_status === 'published') return false
  if (paper.manual_review_requested || paper.needs_review || status === 'pending_manual_review') {
    return false
  }
  return ['submitted', 'checking', 'processing', 'uploaded'].includes(status)
    || !hasCheckedPaperReviewPayload(paper)
}

export function isCheckedPaperCheckFailed(paper: CheckedPaper) {
  const status = normalizedToken(paper.status).replace(/[\s-]+/g, '_')
  return status.includes('failed') && !(paper.grading_results?.length)
}

export function questionStatus(item: GradingResultItem): CheckedPaperQuestionStatus {
  const explicit = normalizeCheckedPaperStatus(item.result_status ?? item.status ?? item.correctness)
  if (explicit) return explicit
  const score = item.score ?? null
  const max = item.max_score ?? null
  if (score == null || max == null || max <= 0) return 'pending' as const
  if (score >= max) return 'correct' as const
  const response = item.response ?? item.student_answer ?? item.selected_answer
  if (!hasMeaningfulAnswer(response) && !hasEvaluatedScanEvidence(item)) return 'missed' as const
  return 'wrong' as const
}

function hasEvaluatedScanEvidence(item: GradingResultItem) {
  return Boolean(
    normalizedToken(item.policy_status) === 'evaluated'
    && ((Array.isArray(item.attempt_ids) && item.attempt_ids.length > 0)
      || (Array.isArray(item.evidence_citations) && item.evidence_citations.length > 0)),
  )
}

function parseOptionSource(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const candidate = value.trim()
  if (!candidate || (!candidate.startsWith('[') && !candidate.startsWith('{'))) return value
  try {
    return JSON.parse(candidate) as unknown
  } catch {
    return value
  }
}

function firstString(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = firstString(item)
      if (candidate) return candidate
    }
    return ''
  }
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeQuestionFigure(item: GradingResultItem): QuestionReviewFigure | null {
  const nestedQuestion = recordValue(item, ['question', 'question_data', 'question_details'])
  const rawVisual = recordValue(item, ['visual_payload', 'question_visual', 'question_image'])
    ?? recordValue(nestedQuestion, ['visual_payload', 'question_visual', 'question_image'])
  const visual = parseOptionSource(rawVisual)
  const imageUrl = firstString(recordValue(visual, ['asset_url', 'image_url', 'url', 'src']))
    || firstString(recordValue(visual, ['asset_urls', 'image_urls']))
    || firstString(recordValue(item, ['visual_asset_url', 'question_image_url', 'diagram_url']))
    || firstString(recordValue(nestedQuestion, ['visual_asset_url', 'question_image_url', 'diagram_url']))
  if (!imageUrl) return null

  const altText = firstString(recordValue(visual, ['alt_text', 'alt', 'caption', 'description']))
    || firstString(recordValue(item, ['visual_alt_text', 'question_image_alt']))
    || 'Diagram associated with this question'
  return { imageUrl, altText }
}

function normalizeRawOptions(value: unknown): Array<{ key: string; text: string; imageUrl: string | null }> {
  const parsed = parseOptionSource(value)
  const nested = parseOptionSource(recordValue(parsed, ['options', 'choices', 'items']))
  const candidate = nested ?? parsed
  const source = Array.isArray(candidate)
    ? candidate
    : candidate && typeof candidate === 'object'
      ? Object.entries(candidate as Record<string, unknown>).map(([key, option]) => (
        option && typeof option === 'object' && !Array.isArray(option)
          ? { ...(option as Record<string, unknown>), id: recordValue(option, ['id', 'key', 'label', 'option_id']) ?? key }
          : { id: key, text: option }
      ))
      : []

  return source.flatMap((option, index) => {
    if (typeof option === 'string' || typeof option === 'number') {
      return [{ key: String.fromCharCode(65 + index), text: String(option), imageUrl: null }]
    }
    if (!option || typeof option !== 'object' || Array.isArray(option)) return []
    const key = answerDisplay(recordValue(option, ['id', 'key', 'label', 'option_id'])) || String.fromCharCode(65 + index)
    const text = answerDisplay(recordValue(option, ['text', 'content', 'value', 'option']))
    const visual = recordValue(option, ['visual_payload'])
    const imageUrl = answerDisplay(recordValue(option, ['image_url', 'image', 'asset_url']))
      || answerDisplay(recordValue(visual, ['asset_url']))
      || null
    if (!text && !imageUrl) return []
    return [{ key, text, imageUrl }]
  })
}

function matchAnswer(value: unknown, options: Array<{ key: string; text: string }>) {
  const matches = new Set<string>()
  const matchOne = (candidate: unknown) => {
    if (!hasMeaningfulAnswer(candidate)) return
    if (Array.isArray(candidate)) {
      candidate.forEach(matchOne)
      return
    }
    if (typeof candidate === 'object') {
      const index = recordValue(candidate, ['index', 'option_index'])
      if (typeof index === 'number' && Number.isInteger(index) && options[index]) matches.add(options[index].key)
      const nested = recordValue(candidate, ['key', 'id', 'label', 'option_id', 'text', 'value', 'answer'])
      if (nested != null) matchOne(nested)
      return
    }
    if (typeof candidate === 'number' && Number.isInteger(candidate) && options[candidate]) {
      matches.add(options[candidate].key)
      return
    }

    const raw = String(candidate).trim()
    const token = normalizedToken(raw)
    const exact = options.find((option) => {
      const key = normalizedToken(option.key)
      const text = normalizedToken(option.text)
      return token === key
        || (Boolean(text) && token === text)
        || (Boolean(text) && token === `${key}. ${text}`)
        || (Boolean(text) && token === `${key}) ${text}`)
        || token.startsWith(`${key}.`)
        || token.startsWith(`${key})`)
    })
    if (exact) {
      matches.add(exact.key)
      return
    }
    if (/^\d+$/.test(raw)) {
      const index = Number(raw)
      if (options[index]) matches.add(options[index].key)
      return
    }
    if (/[,;|]/.test(raw)) raw.split(/[,;|]/).forEach(matchOne)
  }
  matchOne(value)
  return matches
}

export function normalizeQuestionOptions(item: GradingResultItem): QuestionReviewOption[] {
  const nestedQuestion = recordValue(item, ['question', 'question_data', 'question_details'])
  const optionSource = recordValue(item, ['options', 'question_options', 'choices'])
    ?? recordValue(nestedQuestion, ['options', 'question_options', 'choices'])
  const rawOptions = normalizeRawOptions(optionSource)
  const selected = matchAnswer(item.response ?? item.student_answer ?? item.selected_answer, rawOptions)
  const expected = matchAnswer(item.expected_answer, rawOptions)
  return rawOptions.map((option) => ({
    ...option,
    selected: selected.has(option.key),
    expected: expected.has(option.key),
  }))
}

function questionOptionContext(questionType: unknown, actualCount: number): QuestionOptionContext {
  const normalizedType = normalizedToken(questionType).replace(/\s+/g, '_')
  const expectedCount = normalizedType === 'mcq'
    ? 4
    : normalizedType === 'true_false'
      ? 2
      : null

  if (expectedCount == null) {
    return { status: 'not_applicable', expectedCount, actualCount }
  }
  if (actualCount === 0) {
    return { status: 'unavailable', expectedCount, actualCount }
  }
  if (actualCount < expectedCount) {
    return { status: 'partial', expectedCount, actualCount }
  }
  return { status: 'complete', expectedCount, actualCount }
}

export function buildDetailedExplanation(item: GradingResultItem): DetailedExplanationSection[] {
  const status = questionStatus(item)
  const unsuccessful = status === 'wrong' || status === 'missed'
  const selected = answerDisplay(item.response ?? item.student_answer ?? item.selected_answer)
  const expected = answerDisplay(item.expected_answer)
  const whyMarksCut = answerDisplay(item.why_marks_cut)
    || (unsuccessful ? answerDisplay(item.feedback) : '')
    || (unsuccessful && (selected || expected)
      ? `Selected: ${selected || 'Not answered'}; Expected: ${expected || 'Not available'}.`
      : '')
  const potentialSolutions = toStringList(item.solution_ideas ?? item.solution_steps ?? item.explanation)
  const hints = toStringList(item.hints)
  const easyExample = toStringList(item.easy_example)
  const recommendation = toStringList(item.recommendation)
  const sections: DetailedExplanationSection[] = []

  if (whyMarksCut) sections.push({ key: 'why_marks_cut', title: 'Why Marks Cut', content: [whyMarksCut], list: false })
  if (potentialSolutions.length) sections.push({ key: 'potential_solutions', title: 'Solution Steps', content: potentialSolutions, list: true })
  if (hints.length) sections.push({ key: 'hints', title: 'Hints', content: hints, list: true })
  if (easyExample.length) sections.push({ key: 'easy_example', title: 'Easy Example', content: easyExample, list: false })
  if (recommendation.length) sections.push({ key: 'recommendation', title: 'Recommendation', content: recommendation, list: false })
  return sections
}

export function buildQuestionReview(item: GradingResultItem) {
  const responseValue = item.response ?? item.student_answer ?? item.selected_answer
  const answerAvailable = hasMeaningfulAnswer(responseValue)
  const answerEvaluatedFromScan = !answerAvailable && hasEvaluatedScanEvidence(item)
  const nestedQuestion = recordValue(item, ['question', 'question_data', 'question_details'])
  const questionText = answerDisplay(recordValue(item, ['question_text', 'text', 'prompt']))
    || answerDisplay(recordValue(nestedQuestion, ['question_text', 'text', 'prompt']))
  const options = normalizeQuestionOptions(item)
  const questionFigure = normalizeQuestionFigure(item)
  const optionBased = ['mcq', 'true_false'].includes(normalizedToken(item.question_type).replace(/\s+/g, '_'))
  const optionContext = questionOptionContext(item.question_type, options.length)
  return {
    questionText,
    contextAvailable: Boolean(questionText),
    questionFigure,
    optionBased,
    options,
    optionContext,
    answerAvailable,
    answerEvaluatedFromScan,
    unanswered: !answerAvailable && !answerEvaluatedFromScan,
    studentAnswer: answerDisplay(responseValue),
    expectedAnswer: answerDisplay(item.expected_answer),
    detailedExplanation: buildDetailedExplanation(item),
  }
}

export function buildCheckedPaperReport(paper: CheckedPaper) {
  const questions = paper.grading_results ?? []
  const totalScore = paper.total_score ?? null
  const maxScore = paper.max_score ?? null
  const percent = totalScore != null && maxScore != null && maxScore > 0
    ? Math.max(0, Math.min(100, Math.round((totalScore / maxScore) * 100)))
    : null
  const correct = questions.filter((item) => questionStatus(item) === 'correct').length
  const wrong = questions.filter((item) => questionStatus(item) === 'wrong').length
  const missed = questions.filter((item) => questionStatus(item) === 'missed').length
  const pending = questions.filter((item) => questionStatus(item) === 'pending').length
  const firstRepair = questions.find((item) => ['wrong', 'missed'].includes(questionStatus(item)) && (item.recommendation || item.feedback)) ?? null
  const recoverableMarks = questions.reduce((sum, item) => {
    if (!['wrong', 'missed'].includes(questionStatus(item))) return sum
    return sum + Math.max(0, (item.max_score ?? 0) - (item.score ?? 0))
  }, 0)

  const published = Boolean(paper.results_published || paper.release_status === 'published')
  const hasUnresolvedBlocker = Boolean(paper.processing_blockers?.some((blocker) => !blocker.resolved_by_teacher))
  const needsInput = Boolean(
    paper.needs_review
    || hasUnresolvedBlocker
    || normalizedToken(paper.status).replace(/[\s-]+/g, '_').includes('needs_review'),
  )
  const provisional = !published && Boolean(paper.needs_review || hasUnresolvedBlocker || paper.status === 'pending_question_review')
  const headline = percent == null
    ? needsInput
      ? 'Checking paused.\nReview one issue to continue.'
      : 'Your diagnosis will appear when checking finishes.'
    : percent >= 85
      ? 'You own the core ideas.\nNow protect the final details.'
      : percent >= 65
        ? 'You understand the chapter.\nYour setup needs precision.'
        : percent >= 40
          ? 'The method is within reach.\nRepair the setup next.'
          : 'The first step is clear.\nRebuild one idea at a time.'

  const repairCount = wrong + missed
  const diagnosisTitle = percent == null
    ? needsInput
      ? 'Your paper needs a quick check.'
      : 'No need to refresh.'
    : repairCount > 0
      ? `Repair the setup in ${repairCount} question${repairCount === 1 ? '' : 's'}.`
      : 'Keep the method precise.'
  const diagnosisBody = readableMathText(
    percent == null
      ? needsInput
        ? paper.processing_blockers?.find((blocker) => !blocker.resolved_by_teacher)?.message
          || 'Open the paper status to review the issue and continue checking.'
        : 'This report updates automatically. You can leave and come back later.'
      : firstRepair?.recommendation || firstRepair?.feedback || paper.grading_feedback || 'Review each question and carry the strongest method into your next attempt.',
  )

  return { questions, totalScore, maxScore, percent, correct, wrong, missed, pending, firstRepair, recoverableMarks, repairCount, headline, diagnosisTitle, diagnosisBody, provisional }
}

export function pendingQuestionReviewItems(paper: CheckedPaper) {
  return (paper.grading_results ?? [])
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => Boolean(item.manual_review_requested && !item.manual_review_completed))
}

export function teacherReviewResponseNotification(item: GradingResultItem, index: number) {
  const thread = item.question_review_thread ?? []
  let latestStudentIndex = -1
  thread.forEach((entry, entryIndex) => {
    if (entry.author_role === 'student') latestStudentIndex = entryIndex
  })
  if (latestStudentIndex < 0) return null

  let teacherEntryIndex = -1
  for (let entryIndex = latestStudentIndex + 1; entryIndex < thread.length; entryIndex += 1) {
    if (thread[entryIndex]?.author_role === 'teacher') teacherEntryIndex = entryIndex
  }
  if (teacherEntryIndex < 0) return null
  const entry = thread[teacherEntryIndex]
  if (entry.student_notification_pending === false) return null
  const resultKey = item.result_id || item.question_id || `index-${index}`
  const eventKey = entry.created_at || `${entry.event_type || 'teacher-response'}-${teacherEntryIndex}`
  return { entry, keyPart: `${resultKey}:${eventKey}` }
}

export function reviewResponseNotificationKey(paperId: string, item: GradingResultItem, index: number) {
  const notification = teacherReviewResponseNotification(item, index)
  return notification ? `${paperId}:${notification.keyPart}` : null
}

export function hasUnreadTeacherReviewResponse(
  item: GradingResultItem,
  index = 0,
  paperId = '',
  seenKeys: ReadonlySet<string> = new Set(),
) {
  const key = reviewResponseNotificationKey(paperId, item, index)
  return Boolean(key && !seenKeys.has(key))
}

export function unreadQuestionReviewResponseItems(paper: CheckedPaper, seenKeys: ReadonlySet<string> = new Set()) {
  return (paper.grading_results ?? [])
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => hasUnreadTeacherReviewResponse(item, index, paper.id, seenKeys))
}

export function questionReviewLabel(item: GradingResultItem, index: number) {
  return `Question ${item.question_number ?? index + 1}`
}

export function findEvidenceQuestion(paper: CheckedPaper, questionId?: string, questionIndex?: number) {
  const questions = paper.grading_results ?? []
  if (questionId) {
    const matchingIndexes = questions.reduce<number[]>((indexes, item, index) => {
      if (item.question_id === questionId) indexes.push(index)
      return indexes
    }, [])
    if (matchingIndexes.length === 1) {
      const index = matchingIndexes[0]
      return { item: questions[index], index }
    }
  }
  const safeIndex = Math.max(0, Math.min(questions.length - 1, questionIndex ?? 0))
  return questions[safeIndex] ? { item: questions[safeIndex], index: safeIndex } : null
}

export function findNextEvidenceQuestion(paper: CheckedPaper, questionId?: string, questionIndex?: number) {
  const current = findEvidenceQuestion(paper, questionId, questionIndex)
  if (!current) return null
  const questions = paper.grading_results ?? []
  const nextIndex = current.index + 1
  return questions[nextIndex] ? { item: questions[nextIndex], index: nextIndex } : null
}

export function findPreviousEvidenceQuestion(paper: CheckedPaper, questionId?: string, questionIndex?: number) {
  const current = findEvidenceQuestion(paper, questionId, questionIndex)
  if (!current) return null
  const questions = paper.grading_results ?? []
  const previousIndex = current.index - 1
  return questions[previousIndex] ? { item: questions[previousIndex], index: previousIndex } : null
}
