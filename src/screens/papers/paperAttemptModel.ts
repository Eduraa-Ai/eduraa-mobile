export function selectNewestInProgressAttempt<T extends { grading_status?: string }>(
  attempts: readonly T[],
): T | undefined {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (attempts[index]?.grading_status === 'in_progress') return attempts[index]
  }
  return undefined
}

export function toggleSelectableAnswer(
  answers: Readonly<Record<string, string>>,
  questionId: string,
  value: string,
): Record<string, string> {
  const nextAnswers = { ...answers }
  if (nextAnswers[questionId] === value) {
    delete nextAnswers[questionId]
  } else {
    nextAnswers[questionId] = value
  }
  return nextAnswers
}

export type PaperAttemptMode = 'standard' | 'interactive_quiz'

export type PaperAttemptIdentity = {
  userId: string
  paperId: string
  examId?: string
  attemptId: string
  mode: PaperAttemptMode
}

export type PaperAttemptDraft = {
  version: 2
  identity: PaperAttemptIdentity
  revision: number
  updatedAt: number
  answers: Record<string, string>
  clearedQuestionIds: string[]
  flaggedQuestionIds: string[]
}

export type PaperAttemptState = {
  identity: PaperAttemptIdentity
  identityKey: string
  answers: Record<string, string>
  flagged: Record<string, boolean>
  touchedAnswers: Record<string, boolean>
  touchedFlags: Record<string, boolean>
  clearedAnswers: Record<string, boolean>
  revision: number
  hydrated: boolean
  lastChange: 'selectable' | 'text' | 'flag' | null
}

export type PaperAttemptAction =
  | { type: 'select'; identityKey: string; questionId: string; value: string }
  | { type: 'text'; identityKey: string; questionId: string; value: string }
  | { type: 'toggleFlag'; identityKey: string; questionId: string }
  | { type: 'hydrateDraft'; identityKey: string; draft: PaperAttemptDraft }
  | { type: 'finishHydration'; identityKey: string }

const safeIdentityPart = (value: string | undefined, fallback: string) =>
  encodeURIComponent(value?.trim() || fallback)

export function paperAttemptIdentityKey(identity: PaperAttemptIdentity): string {
  return [
    safeIdentityPart(identity.userId, 'unknown'),
    safeIdentityPart(identity.paperId, 'paper'),
    safeIdentityPart(identity.examId, 'practice'),
    safeIdentityPart(identity.attemptId, 'attempt'),
    identity.mode,
  ].join(':')
}

export function paperAttemptDraftKey(identity: PaperAttemptIdentity): string {
  return `eduraa-attempt-draft:v2:${paperAttemptIdentityKey(identity)}`
}

export function legacyPaperAttemptDraftKey(identity: PaperAttemptIdentity): string {
  return `eduraa-attempt-draft:${identity.userId}:${identity.paperId}:${identity.examId || 'practice'}`
}

export function samePaperAttemptIdentity(
  left: PaperAttemptIdentity,
  right: PaperAttemptIdentity,
): boolean {
  return paperAttemptIdentityKey(left) === paperAttemptIdentityKey(right)
}

export function createPaperAttemptState(
  identity: PaperAttemptIdentity,
  serverAnswers: Readonly<Record<string, string>> = {},
): PaperAttemptState {
  return {
    identity,
    identityKey: paperAttemptIdentityKey(identity),
    answers: { ...serverAnswers },
    flagged: {},
    touchedAnswers: {},
    touchedFlags: {},
    clearedAnswers: {},
    revision: 0,
    hydrated: false,
    lastChange: null,
  }
}

function nextAnswerState(
  state: PaperAttemptState,
  questionId: string,
  value: string,
  selectable: boolean,
): PaperAttemptState {
  const answers = { ...state.answers }
  const clearedAnswers = { ...state.clearedAnswers }
  const shouldClear = selectable ? answers[questionId] === value : value.length === 0

  if (shouldClear) {
    delete answers[questionId]
    clearedAnswers[questionId] = true
  } else {
    answers[questionId] = value
    delete clearedAnswers[questionId]
  }

  return {
    ...state,
    answers,
    clearedAnswers,
    touchedAnswers: { ...state.touchedAnswers, [questionId]: true },
    revision: state.revision + 1,
    lastChange: selectable ? 'selectable' : 'text',
  }
}

