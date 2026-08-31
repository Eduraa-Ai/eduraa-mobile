import React, { ReactNode, useEffect, useMemo, useState } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Modal,
  PixelRatio,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatedButton, AnimatedCard, AppScreen, ErrorState, TextInputField } from '../../components/ui'
import {
  approvalsApi,
  type ApprovalQueueData,
  type ClassTeacherApproval,
  type PendingAccount,
  type TeacherProfileApproval,
} from '../../api/approvals'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import {
  canAccessApprovalActions,
  getApprovalRoleContract,
  getVisibleApprovalQueues,
  removeCompletedApproval,
  type ApprovalQueueKey,
} from './approvalsModel'

const QUEUE_COPY: Record<ApprovalQueueKey, { title: string; subtitle: string; empty: string }> = {
  principals: {
    title: 'Principal access',
    subtitle: 'New leadership memberships in your school scope.',
    empty: 'No principal access requests need your review.',
  },
  teachers: {
    title: 'Teacher access',
    subtitle: 'Educators waiting to join this branch.',
    empty: 'No teacher access requests need your review.',
  },
  students: {
    title: 'Student access',
    subtitle: 'Learners in your assigned class sections.',
    empty: 'No students in your class are waiting for approval.',
  },
  classTeacherRequests: {
    title: 'Class-teacher plans',
    subtitle: 'Subject ownership proposed for a class.',
    empty: 'No class-teacher plans need your review.',
  },
  teacherProfileUpdates: {
    title: 'Teacher profile changes',
    subtitle: 'Identity and teaching-scope changes awaiting review.',
    empty: 'No teacher profile changes need your review.',
  },
}

function formatDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function queueErrorMessage(error: unknown) {
  const candidate = error as { code?: string; response?: { status?: number; data?: { detail?: string } } }
  if (candidate.code === 'ERR_NETWORK') return 'This queue is offline. Your other loaded queues are still available.'
  if (candidate.code === 'ECONNABORTED') return 'This queue took too long to respond. Try only this queue again.'
  if (candidate.response?.status === 403) return 'Your account no longer has permission for this queue. Refresh your session or contact your school administrator.'
  if (candidate.response?.status === 401) return 'Your session expired. Sign in again to continue reviewing requests.'
  if ((candidate.response?.status ?? 0) >= 500) return 'This secure queue is temporarily unavailable. Nothing was changed—try this queue again shortly.'
  return candidate.response?.data?.detail || 'This queue could not load. Your other queues are unaffected.'
}

function mutationErrorMessage(error: unknown) {
  const candidate = error as { code?: string; response?: { status?: number; data?: { detail?: string } } }
  if (candidate.code === 'ERR_NETWORK') return 'The decision was not confirmed. Reconnect and check the queue before trying again.'
  if (candidate.response?.status === 409) return candidate.response.data?.detail || 'Another reviewer already completed this request. The queue has been refreshed.'
  return candidate.response?.data?.detail || 'The decision could not be completed. Nothing was changed.'
}

function useApprovalQueue<K extends ApprovalQueueKey>(key: K, enabled: boolean, userId?: string) {
  return useQuery<ApprovalQueueData[K]>({
    queryKey: ['approvals', userId, key],
    queryFn: () => approvalsApi.getQueue(key),
    enabled,
    retry: 1,
    staleTime: 15_000,
  })
}

function DetailLine({ label, value }: { label: string; value?: ReactNode }) {
  if (!value) return null
  return (
    <View style={styles.detailLine} accessible accessibilityLabel={`${label}: ${String(value)}`}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  )
}

function DecisionActions({
  label,
  disabled,
  busyAction,
  onApprove,
  onReject,
}: {
  label: string
  disabled: boolean
  busyAction?: 'approve' | 'reject'
  onApprove: () => void
  onReject: () => void
}) {
  const { width } = useWindowDimensions()
  const stacked = width < 360 || PixelRatio.getFontScale() > 1.15
  const approve = (
    <AnimatedButton
      label="Approve"
      accessibilityLabel={`Approve ${label}`}
      icon={<Ionicons name="checkmark" size={18} color={colors.white} />}
      loading={busyAction === 'approve'}
      disabled={disabled}
      onPress={onApprove}
      style={stacked ? styles.stackedAction : styles.approveButton}
    />
  )
  return (
    <View style={[styles.actionRow, stacked && styles.actionColumn]} accessibilityRole="toolbar" accessibilityLabel={`Decision for ${label}`}>
      {approve}
      <AnimatedButton label="Reject" accessibilityLabel={`Reject ${label}`} icon={<Ionicons name="close" size={18} color={colors.danger} />} loading={busyAction === 'reject'} disabled={disabled} onPress={onReject} style={stacked ? styles.stackedRejectAction : styles.rejectButton} />
    </View>
  )
}

