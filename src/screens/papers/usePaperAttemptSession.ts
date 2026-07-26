import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  createPaperAttemptState,
  legacyPaperAttemptDraftKey,
  paperAttemptDraftFromState,
  paperAttemptDraftKey,
  paperAttemptIdentityKey,
  parseLegacyPaperAttemptDraft,
  parsePaperAttemptDraft,
  reducePaperAttemptState,
  type PaperAttemptAction,
  type PaperAttemptIdentity,
  type PaperAttemptState,
} from './paperAttemptModel'

type UsePaperAttemptSessionOptions = {
  identity: PaperAttemptIdentity | null
  serverAnswers?: Readonly<Record<string, string>>
}

type PaperAttemptSession = {
  answers: Record<string, string>
  flagged: Record<string, boolean>
  isReady: boolean
  isHydrated: boolean
  selectAnswer: (questionId: string, value: string) => void
  setTextAnswer: (questionId: string, value: string) => void
  toggleFlag: (questionId: string) => void
  getAnswerSnapshot: () => Record<string, string>
  flushDraft: () => Promise<void>
  clearDraft: () => Promise<void>
}

type LocalPaperAttemptAction =
  | { type: 'select'; questionId: string; value: string }
  | { type: 'text'; questionId: string; value: string }
  | { type: 'toggleFlag'; questionId: string }

const TEXT_PERSIST_DELAY_MS = 250

