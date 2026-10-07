import React, { useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import type { MobileControl } from '../../data/mobileControlCatalog'
import { groupStaffControls, StaffToolGroupId, staffToolIcons, staffToolLabels } from '../../data/staffToolGroups'
import { useVisibleControls } from '../../hooks/useVisibleControls'
import { useAuthStore } from '../../stores/authStore'
import { colors, typography } from '../../theme'

const primaryNames = ['StaffHome', 'StaffAttendance', 'StaffExams', 'StaffPapers']

const labels: Record<string, string> = {
  StaffHome: 'Home',
  StaffAttendance: 'Attendance',
  StaffExams: 'Exams',
  StaffPapers: 'Papers',
}

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  StaffHome: 'home-outline',
  StaffAttendance: 'checkmark-circle-outline',
  StaffExams: 'calendar-outline',
  StaffPapers: 'document-text-outline',
}

const { palette } = colors

type SectionId = StaffToolGroupId | 'web'

/** One soft tint per group at the same lightness, so no single row shouts. */
const groupTints: Record<SectionId, { surface: string; ink: string }> = {
  teach: { surface: palette.orange[50], ink: palette.orange[600] },
  assess: { surface: palette.sky[50], ink: palette.sky[600] },
  connect: { surface: palette.teal[50], ink: palette.teal[700] },
  more: { surface: palette.violet[50], ink: palette.violet[600] },
  learn: { surface: palette.orange[50], ink: palette.orange[600] },
  school: { surface: palette.sky[50], ink: palette.sky[600] },
  progress: { surface: palette.teal[50], ink: palette.teal[700] },
  web: { surface: palette.slate[100], ink: palette.slate[500] },
}

type ToolRoute = { tab: string; screen?: string; params?: Record<string, unknown> }

/**
 * Where a catalog control opens from the staff tab bar: its own tab when the
 * role has one, otherwise the matching screen inside the Home (StaffHome) stack.
 */
function staffRouteFor(control: MobileControl, tabNames: string[]): ToolRoute {
  const home = (screen: string, params?: Record<string, unknown>): ToolRoute => ({ tab: 'StaffHome', screen, params })
  const tabOr = (tab: string, homeScreen: string): ToolRoute => (tabNames.includes(tab) ? { tab } : home(homeScreen))

  switch (control.id) {
    case 'dashboard': return home('Dashboard')
    case 'class-teacher': return home('ClassTeacherOverview')
    case 'announcements': return home('Announcements')
    case 'doubts': return home('Doubts')
    case 'approvals': return tabOr('StaffApprovals', 'Approvals')
    case 'attendance': return tabOr('StaffAttendance', 'Attendance')
    case 'scan-upload': return tabOr('StaffScanUpload', 'ScanUpload')
    case 'exams': return tabOr('StaffExams', 'Exams')
  }

  if (control.nativeStatus !== 'web-only' && control.target.kind === 'tab') {
    const { tab, screen, params } = control.target
    if (tab === 'Papers') return { tab: 'StaffPapers', screen, params }
    if (tab === 'AIStudio') return tabOr('StaffAIStudio', 'StaffAIStudio')
    if (tab === 'Results') return tabOr('StaffResults', 'StaffResults')
    if (tab === 'PreviousPapers' && tabNames.includes('StaffPreviousPapers')) return { tab: 'StaffPreviousPapers' }
    if (tab === 'Profile' && tabNames.includes('StaffProfile')) return { tab: 'StaffProfile' }
  }
  return home('Feature', { featureId: control.id })
}

