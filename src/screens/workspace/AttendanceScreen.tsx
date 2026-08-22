import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNetInfo } from '@react-native-community/netinfo'
import { useNavigation } from '@react-navigation/native'
import React, { ReactNode, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, AppState, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatedButton, AnimatedCard, AppScreen, ErrorState, SelectableChip, TextInputField } from '../../components/ui'
import {
  AttendanceCorrectionRequest,
  AttendanceRecord,
  AttendanceStatus,
  attendanceApi,
} from '../../api/attendance'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import type { Role } from '../../types'
import {
  changedAttendanceRecords,
  formatSchoolDate,
  hasAttendanceChanges,
  statusesFromRecords,
  type AttendanceDraft,
  type StoredAttendanceDraft,
} from './attendanceModel'

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

const formatDate = formatSchoolDate

function formatMonth(value: string) {
  const [year, month] = value.split('-').map(Number)
  if (!year || !month) return value
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1))
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

function MetricStrip({ items }: { items: Array<{ value: ReactNode; label: string; tone?: string }> }) {
  return (
    <View style={styles.metricStrip}>
      {items.map((item, index) => (
        <View key={item.label} style={[styles.metricStripItem, index > 0 && styles.metricStripDivider]}>
          <Text style={[styles.metricStripValue, { color: item.tone ?? colors.text }]}>{item.value}</Text>
          <Text numberOfLines={2} style={styles.metricStripLabel}>{item.label}</Text>
        </View>
      ))}
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
    <View style={styles.recordRow}>
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
    </View>
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
  onResolve: (item: AttendanceCorrectionRequest, status: 'approved' | 'rejected', resolutionNote: string) => void
}) {
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({})
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
              <View style={styles.correctionActions}>
                <TextInputField
                  label="Decision reason"
                  value={resolutionNotes[item.id] ?? ''}
                  onChangeText={(value) => setResolutionNotes((current) => ({ ...current, [item.id]: value }))}
                  placeholder="Explain the approval or rejection"
                  left={<Ionicons name="document-text-outline" size={17} color={colors.textMuted} />}
                />
                <View style={styles.actionRow}>
                <AnimatedButton
                  label="Approve"
                  loading={busyKey === `approve-${item.id}`}
                  disabled={Boolean(busyKey) || (resolutionNotes[item.id] ?? '').trim().length < 3}
                  onPress={() => onResolve(item, 'approved', (resolutionNotes[item.id] ?? '').trim())}
                  style={styles.actionButton}
                />
                <AnimatedButton
                  label="Reject"
                  variant="ghost"
                  loading={busyKey === `reject-${item.id}`}
                  disabled={Boolean(busyKey) || (resolutionNotes[item.id] ?? '').trim().length < 3}
                  onPress={() => onResolve(item, 'rejected', (resolutionNotes[item.id] ?? '').trim())}
                  style={styles.actionButton}
                />
                </View>
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
  const navigation = useNavigation()
  const netInfo = useNetInfo()
  const [classNote, setClassNote] = useState('')
  const [draft, setDraft] = useState<AttendanceDraft>({})
  const [draftRevision, setDraftRevision] = useState<number | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [terminalMessage, setTerminalMessage] = useState<string | null>(null)

  const todayQuery = useQuery({
    queryKey: ['attendance', 'teacher', 'today'],
    queryFn: attendanceApi.getTeacherToday,
  })

  const summaryQuery = useQuery({
    queryKey: ['attendance', 'teacher', 'summary'],
    queryFn: attendanceApi.getTeacherSummary,
  })

  const queriedSheet = todayQuery.data?.sheet
  const storageKey = queriedSheet ? `attendance-draft:${queriedSheet.id}` : null
  const dirty = Boolean(queriedSheet && draftRevision === queriedSheet.revision && hasAttendanceChanges(
    queriedSheet.records,
    draft,
    classNote,
    queriedSheet.class_note,
  ))

  useEffect(() => {
    if (!queriedSheet || !storageKey || draftRevision === queriedSheet.revision) return
    let active = true
    void AsyncStorage.getItem(storageKey).then((saved) => {
      if (!active) return
      const parsed = saved ? JSON.parse(saved) as StoredAttendanceDraft : null
      if (parsed?.sheetId === queriedSheet.id && parsed.revision === queriedSheet.revision) {
        setDraft(parsed.statuses)
        setClassNote(parsed.classNote)
      } else {
        setDraft(statusesFromRecords(queriedSheet.records))
        setClassNote(queriedSheet.class_note ?? '')
        if (saved) void AsyncStorage.removeItem(storageKey)
      }
      setDraftRevision(queriedSheet.revision)
    }).catch(() => {
      if (!active) return
      setDraft(statusesFromRecords(queriedSheet.records))
      setClassNote(queriedSheet.class_note ?? '')
      setDraftRevision(queriedSheet.revision)
    })
    return () => { active = false }
  }, [draftRevision, queriedSheet, storageKey])

  useEffect(() => {
    if (!queriedSheet || !storageKey || draftRevision !== queriedSheet.revision || !dirty) return
    const timeout = setTimeout(() => {
      const payload: StoredAttendanceDraft = {
        sheetId: queriedSheet.id,
        revision: queriedSheet.revision,
        classNote,
        statuses: draft,
      }
      void AsyncStorage.setItem(storageKey, JSON.stringify(payload))
    }, 150)
    return () => clearTimeout(timeout)
  }, [classNote, dirty, draft, draftRevision, queriedSheet, storageKey])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !dirty) void todayQuery.refetch()
    })
    return () => subscription.remove()
  }, [dirty, todayQuery.refetch])

  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (!dirty) return
    event.preventDefault()
    Alert.alert('Keep your attendance draft?', 'Your changes are saved on this device. Stay here to submit them, or leave and return later.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
    ])
  }), [dirty, navigation])

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
    onSuccess: async (updated) => {
      if (updated && typeof updated === 'object' && 'revision' in updated) {
        const next = updated as NonNullable<typeof queriedSheet>
        queryClient.setQueryData(['attendance', 'teacher', 'today'], (current: typeof todayQuery.data) => current ? { ...current, sheet: next } : current)
        if (next) {
          setDraft(statusesFromRecords(next.records))
          setClassNote(next.class_note ?? '')
          setDraftRevision(next.revision)
        }
      }
      if (storageKey) await AsyncStorage.removeItem(storageKey)
      await invalidate()
    },
    onError: (error) => {
      const statusCode = (error as { response?: { status?: number } }).response?.status
      const message = extractDetail(error, 'Unable to update attendance.')
      if (statusCode === 409) setConflict(message)
      else Alert.alert(netInfo.isConnected === false ? 'Draft saved offline' : 'Attendance failed', netInfo.isConnected === false ? 'Your roster changes remain safe on this device. Reconnect, then try again.' : message)
    },
    onSettled: () => setBusyKey(null),
  })

  if (todayQuery.isLoading) {
    return (
      <AppScreen protectedChrome scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading attendance</Text>
      </AppScreen>
    )
  }

  if (todayQuery.isError || !todayQuery.data) {
    return (
      <AppScreen protectedChrome contentStyle={styles.screen}>
        <AttendanceHero title="Today's roster" subtitle="Your authorized class roster could not be loaded." signal="RECOVERY" />
        <ErrorState kind={netInfo.isConnected === false ? 'offline' : 'error'} title={netInfo.isConnected === false ? 'Attendance is offline' : 'Attendance unavailable'} message={netInfo.isConnected === false ? 'Reconnect to load the authorized class roster. Any existing draft will remain on this device.' : extractDetail(todayQuery.error, "Unable to load today's attendance sheet.")} onAction={() => void todayQuery.refetch()} />
      </AppScreen>
    )
  }

  const sheet = todayQuery.data.sheet
  const summary = summaryQuery.data ?? sheet.summary
  const locked = sheet.status === 'submitted' || sheet.status === 'locked'
  const refreshing = todayQuery.isRefetching || summaryQuery.isRefetching

  const updateRecord = (record: AttendanceRecord, status: AttendanceStatus) => {
    if (locked) return
    setTerminalMessage(null)
    setDraft((current) => ({ ...current, [record.id]: status }))
  }

  const pendingRecords = changedAttendanceRecords(sheet.records, draft)
  const saveDraft = () => sheetMutation.mutate({
    key: 'save',
    run: () => attendanceApi.updateRecords(sheet.id, sheet.revision, pendingRecords, classNote.trim() || null),
  })

  const reloadLatest = () => {
    setConflict(null)
    if (storageKey) void AsyncStorage.removeItem(storageKey)
    setDraftRevision(null)
    void todayQuery.refetch()
  }

  const refreshAttendance = () => {
    if (!dirty) {
      void invalidate()
      return
    }
    Alert.alert('Refresh this roster?', 'Refreshing discards the attendance draft saved on this device.', [
      { text: 'Keep draft', style: 'cancel' },
      { text: 'Discard and refresh', style: 'destructive', onPress: reloadLatest },
    ])
  }

  return (
    <AppScreen
      protectedChrome
      contentStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAttendance} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <AttendanceHero
        title={`${sheet.standard} ${sheet.division} · ${formatDate(sheet.attendance_date)}`}
        subtitle={`${sheet.records.length} authorized students · Review exceptions, then submit once.`}
        signal={locked ? 'CLOSED' : dirty ? 'LOCAL DRAFT' : 'READY'}
      />

      <View style={styles.summaryBand}>
        <View style={styles.statusRow}>
          <SelectableChip label={sheet.status} selected />
          <Text style={styles.dateText}>{sheet.submitted_at ? `Submitted ${formatDate(sheet.submitted_at)}` : dirty ? 'Draft saved on this device' : 'Up to date'}</Text>
        </View>
        <MetricStrip items={[
          { value: summary.total_students, label: 'Roster' },
          { value: summary.present_count, label: 'Present', tone: colors.success },
          { value: summary.absent_count, label: 'Absent', tone: colors.danger },
          { value: summary.late_count + summary.half_day_count, label: 'Late / half', tone: colors.warning },
        ]} />
      </View>

      {netInfo.isConnected === false ? (
        <View style={styles.inlineNotice} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
          <Text style={styles.inlineNoticeText}>Offline · keep marking. This draft stays on your device until you reconnect.</Text>
        </View>
      ) : null}
      {summaryQuery.isError ? (
        <View style={styles.inlineNotice}><Ionicons name="sync-outline" size={18} color={colors.warning} /><Text style={styles.inlineNoticeText}>Roster loaded. Summary refresh is delayed.</Text></View>
      ) : null}
      {conflict ? (
        <ErrorState title="A newer roster is available" message={`${conflict} Your local draft is still safe.`} actionLabel="Review latest" onAction={reloadLatest} />
      ) : null}
      {terminalMessage ? (
        <View style={styles.successNotice} accessibilityRole="alert"><Ionicons name="checkmark-circle" size={20} color={colors.success} /><Text style={styles.successNoticeText}>{terminalMessage}</Text></View>
      ) : null}

      <AnimatedCard style={styles.actionCard}>
        <TextInputField
          label="Class note"
          value={classNote}
          onChangeText={setClassNote}
          placeholder={sheet.class_note || 'Add an optional class note'}
          multiline
          left={<Ionicons name="document-text" size={17} color={colors.textMuted} />}
        />
        <AnimatedButton
          label={locked ? 'Attendance submitted' : 'Submit final attendance'}
          loading={busyKey === 'submit'}
          disabled={Boolean(busyKey) || locked || netInfo.isConnected === false || sheet.records.length === 0}
          onPress={() => Alert.alert('Submit final attendance?', `${sheet.standard} ${sheet.division} · ${formatDate(sheet.attendance_date)} · ${sheet.records.length} students. This becomes read-only unless leadership reopens it.`, [
            { text: 'Review roster', style: 'cancel' },
            { text: 'Submit', onPress: () => sheetMutation.mutate({ key: 'submit', run: async () => {
              const result = await attendanceApi.submitSheet(sheet.id, sheet.revision, classNote.trim() || null, pendingRecords)
              setTerminalMessage(`Submitted ${result.standard} ${result.division} for ${formatDate(result.attendance_date)}. No further action is needed.`)
              return result
            } }) },
          ])}
        />
        <View style={styles.actionRow}>
          <AnimatedButton
            label="Mark all present"
            disabled={Boolean(busyKey) || locked}
            onPress={() => setDraft(Object.fromEntries(sheet.records.map((record) => [record.id, 'present' as AttendanceStatus])))}
            style={styles.actionButton}
          />
          <AnimatedButton
            label={dirty ? 'Save draft' : 'Draft saved'}
            variant="secondary"
            loading={busyKey === 'save'}
            disabled={Boolean(busyKey) || locked || !dirty || netInfo.isConnected === false}
            onPress={saveDraft}
            style={styles.actionButton}
          />
        </View>
      </AnimatedCard>

      <View style={styles.section}>
        <SectionHeader title="Class roster" subtitle={locked ? 'Submitted sheets are read-only.' : 'Tap a status to update one student.'} count={sheet.records.length} />
        {sheet.records.length === 0 ? (
          <ErrorState title="No students are enrolled" message="This class roster is empty, so attendance cannot be submitted. Refresh after enrollment is corrected." onAction={() => void todayQuery.refetch()} />
        ) : (
          <View style={styles.rosterSurface}>
            {sheet.records.map((record) => (
              <AttendanceRecordCard
                key={record.id}
                record={{ ...record, status: draft[record.id] ?? record.status }}
                disabled={locked || Boolean(busyKey)}
                busy={false}
                onStatus={(status) => updateRecord(record, status)}
              />
            ))}
          </View>
        )}
      </View>
    </AppScreen>
  )
}

