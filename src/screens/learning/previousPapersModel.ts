import type {
  PreviousChapter,
  PreviousPaper,
  PreviousQuestion,
  StartPreviousPaperExamRequest,
} from '../../api/previousPapers'

export type PreviousPaperSelectionMode = 'paper' | 'subject' | 'chapter'

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
  search = '',
) {
  const normalizedSearch = search.trim().toLowerCase()
  return papers.filter((paper) => {
    if (exam && paper.exam !== exam) return false
    if (year && String(paper.year ?? '') !== year) return false
    if (
      normalizedSearch &&
      ![
        paper.title,
        paper.exam,
        paper.session_label,
        paper.shift_label,
        paper.paper_label,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedSearch)
    ) {
      return false
    }
    return true
  })
}

export function filterPreviousQuestions(
  questions: readonly PreviousQuestion[],
  search: string,
) {
  const normalizedSearch = search.trim().toLowerCase()
  if (!normalizedSearch) return [...questions]

  return questions.filter((question) =>
    [
      question.question_text,
      question.chapter_title,
      question.topic_slug,
      question.subject,
      question.branch,
      question.exam_session,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch),
  )
}

export function isPreviousPaperSelectionComplete(
  mode: PreviousPaperSelectionMode,
  subjects: readonly string[],
  chapterIds: readonly string[],
) {
  if (mode === 'subject') return subjects.length > 0
  if (mode === 'chapter') return subjects.length > 0 && chapterIds.length > 0
  return true
}

export function buildPreviousPaperStartRequest(
  mode: PreviousPaperSelectionMode,
  subjects: readonly string[],
  chapterIds: readonly string[],
  timerEnabled: boolean,
  durationMinutes: number,
  attemptAction: 'auto' | 'new',
): StartPreviousPaperExamRequest {
  const selectedSubjects = mode === 'paper' ? [] : [...new Set(subjects.filter(Boolean))]
  const selectedChapterIds = mode === 'chapter' ? [...new Set(chapterIds.filter(Boolean))] : []

  return {
    mode,
    // Keep singular fields for older API deployments while the arrays carry the
    // complete selection on the current production contract.
    subject: selectedSubjects.length === 1 ? selectedSubjects[0] : undefined,
    subjects: selectedSubjects,
    chapter_id: selectedChapterIds.length === 1 ? selectedChapterIds[0] : undefined,
    chapter_ids: selectedChapterIds,
    timer_enabled: timerEnabled,
    duration_minutes: timerEnabled ? Math.min(300, Math.max(5, Math.round(durationMinutes))) : null,
    attempt_action: attemptAction,
  }
}

const superscriptMap: Record<string, string> = {
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

const subscriptMap: Record<string, string> = {
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
}

const greekMap: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  phi: 'φ',
  omega: 'ω',
  Delta: 'Δ',
  Omega: 'Ω',
}

export function readablePreviousPaperText(value?: string | null) {
  let next = String(value ?? '')
    .replace(/\\\[(.*?)\\\]/gs, ' $1 ')
    .replace(/\\\((.*?)\\\)/gs, ' $1 ')
    .replace(/\$\$([\s\S]*?)\$\$/g, ' $1 ')
    .replace(/\$([^$]*?)\$/g, ' $1 ')
    .replace(/\\(?:dfrac|tfrac|frac)\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\(?:mathrm|text|operatorname)\{([^{}]+)\}/g, '$1')
    .replace(/\\left|\\right/g, '')
    .replace(/\\(?:,|;|:|quad|qquad)/g, ' ')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\leq?/g, '≤')
    .replace(/\\geq?/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\approx/g, '≈')
    .replace(/\\infty/g, '∞')
    .replace(/\\circ/g, '°')

  for (const [latex, symbol] of Object.entries(greekMap)) {
    next = next.replace(new RegExp(`\\\\${latex}(?![A-Za-z])`, 'g'), symbol)
  }

  return next
    .replace(/\^\{([^{}]+)\}/g, (_match, exponent: string) =>
      exponent.split('').map((character) => superscriptMap[character] ?? character).join(''),
    )
    .replace(/\^([0-9+\-])/g, (_match, exponent: string) => superscriptMap[exponent] ?? exponent)
    .replace(/_\{([^{}]+)\}/g, (_match, subscript: string) =>
      subscript.split('').map((character) => subscriptMap[character] ?? character).join(''),
    )
    .replace(/_([0-9+\-])/g, (_match, subscript: string) => subscriptMap[subscript] ?? subscript)
    .replace(/[*_]{1,2}/g, '')
    .replace(/[{}]/g, '')
    .replace(/\\([A-Za-z]+)/g, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
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
