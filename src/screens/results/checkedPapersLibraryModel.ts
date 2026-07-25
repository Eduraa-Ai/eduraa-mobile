import type { CheckedPaper } from '../../types'

export type CheckedPaperTab = 'all' | 'needs_attention' | 'strong'

// Presentation-only band shared with ResultDetailScreen. This never changes
// persisted scores, grading outcomes, submission state, or API semantics.
export const STRONG_PERCENT = 65
export const CHECKED_PAPERS_POLL_INTERVAL_MS = 4000

export function normalize(value?: string | null) {
  return String(value ?? '').trim().toLowerCase()
}

export function getPaperTitle(paper: CheckedPaper) {
  return paper.exam_name || paper.subject_name || paper.identifier_text || 'Checked paper'
}

export function getPaperSubject(paper: CheckedPaper) {
  return paper.subject_name || 'General'
}

export function getQuestionCount(paper: CheckedPaper) {
  return paper.grading_results?.length ?? null
}

export function scorePercent(paper: CheckedPaper) {
  if (paper.total_score == null || paper.max_score == null || paper.max_score <= 0) return null
  return Math.max(0, Math.min(100, Math.round((paper.total_score / paper.max_score) * 100)))
}

export function scoreLabel(paper: CheckedPaper) {
  if (paper.total_score != null && paper.max_score != null) return `${paper.total_score}/${paper.max_score}`
  return 'Score pending'
}

export function isPaperChecking(paper: CheckedPaper) {
  const status = normalize(paper.status).replace(/[\s-]+/g, '_')
  if (paper.manual_review_requested || paper.needs_review || status === 'pending_manual_review' || status === 'needs_review') {
    return false
  }
  return scorePercent(paper) == null
}

export function paperAccessibilityLabel(paper: CheckedPaper, dateLabel: string) {
  const questions = getQuestionCount(paper)
  const questionLabel = questions == null ? 'Question count unavailable' : `${questions} question${questions === 1 ? '' : 's'}`
  return `${getPaperTitle(paper)}, ${getPaperSubject(paper)}, ${scoreLabel(paper)}, ${paperStatusLabel(paper)}, ${questionLabel}, ${dateLabel}. Opens the checked paper report.`
}

export function canOpenPaper(paperId: string | null | undefined, openingPaperId: string | null) {
  return Boolean(paperId && !openingPaperId)
}

export function formatPaperCount(count: number) {
  return `${count} ${count === 1 ? 'PAPER' : 'PAPERS'}`
}

export function isNeedsAttention(paper: CheckedPaper) {
  const percent = scorePercent(paper)
  if (paper.manual_review_requested || paper.needs_review || paper.status === 'pending_manual_review') return true
  if (paper.status === 'processing' || paper.status === 'uploaded') return true
  return percent != null ? percent < STRONG_PERCENT : false
}

export function isStrong(paper: CheckedPaper) {
  const percent = scorePercent(paper)
  if (paper.status !== 'graded' && paper.status !== 'completed') return false
  return percent != null ? percent >= STRONG_PERCENT : false
}

export function paperStatusLabel(paper: CheckedPaper) {
  if (paper.manual_review_requested) return 'Manual review requested'
  if (paper.needs_review || paper.status === 'pending_manual_review') return 'Needs review'
  if (paper.status === 'processing' || paper.status === 'uploaded') return 'Checking in progress'
  if (isStrong(paper)) return 'Strong'
  if (scorePercent(paper) != null) return 'Needs attention'
  return 'Score pending'
}

export function paperInsight(paper: CheckedPaper) {
  const percent = scorePercent(paper)
  if (paper.manual_review_requested) return 'Awaiting a manual review.'
  if (paper.needs_review || paper.status === 'pending_manual_review') return 'The reviewer needs to look at this paper.'
  if (paper.status === 'processing' || paper.status === 'uploaded') return 'Eduraa is still checking this result.'
  if (percent == null) return 'Score will appear after checking completes.'
  if (percent >= STRONG_PERCENT) return 'Strong performance with a clear next step.'
  if (percent >= 40) return 'Repairable gaps showed up here.'
  return 'This paper needs focused repair.'
}

export function sortByRecency(papers: CheckedPaper[]) {
  return papers.slice().sort((a, b) => {
    const bTime = new Date(b.updated_at || b.created_at).getTime()
    const aTime = new Date(a.updated_at || a.created_at).getTime()
    return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime)
  })
}

export function buildAssessmentModel(papers: CheckedPaper[]) {
  const scored = papers.filter((paper) => scorePercent(paper) != null)
  const average = scored.length ? Math.round(scored.reduce((sum, paper) => sum + (scorePercent(paper) ?? 0), 0) / scored.length) : null
  const strongCount = papers.filter(isStrong).length
  const attentionCount = papers.filter(isNeedsAttention).length
  const reviewCount = papers.filter(
    (paper) => paper.manual_review_requested || paper.needs_review || paper.status === 'pending_manual_review',
  ).length
  const latest = scored[0] ?? null
  const previous = scored[1] ?? null
  const delta = latest && previous ? (scorePercent(latest) ?? 0) - (scorePercent(previous) ?? 0) : null

  const strongestSubject = (() => {
    const buckets = new Map<string, Array<number>>()
    papers.forEach((paper) => {
      const percent = scorePercent(paper)
      const subject = getPaperSubject(paper)
      if (percent == null) return
      const next = buckets.get(subject) ?? []
      next.push(percent)
      buckets.set(subject, next)
    })

    return Array.from(buckets.entries())
      .filter(([, values]) => values.length >= 2)
      .map(([subject, values]) => ({
        subject,
        average: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
        count: values.length,
      }))
      .sort((a, b) => b.average - a.average || b.count - a.count)[0] ?? null
  })()

  const headline = (() => {
    if (latest && previous && delta != null) {
      if (delta > 0) return 'Your latest result is moving upward.'
      if (delta < 0) return 'Your latest result needs a closer look.'
      return 'Your latest results are holding steady.'
    }
    if (attentionCount > 0) return `${attentionCount} paper${attentionCount === 1 ? '' : 's'} deserve attention.`
    if (strongestSubject) return `${strongestSubject.subject} is your strongest subject so far.`
    return 'Your learning signal is taking shape.'
  })()

  const insight = (() => {
    if (latest && previous && delta != null) {
      if (delta > 0) return `Accuracy improved ${delta} points versus your previous checked paper.`
      if (delta < 0) return `Accuracy moved down ${Math.abs(delta)} points; open the report to see what changed.`
      return 'Your last two checked papers have the same percentage.'
    }
    if (papers.length > 0) return 'Complete another paper to unlock a reliable trend.'
    return 'Complete a paper and Eduraa will surface the clearest next step.'
  })()

  return { latest, average, attentionCount, reviewCount, strongCount, headline, insight, delta, strongestSubject }
}

export function matchesSearch(paper: CheckedPaper, term: string) {
  if (!term) return true
  return [paper.exam_name, paper.subject_name, paper.student_name, paper.grading_feedback, paper.identifier_text, paper.status]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(term))
}

export function matchesTab(paper: CheckedPaper, tab: CheckedPaperTab) {
  if (tab === 'all') return true
  if (tab === 'needs_attention') return isNeedsAttention(paper)
  return isStrong(paper)
}

export function buildSubjectOptions(papers: CheckedPaper[]) {
  const counts = new Map<string, number>()
  papers.forEach((paper) => {
    const subject = getPaperSubject(paper)
    counts.set(subject, (counts.get(subject) ?? 0) + 1)
  })

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