function AttendanceHero({ title, subtitle, signal }: { title: string; subtitle: string; signal: string }) {
  return (
    <View style={styles.attendanceHero}>
      <View pointerEvents="none" style={styles.heroOrbit} />
      <View style={styles.heroTopline}>
        <View style={styles.heroIdentity}>
          <View style={styles.heroIcon}><Ionicons name="today" size={17} color={colors.white} /></View>
          <Text style={styles.heroEyebrow}>EDURAA ATTENDANCE</Text>
        </View>
        <View style={styles.heroSignal}><View style={styles.heroSignalDot} /><Text style={styles.heroSignalText}>{signal}</Text></View>
      </View>
      <Text style={styles.heroTitle}>{title}</Text>
      <Text style={styles.heroSubtitle}>{subtitle}</Text>
      <View style={styles.heroRule}><View style={styles.heroRuleActive} /></View>
    </View>
  )
}

function LeadershipAttendance() {
  const queryClient = useQueryClient()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [reopenReason, setReopenReason] = useState('')
  const [terminalMessage, setTerminalMessage] = useState<string | null>(null)

  const summaryQuery = useQuery({
    queryKey: ['attendance', 'leadership', 'summary'],
    queryFn: attendanceApi.getLeadershipSummary,
  })

  const correctionsQuery = useQuery({
    queryKey: ['attendance', 'corrections'],
    queryFn: attendanceApi.getCorrections,
  })

  const selectedSheetQuery = useQuery({
    queryKey: ['attendance', 'leadership', 'sheet', selectedClassId, summaryQuery.data?.attendance_date],
    queryFn: () => attendanceApi.getSheet(selectedClassId!, summaryQuery.data!.attendance_date),
    enabled: Boolean(selectedClassId && summaryQuery.data?.attendance_date),
  })

  const resolveMutation = useMutation({
    mutationFn: async ({ key, id, status, resolutionNote }: { key: string; id: string; status: 'approved' | 'rejected'; resolutionNote: string }) => {
      setBusyKey(key)
      return attendanceApi.resolveCorrection(id, status, resolutionNote)
    },
    onSuccess: async (result) => {
      setTerminalMessage(`Correction ${result.status}. The decision and reason are now in the audit trail.`)
      await queryClient.invalidateQueries({ queryKey: ['attendance', 'corrections'] })
    },
    onError: (error) => Alert.alert('Correction failed', extractDetail(error, 'Unable to resolve this correction.')),
    onSettled: () => setBusyKey(null),
  })

  const reopenMutation = useMutation({
    mutationFn: ({ sheetId, reason }: { sheetId: string; reason: string }) => attendanceApi.reopenSheet(sheetId, reason),
    onSuccess: async (result) => {
      setReopenReason('')
      setTerminalMessage(`Reopened ${result.standard} ${result.division}. The assigned teacher can now correct this roster.`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance', 'leadership', 'summary'] }),
        queryClient.invalidateQueries({ queryKey: ['attendance', 'leadership', 'sheet'] }),
      ])
    },
    onError: (error) => Alert.alert('Sheet not reopened', extractDetail(error, 'Unable to reopen this attendance sheet.')),
  })

  if (summaryQuery.isLoading || correctionsQuery.isLoading) {
    return (
      <AppScreen protectedChrome scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading attendance</Text>
      </AppScreen>
    )
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <AppScreen protectedChrome contentStyle={styles.screen}>
        <AttendanceHero title="School attendance" subtitle="Today's authorized overview could not be loaded." signal="RECOVERY" />
        <ErrorState title="Attendance unavailable" message={extractDetail(summaryQuery.error, 'Unable to load leadership attendance.')} onAction={() => void summaryQuery.refetch()} />
      </AppScreen>
    )
  }

  const summary = summaryQuery.data
  const percent = summary.total_classes ? Math.round((summary.submitted_classes / summary.total_classes) * 100) : 0
  const refreshing = summaryQuery.isRefetching || correctionsQuery.isRefetching

  return (
    <AppScreen
      protectedChrome
      contentStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {
        void summaryQuery.refetch()
        void correctionsQuery.refetch()
      }} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <AttendanceHero
        title={`${percent}% classes submitted`}
        subtitle={`Daily attendance overview for ${formatDate(summary.attendance_date)}.`}
        signal={`${summary.pending_classes} REVIEW`}
      />

      {terminalMessage ? (
        <View style={styles.successNotice} accessibilityRole="alert"><Ionicons name="checkmark-circle" size={20} color={colors.success} /><Text style={styles.successNoticeText}>{terminalMessage}</Text></View>
      ) : null}

      <View style={styles.summaryBand}>
        <MetricStrip items={[
          { value: summary.total_classes, label: 'Classes' },
          { value: summary.submitted_classes, label: 'Submitted', tone: colors.success },
          { value: summary.pending_classes, label: 'Pending', tone: colors.warning },
          { value: summary.reopened_sheets, label: 'Reopened', tone: colors.info },
        ]} />
        <Text style={styles.snapshotText}>{summary.total_students} students · {summary.present_count} present · {summary.absent_count} absent · {summary.late_count + summary.half_day_count} late or half-day</Text>
      </View>

      <CorrectionsList
        corrections={correctionsQuery.data ?? []}
        canResolve
        busyKey={busyKey}
        onResolve={(item, status, resolutionNote) => {
          Alert.alert(`${status === 'approved' ? 'Approve' : 'Reject'} correction?`, item.reason, [
            { text: 'Cancel', style: 'cancel' },
            { text: status === 'approved' ? 'Approve' : 'Reject', onPress: () => resolveMutation.mutate({ key: `${status === 'approved' ? 'approve' : 'reject'}-${item.id}`, id: item.id, status, resolutionNote }) },
          ])
        }}
      />

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

      <View style={styles.section}>
        <SectionHeader title="Class sheets" subtitle="Open a submitted sheet only when a correction is required." count={summary.classes.length} />
        {summary.classes.map((item) => (
          <Pressable key={item.class_section_id} accessibilityRole="button" onPress={() => { setSelectedClassId(item.class_section_id); setReopenReason('') }}>
            <AnimatedCard style={selectedClassId === item.class_section_id ? { ...styles.classCard, ...styles.selectedClassCard } : styles.classCard}>
              <View style={styles.recordTop}>
                <View style={styles.iconBubble}><Ionicons name="people" size={18} color={colors.accent} /></View>
                <View style={styles.recordCopy}>
                  <Text style={styles.recordTitle}>{item.standard} {item.division}</Text>
                  <Text style={styles.recordMeta}>{item.student_count} students · {item.class_teacher_name || 'Teacher unassigned'}</Text>
                </View>
                <SelectableChip label={item.status || 'pending'} selected={selectedClassId === item.class_section_id} />
              </View>
            </AnimatedCard>
          </Pressable>
        ))}
        {selectedSheetQuery.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
        {selectedSheetQuery.isError ? <ErrorState title="Sheet could not load" message={extractDetail(selectedSheetQuery.error, 'Refresh and try again.')} onAction={() => void selectedSheetQuery.refetch()} /> : null}
        {selectedSheetQuery.data && ['submitted', 'locked'].includes(selectedSheetQuery.data.status) ? (
          <AnimatedCard style={styles.actionCard}>
            <Text style={styles.recordTitle}>Reopen {selectedSheetQuery.data.standard} {selectedSheetQuery.data.division}</Text>
            <Text style={styles.noteText}>This returns the roster to the assigned teacher and records your reason in the audit trail.</Text>
            <TextInputField label="Reopen reason" value={reopenReason} onChangeText={setReopenReason} placeholder="Explain what needs correction" left={<Ionicons name="refresh" size={17} color={colors.textMuted} />} />
            <AnimatedButton label="Reopen for correction" variant="secondary" loading={reopenMutation.isPending} disabled={reopenReason.trim().length < 3} onPress={() => reopenMutation.mutate({ sheetId: selectedSheetQuery.data.id, reason: reopenReason.trim() })} />
          </AnimatedCard>
        ) : null}
      </View>

    </AppScreen>
  )
}