export function usePaperAttemptSession({
  identity,
  serverAnswers = {},
}: UsePaperAttemptSessionOptions): PaperAttemptSession {
  const identityKey = identity ? paperAttemptIdentityKey(identity) : null
  const [renderState, setRenderState] = useState<PaperAttemptState | null>(null)
  const stateRef = useRef<PaperAttemptState | null>(null)
  const mountedRef = useRef(true)
  const hydrationGenerationRef = useRef(0)
  const hydrationPromiseRef = useRef<Promise<void>>(Promise.resolve())
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const writeChainRef = useRef<Promise<void>>(Promise.resolve())
  const lastQueuedRevisionRef = useRef(-1)
  const lastSavedRevisionRef = useRef(-1)
  const draftDisabledRef = useRef(false)

  const publishState = useCallback((nextState: PaperAttemptState) => {
    stateRef.current = nextState
    if (mountedRef.current) setRenderState(nextState)
  }, [])

  const enqueueSnapshot = useCallback((
    snapshot: PaperAttemptState,
    force = false,
  ): Promise<void> => {
    if (draftDisabledRef.current) return writeChainRef.current
    if (!snapshot.hydrated) return writeChainRef.current
    if (!force && snapshot.revision <= lastQueuedRevisionRef.current) {
      return writeChainRef.current
    }
    if (force && snapshot.revision <= lastSavedRevisionRef.current) {
      return writeChainRef.current
    }

    lastQueuedRevisionRef.current = Math.max(
      lastQueuedRevisionRef.current,
      snapshot.revision,
    )
    const key = paperAttemptDraftKey(snapshot.identity)
    const raw = JSON.stringify(paperAttemptDraftFromState(snapshot))

    writeChainRef.current = writeChainRef.current
      .catch(() => undefined)
      .then(() => AsyncStorage.setItem(key, raw))
      .then(() => {
        lastSavedRevisionRef.current = Math.max(
          lastSavedRevisionRef.current,
          snapshot.revision,
        )
      })
      .catch(() => undefined)

    return writeChainRef.current
  }, [])

  const flushDraft = useCallback(async () => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }
    await hydrationPromiseRef.current.catch(() => undefined)
    const snapshot = stateRef.current
    if (snapshot?.hydrated && !draftDisabledRef.current) {
      await enqueueSnapshot(snapshot, true)
    }
  }, [enqueueSnapshot])

  const clearDraft = useCallback(async () => {
    draftDisabledRef.current = true
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }
    await hydrationPromiseRef.current.catch(() => undefined)
    await writeChainRef.current.catch(() => undefined)
    const snapshot = stateRef.current
    if (!snapshot) return
    await Promise.all([
      AsyncStorage.removeItem(paperAttemptDraftKey(snapshot.identity)),
      AsyncStorage.removeItem(legacyPaperAttemptDraftKey(snapshot.identity)),
    ])
    lastQueuedRevisionRef.current = -1
    lastSavedRevisionRef.current = -1
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      void flushDraft()
    }
  }, [flushDraft])

  useEffect(() => {
    const generation = hydrationGenerationRef.current + 1
    hydrationGenerationRef.current = generation
    lastQueuedRevisionRef.current = -1
    lastSavedRevisionRef.current = -1
    draftDisabledRef.current = false

    if (!identity || !identityKey) {
      stateRef.current = null
      setRenderState(null)
      hydrationPromiseRef.current = Promise.resolve()
      return
    }

    const baseline = createPaperAttemptState(identity, serverAnswers)
    publishState(baseline)

    hydrationPromiseRef.current = (async () => {
      let draft = null
      let migratedLegacy = false
      try {
        const raw = await AsyncStorage.getItem(paperAttemptDraftKey(identity))
        draft = parsePaperAttemptDraft(raw, identity)
        if (!draft) {
          const legacyRaw = await AsyncStorage.getItem(legacyPaperAttemptDraftKey(identity))
          draft = parseLegacyPaperAttemptDraft(legacyRaw, identity)
          migratedLegacy = Boolean(draft)
        }
      } catch {
        draft = null
      }

      if (hydrationGenerationRef.current !== generation) return
      const current = stateRef.current
      if (!current || current.identityKey !== identityKey) return

      const hydrated = draft
        ? reducePaperAttemptState(current, {
            type: 'hydrateDraft',
            identityKey,
            draft,
          })
        : reducePaperAttemptState(current, {
            type: 'finishHydration',
            identityKey,
          })
      if (migratedLegacy) {
        const migratedRaw = JSON.stringify(paperAttemptDraftFromState(hydrated))
        writeChainRef.current = writeChainRef.current
          .catch(() => undefined)
          .then(() => AsyncStorage.setItem(paperAttemptDraftKey(identity), migratedRaw))
          .then(() => AsyncStorage.removeItem(legacyPaperAttemptDraftKey(identity)))
          .then(() => {
            lastSavedRevisionRef.current = Math.max(
              lastSavedRevisionRef.current,
              hydrated.revision,
            )
          })
          .catch(() => undefined)
      }
      publishState(hydrated)
      if (migratedLegacy) await writeChainRef.current
    })()
  }, [identityKey, publishState])

  useEffect(() => {
    if (!renderState?.hydrated || renderState.revision <= 0) return
    if (renderState.identityKey !== identityKey) return

    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    const delay = renderState.lastChange === 'text' ? TEXT_PERSIST_DELAY_MS : 0
    const snapshot = renderState
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null
      void enqueueSnapshot(snapshot)
    }, delay)

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
        persistTimerRef.current = null
      }
    }
  }, [enqueueSnapshot, identityKey, renderState])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        void flushDraft()
      }
    })
    return () => subscription.remove()
  }, [flushDraft])

  const applyAction = useCallback((action: LocalPaperAttemptAction) => {
    const current = stateRef.current
    if (!current || current.identityKey !== identityKey) return
    publishState(reducePaperAttemptState(current, {
      ...action,
      identityKey: current.identityKey,
    } as PaperAttemptAction))
  }, [identityKey, publishState])

  const selectAnswer = useCallback((questionId: string, value: string) => {
    applyAction({ type: 'select', questionId, value })
  }, [applyAction])

  const setTextAnswer = useCallback((questionId: string, value: string) => {
    applyAction({ type: 'text', questionId, value })
  }, [applyAction])

  const toggleFlag = useCallback((questionId: string) => {
    applyAction({ type: 'toggleFlag', questionId })
  }, [applyAction])

  const getAnswerSnapshot = useCallback(() => {
    const current = stateRef.current
    if (!current || current.identityKey !== identityKey) return {}
    return { ...current.answers }
  }, [identityKey])

  const visibleState = renderState?.identityKey === identityKey ? renderState : null
  return useMemo(() => ({
    answers: visibleState?.answers ?? {},
    flagged: visibleState?.flagged ?? {},
    isReady: Boolean(visibleState),
    isHydrated: Boolean(visibleState?.hydrated),
    selectAnswer,
    setTextAnswer,
    toggleFlag,
    getAnswerSnapshot,
    flushDraft,
    clearDraft,
  }), [
    clearDraft,
    flushDraft,
    getAnswerSnapshot,
    selectAnswer,
    setTextAnswer,
    toggleFlag,
    visibleState,
  ])
}
