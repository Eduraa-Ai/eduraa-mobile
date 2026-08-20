import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { getFocusedRouteNameFromRoute } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Path } from 'react-native-svg'
import { colors, motion, radius, spacing } from '../../theme'

const MAX_SHELL_WIDTH = 410
const MIN_SHELL_WIDTH = 288
const SHELL_INSET = 14
const SHELL_EDGE_PADDING = 5
const SHELL_HEIGHT = 68
const SCROLLING_ITEM_WIDTH = 66
const ACTIVE_ORB_SIZE = 46

const iconByRoute: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: 'home-outline',
  Exams: 'calendar-outline',
  Papers: 'document-text-outline',
  Results: 'bar-chart-outline',
  PreviousPapers: 'documents-outline',
  StaffPreviousPapers: 'documents-outline',
  CheatSheets: 'reader-outline',
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
  StaffProfile: 'person-outline',
}

function RouteIcon({
  color,
  routeName,
}: {
  color: string
  routeName?: string
}) {
  const icon = iconByRoute[routeName ?? ''] ?? 'ellipse-outline'
  if (routeName !== 'PreviousPapers' && routeName !== 'StaffPreviousPapers') {
    return <Ionicons name={icon} size={20} color={color} />
  }

  return (
    <View style={styles.previousPapersIcon}>
      <Ionicons name={icon} size={20} color={color} />
      <View style={[styles.previousPapersClock, color === 'transparent' && styles.iconHidden]}>
        <Ionicons name="time" size={8} color={colors.white} />
      </View>
    </View>
  )
}

const fullScreenNestedRoutes = new Set(['AttemptPaper', 'Quiz', 'AIStudio', 'StaffAIStudio', 'Announcements', 'Approvals', 'Doubts'])

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

function ConstellationField() {
  return (
    <View pointerEvents="none" style={styles.constellationClip}>
      <Svg width="100%" height="100%" viewBox="0 0 360 74" preserveAspectRatio="none">
        <Path
          d="M18 51L62 24L112 43L158 18L206 48L252 28L302 49L344 19M62 24L78 61M158 18L174 63M252 28L270 63M302 49L344 19"
          fill="none"
          stroke="rgba(7,21,45,0.18)"
          strokeWidth={0.7}
          strokeDasharray="2 4"
        />
        <Circle cx={18} cy={51} r={1.4} fill="rgba(7,21,45,0.25)" />
        <Circle cx={62} cy={24} r={1.8} fill="rgba(7,21,45,0.30)" />
        <Circle cx={78} cy={61} r={1.2} fill="rgba(7,21,45,0.22)" />
        <Circle cx={112} cy={43} r={1.3} fill="rgba(7,21,45,0.24)" />
        <Circle cx={158} cy={18} r={1.6} fill="rgba(7,21,45,0.28)" />
        <Circle cx={174} cy={63} r={1.2} fill="rgba(7,21,45,0.22)" />
        <Circle cx={206} cy={48} r={2} fill={colors.accentLight} />
        <Circle cx={252} cy={28} r={1.5} fill="rgba(7,21,45,0.27)" />
        <Circle cx={270} cy={63} r={1.1} fill="rgba(7,21,45,0.20)" />
        <Circle cx={302} cy={49} r={1.5} fill="rgba(7,21,45,0.27)" />
        <Circle cx={344} cy={19} r={1.7} fill="rgba(7,21,45,0.29)" />
      </Svg>
    </View>
  )
}

interface TabItemProps {
  accessibilityLabel: string
  isFocused: boolean
  isPreviewed: boolean
  label: string
  onLongPress: () => void
  onPress: () => void
  routeName: string
  testID?: string
  width: number
}

function TabItem({
  accessibilityLabel,
  isFocused,
  isPreviewed,
  label,
  onLongPress,
  onPress,
  routeName,
  testID,
  width,
}: TabItemProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={{ top: 10, bottom: 2, left: 2, right: 2 }}
      testID={testID}
      style={({ pressed }) => [
        styles.item,
        { width },
        pressed && styles.itemPressed,
      ]}
    >
      <View pointerEvents="none" style={styles.iconStage}>
        <RouteIcon
          routeName={routeName}
          color={isPreviewed ? 'transparent' : colors.textSecondary}
        />
      </View>
      <Text numberOfLines={1} style={[styles.label, isPreviewed && styles.labelFocused]}>
        {label}
      </Text>
    </Pressable>
  )
}