export function reducePaperAttemptState(
  state: PaperAttemptState,
  action: PaperAttemptAction,
): PaperAttemptState {
  if (action.identityKey !== state.identityKey) return state

  if (action.type === 'select') {
    return nextAnswerState(state, action.questionId, action.value, true)
  }

  if (action.type === 'text') {
    return nextAnswerState(state, action.questionId, action.value, false)
  }

  if (action.type === 'toggleFlag') {
    const flagged = { ...state.flagged }
    if (flagged[action.questionId]) {
      delete flagged[action.questionId]
    } else {
      flagged[action.questionId] = true
    }
    return {
      ...state,
      flagged,
      touchedFlags: { ...state.touchedFlags, [action.questionId]: true },
      revision: state.revision + 1,
      lastChange: 'flag',
    }
  }

  if (action.type === 'hydrateDraft') {
    if (!samePaperAttemptIdentity(state.identity, action.draft.identity)) return state

    const answers = { ...state.answers }
    const clearedAnswers = { ...state.clearedAnswers }
    const flagged = { ...state.flagged }

    for (const [questionId, value] of Object.entries(action.draft.answers)) {
      if (state.touchedAnswers[questionId]) continue
      answers[questionId] = value
      delete clearedAnswers[questionId]
    }
    for (const questionId of action.draft.clearedQuestionIds) {
      if (state.touchedAnswers[questionId]) continue
      delete answers[questionId]
      clearedAnswers[questionId] = true
    }
    for (const questionId of action.draft.flaggedQuestionIds) {
      if (!state.touchedFlags[questionId]) flagged[questionId] = true
    }

    return { ...state, answers, clearedAnswers, flagged, hydrated: true }
  }

  return state.hydrated ? state : { ...state, hydrated: true }
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.entries(value).reduce<Record<string, string>>((result, [key, item]) => {
    if (key && typeof item === 'string') result[key] = item
    return result
  }, {})
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))]
}

export function parsePaperAttemptDraft(
  raw: string | null,
  identity: PaperAttemptIdentity,
): PaperAttemptDraft | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<PaperAttemptDraft>
    if (value.version !== 2 || !value.identity || !samePaperAttemptIdentity(value.identity, identity)) {
      return null
    }
    return {
      version: 2,
      identity,
      revision: typeof value.revision === 'number' && Number.isFinite(value.revision)
        ? Math.max(0, Math.floor(value.revision))
        : 0,
      updatedAt: typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
        ? value.updatedAt
        : 0,
      answers: stringRecord(value.answers),
      clearedQuestionIds: stringArray(value.clearedQuestionIds),
      flaggedQuestionIds: stringArray(value.flaggedQuestionIds),
    }
  } catch {
    return null
  }
}

export function parseLegacyPaperAttemptDraft(
  raw: string | null,
  identity: PaperAttemptIdentity,
): PaperAttemptDraft | null {
  if (!raw || identity.mode !== 'standard') return null
  try {
    const value = JSON.parse(raw) as {
      attemptId?: unknown
      answers?: unknown
      flagged?: unknown
    }
    if (value.attemptId !== identity.attemptId) return null
    const flagged = value.flagged && typeof value.flagged === 'object' && !Array.isArray(value.flagged)
      ? Object.entries(value.flagged)
          .filter(([, item]) => item === true)
          .map(([questionId]) => questionId)
      : []
    return {
      version: 2,
      identity,
      revision: 0,
      updatedAt: 0,
      answers: stringRecord(value.answers),
      clearedQuestionIds: [],
      flaggedQuestionIds: flagged,
    }
  } catch {
    return null
  }
}

export function paperAttemptDraftFromState(
  state: PaperAttemptState,
  updatedAt = Date.now(),
): PaperAttemptDraft {
  return {
    version: 2,
    identity: state.identity,
    revision: state.revision,
    updatedAt,
    answers: { ...state.answers },
    clearedQuestionIds: Object.keys(state.clearedAnswers),
    flaggedQuestionIds: Object.entries(state.flagged)
      .filter(([, selected]) => selected)
      .map(([questionId]) => questionId),
  }
}

export function buildPaperAnswerEntries(
  questionIds: readonly string[],
  answers: Readonly<Record<string, string>>,
): Array<{ question_id: string; response: string }> {
  const seen = new Set<string>()
  return questionIds.map((questionId) => {
    if (!questionId || seen.has(questionId)) {
      throw new Error('This paper contains missing or duplicate question IDs and cannot be submitted safely.')
    }
    seen.add(questionId)
    return { question_id: questionId, response: answers[questionId] || '' }
  })
}

export function clampCheckingProgress(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(100, Math.max(0, Math.round(value)))
}