export function StaffBottomTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const [toolsOpen, setToolsOpen] = useState(false)
  const role = useAuthStore((store) => store.user?.role)
  const { controls } = useVisibleControls()
  const focusedRoute = state.routes[state.index]
  const primaryRoutes = primaryNames.flatMap((name) => state.routes.filter((route) => route.name === name))
  const moreSelected = !primaryNames.includes(focusedRoute.name)
  const tabNames = state.routes.map((route) => route.name)
  const nestedState = focusedRoute.state
  const focusedScreen = nestedState && typeof nestedState.index === 'number' ? nestedState.routes[nestedState.index]?.name : undefined

  const sections = useMemo(() => {
    const groups: { id: SectionId; label: string; controls: MobileControl[] }[] = groupStaffControls(
      controls.filter((control) => control.nativeStatus !== 'web-only'),
      role,
    )
    const webOnly = controls.filter((control) => control.nativeStatus === 'web-only')
    if (webOnly.length) groups.push({ id: 'web', label: 'On Eduraa web', controls: webOnly })
    return groups
  }, [controls, role])

  const openRoute = (route: typeof state.routes[number]) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
    if (event.defaultPrevented) return
    setToolsOpen(false)
    if (route.key !== focusedRoute.key) navigation.navigate(route.name)
  }

  const openTool = (target: ToolRoute) => {
    setToolsOpen(false)
    if (target.screen) navigation.navigate(target.tab, { screen: target.screen, params: target.params })
    else navigation.navigate(target.tab)
  }

  const isCurrent = (target: ToolRoute) => {
    if (target.tab !== focusedRoute.name) return false
    if (!target.screen) return true
    return target.screen !== 'Feature' && focusedScreen === target.screen
  }

  return (
    <>
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <View style={styles.rail}>
          {primaryRoutes.map((route) => {
            const selected = route.key === focusedRoute.key
            const options = descriptors[route.key]?.options
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={options?.tabBarAccessibilityLabel ?? labels[route.name]}
                testID={options?.tabBarTestID}
                onPress={() => openRoute(route)}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
              >
                <View style={[styles.iconFrame, selected && styles.selectedFrame]}>
                  <Ionicons name={icons[route.name]} size={22} color={selected ? colors.white : colors.slate[600]} />
                </View>
                <Text numberOfLines={2} style={[styles.tabLabel, selected && styles.selectedLabel]}>{route.name === 'StaffAttendance' ? 'Attend' : labels[route.name]}</Text>
              </Pressable>
            )
          })}
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: moreSelected || toolsOpen, expanded: toolsOpen }}
            accessibilityLabel="All tools"
            onPress={() => setToolsOpen(true)}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
          >
            <View style={[styles.iconFrame, (moreSelected || toolsOpen) && styles.selectedFrame]}>
              <Ionicons name="grid-outline" size={22} color={moreSelected || toolsOpen ? colors.white : colors.slate[600]} />
            </View>
            <Text numberOfLines={2} style={[styles.tabLabel, (moreSelected || toolsOpen) && styles.selectedLabel]}>All tools</Text>
          </Pressable>
        </View>
      </View>
      <Modal visible={toolsOpen} transparent animationType="slide" onRequestClose={() => setToolsOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.scrim} accessibilityLabel="Close all tools" onPress={() => setToolsOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle} accessibilityRole="header">All tools</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close all tools" onPress={() => setToolsOpen(false)} style={styles.closeButton}>
                <Ionicons name="close" size={21} color={colors.slate[700]} />
              </Pressable>
            </View>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.toolList} keyboardShouldPersistTaps="handled">
              {sections.map((section) => {
                const tint = groupTints[section.id]
                const web = section.id === 'web'
                return (
                  <View key={section.id}>
                    <Text style={styles.groupLabel} accessibilityRole="header">{section.label}</Text>
                    {section.controls.map((control, index) => {
                      const target = staffRouteFor(control, tabNames)
                      const selected = isCurrent(target)
                      const inTabBar = !target.screen && target.tab !== 'StaffHome' && primaryNames.includes(target.tab)
                      const label = staffToolLabels[control.id] ?? control.label
                      return (
                        <Pressable
                          key={control.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          accessibilityLabel={web ? `${label}, opens on Eduraa web` : label}
                          onPress={() => openTool(target)}
                          style={({ pressed }) => [styles.toolRow, index === 0 && styles.toolRowFirst, pressed && styles.toolRowPressed]}
                        >
                          <View style={[styles.toolIcon, { backgroundColor: tint.surface }]}>
                            <Ionicons name={staffToolIcons[control.id] ?? 'ellipse-outline'} size={19} color={tint.ink} />
                          </View>
                          <Text style={[styles.toolLabel, web && styles.toolLabelWeb]} numberOfLines={1}>{label}</Text>
                          {inTabBar && !selected ? <Text style={styles.toolHint}>In tab bar</Text> : null}
                          {selected ? (
                            <Ionicons name="checkmark" size={18} color={colors.accent} />
                          ) : (
                            <Ionicons name={web ? 'open-outline' : 'chevron-forward'} size={web ? 15 : 17} color={colors.slate[400]} />
                          )}
                        </Pressable>
                      )
                    })}
                  </View>
                )
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  )
}

// ─── Students ───────────────────────────────────────────────────────────────
// Same dock as staff: four destinations in the rail, everything else in a
// "More" sheet, so both apps share one navigation pattern.

const studentOrder = ['Home', 'Papers', 'Results', 'Attendance', 'PreviousPapers', 'CheatSheets', 'Profile']

const studentLabels: Record<string, string> = {
  Home: 'Home',
  Papers: 'Papers',
  Results: 'Results',
  Attendance: 'Attend',
  PreviousPapers: 'Previous',
  CheatSheets: 'Cheat sheets',
  Profile: 'Profile',
}

const studentSheetLabels: Record<string, string> = {
  Attendance: 'Attendance',
  PreviousPapers: 'Previous papers',
  CheatSheets: 'Cheat sheets',
  Profile: 'Profile',
}

const studentIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: 'home-outline',
  Papers: 'document-text-outline',
  Results: 'bar-chart-outline',
  Attendance: 'checkmark-circle-outline',
  PreviousPapers: 'documents-outline',
  CheatSheets: 'reader-outline',
  Profile: 'person-outline',
}

const studentTints: Record<string, { surface: string; ink: string }> = {
  Attendance: groupTints.teach,
  PreviousPapers: groupTints.assess,
  CheatSheets: groupTints.more,
  Profile: groupTints.connect,
}

export function StudentBottomTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const focusedRoute = state.routes[state.index]
  const ordered = studentOrder.flatMap((name) => state.routes.filter((route) => route.name === name))
  const others = state.routes.filter((route) => !studentOrder.includes(route.name))
  const all = [...ordered, ...others]
  const primary = all.slice(0, 4)
  const extra = all.slice(4)
  const moreSelected = extra.some((route) => route.key === focusedRoute.key)

  const openRoute = (route: typeof state.routes[number]) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
    if (event.defaultPrevented) return
    setMoreOpen(false)
    if (route.key !== focusedRoute.key) navigation.navigate(route.name)
  }

  return (
    <>
      <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <View style={styles.rail}>
          {primary.map((route) => {
            const selected = route.key === focusedRoute.key
            const options = descriptors[route.key]?.options
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={options?.tabBarAccessibilityLabel ?? studentSheetLabels[route.name] ?? studentLabels[route.name] ?? route.name}
                testID={options?.tabBarTestID}
                onPress={() => openRoute(route)}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
              >
                <View style={[styles.iconFrame, selected && styles.selectedFrame]}>
                  <Ionicons name={studentIcons[route.name] ?? 'ellipse-outline'} size={22} color={selected ? colors.white : colors.slate[600]} />
                </View>
                <Text numberOfLines={1} style={[styles.tabLabel, selected && styles.selectedLabel]}>{studentLabels[route.name] ?? route.name}</Text>
              </Pressable>
            )
          })}
          {extra.length ? (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: moreSelected || moreOpen, expanded: moreOpen }}
              accessibilityLabel="More"
              onPress={() => setMoreOpen(true)}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
            >
              <View style={[styles.iconFrame, (moreSelected || moreOpen) && styles.selectedFrame]}>
                <Ionicons name="grid-outline" size={22} color={moreSelected || moreOpen ? colors.white : colors.slate[600]} />
              </View>
              <Text numberOfLines={1} style={[styles.tabLabel, (moreSelected || moreOpen) && styles.selectedLabel]}>More</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.scrim} accessibilityLabel="Close more" onPress={() => setMoreOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle} accessibilityRole="header">More</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close more" onPress={() => setMoreOpen(false)} style={styles.closeButton}>
                <Ionicons name="close" size={21} color={colors.slate[700]} />
              </Pressable>
            </View>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.toolList}>
              <View>
                {extra.map((route, index) => {
                  const selected = route.key === focusedRoute.key
                  const tint = studentTints[route.name] ?? groupTints.more
                  const label = studentSheetLabels[route.name] ?? studentLabels[route.name] ?? route.name
                  return (
                    <Pressable
                      key={route.key}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      accessibilityLabel={descriptors[route.key]?.options.tabBarAccessibilityLabel ?? label}
                      onPress={() => openRoute(route)}
                      style={({ pressed }) => [styles.toolRow, index === 0 && styles.toolRowFirst, pressed && styles.toolRowPressed]}
                    >
                      <View style={[styles.toolIcon, { backgroundColor: tint.surface }]}>
                        <Ionicons name={studentIcons[route.name] ?? 'ellipse-outline'} size={19} color={tint.ink} />
                      </View>
                      <Text style={styles.toolLabel} numberOfLines={1}>{label}</Text>
                      {selected ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : <Ionicons name="chevron-forward" size={17} color={colors.slate[400]} />}
                    </Pressable>
                  )
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.borderSubtle, shadowColor: colors.slate[950], shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.06, shadowRadius: 18, elevation: 12 },
  rail: { width: '100%', maxWidth: 520, alignSelf: 'center', minHeight: 70, flexDirection: 'row', paddingHorizontal: 4, alignItems: 'center' },
  tab: { flex: 1, minWidth: 0, minHeight: 68, alignItems: 'center', justifyContent: 'center', gap: 4 },
  pressed: { opacity: 0.72 },
  iconFrame: { width: 40, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  selectedFrame: { backgroundColor: colors.nav },
  tabLabel: { color: colors.slate[600], fontSize: 11, fontFamily: typography.fonts.bodySemibold, lineHeight: 15, textAlign: 'center' },
  selectedLabel: { color: colors.nav, fontFamily: typography.fonts.bodyBold },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(2, 6, 23, 0.46)' },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '88%', alignSelf: 'center', backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 9 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.slate[300], marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { color: colors.slate[950], fontSize: 24, fontFamily: typography.fonts.bodyBold, letterSpacing: -0.6 },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.slate[100] },
  sheetScroll: { flexGrow: 0 },
  toolList: { paddingBottom: 8, gap: 14 },
  groupLabel: { color: colors.slate[500], fontSize: 11, fontFamily: typography.fonts.bodyBold, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 },
  toolRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 14, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  toolRowFirst: { borderTopWidth: 0 },
  toolRowPressed: { backgroundColor: colors.slate[50] },
  toolIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toolLabel: { flex: 1, color: colors.slate[900], fontSize: 15, fontFamily: typography.fonts.bodySemibold },
  toolLabelWeb: { color: colors.slate[700] },
  toolHint: { color: colors.slate[500], fontSize: 11, fontFamily: typography.fonts.bodySemibold },
})
