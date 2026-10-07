import React from 'react'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { getFocusedRouteNameFromRoute } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StaffBottomTabBar, StudentBottomTabBar } from './StaffBottomTabBar'

/** Screens that take the whole display (attempts, chats, full readers). */
const fullScreenNestedRoutes = new Set(['AttemptPaper', 'Quiz', 'AIStudio', 'StaffAIStudio', 'Announcements', 'Approvals', 'Doubts', 'Feature', 'Dashboard', 'DashboardStudentDetail', 'DashboardPaperDetail'])

function isTabBarStyleHidden(tabBarStyle: unknown): boolean {
  if (!tabBarStyle) return false
  if (Array.isArray(tabBarStyle)) return tabBarStyle.some(isTabBarStyleHidden)
  if (typeof tabBarStyle === 'object' && tabBarStyle !== null && 'display' in tabBarStyle) {
    return (tabBarStyle as { display?: unknown }).display === 'none'
  }
  return false
}

function getNestedFocusedRouteName(route: BottomTabBarProps['state']['routes'][number]) {
  const helperName = getFocusedRouteNameFromRoute(route)
  if (helperName) return helperName

  let nestedState = route.state as { index?: number; routes?: Array<{ name?: string; state?: unknown }> } | undefined
  let focusedName: string | null = null

  while (nestedState?.routes?.length) {
    const focusedIndex = typeof nestedState.index === 'number' ? nestedState.index : 0
    const focusedRoute = nestedState.routes[focusedIndex]
    focusedName = focusedRoute?.name ?? focusedName
    nestedState = focusedRoute?.state as typeof nestedState
  }

  if (focusedName) return focusedName

  const params = route.params as { screen?: string; params?: { screen?: string } } | undefined
  if (params?.params?.screen) return params.params.screen
  if (params?.screen) return params.screen

  return null
}

/** One dock for every role: staff get "All tools", students get "More". */
export function BottomTabBar(props: BottomTabBarProps) {
  const { state, descriptors } = props
  const insets = useSafeAreaInsets()
  const focusedRoute = state.routes[state.index]
  const focusedOptions = focusedRoute ? descriptors[focusedRoute.key]?.options : undefined
  const nestedRouteName = focusedRoute ? getNestedFocusedRouteName(focusedRoute) : null

  if (
    isTabBarStyleHidden(focusedOptions?.tabBarStyle) ||
    fullScreenNestedRoutes.has(focusedRoute.name) ||
    (nestedRouteName && fullScreenNestedRoutes.has(nestedRouteName))
  ) {
    return null
  }

  const isStaff = state.routes.some((route) => route.name === 'StaffHome')
  return isStaff
    ? <StaffBottomTabBar {...props} insets={insets} />
    : <StudentBottomTabBar {...props} insets={insets} />
}

export default BottomTabBar
