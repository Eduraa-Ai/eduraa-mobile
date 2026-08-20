import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { AppScreen } from '../../components/ui'
import { b2cApi } from '../../api/b2c'
import { mobileControls, MobileControl, roleCanSeeControl } from '../../data/mobileControlCatalog'
import { useClassTeacherAccess } from '../../hooks/useClassTeacherAccess'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, spacing, typography } from '../../theme'

function roleLabel(role?: string) {
  return role ? role.replace(/_/g, ' ') : 'workspace'
}

function isCompetitiveProfile(user: ReturnType<typeof useAuthStore.getState>['user'], profile?: Awaited<ReturnType<typeof b2cApi.getProfile>>) {
  return (
    user?.b2c_education_level === 'competitive_exams' ||
    user?.b2c_education_level === 'competitive_exam' ||
    profile?.education_level === 'competitive_exams'
  )
}

function isJeeProfile(user: ReturnType<typeof useAuthStore.getState>['user'], profile?: Awaited<ReturnType<typeof b2cApi.getProfile>>) {
  const haystack = [
    user?.b2c_board,
    user?.b2c_standard,
    user?.b2c_target_exam,
    ...(user?.b2c_subjects ?? []),
    profile?.school_board,
    profile?.school_standard,
    ...(profile?.subjects ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes('jee')
}

function WorkflowRow({ control, index, first, last, onPress }: { control: MobileControl; index: number; first: boolean; last: boolean; onPress: () => void }) {
  const iconName = control.icon as keyof typeof Ionicons.glyphMap

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${control.label}. ${control.description}`}
      style={({ pressed }) => [styles.workflowRow, first && styles.workflowRowFirst, last && styles.workflowRowLast, pressed && styles.pressed]}
    >
      <View style={styles.workflowIndex}>
        <Text style={styles.workflowIndexText}>{String(index + 1).padStart(2, '0')}</Text>
      </View>
      <View style={styles.workflowIcon}>
        <Ionicons name={iconName in Ionicons.glyphMap ? iconName : 'ellipse'} size={18} color={colors.accent} />
      </View>
      <View style={styles.workflowCopy}>
        {first ? <Text style={styles.workflowFirstLabel}>ROLE START</Text> : null}
        <Text style={styles.workflowTitle}>{control.label}</Text>
        <Text style={styles.workflowBody} numberOfLines={2}>{control.description}</Text>
      </View>
      <Ionicons name="arrow-forward" size={18} color={colors.textSoft} />
    </Pressable>
  )
}

export default function WorkspaceScreen() {
  const navigation = useNavigation<any>()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)

  const b2cQuery = useQuery({
    queryKey: ['workspace-b2c-profile', user?.id],
    queryFn: b2cApi.getProfile,
    enabled: user?.role === 'b2c_student',
  })

  const classTeacherAccess = useClassTeacherAccess({ enabled: user?.role === 'teacher' })

  const controls = useMemo(() => {
    if (!user?.role) return []
    const competitive = isCompetitiveProfile(user, b2cQuery.data)
    const jee = isJeeProfile(user, b2cQuery.data)

    return mobileControls.filter((control) => {
      if (control.hiddenOnWeb || !roleCanSeeControl(user.role, control)) return false
      if (control.requiresClassTeacher) {
        // The JWT claim can be stale in both directions, so the server's
        // answer is the gate. Issue #61 forbids a client flag deciding this.
        if (!classTeacherAccess.isAuthorized) return false
      }
      if (control.requiresCompetitiveExam && !competitive) return false
      if (control.requiresJee && !jee) return false
      return true
    })
  }, [b2cQuery.data, classTeacherAccess.isAuthorized, user])

  const openControl = (control: MobileControl) => {
    const parent = navigation.getParent?.()
    const parentRoutes: string[] = parent?.getState?.().routeNames ?? []

    if (control.id === 'class-teacher') {
      navigation.navigate('ClassTeacherOverview')
      return
    }
    if (control.id === 'approvals') {
      if (parentRoutes.includes('StaffApprovals')) parent.navigate('StaffApprovals')
      else navigation.navigate('Approvals')
      return
    }
    if (control.id === 'attendance') {
      if (parentRoutes.includes('StaffAttendance')) parent.navigate('StaffAttendance')
      else navigation.navigate('Attendance')
      return
    }
    if (control.id === 'scan-upload') {
      if (parentRoutes.includes('StaffScanUpload')) parent.navigate('StaffScanUpload')
      else navigation.navigate('ScanUpload')
      return
    }
    if (control.id === 'exams' || control.id === 'student-exams') {
      if (parentRoutes.includes('StaffExams')) parent.navigate('StaffExams')
      else navigation.navigate('Exams')
      return
    }

    if (control.target.kind === 'tab') {
      const isStaffTabs = parentRoutes.includes('StaffHome')
      if (isStaffTabs) {
        if (control.target.tab === 'AIStudio') navigation.navigate('StaffAIStudio')
        else if (control.target.tab === 'Papers' && control.target.screen === 'GeneratePaper') navigation.navigate('StaffGeneratePaper')
        else if (control.target.tab === 'Papers') navigation.navigate('StaffPapers')
        else if (control.target.tab === 'Results') navigation.navigate('StaffResults')
        else if (control.target.tab === 'Profile' && parentRoutes.includes('StaffProfile')) parent.navigate('StaffProfile')
        else if (control.target.tab === 'Home' && !control.target.screen) parent.navigate('StaffHome')
        else navigation.navigate('Feature', { featureId: control.id })
        return
      }

      if (parent) {
        parent.navigate(control.target.tab, control.target.screen ? { screen: control.target.screen, params: control.target.params } : undefined)
        return
      }
    }

    navigation.navigate('Feature', { featureId: control.id })
  }

  const preferredId = user?.role === 'principal' ? 'approvals' : 'exams'
  const focusControl = controls.find((control) => control.id === preferredId) ?? controls[0]
  const orderedControls = focusControl
    ? [focusControl, ...controls.filter((control) => control.id !== focusControl.id)]
    : controls
  const firstName = user?.display_name?.trim().split(/\s+/)[0]

  return (
    <AppScreen contentStyle={styles.screen}>
      <View style={styles.identityRow}>
        <Image source={require('../../../assets/eduraa-book-brain.png')} style={styles.logo} resizeMode="cover" />
        <View style={styles.identityCopy}>
          <Text style={styles.identityName}>EDURAA</Text>
          <Text style={styles.identityRole}>{roleLabel(user?.role)}</Text>
        </View>
        <View style={styles.accountMenuWrap}>
          <Pressable
            onPress={() => setAccountMenuOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel="Open account menu"
            style={({ pressed }) => [styles.livePill, pressed && styles.pressed]}
          >
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live</Text>
            <Ionicons name={accountMenuOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.success} />
          </Pressable>
          {accountMenuOpen ? (
            <View style={styles.accountDropdown}>
              <Pressable
                onPress={() => {
                  setAccountMenuOpen(false)
                  void logout()
                }}
                accessibilityRole="button"
                accessibilityLabel="Logout"
                style={({ pressed }) => [styles.logoutRow, pressed && styles.pressed]}
              >
                <Ionicons name="log-out-outline" size={17} color={colors.danger} />
                <Text style={styles.logoutText}>Logout</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.intro}>
        <Text style={styles.eyebrow}>TODAY’S DESK</Text>
        <Text style={styles.title}>{firstName ? `${firstName}, choose your next move.` : 'Choose your next move.'}</Text>
        <Text style={styles.subtitle}>Your role-ready tools, connected to Eduraa data and kept in one focused place.</Text>
      </View>

      {user?.role === 'b2c_student' && b2cQuery.isLoading ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.inlineLoadingText}>Personalizing your workspace</Text>
        </View>
      ) : null}

      {orderedControls.length ? (
        <View style={styles.workflowSection}>
          <View style={styles.workflowHeader}>
            <Text style={styles.workflowHeading}>Live workflows</Text>
            <Text style={styles.workflowMeta}>{orderedControls.length} ready</Text>
          </View>
          <View style={styles.workflowList}>
            {orderedControls.map((control, index) => (
              <WorkflowRow
                key={control.id}
                control={control}
                index={index}
                first={index === 0}
                last={index === orderedControls.length - 1}
                onPress={() => openControl(control)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing[20] + 48, gap: spacing[5] },
  identityRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing[3], zIndex: 2 },
  logo: { width: 44, height: 44, borderRadius: 17 },
  identityCopy: { flex: 1 },
  identityName: { color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 12, letterSpacing: 2.8 },
  identityRole: { marginTop: 2, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11, textTransform: 'capitalize' },
  accountMenuWrap: { position: 'relative', alignItems: 'flex-end', zIndex: 3 },
  livePill: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing[3], borderRadius: radius.full, backgroundColor: colors.successSurface },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  liveText: { color: colors.success, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  accountDropdown: { position: 'absolute', top: 40, right: 0, minWidth: 132, borderRadius: 12, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.white, paddingVertical: spacing[1] },
  logoutRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[3] },
  logoutText: { color: colors.danger, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  intro: { gap: spacing[2], marginTop: -spacing[1] },
  eyebrow: { color: colors.accent, fontFamily: typography.fonts.bodyBold, fontSize: 11, letterSpacing: 1.3 },
  title: { maxWidth: 350, color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
  subtitle: { maxWidth: 355, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 14, lineHeight: 21 },
  inlineLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  inlineLoadingText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  workflowSection: { gap: spacing[3] },
  workflowHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  workflowHeading: { color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 20 },
  workflowMeta: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  workflowList: { overflow: 'hidden', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderStrong },
  workflowRow: { minHeight: 102, flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[4], borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  workflowRowFirst: { minHeight: 124, borderLeftWidth: 4, borderLeftColor: colors.accent, paddingLeft: spacing[3], backgroundColor: colors.accentSurface },
  workflowRowLast: { borderBottomWidth: 0 },
  workflowIndex: { width: 24 },
  workflowIndexText: { color: colors.textSoft, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  workflowIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: colors.accentSurface },
  workflowCopy: { flex: 1 },
  workflowFirstLabel: { marginBottom: spacing[1], color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 9, letterSpacing: 1.1 },
  workflowTitle: { color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 15 },
  workflowBody: { marginTop: spacing[1], color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.7, backgroundColor: colors.accentSurface },
})
