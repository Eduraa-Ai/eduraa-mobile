import type { CheckedPaper, GradingResultItem } from '../../types'

export type QuestionEvidenceTab = 'feedback' | 'scan' | 'review'

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  mcq: 'MCQ',
  short_answer: 'Short answer',
  long_answer: 'Long answer',
  fill_blank: 'Fill blank',
  match_columns: 'Match columns',
  true_false: 'True / false',
}

export function readableMathText(value?: string | null) {
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

export function questionStatus(item: GradingResultItem) {
  const score = item.score ?? null
  const max = item.max_score ?? null
  if (score == null || max == null || max <= 0) return 'pending' as const
  if (score >= max) return 'correct' as const
  if (score > 0) return 'partial' as const
  return 'missed' as const
}

export function buildCheckedPaperReport(paper: CheckedPaper) {
  const questions = paper.grading_results ?? []
  const totalScore = paper.total_score ?? null
  const maxScore = paper.max_score ?? null
  const percent = totalScore != null && maxScore != null && maxScore > 0
    ? Math.max(0, Math.min(100, Math.round((totalScore / maxScore) * 100)))
    : null
  const correct = questions.filter((item) => questionStatus(item) === 'correct').length
  const partial = questions.filter((item) => questionStatus(item) === 'partial').length
  const missed = questions.filter((item) => questionStatus(item) === 'missed').length
  const pending = questions.filter((item) => questionStatus(item) === 'pending').length
  const firstRepair = questions.find((item) => ['partial', 'missed'].includes(questionStatus(item)) && (item.recommendation || item.feedback)) ?? null
  const recoverableMarks = questions.reduce((sum, item) => {
    if (!['partial', 'missed'].includes(questionStatus(item))) return sum
    return sum + Math.max(0, (item.max_score ?? 0) - (item.score ?? 0))
  }, 0)

  const headline = percent == null
    ? 'Your diagnosis will appear when checking finishes.'
    : percent >= 85
      ? 'You own the core ideas.\nNow protect the final details.'
      : percent >= 65
        ? 'You understand the chapter.\nYour setup needs precision.'
        : percent >= 40
          ? 'The method is within reach.\nRepair the setup next.'
          : 'The first step is clear.\nRebuild one idea at a time.'

  const repairCount = partial + missed
  const diagnosisTitle = repairCount > 0
    ? `Repair the setup in ${repairCount} question${repairCount === 1 ? '' : 's'}.`
    : 'Keep the method precise.'
  const diagnosisBody = readableMathText(
    firstRepair?.recommendation || firstRepair?.feedback || paper.grading_feedback || 'Review each question and carry the strongest method into your next attempt.',
  )

  return { questions, totalScore, maxScore, percent, correct, partial, missed, pending, firstRepair, recoverableMarks, repairCount, headline, diagnosisTitle, diagnosisBody }
}

export function findEvidenceQuestion(paper: CheckedPaper, questionId?: string, questionIndex?: number) {
  const questions = paper.grading_results ?? []
  if (questionId) {
    const match = questions.find((item) => item.question_id === questionId)
    if (match) return { item: match, index: questions.indexOf(match) }
  }
  const safeIndex = Math.max(0, Math.min(questions.length - 1, questionIndex ?? 0))
  return questions[safeIndex] ? { item: questions[safeIndex], index: safeIndex } : null
}
