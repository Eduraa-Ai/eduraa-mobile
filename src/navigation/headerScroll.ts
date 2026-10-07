import { useContext, useEffect, useRef, useState } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { NavigationRouteContext } from '@react-navigation/native'

// Scroll offset past which the app header switches to its compact state.
const COMPACT_AFTER_Y = 8

type Listener = (compact: boolean) => void

const compactByRoute = new Map<string, boolean>()
const listenersByRoute = new Map<string, Set<Listener>>()

export function setHeaderCompact(routeKey: string, compact: boolean) {
  if (compactByRoute.get(routeKey) === compact) return
  compactByRoute.set(routeKey, compact)
  listenersByRoute.get(routeKey)?.forEach((listener) => listener(compact))
}

/** Header side: re-renders only when the screen crosses the compact threshold. */
export function useHeaderCompact(routeKey: string) {
  const [compact, setCompact] = useState(() => compactByRoute.get(routeKey) ?? false)

  useEffect(() => {
    let listeners = listenersByRoute.get(routeKey)
    if (!listeners) {
      listeners = new Set()
      listenersByRoute.set(routeKey, listeners)
    }
    listeners.add(setCompact)
    setCompact(compactByRoute.get(routeKey) ?? false)
    return () => {
      listeners?.delete(setCompact)
      if (listeners?.size === 0) {
        listenersByRoute.delete(routeKey)
        compactByRoute.delete(routeKey)
      }
    }
  }, [routeKey])

  return compact
}

/**
 * Screen side: returns an onScroll handler that drives the app header for the
 * current route. AppScreen and Screen wire this in automatically; screens with
 * their own ScrollView or FlatList can pass it to `onScroll` directly.
 */
export function useAppHeaderScroll(onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void) {
  const route = useContext(NavigationRouteContext)
  const routeKey = route?.key

  return (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (routeKey) setHeaderCompact(routeKey, event.nativeEvent.contentOffset.y > COMPACT_AFTER_Y)
    onScroll?.(event)
  }
}

// In-screen steps (e.g. a multi-step builder) can take over the header's back
// button so it returns to the previous step instead of leaving the screen.
type BackHandler = () => void
const backByRoute = new Map<string, BackHandler>()
const backListenersByRoute = new Map<string, Set<(handler?: BackHandler) => void>>()

function setHeaderBack(routeKey: string, handler?: BackHandler) {
  if (handler) backByRoute.set(routeKey, handler)
  else backByRoute.delete(routeKey)
  backListenersByRoute.get(routeKey)?.forEach((listener) => listener(handler))
}

/** Header side: the screen's current back override, if any. */
export function useHeaderBackOverride(routeKey: string) {
  const [handler, setHandler] = useState<BackHandler | undefined>(() => backByRoute.get(routeKey))

  useEffect(() => {
    let listeners = backListenersByRoute.get(routeKey)
    if (!listeners) {
      listeners = new Set()
      backListenersByRoute.set(routeKey, listeners)
    }
    const listener = (next?: BackHandler) => setHandler(() => next)
    listeners.add(listener)
    setHandler(() => backByRoute.get(routeKey))
    return () => {
      listeners?.delete(listener)
      if (listeners?.size === 0) backListenersByRoute.delete(routeKey)
    }
  }, [routeKey])

  return handler
}

/** Screen side: route the header's back button to `onBack` while it is set. */
export function useAppHeaderBack(onBack?: BackHandler) {
  const route = useContext(NavigationRouteContext)
  const routeKey = route?.key
  const latest = useRef(onBack)
  latest.current = onBack
  const active = Boolean(onBack)

  useEffect(() => {
    if (!routeKey) return
    setHeaderBack(routeKey, active ? () => latest.current?.() : undefined)
    return () => setHeaderBack(routeKey, undefined)
  }, [active, routeKey])
}
