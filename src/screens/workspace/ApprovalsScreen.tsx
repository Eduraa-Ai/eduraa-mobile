import React, { ReactNode, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatedButton, AnimatedCard, AppScreen, ErrorState, GradientHeroCard, SelectableChip, TextInputField } from '../../components/ui'
import {
  approvalsApi,
  ApprovalQueues,
  ClassTeacherApproval,
  PendingAccount,
  TeacherProfileApproval,
} from '../../api/approvals'
import { colors, radius, shadows, spacing, typography } from '../../theme'

type QueueKey = keyof Omit<ApprovalQueues, 'errors'>

function formatDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function DetailLine({ label, value }: { label: string; value?: ReactNode }) {
  if (!value) return null
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  )
}

function QueueSection({
  title,
  subtitle,
  count,
  error,
  children,
}: {
  title: string
  subtitle: string
  count: number
  error?: string
  children: ReactNode
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      </View>
      {error ? (
        <AnimatedCard style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </AnimatedCard>
      ) : count === 0 ? (
        <AnimatedCard style={styles.emptyCard}>
          <Text style={styles.emptyText}>No pending approvals.</Text>
        </AnimatedCard>
      ) : (
        children
      )}
    </View>
  )
}

function AccountApprovalCard({
  item,
  actionLabel,
  isBusy,
  onApprove,
}: {
  item: PendingAccount
  actionLabel: string
  isBusy: boolean
  onApprove: () => void
}) {
  return (
    <AnimatedCard style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.display_name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>{item.display_name}</Text>
          <Text style={styles.cardMeta}>{item.identifier}</Text>
        </View>
        <SelectableChip label={item.role.replace(/_/g, ' ')} selected />
      </View>

      <View style={styles.detailGrid}>
        <DetailLine label="Created" value={formatDate(item.created_at)} />
        <DetailLine label="Standards" value={item.standards_taught?.join(', ')} />
        <DetailLine label="Subjects" value={item.subjects_taught?.join(', ')} />
        <DetailLine label="Class teacher" value={item.class_teacher_opt_in ? `${item.class_teacher_standard ?? ''} ${item.class_teacher_division ?? ''}`.trim() : undefined} />
      </View>

      <AnimatedButton label={actionLabel} loading={isBusy} disabled={isBusy} onPress={onApprove} />
    </AnimatedCard>
  )
}

function ClassTeacherCard({ item, isBusy, onApprove }: { item: ClassTeacherApproval; isBusy: boolean; onApprove: () => void }) {
  return (
    <AnimatedCard style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.iconBubble}>
          <Ionicons name="school" size={18} color={colors.accent} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>{item.class_teacher_name}</Text>
          <Text style={styles.cardMeta}>{item.standard} {item.division}</Text>
        </View>
      </View>
      {item.assignments.map((assignment) => (
        <View key={`${item.id}-${assignment.teacher_id}-${assignment.subject}`} style={styles.assignmentRow}>
          <Text style={styles.assignmentSubject}>{assignment.subject}</Text>
          <Text style={styles.assignmentTeacher}>{assignment.teacher_name}</Text>
        </View>
      ))}
      <AnimatedButton label="Approve class teacher request" loading={isBusy} disabled={isBusy} onPress={onApprove} />
    </AnimatedCard>
  )
}

function ProfileUpdateCard({ item, isBusy, onApprove }: { item: TeacherProfileApproval; isBusy: boolean; onApprove: () => void }) {
  const requested = item.requested_profile
  const current = item.current_profile

  return (
    <AnimatedCard style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.iconBubble}>
          <Ionicons name="person-add" size={18} color={colors.accent} />
        </View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>{item.teacher_name}</Text>
          <Text style={styles.cardMeta}>Submitted {formatDate(item.submitted_at) || 'recently'}</Text>
        </View>
      </View>
      <View style={styles.compareBox}>
        <Text style={styles.compareTitle}>Requested profile</Text>
        <DetailLine label="Name" value={`${requested.first_name} ${requested.last_name}`} />
        <DetailLine label="Email" value={requested.email} />
        <DetailLine label="Teacher ID" value={requested.teacher_id} />
        <DetailLine label="Branch" value={requested.branch_name} />
        <DetailLine label="Subjects" value={requested.subjects_taught.join(', ')} />
      </View>
      <View style={styles.compareBoxMuted}>
        <Text style={styles.compareTitle}>Current profile</Text>
        <DetailLine label="Name" value={`${current.first_name} ${current.last_name}`} />
        <DetailLine label="Email" value={current.email} />
        <DetailLine label="Teacher ID" value={current.teacher_id} />
      </View>
      <AnimatedButton label="Approve profile update" loading={isBusy} disabled={isBusy} onPress={onApprove} />
    </AnimatedCard>
  )
}

