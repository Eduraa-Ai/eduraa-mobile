import React, { ReactNode, useRef, useState } from 'react'
import { ActivityIndicator, Image, Pressable, RefreshControlProps, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { AppScreen, SegmentedTabs } from '../../components/ui'
import { MobileControl } from '../../data/mobileControlCatalog'
import { groupStaffControls, isLearnerRole, workspaceToolLabel } from '../../data/staffToolGroups'
import { useVisibleControls } from '../../hooks/useVisibleControls'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, spacing, typography } from '../../theme'

function roleLabel(role?: string) {
  if (role === 'b2c_student') return 'Learner'
  return role ? role.replace(/_/g, ' ') : 'workspace'
}

const workflowSummaries: Record<string, string> = {
  dashboard: 'Class and school performance',
  attendance: 'Mark and review daily attendance',
  'teacher-students': 'Roster and student profiles',
  'class-teacher': 'Your class and enrollments',
  exams: 'Set and manage exams',
  generate: 'Create a question paper',
  'generate-custom': 'Upload a paper and answer key',
  'scan-upload': 'Scan answer sheets for checking',
  'checked-papers': 'Review marks and feedback',
  'previous-papers': 'School paper library',
  approvals: 'Review incoming requests',
  announcements: 'Send updates to your classes',
  doubts: 'Answer student questions',
  'ai-studio': 'Plan and create with AI',
  teacher: 'Your teacher profile',
  'principal-profile': 'Your school profile',
  'index-books': 'School book catalog',
  'index-notes': 'School notes catalog',
}

/** Students read the same rows with learner wording. */
const learnerSummaries: Record<string, string> = {
  dashboard: 'Scores, progress and what to study next',
  attendance: 'Your attendance and leave requests',
  generate: 'Create a focused set of questions',
  'scan-upload': 'Upload your answer sheet',
  'checked-papers': 'Marks and teacher feedback',
  'previous-papers': 'Past papers to practise',
  announcements: 'Updates from your school',
  doubts: 'Send and follow up on a doubt',
  'agentic-learning': 'Work through a lesson at your pace',
  'competitive-exam': 'JEE chapters, packs and drills',
  'student-exams': 'Assigned exams and class practice',
  'cheat-sheets': 'Quick revision notes',
  'ai-studio': 'Get help when you are stuck',
  'student-profile': 'Your school profile and account',
}

