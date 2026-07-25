import type { PreviousChapter, PreviousPaper } from '../../api/previousPapers'

export function getPreviousPaperFilters(papers: readonly PreviousPaper[]) {
  const exams: string[] = []
  const years = new Set<number>()

  for (const paper of papers) {
    const exam = paper.exam?.trim()
    if (exam && !exams.includes(exam)) exams.push(exam)
    if (typeof paper.year === 'number' && Number.isFinite(paper.year)) years.add(paper.year)
  }

  return {
    exams,
    years: [...years].sort((left, right) => right - left).map(String),
  }
}

export function filterPreviousPapers(
  papers: readonly PreviousPaper[],
  exam: string | null,
  year: string | null,
) {
  return papers.filter((paper) => {
    if (exam && paper.exam !== exam) return false
    if (year && String(paper.year ?? '') !== year) return false
    return true
  })
}

export function reconcileSelectedPaperId(
  visiblePapers: readonly PreviousPaper[],
  selectedPaperId: string | null,
) {
  if (selectedPaperId && visiblePapers.some((paper) => paper.id === selectedPaperId)) {
    return selectedPaperId
  }
  return visiblePapers[0]?.id ?? null
}

export function getVisibleChapters(
  chapters: readonly PreviousChapter[],
  expanded: boolean,
  limit = 6,
) {
  return expanded ? [...chapters] : chapters.slice(0, Math.max(0, limit))
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  const detail = (error as { response?: { data?: { detail?: unknown } } } | null)
    ?.response?.data?.detail

  if (typeof detail === 'string' && detail.trim()) return detail.trim()

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!item || typeof item !== 'object') return null
        const message = (item as { msg?: unknown }).msg
        return typeof message === 'string' && message.trim() ? message.trim() : null
      })
      .filter((item): item is string => Boolean(item))

    if (messages.length) return messages.join(' ')
  }

  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return fallback
}
