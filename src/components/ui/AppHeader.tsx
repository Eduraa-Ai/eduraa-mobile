import React, { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackHeaderProps } from '@react-navigation/native-stack'
import type { BottomTabHeaderProps } from '@react-navigation/bottom-tabs'
import { useAuthStore } from '../../stores/authStore'
import { useAppHeaderBack, useHeaderBackOverride, useHeaderCompact } from '../../navigation/headerScroll'
import { resolveScreenHeader } from '../../navigation/screenHeaders'
import { colors, radius, spacing, typography } from '../../theme'

/** Height of the header row below the status bar. Fixed so content never jumps on scroll. */
export const APP_HEADER_ROW_HEIGHT = 56

const TITLE_SIZE_REST = 23
const TITLE_SIZE_COMPACT = 17

type AppHeaderProps = {
  title: string
  label?: string
  /** `root` = reached from the bottom bar (logo + account). `inner` = pushed screen (back button). */
  mode: 'root' | 'inner'
  onBack?: () => void
  onOpenProfile?: () => void
  right?: ReactNode
  compact?: boolean
}

export function AppHeader({ title, label, mode, onBack, onOpenProfile, right, compact = false }: AppHeaderProps) {
  const insets = useSafeAreaInsets()
  const progress = useRef(new Animated.Value(compact ? 1 : 0)).current

  useEffect(() => {
    Animated.timing(progress, { toValue: compact ? 1 : 0, duration: 180, useNativeDriver: false }).start()
  }, [compact, progress])

  const titleSize = progress.interpolate({ inputRange: [0, 1], outputRange: [TITLE_SIZE_REST, TITLE_SIZE_COMPACT] })
  const labelOpacity = progress.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' })
  const labelHeight = progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] })

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Animated.View pointerEvents="none" style={[styles.surface, { opacity: progress }]} />
      <View style={styles.row}>
        {mode === 'inner' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            onPress={onBack}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={20} color={colors.nav} />
          </Pressable>
        ) : (
          <Image
            source={require('../../../assets/eduraa-book-brain.png')}
            style={styles.logo}
            resizeMode="cover"
            accessibilityLabel="Eduraa"
          />
        )}

        <View style={styles.copy}>
          {label ? (
            <Animated.Text
              numberOfLines={1}
              style={[styles.label, { opacity: labelOpacity, height: labelHeight }]}
            >
              {label.toUpperCase()}
            </Animated.Text>
          ) : null}
          <Animated.Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { fontSize: titleSize }]}>
            {title}
          </Animated.Text>
        </View>

        {right ? <View style={styles.right}>{right}</View> : null}
        {mode === 'root' && !right ? <AccountButton onOpenProfile={onOpenProfile} /> : null}
      </View>
      <Animated.View style={[styles.hairline, { opacity: progress }]} />
    </View>
  )
}

/**
 * Lets a screen (or one view inside it) configure the shared app header from JSX:
 * a dynamic title, a back button that returns to the previous in-screen view, and
 * the one right-hand action. Renders nothing. Change `rightKey` whenever the
 * action's appearance changes (e.g. busy state) so the header re-renders it.
 */
export function AppHeaderConfig({
  title,
  onBack,
  right,
  rightKey,
}: {
  title?: string
  onBack?: () => void
  right?: () => ReactNode
  rightKey?: string
}) {
  const navigation = useNavigation<any>()
  const rightRef = useRef(right)
  rightRef.current = right
  const hasRight = Boolean(right)
  useAppHeaderBack(onBack)
  useLayoutEffect(() => {
    navigation.setOptions({
      ...(title ? { headerTitle: title } : {}),
      headerRight: hasRight ? () => rightRef.current?.() : undefined,
    })
  }, [hasRight, navigation, rightKey, title])
  return null
}

/** The single action a screen may put on the right of the header (e.g. "Write", "Custom paper"). */
export function AppHeaderAction({
  label,
  icon,
  onPress,
  accessibilityLabel,
}: {
  label: string
  icon?: keyof typeof Ionicons.glyphMap
  onPress: () => void
  accessibilityLabel?: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      {icon ? <Ionicons name={icon} size={15} color={colors.white} /> : null}
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  )
}

/** Icon-only header action (e.g. refresh), styled like the back button. */
export function AppHeaderIconAction({
  icon,
  onPress,
  accessibilityLabel,
  busy = false,
}: {
  icon: keyof typeof Ionicons.glyphMap
  onPress: () => void
  accessibilityLabel: string
  busy?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
    >
      {busy ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name={icon} size={18} color={colors.nav} />}
    </Pressable>
  )
}

function initials(name?: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'E'
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '')).toUpperCase()
}