export default function ApprovalsScreen() {
  const [principalPassword, setPrincipalPassword] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const approvalsQuery = useQuery({
    queryKey: ['approvals', 'queues'],
    queryFn: approvalsApi.getQueues,
  })

  const approveMutation = useMutation({
    mutationFn: async ({ key, run }: { key: string; run: () => Promise<unknown> }) => {
      setBusyKey(key)
      return run()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['approvals', 'queues'] })
      Alert.alert('Approved', 'The approval queue has been updated.')
    },
    onError: (error) => {
      const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
      Alert.alert('Approval failed', detail || 'Unable to approve this request.')
    },
    onSettled: () => setBusyKey(null),
  })

  const data = approvalsQuery.data
  const totalPending = useMemo(() => {
    if (!data) return 0
    return data.principals.length + data.teachers.length + data.students.length + data.classTeacherRequests.length + data.teacherProfileUpdates.length
  }, [data])

  const confirm = (title: string, message: string, key: string, run: () => Promise<unknown>) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Approve', onPress: () => approveMutation.mutate({ key, run }) },
    ])
  }

  if (approvalsQuery.isLoading) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading approvals</Text>
      </AppScreen>
    )
  }

  if (approvalsQuery.isError || !data) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ErrorState title="Approvals unavailable" message="Unable to load approval queues." onAction={() => void approvalsQuery.refetch()} />
      </AppScreen>
    )
  }

  return (
    <AppScreen
      contentStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={approvalsQuery.isRefetching} onRefresh={approvalsQuery.refetch} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <GradientHeroCard
        eyebrow="APPROVALS"
        title={totalPending ? `${totalPending} pending requests` : 'All clear'}
        subtitle="Approve principals, teachers, students, class-teacher requests, and teacher profile updates inside the mobile app."
      />

      <AnimatedCard style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryValue}>{data.principals.length}</Text>
            <Text style={styles.summaryLabel}>Principals</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryValue}>{data.teachers.length}</Text>
            <Text style={styles.summaryLabel}>Teachers</Text>
          </View>
          <View style={styles.summaryMetric}>
            <Text style={styles.summaryValue}>{data.students.length}</Text>
            <Text style={styles.summaryLabel}>Students</Text>
          </View>
        </View>
      </AnimatedCard>

      <QueueSection title="Principal approvals" subtitle="Branch/school admin queue." count={data.principals.length} error={data.errors.principals}>
        <TextInputField
          label="Approval password"
          value={principalPassword}
          onChangeText={setPrincipalPassword}
          secureTextEntry
          placeholder="Re-enter password"
          left={<Ionicons name="lock-closed" size={17} color={colors.textMuted} />}
        />
        {data.principals.map((item) => (
          <AccountApprovalCard
            key={item.id}
            item={item}
            actionLabel="Approve principal"
            isBusy={busyKey === `principal-${item.id}`}
            onApprove={() => {
              if (!principalPassword.trim()) {
                Alert.alert('Password required', 'Re-enter your password to approve a principal.')
                return
              }
              confirm('Approve principal?', item.display_name, `principal-${item.id}`, () => approvalsApi.approvePrincipal(item.id, principalPassword))
            }}
          />
        ))}
      </QueueSection>

      <QueueSection title="Teacher approvals" subtitle="Principal approval queue." count={data.teachers.length} error={data.errors.teachers}>
        {data.teachers.map((item) => (
          <AccountApprovalCard
            key={item.id}
            item={item}
            actionLabel="Approve teacher"
            isBusy={busyKey === `teacher-${item.id}`}
            onApprove={() => confirm('Approve teacher?', item.display_name, `teacher-${item.id}`, () => approvalsApi.approveTeacher(item.id))}
          />
        ))}
      </QueueSection>

      <QueueSection title="Student approvals" subtitle="Teacher/class-teacher approval queue." count={data.students.length} error={data.errors.students}>
        {data.students.map((item) => (
          <AccountApprovalCard
            key={item.id}
            item={item}
            actionLabel="Approve student"
            isBusy={busyKey === `student-${item.id}`}
            onApprove={() => confirm('Approve student?', item.display_name, `student-${item.id}`, () => approvalsApi.approveStudent(item.id))}
          />
        ))}
      </QueueSection>

      <QueueSection
        title="Class teacher requests"
        subtitle="Subject-teacher assignments for a class."
        count={data.classTeacherRequests.length}
        error={data.errors.classTeacherRequests}
      >
        {data.classTeacherRequests.map((item) => (
          <ClassTeacherCard
            key={item.id}
            item={item}
            isBusy={busyKey === `class-teacher-${item.id}`}
            onApprove={() => confirm('Approve class teacher request?', `${item.class_teacher_name} / ${item.standard} ${item.division}`, `class-teacher-${item.id}`, () => approvalsApi.approveClassTeacherRequest(item.id))}
          />
        ))}
      </QueueSection>

      <QueueSection
        title="Teacher profile updates"
        subtitle="Requested profile edits awaiting principal approval."
        count={data.teacherProfileUpdates.length}
        error={data.errors.teacherProfileUpdates}
      >
        {data.teacherProfileUpdates.map((item) => (
          <ProfileUpdateCard
            key={item.id}
            item={item}
            isBusy={busyKey === `profile-${item.id}`}
            onApprove={() => confirm('Approve profile update?', item.teacher_name, `profile-${item.id}`, () => approvalsApi.approveTeacherProfileUpdate(item.id))}
          />
        ))}
      </QueueSection>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[20],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  summaryCard: {
    gap: spacing[4],
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  summaryMetric: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
  },
  summaryValue: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 22,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  section: {
    gap: spacing[3],
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  sectionTitle: {
    ...typography.roles.title,
    color: colors.text,
  },
  sectionSubtitle: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  countPill: {
    minWidth: 42,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  countText: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  card: {
    gap: spacing[4],
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.slate[950],
    ...shadows.xs,
  },
  avatarText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 16,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
  },
  cardMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    marginTop: 2,
  },
  detailGrid: {
    gap: spacing[2],
  },
  detailLine: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  detailLabel: {
    width: 92,
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  detailValue: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
  },
  assignmentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
  },
  assignmentSubject: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  assignmentTeacher: {
    flex: 1,
    textAlign: 'right',
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
  },
  compareBox: {
    borderRadius: radius.lg,
    backgroundColor: colors.accentSurface,
    padding: spacing[3],
    gap: spacing[2],
  },
  compareBoxMuted: {
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
    gap: spacing[2],
  },
  compareTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: colors.backgroundElevated,
  },
  emptyText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  errorCard: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
  },
  errorText: {
    ...typography.roles.body,
    color: colors.danger,
  },
})