export function BottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { width: windowWidth } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const focusedRoute = state.routes[state.index]
  const focusedOptions = focusedRoute ? descriptors[focusedRoute.key]?.options : undefined
  const nestedRouteName = focusedRoute ? getNestedFocusedRouteName(focusedRoute) : null
  const shellRef = useRef<View>(null)
  const scrollRef = useRef<ScrollView>(null)
  const shellLeftRef = useRef(0)
  const scrollOffsetRef = useRef(0)
  const previewIndexRef = useRef(state.index)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [previewIndex, setPreviewIndex] = useState(state.index)
  const [isDragging, setIsDragging] = useState(false)

  const shellWidth = Math.min(MAX_SHELL_WIDTH, Math.max(MIN_SHELL_WIDTH, windowWidth - SHELL_INSET * 2))
  const availableTabWidth = shellWidth - SHELL_EDGE_PADDING * 2
  // Six labels become unreadable on 320 px devices. Keep the full labels and
  // center the active route in the existing horizontal rail instead.
  const fitsWithoutScrolling = state.routes.length <= 6
  const itemWidth = fitsWithoutScrolling
    ? availableTabWidth / Math.max(1, state.routes.length)
    : SCROLLING_ITEM_WIDTH
  const contentWidth = fitsWithoutScrolling
    ? shellWidth
    : state.routes.length * itemWidth + SHELL_EDGE_PADDING * 2
  const activeIndicatorX = useRef(
    new Animated.Value(
      SHELL_EDGE_PADDING + state.index * itemWidth + (itemWidth - ACTIVE_ORB_SIZE) / 2,
    ),
  ).current
  const activeRouteName = state.routes[previewIndex]?.name
  const indicatorPositionForIndex = useCallback(
    (index: number) => SHELL_EDGE_PADDING + index * itemWidth + (itemWidth - ACTIVE_ORB_SIZE) / 2,
    [itemWidth],
  )

  const measureShell = useCallback(() => {
    shellRef.current?.measureInWindow((x) => {
      shellLeftRef.current = x
    })
  }, [])

  const scrollToIndex = useCallback((index: number, animated = true) => {
    if (!viewportWidth || fitsWithoutScrolling) return
    const itemCenter = SHELL_EDGE_PADDING + index * itemWidth + itemWidth / 2
    const maxScroll = Math.max(0, contentWidth - viewportWidth)
    const centeredScroll = clamp(itemCenter - viewportWidth / 2, 0, maxScroll)
    scrollRef.current?.scrollTo({ x: centeredScroll, animated })
  }, [contentWidth, fitsWithoutScrolling, itemWidth, viewportWidth])

  const settleIndicator = useCallback((index: number) => {
    Animated.spring(activeIndicatorX, {
      toValue: indicatorPositionForIndex(index),
      ...motion.spring.tab,
      useNativeDriver: true,
    }).start()
  }, [activeIndicatorX, indicatorPositionForIndex])

  const navigateToIndex = useCallback((index: number) => {
    const route = state.routes[index]
    if (!route || index === state.index) return false

    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    })

    if (event.defaultPrevented) return false
    navigation.navigate(route.name)
    return true
  }, [navigation, state.index, state.routes])

  const updateDragFromPageX = useCallback((pageX: number) => {
    const lastIndex = Math.max(0, state.routes.length - 1)
    const firstPosition = indicatorPositionForIndex(0)
    const lastPosition = indicatorPositionForIndex(lastIndex)
    const contentX = pageX - shellLeftRef.current + scrollOffsetRef.current
    const nextPosition = clamp(contentX - ACTIVE_ORB_SIZE / 2, firstPosition, lastPosition)
    const nextIndex = clamp(
      Math.round((nextPosition - firstPosition) / itemWidth),
      0,
      lastIndex,
    )

    activeIndicatorX.setValue(nextPosition)

    if (previewIndexRef.current !== nextIndex) {
      previewIndexRef.current = nextIndex
      setPreviewIndex(nextIndex)
      scrollToIndex(nextIndex, false)
    }
  }, [
    activeIndicatorX,
    indicatorPositionForIndex,
    itemWidth,
    scrollToIndex,
    state.routes.length,
  ])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) => {
          const horizontalIntent = Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2
          return horizontalIntent && Math.abs(gesture.dx) > 3
        },
        onMoveShouldSetPanResponderCapture: (_, gesture) => {
          const horizontalIntent = Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2
          return horizontalIntent && Math.abs(gesture.dx) > 3
        },
        onPanResponderGrant: (_, gesture) => {
          activeIndicatorX.stopAnimation()
          setIsDragging(true)
          updateDragFromPageX(gesture.moveX || gesture.x0 + gesture.dx)
        },
        onPanResponderMove: (_, gesture) => {
          updateDragFromPageX(gesture.moveX || gesture.x0 + gesture.dx)
        },
        onPanResponderRelease: () => {
          const targetIndex = previewIndexRef.current
          const committed = navigateToIndex(targetIndex)
          const settledIndex = committed ? targetIndex : state.index

          previewIndexRef.current = settledIndex
          setPreviewIndex(settledIndex)
          setIsDragging(false)
          settleIndicator(settledIndex)
        },
        onPanResponderTerminate: () => {
          previewIndexRef.current = state.index
          setPreviewIndex(state.index)
          setIsDragging(false)
          settleIndicator(state.index)
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
      }),
    [
      activeIndicatorX,
      navigateToIndex,
      settleIndicator,
      state.index,
      updateDragFromPageX,
    ],
  )

  useEffect(() => {
    previewIndexRef.current = state.index
    setPreviewIndex(state.index)
    settleIndicator(state.index)
    scrollToIndex(state.index)
  }, [scrollToIndex, settleIndicator, state.index])

  if (
    isTabBarStyleHidden(focusedOptions?.tabBarStyle) ||
    fullScreenNestedRoutes.has(focusedRoute.name) ||
    (nestedRouteName && fullScreenNestedRoutes.has(nestedRouteName))
  ) {
    return null
  }

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          paddingBottom: Math.max(insets.bottom, spacing[3]),
        },
      ]}
    >
      <View
        ref={shellRef}
        {...panResponder.panHandlers}
        onLayout={measureShell}
        style={[styles.barShell, { width: shellWidth, minWidth: shellWidth, maxWidth: shellWidth }]}
      >
        <View pointerEvents="none" style={styles.glassSurface}>
          <LinearGradient
            colors={['rgba(255,255,255,0.90)', 'rgba(255,247,237,0.71)', 'rgba(255,255,255,0.82)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <ConstellationField />
          <View style={styles.topSheen} />
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal
          scrollEnabled={!fitsWithoutScrolling && !isDragging}
          showsHorizontalScrollIndicator={false}
          bounces={!fitsWithoutScrolling}
          directionalLockEnabled
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
          style={styles.scroller}
          contentContainerStyle={[styles.bar, { width: contentWidth }]}
          onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
          onScroll={(event) => {
            scrollOffsetRef.current = event.nativeEvent.contentOffset.x
          }}
          scrollEventThrottle={16}
        >
          <Animated.View
            pointerEvents="none"
            testID="bottom-tab-active-indicator"
            style={[
              styles.slidingIndicator,
              {
                transform: [{ translateX: activeIndicatorX }],
              },
            ]}
          >
            <LinearGradient
              colors={['#173250', '#07152d', '#061226']}
              start={{ x: 0.18, y: 0 }}
              end={{ x: 0.82, y: 1 }}
              style={styles.activeOrb}
            >
              <View style={styles.orbSheen} />
              <View style={styles.orbWhiteStar} />
              <View style={styles.orbWhiteStarSmall} />
              <View style={styles.orbOrangeSignal} />
              <RouteIcon routeName={activeRouteName} color={colors.white} />
            </LinearGradient>
          </Animated.View>
          {state.routes.map((route, index) => {
            const isFocused = state.routes[state.index]?.key === route.key
            const isPreviewed = previewIndex === index
            const options = descriptors[route.key]?.options
            const label =
              typeof options?.tabBarLabel === 'string'
                ? options.tabBarLabel
                : typeof options?.title === 'string'
                  ? options.title
                  : route.name
            const accessibilityLabel =
              options?.tabBarAccessibilityLabel ?? label

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

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              })
            }

            return (
              <TabItem
                key={route.key}
                accessibilityLabel={accessibilityLabel}
                isFocused={isFocused}
                isPreviewed={isPreviewed}
                label={label}
                onLongPress={onLongPress}
                onPress={onPress}
                routeName={route.name}
                testID={options?.tabBarTestID}
                width={itemWidth}
              />
            )
          })}
        </ScrollView>
        {!fitsWithoutScrolling ? (
          <>
            <View pointerEvents="none" style={[styles.overflowCue, styles.overflowCueLeft]} accessibilityElementsHidden>
              <LinearGradient colors={['rgba(255,250,242,0.98)', 'rgba(255,250,242,0)']} style={StyleSheet.absoluteFill} />
              <Ionicons name="chevron-back" size={16} color={colors.accent} />
            </View>
            <View pointerEvents="none" style={styles.overflowCue} accessibilityElementsHidden>
              <LinearGradient colors={['rgba(255,250,242,0)', 'rgba(255,250,242,0.98)']} style={StyleSheet.absoluteFill} />
              <Ionicons name="chevron-forward" size={16} color={colors.accent} />
            </View>
          </>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: SHELL_INSET,
    alignItems: 'center',
  },
  barShell: {
    position: 'relative',
    alignSelf: 'stretch',
    flexShrink: 0,
    height: SHELL_HEIGHT,
    borderRadius: radius.xl,
    shadowColor: colors.slate[950],
    shadowOffset: { width: 0, height: 13 },
    shadowOpacity: 0.15,
    shadowRadius: 25,
    elevation: 12,
  },
  glassSurface: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.90)',
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  constellationClip: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.82,
  },
  scroller: {
    width: '100%',
    maxWidth: '100%',
    height: SHELL_HEIGHT,
    flexGrow: 0,
    overflow: 'visible',
  },
  topSheen: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
    top: 4,
    height: 1,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  bar: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: SHELL_EDGE_PADDING,
  },
  overflowCue: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 28,
    height: SHELL_HEIGHT,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 3,
    zIndex: 8,
  },
  overflowCueLeft: {
    left: 0,
    right: undefined,
    alignItems: 'flex-start',
    paddingLeft: 3,
    paddingRight: 0,
  },
  item: {
    position: 'relative',
    height: SHELL_HEIGHT,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
    zIndex: 2,
  },
  itemPressed: {
    opacity: motion.press.opacity,
  },
  iconStage: {
    position: 'absolute',
    top: 5,
    width: ACTIVE_ORB_SIZE,
    height: ACTIVE_ORB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  slidingIndicator: {
    position: 'absolute',
    left: 0,
    top: 1,
    width: ACTIVE_ORB_SIZE,
    height: ACTIVE_ORB_SIZE,
    zIndex: 4,
  },
  activeOrb: {
    width: ACTIVE_ORB_SIZE,
    height: ACTIVE_ORB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,250,242,0.90)',
    borderRadius: radius.full,
    shadowColor: colors.slate[950],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.21,
    shadowRadius: 15,
    elevation: 8,
  },
  orbSheen: {
    position: 'absolute',
    top: 3,
    left: 8,
    width: 19,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.10)',
    transform: [{ rotate: '-18deg' }],
  },
  orbWhiteStar: {
    position: 'absolute',
    top: 8,
    left: 9,
    width: 2.5,
    height: 2.5,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.76)',
  },
  orbWhiteStarSmall: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 2,
    height: 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.48)',
  },
  orbOrangeSignal: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 4,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.accentLight,
    shadowColor: colors.accentLight,
    shadowOpacity: 0.7,
    shadowRadius: 5,
    elevation: 2,
  },
  label: {
    maxWidth: '94%',
    color: colors.textSecondary,
    fontSize: 8.5,
    fontWeight: '700',
    lineHeight: 10,
    textAlign: 'center',
  },
  labelFocused: {
    color: '#07152d',
    fontWeight: '900',
  },
  previousPapersIcon: {
    position: 'relative',
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previousPapersClock: {
    position: 'absolute',
    right: -2,
    bottom: -1,
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.backgroundElevated,
    backgroundColor: colors.accent,
  },
  iconHidden: {
    opacity: 0,
  },
})

export default BottomTabBar