function AccountButton({ onOpenProfile }: { onOpenProfile?: () => void }) {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [open, setOpen] = useState(false)

  return (
    <View style={styles.accountWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open account menu"
        accessibilityState={{ expanded: open }}
        hitSlop={6}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
      >
        <Text style={styles.avatarText}>{initials(user?.display_name)}</Text>
      </Pressable>
      {open ? (
        <View style={styles.menu}>
          {onOpenProfile ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Profile"
              onPress={() => {
                setOpen(false)
                onOpenProfile()
              }}
              style={({ pressed }) => [styles.menuRow, pressed && styles.menuPressed]}
            >
              <Ionicons name="person-outline" size={17} color={colors.nav} />
              <Text style={styles.menuText}>Profile</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Log out"
            onPress={() => {
              setOpen(false)
              void logout()
            }}
            style={({ pressed }) => [styles.menuRow, pressed && styles.menuPressed]}
          >
            <Ionicons name="log-out-outline" size={17} color={colors.danger} />
            <Text style={[styles.menuText, styles.menuDanger]}>Log out</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

const PROFILE_ROUTES = ['StaffProfile', 'Profile']

function findProfileNavigator(navigation: any): { nav: any; route: string } | null {
  let current = navigation
  while (current) {
    const names: string[] = current.getState?.()?.routeNames ?? []
    const match = PROFILE_ROUTES.find((name) => names.includes(name))
    if (match) return { nav: current, route: match }
    current = current.getParent?.()
  }
  return null
}

type NavigatorHeaderProps = (NativeStackHeaderProps | BottomTabHeaderProps) & { back?: { title: string } }

function isTabBarHidden(style: unknown) {
  const flat = StyleSheet.flatten(style as any) as { display?: string } | undefined
  return flat?.display === 'none'
}

// Screens reached straight from the bottom bar (or its "All tools" sheet). They show the
// logo and account menu; every other screen shows a back button.
const TOP_LEVEL_ROUTES = new Set([
  'StaffAttendance', 'StaffExams', 'StaffScanUpload', 'StaffPreviousPapers',
  'PapersList', 'ResultsList', 'ProfileMain',
  'Attendance', 'PreviousPapers', 'CheatSheets',
])
const HOME_ROUTES = ['StaffHome', 'Home']

function navigateHome(navigation: any) {
  let current = navigation
  while (current) {
    const names: string[] = current.getState?.()?.routeNames ?? []
    const home = HOME_ROUTES.find((name) => names.includes(name))
    if (home) {
      current.navigate(home)
      return
    }
    current = current.getParent?.()
  }
}

function NavigatorHeader({ navigation, route, options, back }: NavigatorHeaderProps) {
  const role = useAuthStore((state) => state.user?.role)
  const compact = useHeaderCompact(route.key)
  const backOverride = useHeaderBackOverride(route.key)
  const meta = resolveScreenHeader(route.name, role)
  const headerTitle = typeof options.headerTitle === 'string' ? options.headerTitle : undefined
  const title = headerTitle ?? meta.title ?? options.title ?? route.name
  const tabBarStyle = (options as BottomTabHeaderProps['options']).tabBarStyle
  // A stack screen pushed on top of another is always inner; an Attendance route pushed
  // from the Workspace stack has history even though the same name is top-level as a tab.
  const topLevel = !back && !backOverride && TOP_LEVEL_ROUTES.has(route.name) && !isTabBarHidden(tabBarStyle)
  const mode: 'root' | 'inner' = topLevel ? 'root' : 'inner'

  const onBack = () => {
    if (backOverride) backOverride()
    else if (navigation.canGoBack()) navigation.goBack()
    else if (meta.backFallback) navigation.navigate(meta.backFallback as never)
    else navigateHome(navigation)
  }

  const profile = mode === 'root' ? findProfileNavigator(navigation) : null
  const onProfile = profile && route.name !== profile.route && route.name !== 'ProfileMain'
    ? () => profile.nav.navigate(profile.route)
    : undefined

  const right = options.headerRight?.({ tintColor: colors.nav, canGoBack: navigation.canGoBack() } as any)

  return (
    <AppHeader
      title={title}
      label={meta.label}
      mode={mode}
      onBack={onBack}
      onOpenProfile={onProfile}
      right={right}
      compact={compact}
    />
  )
}

/** Use as `header` in any stack or tab navigator's screenOptions. */
export function renderAppHeader(props: NavigatorHeaderProps) {
  return <NavigatorHeader {...props} />
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background,
    zIndex: 10,
  },
  surface: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.backgroundElevated,
    shadowColor: colors.nav,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  row: {
    height: APP_HEADER_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingLeft: spacing[3],
    paddingRight: spacing[4],
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logo: {
    width: 38,
    height: 38,
    borderRadius: 12,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  label: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.4,
    overflow: 'hidden',
  },
  title: {
    color: colors.nav,
    fontFamily: typography.fonts.heading,
    lineHeight: 28,
    letterSpacing: -0.4,
  },
  right: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  action: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing[3],
    borderRadius: radius.full,
    backgroundColor: colors.nav,
  },
  actionText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  accountWrap: {
    position: 'relative',
    zIndex: 20,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  avatarText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 0.4,
  },
  menu: {
    position: 'absolute',
    top: 44,
    right: 0,
    minWidth: 150,
    paddingVertical: spacing[1],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    shadowColor: colors.nav,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  menuRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
  },
  menuPressed: {
    backgroundColor: colors.accentSurface,
  },
  menuText: {
    color: colors.nav,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  menuDanger: {
    color: colors.danger,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
})