function QueueSection({
  queueKey,
  count,
  error,
  outcomeUnknown,
  loading,
  retrying,
  onRetry,
  children,
}: {
  queueKey: ApprovalQueueKey
  count: number
  error?: unknown
  outcomeUnknown: boolean
  loading: boolean
  retrying: boolean
  onRetry: () => void
  children: ReactNode
}) {
  const copy = QUEUE_COPY[queueKey]
  return (
    <View style={styles.section} accessibilityRole="summary">
      <View style={styles.sectionHeader}>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>{copy.title}</Text>
          <Text style={styles.sectionSubtitle}>{copy.subtitle}</Text>
        </View>
        <View style={[styles.countPill, outcomeUnknown && styles.countPillUnavailable]} accessibilityLabel={outcomeUnknown ? `${copy.title} is unavailable` : `${count} pending`}>
          <Text style={[styles.countText, outcomeUnknown && styles.countTextUnavailable]}>{outcomeUnknown ? 'Unavailable' : count}</Text>
        </View>
      </View>
      {loading ? (
        <View style={styles.queueLoading} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.queueLoadingText}>Loading only this queue</Text>
        </View>
      ) : error ? (
        <View style={styles.queueError} accessibilityRole="alert">
          <View style={styles.queueStateIcon}>
            <Ionicons name="cloud-offline-outline" size={20} color={colors.danger} />
          </View>
          <View style={styles.queueStateCopy}>
            <Text style={styles.queueStateTitle}>{copy.title} needs attention</Text>
            <Text style={styles.queueStateBody}>{queueErrorMessage(error)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Retry ${copy.title}`}
              accessibilityState={{ busy: retrying }}
              onPress={onRetry}
              disabled={retrying}
              style={styles.retryButton}
            >
              {retrying ? <ActivityIndicator color={colors.accentStrong} /> : <Ionicons name="refresh" size={17} color={colors.accentStrong} />}
              <Text style={styles.retryText}>{retrying ? 'Retrying' : `Retry ${copy.title}`}</Text>
            </Pressable>
          </View>
        </View>
      ) : count === 0 ? (
        <View style={styles.emptyLane}>
          <View style={styles.emptyCheck}>
            <Ionicons name="checkmark" size={18} color={colors.success} />
          </View>
          <Text style={styles.emptyText}>{copy.empty}</Text>
        </View>
      ) : children}
    </View>
  )
}

function AccountCard({
  item,
  busyAction,
  disabled,
  onApprove,
  onReject,
}: {
  item: PendingAccount
  busyAction?: 'approve' | 'reject'
  disabled: boolean
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <AnimatedCard style={styles.requestCard}>
      <View style={styles.cardTop}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{item.display_name.slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>{item.display_name}</Text>
          <Text style={styles.cardMeta}>{item.identifier}</Text>
        </View>
      </View>
      <View style={styles.detailGrid}>
        <DetailLine label="Requested" value={formatDate(item.created_at)} />
        <DetailLine label="Standards" value={item.standards_taught?.join(', ')} />
        <DetailLine label="Subjects" value={item.subjects_taught?.join(', ')} />
        <DetailLine label="Class" value={item.class_teacher_opt_in ? `${item.class_teacher_standard ?? ''} ${item.class_teacher_division ?? ''}`.trim() : undefined} />
      </View>
      <DecisionActions label={item.display_name} disabled={disabled} busyAction={busyAction} onApprove={onApprove} onReject={onReject} />
    </AnimatedCard>
  )
}

function ClassTeacherCard({
  item,
  busyAction,
  disabled,
  onApprove,
  onReject,
}: {
  item: ClassTeacherApproval
  busyAction?: 'approve' | 'reject'
  disabled: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const label = `${item.class_teacher_name}'s plan for ${item.standard} ${item.division}`
  return (
    <AnimatedCard style={styles.requestCard}>
      <View style={styles.cardTop}>
        <View style={styles.planIcon}><Ionicons name="git-branch-outline" size={20} color={colors.accent} /></View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>{item.class_teacher_name}</Text>
          <Text style={styles.cardMeta}>{item.standard} · Division {item.division}</Text>
        </View>
      </View>
      <View style={styles.assignmentList}>
        {item.assignments.map((assignment) => (
          <View key={`${item.id}-${assignment.teacher_id}-${assignment.subject}`} style={styles.assignmentRow}>
            <Text style={styles.assignmentSubject}>{assignment.subject}</Text>
            <Text style={styles.assignmentTeacher}>{assignment.teacher_name}</Text>
          </View>
        ))}
      </View>
      <DecisionActions label={label} disabled={disabled} busyAction={busyAction} onApprove={onApprove} onReject={onReject} />
    </AnimatedCard>
  )
}

function ProfileUpdateCard({
  item,
  busyAction,
  disabled,
  onApprove,
  onReject,
}: {
  item: TeacherProfileApproval
  busyAction?: 'approve' | 'reject'
  disabled: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const requested = item.requested_profile
  const current = item.current_profile
  return (
    <AnimatedCard style={styles.requestCard}>
      <View style={styles.cardTop}>
        <View style={styles.planIcon}><Ionicons name="person-outline" size={20} color={colors.accent} /></View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>{item.teacher_name}</Text>
          <Text style={styles.cardMeta}>Submitted {formatDate(item.submitted_at) || 'recently'}</Text>
        </View>
      </View>
      <View style={styles.profileCompare}>
        <View style={styles.requestedProfile}>
          <Text style={styles.compareEyebrow}>REQUESTED</Text>
          <DetailLine label="Name" value={`${requested.first_name} ${requested.last_name}`} />
          <DetailLine label="Email" value={requested.email} />
          <DetailLine label="Teacher ID" value={requested.teacher_id} />
          <DetailLine label="Branch" value={requested.branch_name} />
          <DetailLine label="Subjects" value={requested.subjects_taught.join(', ')} />
        </View>
        <View style={styles.currentProfile}>
          <Text style={styles.compareEyebrowMuted}>CURRENT RECORD</Text>
          <Text style={styles.currentProfileText}>{current.first_name} {current.last_name} · {current.teacher_id}</Text>
        </View>
      </View>
      <DecisionActions label={`${item.teacher_name}'s profile update`} disabled={disabled} busyAction={busyAction} onApprove={onApprove} onReject={onReject} />
    </AnimatedCard>
  )
}

type DecisionVariables = {
  queue: ApprovalQueueKey
  id: string
  label: string
  action: 'approve' | 'reject'
  run: () => Promise<unknown>
}

export default function ApprovalsScreen() {
  const navigation = useNavigation<any>()
  const { height } = useWindowDimensions()
  const compactHeight = height < 760
  const user = useAuthStore((state) => state.user)
  const roleContract = getApprovalRoleContract(user?.role)
  const visibleQueues = getVisibleApprovalQueues(user?.role)
  const canDecide = canAccessApprovalActions(user?.role)
  const queryClient = useQueryClient()
  const [principalPassword, setPrincipalPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [slow, setSlow] = useState(false)
  const [pendingDecision, setPendingDecision] = useState<DecisionVariables | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [hasReceivedInitialQueueResult, setHasReceivedInitialQueueResult] = useState(false)

  const principals = useApprovalQueue('principals', visibleQueues.includes('principals'), user?.id)
  const teachers = useApprovalQueue('teachers', visibleQueues.includes('teachers'), user?.id)
  const students = useApprovalQueue('students', visibleQueues.includes('students'), user?.id)
  const classTeacherRequests = useApprovalQueue('classTeacherRequests', visibleQueues.includes('classTeacherRequests'), user?.id)
  const teacherProfileUpdates = useApprovalQueue('teacherProfileUpdates', visibleQueues.includes('teacherProfileUpdates'), user?.id)
  const queryMap = { principals, teachers, students, classTeacherRequests, teacherProfileUpdates }
  const visibleQueryList = visibleQueues.map((key) => queryMap[key])
  const loadingAny = visibleQueryList.some((query) => query.isPending)
  const loadedAny = visibleQueryList.some((query) => query.data !== undefined)
  const refreshing = visibleQueryList.some((query) => query.isRefetching && !query.isPending)
  const hasQueueResult = visibleQueryList.some((query) => query.data !== undefined || query.error)
  const unavailableQueues = visibleQueues.filter((key) => queryMap[key].data === undefined && (queryMap[key].error || queryMap[key].isPending))
  const hasUnavailableQueue = unavailableQueues.length > 0

  useEffect(() => {
    if (hasQueueResult) setHasReceivedInitialQueueResult(true)
  }, [hasQueueResult])

  useEffect(() => {
    setHasReceivedInitialQueueResult(false)
  }, [user?.id])

  useEffect(() => {
    if (!loadingAny) {
      setSlow(false)
      return
    }
    const timer = setTimeout(() => setSlow(true), 6000)
    return () => clearTimeout(timer)
  }, [loadingAny])

  const totalPending = useMemo(
    () => visibleQueues.reduce((total, key) => total + (queryMap[key].data?.length ?? 0), 0),
    // Query data references are intentionally enumerated for a stable derived count.
    [visibleQueues, principals.data, teachers.data, students.data, classTeacherRequests.data, teacherProfileUpdates.data],
  )

  const decisionMutation = useMutation({
    retry: false,
    mutationFn: async (variables: DecisionVariables) => variables.run(),
    onMutate: (variables) => {
      setNotice(null)
      setBusyKey(`${variables.queue}:${variables.id}:${variables.action}`)
    },
    onSuccess: async (_data, variables) => {
      queryClient.setQueryData<Array<{ id: string }>>(
        ['approvals', user?.id, variables.queue],
        (current) => removeCompletedApproval(current, variables.id),
      )
      setNotice({
        tone: 'success',
        text: `${variables.label} was ${variables.action === 'approve' ? 'approved' : 'rejected'}. The queue is up to date.`,
      })
      AccessibilityInfo.announceForAccessibility(`${variables.label} ${variables.action === 'approve' ? 'approved' : 'rejected'}`)
      await queryClient.invalidateQueries({ queryKey: ['approvals', user?.id, variables.queue] })
    },
    onError: async (error, variables) => {
      setNotice({ tone: 'error', text: mutationErrorMessage(error) })
      if ((error as { response?: { status?: number } }).response?.status === 409) {
        await queryClient.invalidateQueries({ queryKey: ['approvals', user?.id, variables.queue] })
      }
    },
    onSettled: () => setBusyKey(null),
  })

  const requestDecision = (variables: DecisionVariables) => {
    if (decisionMutation.isPending || busyKey) return
    if (variables.queue === 'principals' && !principalPassword.trim()) {
      const message = 'Re-enter your admin password before deciding a principal request.'
      setPasswordError(message)
      AccessibilityInfo.announceForAccessibility(message)
      return
    }
    setPendingDecision(variables)
  }

  const accountDecision = (queue: 'principals' | 'teachers' | 'students', item: PendingAccount) => {
    const run = queue === 'principals'
      ? () => approvalsApi.approvePrincipal(item.id, principalPassword)
      : queue === 'teachers'
        ? () => approvalsApi.approveTeacher(item.id)
        : () => approvalsApi.approveStudent(item.id)
    requestDecision({ queue, id: item.id, label: item.display_name, action: 'approve', run })
  }
  const accountRejection = (queue: 'principals' | 'teachers' | 'students', item: PendingAccount) => requestDecision({ queue, id: item.id, label: item.display_name, action: 'reject', run: () => queue === 'principals' ? approvalsApi.rejectPrincipal(item.id, rejectionReason, principalPassword) : queue === 'teachers' ? approvalsApi.rejectTeacher(item.id, rejectionReason) : approvalsApi.rejectStudent(item.id, rejectionReason) })

  const requestPlanDecision = (item: ClassTeacherApproval) => requestDecision({
    queue: 'classTeacherRequests',
    id: item.id,
    label: `${item.class_teacher_name}'s class-teacher plan`,
    action: 'approve',
    run: () => approvalsApi.approveClassTeacherRequest(item.id),
  })
  const requestPlanRejection = (item: ClassTeacherApproval) => requestDecision({ queue: 'classTeacherRequests', id: item.id, label: `${item.class_teacher_name}'s class-teacher plan`, action: 'reject', run: () => approvalsApi.rejectClassTeacherRequest(item.id, rejectionReason) })

  const requestProfileDecision = (item: TeacherProfileApproval) => requestDecision({
    queue: 'teacherProfileUpdates',
    id: item.id,
    label: `${item.teacher_name}'s profile update`,
    action: 'approve',
    run: () => approvalsApi.approveTeacherProfileUpdate(item.id),
  })
  const requestProfileRejection = (item: TeacherProfileApproval) => requestDecision({ queue: 'teacherProfileUpdates', id: item.id, label: `${item.teacher_name}'s profile update`, action: 'reject', run: () => approvalsApi.rejectTeacherProfileUpdate(item.id, rejectionReason) })

  const isItemBusy = (queue: ApprovalQueueKey, id: string) => busyKey?.startsWith(`${queue}:${id}:`) ? busyKey.split(':').at(-1) as 'approve' | 'reject' : undefined
  const refreshVisible = () => void Promise.all(visibleQueues.map((key) => queryMap[key].refetch()))
  const leaveApprovals = () => {
    const routeNames: string[] = navigation.getState?.().routeNames ?? []
    if (routeNames.includes('StaffHome')) navigation.navigate('StaffHome')
    else if (routeNames.includes('StaffWorkspace')) navigation.navigate('StaffWorkspace')
    else if (navigation.canGoBack?.()) navigation.goBack()
  }

  if (!canDecide || !roleContract) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ErrorState
          title="Approval actions are not available"
          message="This account cannot review other people’s school access. Student approval status is available from the sign-in screen."
        />
      </AppScreen>
    )
  }

  if (loadingAny && !loadedAny && !hasReceivedInitialQueueResult) {
    return (
      <AppScreen scroll={false} contentStyle={styles.loadingRoot}>
        <View style={styles.loadingMark}><ActivityIndicator color={colors.accent} /></View>
        <Text style={styles.loadingEyebrow}>SECURE SCHOOL SCOPE</Text>
        <Text style={styles.loadingTitle}>Preparing your review desk.</Text>
        <Text style={styles.loadingBody}>{slow ? 'The school connection is slower than usual. You can keep this screen open safely.' : 'Only the queues permitted for your role are being loaded.'}</Text>
      </AppScreen>
    )
  }

  return (
    <AppScreen
      contentStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshVisible} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <View style={styles.screenTopbar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to workspace" onPress={leaveApprovals} style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}>
          <Ionicons name="arrow-back" size={20} color={colors.nav} />
        </Pressable>
        <View style={styles.screenTopbarCopy}>
          <Text style={styles.screenTopbarEyebrow}>SECURE SCHOOL SCOPE</Text>
          <Text style={styles.screenTopbarTitle}>Approvals</Text>
        </View>
      </View>

      <View style={[styles.hero, compactHeight && styles.heroCompact]}>
        <View style={styles.heroTop}>
          <View style={styles.heroMark}><Ionicons name="shield-checkmark" size={22} color={colors.accent} /></View>
          <Text style={styles.heroRole}>{roleContract.label.toUpperCase()}</Text>
        </View>
        <Text style={[styles.heroTitle, compactHeight && styles.heroTitleCompact]}>{hasUnavailableQueue ? `${unavailableQueues.length === 1 ? 'A review queue needs attention.' : 'Review queues need attention.'}` : totalPending ? `${totalPending} decision${totalPending === 1 ? '' : 's'} need you.` : 'Your review desk is clear.'}</Text>
        <Text style={[styles.heroBody, compactHeight && styles.heroBodyCompact]}>{hasUnavailableQueue ? 'We could not confirm every permitted queue. Retry the highlighted queue; other loaded queues remain available.' : `${roleContract.purpose} Other roles’ queues stay private.`}</Text>
        <View style={[styles.heroTrust, compactHeight && styles.heroTrustCompact]}>
          <Ionicons name="time-outline" size={16} color="#AAB5C6" />
          <Text style={styles.heroTrustText}>{hasUnavailableQueue ? 'No decision was made while a queue is unavailable.' : 'Every completed decision keeps its actor and server time.'}</Text>
        </View>
      </View>

      {slow && loadingAny ? (
        <View style={styles.slowBanner} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.accentStrong} />
          <Text style={styles.slowText}>One queue is still arriving. Loaded queues remain ready to review.</Text>
        </View>
      ) : null}

      {notice ? (
        <View style={[styles.notice, notice.tone === 'success' ? styles.noticeSuccess : styles.noticeError]} accessibilityRole="alert">
          <Ionicons name={notice.tone === 'success' ? 'checkmark-circle' : 'alert-circle'} size={20} color={notice.tone === 'success' ? colors.success : colors.danger} />
          <Text style={[styles.noticeText, notice.tone === 'success' ? styles.noticeSuccessText : styles.noticeErrorText]}>{notice.text}</Text>
        </View>
      ) : null}

      {visibleQueues.includes('principals') ? (
        <QueueSection queueKey="principals" count={principals.data?.length ?? 0} error={principals.error} outcomeUnknown={Boolean(principals.data === undefined && (principals.error || principals.isPending))} loading={principals.isPending} retrying={principals.isRefetching} onRetry={() => void principals.refetch()}>
          <View style={styles.passwordBlock}>
            <TextInputField
              label="Confirm with your admin password"
              value={principalPassword}
              onChangeText={(value) => { setPrincipalPassword(value); setPasswordError(null) }}
              secureTextEntry
              placeholder="Re-enter password"
              error={passwordError ?? undefined}
              left={<Ionicons name="lock-closed" size={17} color={colors.textMuted} />}
            />
            <Text style={styles.passwordHint}>Used only for this decision; it is never stored on the device.</Text>
          </View>
          {principals.data?.map((item) => <AccountCard key={item.id} item={item} disabled={decisionMutation.isPending} busyAction={isItemBusy('principals', item.id)} onApprove={() => accountDecision('principals', item)} onReject={() => { setRejectionReason(''); accountRejection('principals', item) }} />)}
        </QueueSection>
      ) : null}

      {visibleQueues.includes('teachers') ? (
        <QueueSection queueKey="teachers" count={teachers.data?.length ?? 0} error={teachers.error} outcomeUnknown={Boolean(teachers.data === undefined && (teachers.error || teachers.isPending))} loading={teachers.isPending} retrying={teachers.isRefetching} onRetry={() => void teachers.refetch()}>
          {teachers.data?.map((item) => <AccountCard key={item.id} item={item} disabled={decisionMutation.isPending} busyAction={isItemBusy('teachers', item.id)} onApprove={() => accountDecision('teachers', item)} onReject={() => { setRejectionReason(''); accountRejection('teachers', item) }} />)}
        </QueueSection>
      ) : null}

      {visibleQueues.includes('students') ? (
        <QueueSection queueKey="students" count={students.data?.length ?? 0} error={students.error} outcomeUnknown={Boolean(students.data === undefined && (students.error || students.isPending))} loading={students.isPending} retrying={students.isRefetching} onRetry={() => void students.refetch()}>
          {students.data?.map((item) => <AccountCard key={item.id} item={item} disabled={decisionMutation.isPending} busyAction={isItemBusy('students', item.id)} onApprove={() => accountDecision('students', item)} onReject={() => { setRejectionReason(''); accountRejection('students', item) }} />)}
        </QueueSection>
      ) : null}

      {visibleQueues.includes('classTeacherRequests') ? (
        <QueueSection queueKey="classTeacherRequests" count={classTeacherRequests.data?.length ?? 0} error={classTeacherRequests.error} outcomeUnknown={Boolean(classTeacherRequests.data === undefined && (classTeacherRequests.error || classTeacherRequests.isPending))} loading={classTeacherRequests.isPending} retrying={classTeacherRequests.isRefetching} onRetry={() => void classTeacherRequests.refetch()}>
          {classTeacherRequests.data?.map((item) => <ClassTeacherCard key={item.id} item={item} disabled={decisionMutation.isPending} busyAction={isItemBusy('classTeacherRequests', item.id)} onApprove={() => requestPlanDecision(item)} onReject={() => { setRejectionReason(''); requestPlanRejection(item) }} />)}
        </QueueSection>
      ) : null}

      {visibleQueues.includes('teacherProfileUpdates') ? (
        <QueueSection queueKey="teacherProfileUpdates" count={teacherProfileUpdates.data?.length ?? 0} error={teacherProfileUpdates.error} outcomeUnknown={Boolean(teacherProfileUpdates.data === undefined && (teacherProfileUpdates.error || teacherProfileUpdates.isPending))} loading={teacherProfileUpdates.isPending} retrying={teacherProfileUpdates.isRefetching} onRetry={() => void teacherProfileUpdates.refetch()}>
          {teacherProfileUpdates.data?.map((item) => <ProfileUpdateCard key={item.id} item={item} disabled={decisionMutation.isPending} busyAction={isItemBusy('teacherProfileUpdates', item.id)} onApprove={() => requestProfileDecision(item)} onReject={() => { setRejectionReason(''); requestProfileRejection(item) }} />)}
        </QueueSection>
      ) : null}

      <Modal visible={Boolean(pendingDecision)} transparent animationType="fade" onRequestClose={() => setPendingDecision(null)}>
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmSheet} accessibilityRole="alert">
            <View style={styles.confirmIcon}>
              <Ionicons name="shield-outline" size={24} color={colors.danger} />
            </View>
            <Text style={styles.confirmEyebrow}>FINAL SCHOOL DECISION</Text>
            <Text style={styles.confirmTitle}>{pendingDecision?.action === 'reject' ? 'Reject this request?' : 'Approve this request?'}</Text>
            <Text style={styles.confirmTarget}>{pendingDecision?.label}</Text>
            {pendingDecision?.action === 'reject' ? <View style={styles.rejectionReasonBlock}><TextInputField label="Reason for rejection (required)" value={rejectionReason} onChangeText={setRejectionReason} placeholder="Explain what must be corrected" multiline error={rejectionReason.trim().length > 0 && rejectionReason.trim().length < 3 ? 'Use at least 3 characters.' : undefined} /><Text style={styles.rejectionReasonHint}>Tell the educator what to correct (minimum 3 characters).</Text></View> : null}
            <View style={styles.confirmAuditRow}>
              <Ionicons name="time-outline" size={17} color={colors.textMuted} />
              <Text style={styles.confirmAuditText}>Your identity, this target, the decision, and server time will be recorded.</Text>
            </View>
            <View style={styles.confirmActions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Keep request pending" onPress={() => setPendingDecision(null)} style={({ pressed }) => [styles.confirmCancel, pressed && styles.buttonPressed]}>
                <Text style={styles.confirmCancelText}>Keep pending</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${pendingDecision?.action === 'reject' ? 'Reject' : 'Approve'} request for ${pendingDecision?.label ?? ''}`}
                accessibilityState={{ disabled: pendingDecision?.action === 'reject' && rejectionReason.trim().length < 3 }}
                disabled={pendingDecision?.action === 'reject' && rejectionReason.trim().length < 3}
                onPress={() => {
                  if (!pendingDecision || decisionMutation.isPending || (pendingDecision.action === 'reject' && rejectionReason.trim().length < 3)) return
                  const decision = pendingDecision
                  setPendingDecision(null)
                  decisionMutation.mutate(decision)
                }}
                style={({ pressed }) => [pendingDecision?.action === 'reject' ? styles.confirmReject : styles.confirmPrimary, pendingDecision?.action === 'reject' && rejectionReason.trim().length < 3 && styles.confirmRejectDisabled, pressed && styles.buttonPressed]}
              >
                <Text style={styles.confirmPrimaryText}>{pendingDecision?.action === 'reject' ? 'Reject request' : 'Approve request'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing[20] + 84, gap: spacing[7] },
  screenTopbar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  backButton: { width: 44, height: 44, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, ...shadows.xs },
  screenTopbarCopy: { flex: 1 },
  screenTopbarEyebrow: { ...typography.roles.eyebrow, color: colors.accentStrong },
  screenTopbarTitle: { marginTop: 2, color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 19 },
  center: { alignItems: 'center', justifyContent: 'center' },
  loadingRoot: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[8] },
  loadingMark: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSurface },
  loadingEyebrow: { ...typography.roles.eyebrow, marginTop: spacing[5], color: colors.accentStrong },
  loadingTitle: { ...typography.roles.screenTitle, marginTop: spacing[2], color: colors.nav, textAlign: 'center' },
  loadingBody: { ...typography.roles.body, maxWidth: 320, marginTop: spacing[3], color: colors.textMuted, textAlign: 'center' },
  hero: { overflow: 'hidden', borderRadius: 30, padding: spacing[6], backgroundColor: colors.nav, ...shadows.lg },
  heroCompact: { padding: spacing[5], borderRadius: 26 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  heroMark: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(243,108,33,0.14)', borderWidth: 1, borderColor: 'rgba(243,108,33,0.28)' },
  heroRole: { ...typography.roles.eyebrow, flex: 1, color: '#FFD9C2' },
  heroTitle: { marginTop: spacing[7], color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 31, lineHeight: 37, letterSpacing: -0.7 },
  heroTitleCompact: { marginTop: spacing[4], fontSize: 27, lineHeight: 32 },
  heroBody: { ...typography.roles.body, marginTop: spacing[3], color: '#AAB5C6' },
  heroBodyCompact: { marginTop: spacing[2], fontSize: 13, lineHeight: 19 },
  heroTrust: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[6], paddingTop: spacing[4], borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  heroTrustCompact: { marginTop: spacing[4], paddingTop: spacing[3] },
  heroTrustText: { flex: 1, color: '#AAB5C6', fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  slowBanner: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderRadius: radius.xl, backgroundColor: colors.warningSurface },
  slowText: { ...typography.roles.body, flex: 1, color: colors.warning },
  notice: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing[3], padding: spacing[4], borderRadius: radius.xl, borderWidth: 1 },
  noticeSuccess: { backgroundColor: colors.successSurface, borderColor: colors.successBorder },
  noticeError: { backgroundColor: colors.dangerSurface, borderColor: colors.dangerBorder },
  noticeText: { ...typography.roles.body, flex: 1 },
  noticeSuccessText: { color: colors.successText },
  noticeErrorText: { color: colors.dangerText },
  section: { gap: spacing[4] },
  sectionHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'flex-start', gap: spacing[4] },
  sectionCopy: { flex: 1 },
  sectionTitle: { ...typography.roles.title, color: colors.nav },
  sectionSubtitle: { ...typography.roles.body, marginTop: spacing[1], color: colors.textMuted },
  countPill: { minWidth: 44, height: 44, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSurface },
  countPillUnavailable: { minWidth: 92, paddingHorizontal: spacing[3], backgroundColor: colors.dangerSurface },
  countText: { color: colors.accentStrong, fontFamily: typography.fonts.headingSemibold, fontSize: 17 },
  countTextUnavailable: { fontFamily: typography.fonts.bodyBold, fontSize: 11, color: colors.dangerText },
  queueError: { flexDirection: 'row', gap: spacing[3], padding: spacing[4], borderRadius: radius.xl, borderWidth: 1, borderColor: colors.dangerBorder, backgroundColor: colors.dangerSurface },
  queueLoading: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], borderRadius: radius.xl, backgroundColor: colors.backgroundElevated },
  queueLoadingText: { ...typography.roles.body, color: colors.textMuted },
  queueStateIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  queueStateCopy: { flex: 1 },
  queueStateTitle: { color: colors.dangerText, fontFamily: typography.fonts.bodyBold, fontSize: 14 },
  queueStateBody: { ...typography.roles.body, marginTop: spacing[1], color: colors.textSecondary },
  retryButton: { minHeight: 48, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], marginTop: spacing[3], paddingHorizontal: spacing[3], borderRadius: radius.full, borderWidth: 1, borderColor: colors.dangerBorder, backgroundColor: colors.white },
  retryText: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  emptyLane: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated },
  emptyCheck: { width: 40, height: 40, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.successSurface },
  emptyText: { ...typography.roles.body, flex: 1, color: colors.textSecondary },
  passwordBlock: { gap: spacing[1] },
  passwordHint: { marginHorizontal: spacing[2], color: colors.textSoft, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 16 },
  requestCard: { gap: spacing[3], padding: spacing[4], borderColor: colors.borderSubtle },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  avatar: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.nav },
  avatarText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 16 },
  planIcon: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSurface },
  cardCopy: { flex: 1, minWidth: 0 },
  cardTitle: { color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 17, lineHeight: 22 },
  cardMeta: { marginTop: 1, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
  detailGrid: { gap: spacing[1], paddingTop: spacing[2], borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  detailLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  detailLabel: { width: 82, flexShrink: 0, color: colors.textSoft, fontFamily: typography.fonts.bodyBold, fontSize: 11, lineHeight: 17 },
  detailValue: { flex: 1, color: colors.textSecondary, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 17 },
  actionRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing[3] },
  actionColumn: { flexDirection: 'column' },
  stackedAction: { width: '100%' },
  stackedRejectAction: { width: '100%' },
  approveButton: { flex: 1 },
  rejectButton: { flex: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.danger },
  buttonPressed: { transform: [{ scale: 0.98 }], opacity: 0.88 },
  buttonDisabled: { opacity: 0.55 },
  assignmentList: { overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.backgroundMuted },
  assignmentRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3], paddingHorizontal: spacing[4], borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  assignmentSubject: { flex: 1, color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  assignmentTeacher: { flex: 1, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12, textAlign: 'right' },
  profileCompare: { gap: spacing[2] },
  requestedProfile: { gap: spacing[2], padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.accentSurface },
  currentProfile: { padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.backgroundMuted },
  compareEyebrow: { ...typography.roles.eyebrow, marginBottom: spacing[1], color: colors.accentStrong },
  compareEyebrowMuted: { ...typography.roles.eyebrow, color: colors.textSoft },
  currentProfileText: { ...typography.roles.body, marginTop: spacing[1], color: colors.textSecondary },
  confirmBackdrop: { flex: 1, justifyContent: 'flex-end', padding: spacing[4], backgroundColor: 'rgba(3, 10, 24, 0.62)' },
  confirmSheet: { gap: spacing[3], padding: spacing[6], paddingBottom: spacing[7], borderRadius: 30, backgroundColor: colors.white, ...shadows.lg },
  confirmIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSurface },
  confirmEyebrow: { ...typography.roles.eyebrow, color: colors.accentStrong },
  confirmTitle: { color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 25, lineHeight: 31 },
  confirmTarget: { color: colors.textSecondary, fontFamily: typography.fonts.bodyBold, fontSize: 15, lineHeight: 21 },
  confirmAuditRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.backgroundMuted },
  confirmAuditText: { ...typography.roles.body, flex: 1, color: colors.textMuted },
  confirmActions: { gap: spacing[3], marginTop: spacing[2] },
  rejectionReasonBlock: { gap: spacing[2] },
  rejectionReasonHint: { color: colors.textMuted, fontFamily: typography.fonts.body, fontSize: 12, lineHeight: 17 },
  confirmCancel: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.white },
  confirmCancelText: { color: colors.textSecondary, fontFamily: typography.fonts.bodyBold, fontSize: 14 },
  confirmPrimary: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.accent },
  confirmReject: { minHeight: 56, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.danger },
  confirmRejectDisabled: { opacity: 0.45 },
  confirmPrimaryText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 14 },
})
