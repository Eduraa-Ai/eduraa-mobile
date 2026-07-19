import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { getFocusedRouteNameFromRoute } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, motion, radius, spacing } from '../../theme'

const ITEM_SIZE = 42
const ITEM_GAP = 7
const SWIPE_THRESHOLD = 34
const SLOT_SIZE = ITEM_SIZE + ITEM_GAP

const iconByRoute: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: 'home-outline',
  Learning: 'library-outline',
  Exams: 'calendar-outline',
  Papers: 'document-text-outline',
  Results: 'bar-chart-outline',
  ScanUpload: 'scan-outline',
  Attendance: 'today-outline',
  AIStudio: 'sparkles-outline',
  Profile: 'person-outline',
  StaffHome: 'grid-outline',
  StaffApprovals: 'checkmark-done-circle-outline',
  StaffAttendance: 'today-outline',
  StaffScanUpload: 'scan-outline',
  StaffExams: 'calendar-outline',
  StaffPapers: 'document-text-outline',
  StaffResults: 'bar-chart-outline',
  StaffAIStudio: 'sparkles-outline',
}

const fullScreenNestedRoutes = new Set(['AttemptPaper', 'Quiz'])

function isTabBarStyleHidden(tabBarStyle: unknown) {
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function BottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { width: windowWidth } = useWindowDimensions()
  const focusedRoute = state.routes[state.index]
  const focusedOptions = focusedRoute ? descriptors[focusedRoute.key]?.options : undefined
  const nestedRouteName = focusedRoute ? getNestedFocusedRouteName(focusedRoute) : null
  const scrollRef = useRef<ScrollView>(null)
  const thumbX = useRef(new Animated.Value(state.index * SLOT_SIZE)).current
  const dragPositionRef = useRef(state.index * SLOT_SIZE)
  const [previewIndex, setPreviewIndex] = useState(state.index)
  const [viewportWidth, setViewportWidth] = useState(0)

  const contentWidth = Math.max(ITEM_SIZE, state.routes.length * ITEM_SIZE + Math.max(0, state.routes.length - 1) * ITEM_GAP + 1)
  const shellWidth = Math.min(430, Math.max(ITEM_SIZE, windowWidth - spacing[5] * 2))

  const scrollToIndex = useCallback((index: number, animated = true) => {
    if (!viewportWidth) return
    const thumbPosition = index * SLOT_SIZE
    const maxScroll = Math.max(0, contentWidth - viewportWidth)
    const centeredScroll = clamp(thumbPosition - (viewportWidth - ITEM_SIZE) / 2, 0, maxScroll)
    scrollRef.current?.scrollTo({ x: centeredScroll, animated })
  }, [contentWidth, viewportWidth])

  useEffect(() => {
    const nextPosition = state.index * SLOT_SIZE
    dragPositionRef.current = nextPosition
    setPreviewIndex(state.index)
    scrollToIndex(state.index)
    Animated.spring(thumbX, {
      toValue: nextPosition,
      damping: 20,
      stiffness: 260,
      mass: 0.72,
      useNativeDriver: true,
    }).start()
  }, [state.index, scrollToIndex, thumbX])

  const navigateToIndex = (index: number) => {
    const route = state.routes[index]
    if (!route || index === state.index) return

    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    })

    if (!event.defaultPrevented) {
      navigation.navigate(route.name)
    }
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          const horizontalIntent = Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.3
          return horizontalIntent && Math.abs(gesture.dx) > 10
        },
        onPanResponderGrant: () => {
          thumbX.stopAnimation()
          dragPositionRef.current = state.index * SLOT_SIZE
          thumbX.setValue(dragPositionRef.current)
        },
        onPanResponderMove: (_, gesture) => {
          const maxPosition = Math.max(0, (state.routes.length - 1) * SLOT_SIZE)
          const nextPosition = clamp(state.index * SLOT_SIZE + gesture.dx, 0, maxPosition)
          const nextPreviewIndex = clamp(Math.round(nextPosition / SLOT_SIZE), 0, state.routes.length - 1)

          dragPositionRef.current = nextPosition
          thumbX.setValue(nextPosition)
          setPreviewIndex((current) => (current === nextPreviewIndex ? current : nextPreviewIndex))
          scrollToIndex(nextPreviewIndex, false)
        },
        onPanResponderRelease: (_, gesture) => {
          const nearestIndex = clamp(Math.round(dragPositionRef.current / SLOT_SIZE), 0, state.routes.length - 1)

          if (Math.abs(gesture.dx) >= SWIPE_THRESHOLD || nearestIndex !== state.index) {
            navigateToIndex(nearestIndex)
          } else {
            Animated.spring(thumbX, {
              toValue: state.index * SLOT_SIZE,
              damping: 20,
              stiffness: 260,
              mass: 0.72,
              useNativeDriver: true,
            }).start()
            setPreviewIndex(state.index)
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(thumbX, {
            toValue: state.index * SLOT_SIZE,
            damping: 20,
            stiffness: 260,
            mass: 0.72,
            useNativeDriver: true,
          }).start()
          setPreviewIndex(state.index)
        },
      }),
    [navigation, scrollToIndex, state.index, state.routes, thumbX],
  )

  if (isTabBarStyleHidden(focusedOptions?.tabBarStyle) || (nestedRouteName && fullScreenNestedRoutes.has(nestedRouteName))) {
    return null
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.barShell, { width: shellWidth, minWidth: shellWidth, maxWidth: shellWidth }]}>
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.92)', 'rgba(255,247,237,0.72)', 'rgba(255,255,255,0.86)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.topSheen} />
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces
          style={styles.scroller}
          contentContainerStyle={styles.bar}
          onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
        >
          <View pointerEvents="none" style={styles.sliderTrack} />
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.activeThumb,
              {
                transform: [{ translateX: thumbX }],
              },
            ]}
          >
            <Ionicons name={iconByRoute[state.routes[previewIndex]?.name] ?? 'ellipse'} size={20} color={colors.white} />
            <View style={styles.activeDot} />
          </Animated.View>
          {state.routes.map((route, index) => {
            const isFocused = state.index === index
            const options = descriptors[route.key]?.options
            const label =
              options?.tabBarLabel !== undefined
                ? String(options.tabBarLabel)
                : options?.title !== undefined
                  ? options.title
                  : route.name

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              })

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name)
              }
            }

            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                accessibilityRole="tab"
                accessibilityState={{ selected: isFocused }}
                accessibilityLabel={label}
                style={({ pressed }) => [styles.item, styles.itemInactive, pressed && styles.itemPressed]}
              >
                <Ionicons name={iconByRoute[route.name] ?? 'ellipse'} size={20} color={isFocused ? 'transparent' : colors.textSecondary} />
              </Pressable>
            )
          })}
        </ScrollView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    width: '100%',
    alignSelf: 'stretch',
    bottom: 0,
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[4],
    alignItems: 'center',
  },
  barShell: {
    alignSelf: 'stretch',
    flexShrink: 0,
    minHeight: 58,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.88)',
    paddingVertical: 7,
    paddingHorizontal: 7,
    overflow: 'hidden',
    shadowColor: colors.slate[950],
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
    elevation: 14,
  },
  scroller: {
    width: '100%',
    maxWidth: '100%',
    flexGrow: 0,
  },
  topSheen: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
    top: 5,
    height: 1,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  bar: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingRight: 1,
  },
  sliderTrack: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 27,
    height: 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(15,23,42,0.06)',
  },
  item: {
    position: 'relative',
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  itemInactive: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  activeThumb: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: radius.full,
    backgroundColor: colors.slate[950],
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    shadowColor: colors.slate[950],
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  activeDot: {
    position: 'absolute',
    bottom: 5,
    width: 4,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.accentLight,
  },
  itemPressed: {
    opacity: motion.press.opacity,
  },
})

export default BottomTabBar
