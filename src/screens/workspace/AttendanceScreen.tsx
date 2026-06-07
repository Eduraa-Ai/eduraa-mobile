import React, { ReactNode, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatedButton, AnimatedCard, AppScreen, ErrorState, GradientHeroCard, SelectableChip, TextInputField } from '../../components/ui'
import {
  AttendanceCorrectionRequest,
  AttendanceRecord,
  AttendanceStatus,
  attendanceApi,
} from '../../api/attendance'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import type { Role } from '../../types'

const statusLabels: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  half_day: 'Half day',
  excused: 'Excused',
}

const statusTones: Record<AttendanceStatus, string> = {
  present: colors.success,
  absent: colors.danger,
  late: colors.warning,
  half_day: colors.info,
  excused: colors.textMuted,
}

function roleLabel(role?: Role) {
  return role ? role.replace(/_/g, ' ') : 'attendance'
}

function formatDate(value?: string | null) {
  if (!value) return 'Today'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function extractDetail(error: unknown, fallback: string) {
  return (error as { response?: { data?: { detail?: string } } }).response?.data?.detail || fallback
}

function isTeacherRole(role?: Role) {
  return role === 'teacher'
}

function isStudentRole(role?: Role) {
  return role === 'student' || role === 'b2c_student'
}

function isLeadershipRole(role?: Role) {
  return role === 'principal' || role === 'school_super_admin' || role === 'branch_admin' || role === 'admin' || role === 'developer'
}

function MetricTile({ value, label, tone = colors.text }: { value: ReactNode; label: string; tone?: string }) {
  return (
    <View style={styles.metricTile}>
      <Text style={[styles.metricValue, { color: tone }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

function SectionHeader({ title, subtitle, count }: { title: string; subtitle: string; count?: number }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      {typeof count === 'number' ? (
        <View style={styles.countPill}>
          <Text style={styles.countText}>{count}</Text>
        </View>
      ) : null}
    </View>
  )
}

function StatusChip({ status, selected, onPress }: { status: AttendanceStatus; selected: boolean; onPress: () => void }) {
  const tone = statusTones[status]
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.statusChip,
        selected && { backgroundColor: `${tone}18`, borderColor: tone },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.statusChipText, selected && { color: tone }]}>{statusLabels[status]}</Text>
    </Pressable>
  )
}

function AttendanceRecordCard({
  record,
  disabled,
  busy,
  onStatus,
}: {
  record: AttendanceRecord
  disabled: boolean
  busy: boolean
  onStatus: (status: AttendanceStatus) => void
}) {
  return (
    <AnimatedCard style={styles.recordCard}>
      <View style={styles.recordTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{record.student_name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.recordCopy}>
          <Text style={styles.recordTitle}>{record.student_name}</Text>
          <Text style={styles.recordMeta}>{record.student_code} / {record.standard} {record.division ?? ''}</Text>
        </View>
        {busy ? <ActivityIndicator color={colors.accent} /> : <Ionicons name="chevron-forward" size={18} color={colors.textSoft} />}
      </View>
      <View style={styles.statusGrid}>
        {(Object.keys(statusLabels) as AttendanceStatus[]).map((status) => (
          <StatusChip key={status} status={status} selected={record.status === status} onPress={() => !disabled && onStatus(status)} />
        ))}
      </View>
      {record.note ? <Text style={styles.noteText}>{record.note}</Text> : null}
    </AnimatedCard>
  )
}

function CorrectionsList({
  corrections,
  canResolve,
  busyKey,
  onResolve,
}: {
  corrections: AttendanceCorrectionRequest[]
  canResolve: boolean
  busyKey: string | null
  onResolve: (item: AttendanceCorrectionRequest, status: 'approved' | 'rejected') => void
}) {
  return (
    <View style={styles.section}>
      <SectionHeader title="Corrections" subtitle="Attendance correction requests." count={corrections.length} />
      {corrections.length === 0 ? (
        <AnimatedCard style={styles.emptyCard}>
          <Text style={styles.emptyText}>No correction requests.</Text>
        </AnimatedCard>
      ) : (
        corrections.map((item) => (
          <AnimatedCard key={item.id} style={styles.correctionCard}>
            <View style={styles.recordTop}>
              <View style={styles.iconBubble}>
                <Ionicons name="chatbox-ellipses" size={18} color={colors.accent} />
              </View>
              <View style={styles.recordCopy}>
                <Text style={styles.recordTitle}>{item.reason}</Text>
                <Text style={styles.recordMeta}>{item.requested_by_role || 'User'} / {item.status}</Text>
              </View>
            </View>
            {item.resolution_note ? <Text style={styles.noteText}>{item.resolution_note}</Text> : null}
            {canResolve && item.status === 'pending' ? (
              <View style={styles.actionRow}>
                <AnimatedButton
                  label="Approve"
                  loading={busyKey === `approve-${item.id}`}
                  disabled={Boolean(busyKey)}
                  onPress={() => onResolve(item, 'approved')}
                  style={styles.actionButton}
                />
                <AnimatedButton
                  label="Reject"
                  variant="ghost"
                  loading={busyKey === `reject-${item.id}`}
                  disabled={Boolean(busyKey)}
                  onPress={() => onResolve(item, 'rejected')}
                  style={styles.actionButton}
                />
              </View>
            ) : null}
          </AnimatedCard>
        ))
      )}
    </View>
  )
}

function TeacherAttendance() {
  const queryClient = useQueryClient()
  const [classNote, setClassNote] = useState('')
  const [reopenReason, setReopenReason] = useState('')
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const todayQuery = useQuery({
    queryKey: ['attendance', 'teacher', 'today'],
    queryFn: attendanceApi.getTeacherToday,
  })

  const summaryQuery = useQuery({
    queryKey: ['attendance', 'teacher', 'summary'],
    queryFn: attendanceApi.getTeacherSummary,
  })

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['attendance', 'teacher', 'today'] }),
      queryClient.invalidateQueries({ queryKey: ['attendance', 'teacher', 'summary'] }),
    ])
  }

  const sheetMutation = useMutation({
    mutationFn: async ({ key, run }: { key: string; run: () => Promise<unknown> }) => {
      setBusyKey(key)
      return run()
    },
    onSuccess: async () => {
      await invalidate()
    },
    onError: (error) => {
      Alert.alert('Attendance failed', extractDetail(error, 'Unable to update attendance.'))
    },
    onSettled: () => setBusyKey(null),
  })

  if (todayQuery.isLoading || summaryQuery.isLoading) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading attendance</Text>
      </AppScreen>
    )
  }

  if (todayQuery.isError || !todayQuery.data) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ErrorState title="Attendance unavailable" message={extractDetail(todayQuery.error, "Unable to load today's attendance sheet.")} onAction={() => void todayQuery.refetch()} />
      </AppScreen>
    )
  }

  const sheet = todayQuery.data.sheet
  const summary = summaryQuery.data ?? sheet.summary
  const locked = sheet.status === 'submitted' || sheet.status === 'locked'
  const refreshing = todayQuery.isRefetching || summaryQuery.isRefetching

  const updateRecord = (record: AttendanceRecord, status: AttendanceStatus) => {
    if (record.status === status) return
    sheetMutation.mutate({
      key: `record-${record.id}`,
      run: () => attendanceApi.updateRecords(sheet.id, [{ record_id: record.id, status, note: record.note }], classNote || sheet.class_note),
    })
  }

  return (
    <AppScreen
      contentStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void invalidate()} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <GradientHeroCard
        eyebrow="ATTENDANCE"
        title={`${sheet.standard} ${sheet.division} / ${formatDate(sheet.attendance_date)}`}
        subtitle="Mark the class, submit the sheet, and keep corrections visible from mobile."
      />

      <AnimatedCard style={styles.summaryCard}>
        <View style={styles.statusRow}>
          <SelectableChip label={sheet.status} selected />
          <Text style={styles.dateText}>{sheet.submitted_at ? `Submitted ${formatDate(sheet.submitted_at)}` : 'Draft sheet'}</Text>
        </View>
        <View style={styles.metricGrid}>
          <MetricTile value={summary.total_students} label="Students" />
          <MetricTile value={summary.present_count} label="Present" tone={colors.success} />
          <MetricTile value={summary.absent_count} label="Absent" tone={colors.danger} />
          <MetricTile value={summary.late_count + summary.half_day_count} label="Late/half" tone={colors.warning} />
        </View>
      </AnimatedCard>

      <AnimatedCard style={styles.actionCard}>
        <TextInputField
          label="Class note"
          value={classNote}
          onChangeText={setClassNote}
          placeholder={sheet.class_note || 'Add an optional class note'}
          multiline
          left={<Ionicons name="document-text" size={17} color={colors.textMuted} />}
        />
        <View style={styles.actionRow}>
          <AnimatedButton
            label="Mark all present"
            loading={busyKey === 'all-present'}
            disabled={Boolean(busyKey) || locked}
            onPress={() => sheetMutation.mutate({ key: 'all-present', run: () => attendanceApi.markAllPresent(sheet.id) })}
            style={styles.actionButton}
          />
          <AnimatedButton
            label="Submit"
            variant="secondary"
            loading={busyKey === 'submit'}
            disabled={Boolean(busyKey) || locked}
            onPress={() => {
              Alert.alert('Submit attendance?', "This will submit today's sheet for leadership review.", [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Submit', onPress: () => sheetMutation.mutate({ key: 'submit', run: () => attendanceApi.submitSheet(sheet.id, classNote || sheet.class_note) }) },
              ])
            }}
            style={styles.actionButton}
          />
        </View>
        {sheet.status === 'submitted' ? (
          <View style={styles.reopenBox}>
            <TextInputField
              label="Reopen reason"
              value={reopenReason}
              onChangeText={setReopenReason}
              placeholder="Reason for reopening"
              left={<Ionicons name="refresh" size={17} color={colors.textMuted} />}
            />
            <AnimatedButton
              label="Reopen sheet"
              variant="ghost"
              loading={busyKey === 'reopen'}
              disabled={Boolean(busyKey) || reopenReason.trim().length < 3}
              onPress={() => sheetMutation.mutate({ key: 'reopen', run: () => attendanceApi.reopenSheet(sheet.id, reopenReason.trim()) })}
            />
          </View>
        ) : null}
      </AnimatedCard>

      <View style={styles.section}>
        <SectionHeader title="Class roster" subtitle={locked ? 'Submitted sheets are read-only.' : 'Tap a status to update one student.'} count={sheet.records.length} />
        {sheet.records.map((record) => (
          <AttendanceRecordCard
            key={record.id}
            record={record}
            disabled={locked || Boolean(busyKey)}
            busy={busyKey === `record-${record.id}`}
            onStatus={(status) => updateRecord(record, status)}
          />
        ))}
      </View>
    </AppScreen>
  )
}