function WorkflowRow({ control, last, learner, onPress }: { control: MobileControl; last: boolean; learner: boolean; onPress: () => void }) {
  const iconName = control.icon as keyof typeof Ionicons.glyphMap
  const label = workspaceToolLabel(control, learner)
  const summary = (learner ? learnerSummaries[control.id] : undefined) ?? workflowSummaries[control.id] ?? control.description

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${summary}`}
      style={({ pressed }) => [styles.workflowRow, last && styles.workflowRowLast, pressed && styles.pressed]}
    >
      <View style={styles.workflowIcon}>
        <Ionicons name={iconName in Ionicons.glyphMap ? iconName : 'ellipse'} size={18} color={colors.accent} />
      </View>
      <View style={styles.workflowCopy}>
        <Text style={styles.workflowTitle}>{label}</Text>
        <Text style={styles.workflowBody} numberOfLines={1}>{summary}</Text>
        {control.nativeStatus === 'web-only' ? <Text style={styles.workflowWebHint}>Opens on Eduraa web</Text> : null}
      </View>
      <Ionicons name="arrow-forward" size={18} color={colors.textSoft} />
    </Pressable>
  )
}

/**
 * The one Home for every role. Students pass `lead` (their Continue row) and a
 * refresh control; the header, groups and rows are identical for everyone.
 */
export default function WorkspaceScreen({ lead, footer, refreshControl }: { lead?: ReactNode; footer?: ReactNode; refreshControl?: React.ReactElement<RefreshControlProps> } = {}) {
  const navigation = useNavigation<any>()
  const screenRef = useRef<ScrollView>(null)
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const learner = isLearnerRole(user?.role)
  const [activeWorkflowGroup, setActiveWorkflowGroup] = useState<string>(learner ? 'learn' : 'teach')

  const { controls, isPersonalizing } = useVisibleControls()

  const openControl = (control: MobileControl) => {
    const parent = navigation.getParent?.()
    const parentRoutes: string[] = parent?.getState?.().routeNames ?? []

    if (control.id === 'dashboard') {
      navigation.navigate(learner ? 'LearnerDashboard' : 'Dashboard')
      return
    }
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
      else if (parentRoutes.includes('Attendance')) parent.navigate('Attendance')
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
    if (control.id === 'announcements') {
      navigation.navigate('Announcements')
      return
    }
    if (control.id === 'doubts') {
      navigation.navigate('Doubts')
      return
    }

    if (control.target.kind === 'tab') {
      const isStaffTabs = parentRoutes.includes('StaffHome')
      if (isStaffTabs) {
        if (control.target.tab === 'AIStudio') navigation.navigate('StaffAIStudio')
        else if (control.target.tab === 'Papers') {
          parent.navigate(
            'StaffPapers',
            control.target.screen
              ? { screen: control.target.screen, params: control.target.params }
              : undefined,
          )
        }
        else if (control.target.tab === 'Results') navigation.navigate('StaffResults')
        else if (control.target.tab === 'PreviousPapers' && parentRoutes.includes('StaffPreviousPapers')) parent.navigate('StaffPreviousPapers')
        else if (control.target.tab === 'Profile' && parentRoutes.includes('StaffProfile')) parent.navigate('StaffProfile')
        else if (control.target.tab === 'Home' && !control.target.screen) parent.navigate('StaffHome')
        else navigation.navigate('Feature', { featureId: control.id })
        return
      }

      // Learners: AI Studio lives in the Home stack; other targets are tabs.
      if (control.target.tab === 'AIStudio') {
        navigation.navigate('AIStudio')
        return
      }
      if (control.target.tab === 'Home' && control.target.screen) {
        navigation.navigate(control.target.screen, control.target.params)
        return
      }
      if (parent && parentRoutes.includes(control.target.tab)) {
        parent.navigate(control.target.tab, control.target.screen ? { screen: control.target.screen, params: control.target.params } : undefined)
        return
      }
    }

    navigation.navigate('Feature', { featureId: control.id })
  }

  const preferredId = user?.role === 'principal' ? 'approvals' : learner ? 'agentic-learning' : 'exams'
  const focusControl = controls.find((control) => control.id === preferredId) ?? controls[0]
  const orderedControls = focusControl
    ? [focusControl, ...controls.filter((control) => control.id !== focusControl.id)]
    : controls
  const groupedWorkflows = groupStaffControls(orderedControls, user?.role)
  const selectedGroup = groupedWorkflows.find((group) => group.id === activeWorkflowGroup) ?? groupedWorkflows[0]
  const displayedControls = selectedGroup?.controls ?? orderedControls
  const firstName = user?.display_name?.trim().split(/\s+/)[0]

  return (
    <AppScreen scrollRef={screenRef} contentStyle={styles.screen} refreshControl={refreshControl}>
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
        <Text style={styles.title}>Workspace</Text>
        <Text style={styles.subtitle}>{firstName ? `Choose a tool to get started, ${firstName}.` : 'Choose a tool to get started.'}</Text>
      </View>

      {lead ?? null}

      {isPersonalizing ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.inlineLoadingText}>Personalizing your workspace</Text>
        </View>
      ) : null}

      {orderedControls.length ? (
        <View style={styles.workflowSection}>
          <View style={styles.workflowHeader}>
            <Text style={styles.workflowHeading}>{selectedGroup?.label ?? 'Your workflows'}</Text>
            <Text style={styles.workflowMeta}>{displayedControls.length} of {orderedControls.length} tools</Text>
          </View>
          {groupedWorkflows.length > 1 ? (
            <SegmentedTabs
              accessibilityLabel="Workspace sections"
              tabs={groupedWorkflows.map((group) => ({ id: group.id, label: group.label }))}
              value={selectedGroup.id}
              onChange={(group) => {
                setActiveWorkflowGroup(group)
                screenRef.current?.scrollTo({ y: 0, animated: false })
              }}
            />
          ) : null}
          <View style={styles.workflowList}>
            {displayedControls.map((control, index) => (
              <WorkflowRow
                key={control.id}
                control={control}
                last={index === displayedControls.length - 1}
                learner={learner}
                onPress={() => openControl(control)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {footer ?? null}
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
  title: { maxWidth: 350, color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  subtitle: { maxWidth: 355, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 14, lineHeight: 21 },
  inlineLoading: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  inlineLoadingText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  workflowSection: { gap: spacing[3] },
  workflowHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  workflowHeading: { color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 18 },
  workflowMeta: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  workflowList: { overflow: 'hidden', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderStrong },
  workflowRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  workflowRowLast: { borderBottomWidth: 0 },
  workflowIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.accentSurface },
  workflowCopy: { flex: 1 },
  workflowTitle: { color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 15 },
  workflowBody: { marginTop: spacing[1], color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 17 },
  workflowWebHint: { marginTop: spacing[1], color: colors.accentStrong, fontFamily: typography.fonts.bodySemibold, fontSize: 11 },
  pressed: { opacity: 0.7, backgroundColor: colors.accentSurface },
})