function StudentAttendance() {
  const queryClient = useQueryClient()
  const netInfo = useNetInfo()
  const [correctionRecordId, setCorrectionRecordId] = useState<string | null>(null)
  const [correctionReason, setCorrectionReason] = useState('')
  const summaryQuery = useQuery({
    queryKey: ['attendance', 'student', 'summary'],
    queryFn: attendanceApi.getStudentSummary,
  })

  const correctionsQuery = useQuery({
    queryKey: ['attendance', 'student', 'corrections'],
    queryFn: attendanceApi.getCorrections,
    retry: false,
  })

  const correctionMutation = useMutation({
    mutationFn: ({ recordId, reason }: { recordId: string; reason: string }) => attendanceApi.createCorrection(recordId, reason),
    onSuccess: async () => {
      setCorrectionRecordId(null)
      setCorrectionReason('')
      await queryClient.invalidateQueries({ queryKey: ['attendance', 'student', 'corrections'] })
    },
    onError: (error) => Alert.alert('Correction not sent', extractDetail(error, 'Your request could not be sent. Please try again.')),
  })

  if (summaryQuery.isLoading) {
    return (
      <AppScreen protectedChrome scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading attendance</Text>
      </AppScreen>
    )
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return (
      <AppScreen protectedChrome contentStyle={styles.screen}>
        <AttendanceHero title="Your attendance" subtitle="Your private school attendance could not be loaded." signal="RECOVERY" />
        <ErrorState kind={netInfo.isConnected === false ? 'offline' : 'error'} title={netInfo.isConnected === false ? 'Attendance is offline' : 'Attendance unavailable'} message={netInfo.isConnected === false ? 'Reconnect to load your private attendance history.' : extractDetail(summaryQuery.error, 'Attendance is available for enrolled school students.')} onAction={() => void summaryQuery.refetch()} />
      </AppScreen>
    )
  }

  const summary = summaryQuery.data
  const latestTone = summary.latest_status ? statusTones[summary.latest_status] : colors.textMuted

  return (
    <AppScreen
      protectedChrome
      contentStyle={styles.screen}
      refreshControl={<RefreshControl refreshing={summaryQuery.isRefetching} onRefresh={summaryQuery.refetch} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <AttendanceHero
        title={`${Math.round(summary.attendance_percent)}% this month`}
        subtitle={`Your private attendance for ${formatMonth(summary.month)}.`}
        signal="PRIVATE"
      />

      <View style={styles.summaryBand}>
        <MetricStrip items={[
          { value: `${Math.round(summary.attendance_percent)}%`, label: 'Rate', tone: colors.success },
          { value: summary.present_equivalent, label: 'Days' },
          { value: summary.absent_count, label: 'Absent', tone: colors.danger },
          { value: summary.excused_count, label: 'Excused', tone: colors.textMuted },
        ]} />
        <View style={styles.statusRow}>
          <SelectableChip label={summary.latest_status ? statusLabels[summary.latest_status] : 'No latest status'} selected />
          <Text style={[styles.dateText, { color: latestTone }]}>{summary.scheduled_count} scheduled days</Text>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Recent history" subtitle="Latest class attendance records." count={summary.history.length} />
        {summary.history.length === 0 ? (
          <AnimatedCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>No attendance history yet.</Text>
          </AnimatedCard>
        ) : (
          <View style={styles.historyLedger}>
          {summary.history.map((item) => (
            <View key={`${item.attendance_date}-${item.standard}-${item.division ?? ''}`} style={styles.historyRow}>
              <View style={styles.recordTop}>
                <View style={[styles.statusDot, { backgroundColor: statusTones[item.status] }]} />
                <View style={styles.recordCopy}>
                  <Text style={styles.recordTitle}>{formatDate(item.attendance_date)}</Text>
                  <Text style={styles.recordMeta}>{item.standard} {item.division ?? ''} / {statusLabels[item.status]}</Text>
                </View>
              </View>
              {item.note || item.class_note ? <Text style={styles.noteText}>{item.note || item.class_note}</Text> : null}
              {correctionsQuery.data?.find((request) => request.record_id === item.record_id) ? (
                <View style={styles.correctionState}>
                  <Ionicons name="shield-checkmark-outline" size={17} color={colors.info} />
                  <Text style={styles.correctionStateText}>Correction {correctionsQuery.data.find((request) => request.record_id === item.record_id)?.status}</Text>
                </View>
              ) : correctionRecordId === item.record_id ? (
                <View style={styles.correctionActions}>
                  <TextInputField
                    label="What should be corrected?"
                    value={correctionReason}
                    onChangeText={setCorrectionReason}
                    placeholder="Share the date, expected status, and why"
                    multiline
                    left={<Ionicons name="chatbox-ellipses-outline" size={17} color={colors.textMuted} />}
                  />
                  <View style={styles.actionRow}>
                    <AnimatedButton label="Cancel" variant="ghost" disabled={correctionMutation.isPending} onPress={() => { setCorrectionRecordId(null); setCorrectionReason('') }} style={styles.actionButton} />
                    <AnimatedButton label="Send request" loading={correctionMutation.isPending} disabled={correctionReason.trim().length < 3 || netInfo.isConnected === false} onPress={() => correctionMutation.mutate({ recordId: item.record_id, reason: correctionReason.trim() })} style={styles.actionButton} />
                  </View>
                </View>
              ) : (
                <Pressable accessibilityRole="button" onPress={() => setCorrectionRecordId(item.record_id)} style={styles.correctionLink}>
                  <Ionicons name="create-outline" size={17} color={colors.accent} />
                  <Text style={styles.correctionLinkText}>Request a correction</Text>
                </Pressable>
              )}
            </View>
          ))}
          </View>
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
    <AppScreen protectedChrome scroll={false} contentStyle={styles.center}>
      <ErrorState title="Attendance unavailable" message={`Attendance is not configured for ${roleLabel(role)} accounts.`} />
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[5],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  summaryBand: {
    gap: spacing[4],
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.xl,
    backgroundColor: colors.backgroundElevated,
    ...shadows.xs,
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
  metricStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  metricStripItem: {
    flex: 1,
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  metricStripDivider: {
    borderLeftWidth: 1,
    borderLeftColor: colors.borderSubtle,
  },
  metricStripValue: {
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 20,
    textAlign: 'center',
  },
  metricStripLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    lineHeight: 11,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: 3,
  },
  snapshotText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  actionCard: {
    gap: spacing[4],
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  attendanceHero: {
    minHeight: 206,
    overflow: 'hidden',
    padding: spacing[6],
    borderRadius: radius.xl,
    backgroundColor: '#07152D',
    ...shadows.md,
  },
  heroOrbit: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: radius.full,
    borderWidth: 42,
    borderColor: 'rgba(243,108,33,0.14)',
    right: -98,
    top: -104,
  },
  heroTopline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  heroIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  heroIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  heroEyebrow: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.25,
  },
  heroSignal: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroSignalDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.accentLight,
  },
  heroSignalText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.7,
  },
  heroTitle: {
    marginTop: spacing[6],
    maxWidth: '88%',
    color: colors.white,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.65,
  },
  heroSubtitle: {
    marginTop: spacing[2],
    maxWidth: '86%',
    color: '#AAB5C6',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  heroRule: {
    position: 'absolute',
    left: spacing[6],
    right: spacing[6],
    bottom: spacing[5],
    height: 3,
    overflow: 'hidden',
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  heroRuleActive: {
    width: '38%',
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  inlineNotice: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.warningSurface,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  inlineNoticeText: {
    ...typography.roles.body,
    flex: 1,
    color: colors.text,
  },
  successNotice: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radius.lg,
    backgroundColor: colors.successSurface,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  successNoticeText: {
    ...typography.roles.body,
    flex: 1,
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
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
  recordRow: {
    gap: spacing[4],
    padding: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.backgroundElevated,
  },
  correctionCard: {
    gap: spacing[4],
  },
  correctionActions: {
    gap: spacing[3],
  },
  correctionLink: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    alignSelf: 'flex-start',
  },
  correctionLinkText: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  correctionState: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  correctionStateText: {
    color: colors.info,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
    textTransform: 'capitalize',
  },
  classCard: {
    gap: spacing[3],
  },
  historyLedger: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.xl,
    backgroundColor: colors.backgroundElevated,
  },
  rosterSurface: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.xl,
    backgroundColor: colors.backgroundElevated,
  },
  historyRow: {
    gap: spacing[3],
    padding: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  selectedClassCard: {
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
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
    minHeight: 44,
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