function LeadershipAttendance() {
  const queryClient = useQueryClient()
  const [busyKey, setBusyKey] = useState<string | null>(null)

  const summaryQuery = useQuery({
    queryKey: ['attendance', 'leadership', 'summary'],
    queryFn: attendanceApi.getLeadershipSummary,
  })

  const correctionsQuery = useQuery({
    queryKey: ['attendance', 'corrections'],
    queryFn: attendanceApi.getCorrections,
  })

  const resolveMutation = useMutation({
    mutationFn: async ({ key, id, status }: { key: string; id: string; status: 'approved' | 'rejected' }) => {
      setBusyKey(key)
      return attendanceApi.resolveCorrection(id, status)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['attendance', 'corrections'] })
    },
    onError: (error) => Alert.alert('Correction failed', extractDetail(error, 'Unable to resolve this correction.')),
    onSettled: () => setBusyKey(null),
  })

  if (summaryQuery.isLoading || correctionsQuery.isLoading) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading attendance</Text>
      </AppScreen>
    )
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ErrorState title="Attendance unavailable" message={extractDetail(summaryQuery.error, 'Unable to load leadership attendance.')} onAction={() => void summaryQuery.refetch()} />
      </AppScreen>
    )
  }

  const summary = summaryQuery.data
  const percent = summary.total_classes ? Math.round((summary.submitted_classes / summary.total_classes) * 100) : 0
  const refreshing = summaryQuery.isRefetching || correctionsQuery.isRefetching

  return (
    <AppScreen
      contentStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
        void summaryQuery.refetch()
        void correctionsQuery.refetch()
      }} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <GradientHeroCard
        eyebrow="ATTENDANCE"
        title={`${percent}% classes submitted`}
        subtitle={`Daily attendance overview for ${formatDate(summary.attendance_date)}.`}
      />

      <AnimatedCard style={styles.summaryCard}>
        <View style={styles.metricGrid}>
          <MetricTile value={summary.total_classes} label="Classes" />
          <MetricTile value={summary.submitted_classes} label="Submitted" tone={colors.success} />
          <MetricTile value={summary.pending_classes} label="Pending" tone={colors.warning} />
          <MetricTile value={summary.reopened_sheets} label="Reopened" tone={colors.info} />
        </View>
        <View style={styles.metricGrid}>
          <MetricTile value={summary.total_students} label="Students" />
          <MetricTile value={summary.present_count} label="Present" tone={colors.success} />
          <MetricTile value={summary.absent_count} label="Absent" tone={colors.danger} />
          <MetricTile value={summary.late_count + summary.half_day_count} label="Late/half" tone={colors.warning} />
        </View>
      </AnimatedCard>

      <View style={styles.section}>
        <SectionHeader title="Pending classes" subtitle="Classes still awaiting submission." count={summary.pending.length} />
        {summary.pending.length === 0 ? (
          <AnimatedCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>Every class has submitted attendance.</Text>
          </AnimatedCard>
        ) : (
          summary.pending.map((item) => (
            <AnimatedCard key={item.class_section_id} style={styles.classCard}>
              <View style={styles.recordTop}>
                <View style={styles.iconBubble}>
                  <Ionicons name="school" size={18} color={colors.accent} />
                </View>
                <View style={styles.recordCopy}>
                  <Text style={styles.recordTitle}>{item.standard} {item.division}</Text>
                  <Text style={styles.recordMeta}>{item.class_teacher_name || 'No class teacher'} / {item.student_count} students</Text>
                </View>
                <SelectableChip label={item.status || 'pending'} selected={false} />
              </View>
            </AnimatedCard>
          ))
        )}
      </View>

      <CorrectionsList
        corrections={correctionsQuery.data ?? []}
        canResolve
        busyKey={busyKey}
        onResolve={(item, status) => {
          Alert.alert(`${status === 'approved' ? 'Approve' : 'Reject'} correction?`, item.reason, [
            { text: 'Cancel', style: 'cancel' },
            { text: status === 'approved' ? 'Approve' : 'Reject', onPress: () => resolveMutation.mutate({ key: `${status === 'approved' ? 'approve' : 'reject'}-${item.id}`, id: item.id, status }) },
          ])
        }}
      />
    </AppScreen>
  )
}

