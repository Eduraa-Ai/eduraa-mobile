import React from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { getFocusedRouteNameFromRoute } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { colors, motion, radius, shadows, spacing, typography } from '../../theme'

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

export function BottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const focusedRoute = state.routes[state.index]
  const focusedOptions = focusedRoute ? descriptors[focusedRoute.key]?.options : undefined
  const nestedRouteName = focusedRoute ? getNestedFocusedRouteName(focusedRoute) : null

  if (isTabBarStyleHidden(focusedOptions?.tabBarStyle) || (nestedRouteName && fullScreenNestedRoutes.has(nestedRouteName))) {
    return null
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.barShell}>
        <View pointerEvents="none" style={styles.sliderRail} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces
          style={styles.scroller}
          contentContainerStyle={styles.bar}
        >
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
                style={({ pressed }) => [styles.item, isFocused ? styles.itemActive : styles.itemInactive, pressed && styles.itemPressed]}
              >
                {isFocused ? <View style={styles.activeHandle} /> : null}
                <Ionicons name={iconByRoute[route.name] ?? 'ellipse'} size={20} color={isFocused ? colors.white : colors.textSecondary} />
                {isFocused ? (
                  <Text style={styles.label} numberOfLines={1}>
                    {label}
                  </Text>
                ) : null}
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
    bottom: 0,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
  },
  barShell: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    minHeight: 64,
    borderRadius: radius['2xl'],
    backgroundColor: 'rgba(255,250,242,0.98)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
    overflow: 'hidden',
    ...shadows.lg,
  },
  scroller: {
    width: '100%',
    maxWidth: '100%',
    flexGrow: 0,
  },
  sliderRail: {
    position: 'absolute',
    left: spacing[5],
    right: spacing[5],
    top: 7,
    height: 3,
    borderRadius: radius.full,
    backgroundColor: colors.accentSurfaceStrong,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingRight: spacing[2],
  },
  item: {
    position: 'relative',
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  itemInactive: {
    width: 48,
    backgroundColor: colors.backgroundTint,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    ...shadows.xs,
  },
  itemActive: {
    minWidth: 86,
    maxWidth: 132,
    paddingHorizontal: spacing[3],
    backgroundColor: colors.slate[950],
    transform: [{ scale: motion.tabSelection.scale }],
    ...shadows.sm,
  },
  activeHandle: {
    position: 'absolute',
    top: 5,
    left: spacing[3],
    width: 24,
    height: 3,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  itemPressed: {
    opacity: motion.press.opacity,
  },
  label: {
    ...typography.roles.label,
    color: colors.white,
    maxWidth: 84,
    fontSize: 12,
  },
})

export default BottomTabBar