function StudentAttendance() {
  const summaryQuery = useQuery({
    queryKey: ['attendance', 'student', 'summary'],
    queryFn: attendanceApi.getStudentSummary,
  })

  const correctionsQuery = useQuery({
    queryKey: ['attendance', 'student', 'corrections'],
    queryFn: attendanceApi.getCorrections,
    retry: false,
  })

  if (summaryQuery.isLoading) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading attendance</Text>
      </AppScreen>
    )
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ErrorState title="Attendance unavailable" message={extractDetail(summaryQuery.error, 'Attendance is available for enrolled school students.')} onAction={() => void summaryQuery.refetch()} />
      </AppScreen>
    )
  }

  const summary = summaryQuery.data
  const latestTone = summary.latest_status ? statusTones[summary.latest_status] : colors.textMuted

  return (
    <AppScreen
      contentStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={summaryQuery.isRefetching} onRefresh={summaryQuery.refetch} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <GradientHeroCard
        eyebrow="ATTENDANCE"
        title={`${Math.round(summary.attendance_percent)}% this month`}
        subtitle={`Attendance summary for ${summary.month}.`}
      />

      <AnimatedCard style={styles.summaryCard}>
        <View style={styles.metricGrid}>
          <MetricTile value={`${Math.round(summary.attendance_percent)}%`} label="Attendance" tone={colors.success} />
          <MetricTile value={summary.present_equivalent} label="Present eq." />
          <MetricTile value={summary.absent_count} label="Absent" tone={colors.danger} />
          <MetricTile value={summary.excused_count} label="Excused" tone={colors.textMuted} />
        </View>
        <View style={styles.statusRow}>
          <SelectableChip label={summary.latest_status ? statusLabels[summary.latest_status] : 'No latest status'} selected />
          <Text style={[styles.dateText, { color: latestTone }]}>{summary.scheduled_count} scheduled days</Text>
        </View>
      </AnimatedCard>

      <View style={styles.section}>
        <SectionHeader title="Recent history" subtitle="Latest class attendance records." count={summary.history.length} />
        {summary.history.length === 0 ? (
          <AnimatedCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>No attendance history yet.</Text>
          </AnimatedCard>
        ) : (
          summary.history.map((item) => (
            <AnimatedCard key={`${item.attendance_date}-${item.standard}-${item.division ?? ''}`} style={styles.classCard}>
              <View style={styles.recordTop}>
                <View style={[styles.statusDot, { backgroundColor: statusTones[item.status] }]} />
                <View style={styles.recordCopy}>
                  <Text style={styles.recordTitle}>{formatDate(item.attendance_date)}</Text>
                  <Text style={styles.recordMeta}>{item.standard} {item.division ?? ''} / {statusLabels[item.status]}</Text>
                </View>
              </View>
              {item.note || item.class_note ? <Text style={styles.noteText}>{item.note || item.class_note}</Text> : null}
            </AnimatedCard>
          ))
        )}
      </View>

      {correctionsQuery.isError ? null : (
        <CorrectionsList corrections={correctionsQuery.data ?? []} canResolve={false} busyKey={null} onResolve={() => {}} />
      )}
    </AppScreen>
  )
}

export default function AttendanceScreen() {
  const role = useAuthStore((state) => state.user?.role)

  const content = useMemo(() => {
    if (isTeacherRole(role)) return <TeacherAttendance />
    if (isStudentRole(role)) return <StudentAttendance />
    if (isLeadershipRole(role)) return <LeadershipAttendance />
    return null
  }, [role])

  if (content) return content

  return (
    <AppScreen scroll={false} contentStyle={styles.center}>
      <ErrorState title="Attendance unavailable" message={`Attendance is not configured for ${roleLabel(role)} accounts.`} />
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  dateText: {
    flex: 1,
    textAlign: 'right',
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  metricTile: {
    width: '47%',
    minHeight: 82,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
    justifyContent: 'space-between',
  },
  metricValue: {
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 23,
  },
  metricLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  actionCard: {
    gap: spacing[4],
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  actionButton: {
    flex: 1,
  },
  reopenBox: {
    gap: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing[4],
  },
  section: {
    gap: spacing[3],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  sectionCopy: {
    flex: 1,
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
  recordCard: {
    gap: spacing[4],
  },
  correctionCard: {
    gap: spacing[4],
  },
  classCard: {
    gap: spacing[3],
  },
  recordTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  recordCopy: {
    flex: 1,
  },
  recordTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
  },
  recordMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    marginTop: 2,
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
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  statusChip: {
    minHeight: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundElevated,
  },
  statusChipText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  noteText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  emptyCard: {
    backgroundColor: colors.backgroundElevated,
  },
  emptyText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.72,
  },
  statusDot: {
    width: 14,
    height: 14,
    borderRadius: radius.full,
  },
})
