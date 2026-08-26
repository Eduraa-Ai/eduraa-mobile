import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNetInfo } from '@react-native-community/netinfo'
import { useNavigation } from '@react-navigation/native'
import React, { ReactNode, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, AppState, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatedButton, AnimatedCard, AppScreen, DateField, ErrorState, SelectableChip, SelectField, TextInputField } from '../../components/ui'
import {
  AttendanceCorrectionRequest,
  AttendanceRecord,
  AttendanceStatus,
  attendanceApi,
} from '../../api/attendance'
import { useAuthStore } from '../../stores/authStore'
import { colors, layout, radius, shadows, spacing, typography } from '../../theme'
import type { Role } from '../../types'
import {
  changedAttendanceRecords,
  filterAttendanceRecords,
  formatSchoolDate,
  hasAttendanceChanges,
  restoreAttendanceDraft,
  statusesFromRecords,
  todaySchoolDate,
  type AttendanceDraft,
  type AttendanceRosterFilter,
  type StoredAttendanceDraft,
} from './attendanceModel'

const statusLabels: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  half_day: 'Half day',
  excused: 'On leave',
}

const statusTones: Record<AttendanceStatus, string> = {
  present: colors.success,
  absent: colors.danger,
  late: colors.warning,
  half_day: colors.info,
  excused: colors.textMuted,
}

type LeadershipQueueFilter = 'all' | 'missing' | 'draft' | 'submitted' | 'reopened'

const leadershipQueueLabels: Record<LeadershipQueueFilter, string> = {
  all: 'All classes',
  missing: 'Not started',
  draft: 'In progress',
  submitted: 'Completed',
  reopened: 'Needs correction',
}

function leadershipStatusLabel(status?: string | null) {
  if (!status) return leadershipQueueLabels.missing
  if (status === 'draft') return leadershipQueueLabels.draft
  if (status === 'submitted' || status === 'locked') return leadershipQueueLabels.submitted
  if (status === 'reopened') return leadershipQueueLabels.reopened
  return status.replace(/_/g, ' ')
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

function WorkflowStepHeader({ number, title, subtitle }: { number: number; title: string; subtitle: string }) {
  return (
    <View style={styles.workflowStepHeader}>
      <View style={styles.workflowStepNumber}><Text style={styles.workflowStepNumberText}>{number}</Text></View>
      <View style={styles.workflowStepCopy}>
        <Text style={styles.workflowStepTitle}>{title}</Text>
        <Text style={styles.workflowStepSubtitle}>{subtitle}</Text>
      </View>
    </View>
  )
}

function StatusChip({ status, selected, disabled = false, onPress }: { status: AttendanceStatus; selected: boolean; disabled?: boolean; onPress: () => void }) {
  const tone = statusTones[status]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.statusChip,
        selected && { backgroundColor: `${tone}18`, borderColor: tone },
        disabled && styles.disabledControl,
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
  onNote,
}: {
  record: AttendanceRecord
  disabled: boolean
  busy: boolean
  onStatus: (status: AttendanceStatus) => void
  onNote?: (note: string) => void
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
          <StatusChip key={status} status={status} selected={record.status === status} disabled={disabled} onPress={() => onStatus(status)} />
        ))}
      </View>
      {onNote && (record.status !== 'present' || Boolean(record.note?.trim())) ? (
        <TextInputField
          label="Student note"
          value={record.note ?? ''}
          editable={!disabled}
          onChangeText={onNote}
          placeholder="Optional context for this attendance mark"
          left={<Ionicons name="document-text-outline" size={17} color={colors.textMuted} />}
        />
      ) : record.note ? <Text style={styles.noteText}>{record.note}</Text> : null}
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
  const insets = useSafeAreaInsets()
  const [attendanceDate, setAttendanceDate] = useState(todaySchoolDate)
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState('all')
  const [classNote, setClassNote] = useState('')
  const [draft, setDraft] = useState<AttendanceDraft>({})
  const [draftRevision, setDraftRevision] = useState<number | null>(null)
  const [draftSheetId, setDraftSheetId] = useState<string | null>(null)
  const [rosterSearch, setRosterSearch] = useState('')
  const [rosterFilter, setRosterFilter] = useState<AttendanceRosterFilter>('all')
  const [showMoreRosterFilters, setShowMoreRosterFilters] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [terminalMessage, setTerminalMessage] = useState<string | null>(null)

  const classesQuery = useQuery({
    queryKey: ['attendance', 'teacher', 'classes'],
    queryFn: attendanceApi.getTeacherClasses,
  })

  const todayQuery = useQuery({
    queryKey: ['attendance', 'teacher', 'today', attendanceDate, selectedClassId],
    queryFn: () => attendanceApi.getTeacherToday(attendanceDate, selectedClassId),
  })

  const summaryQuery = useQuery({
    queryKey: ['attendance', 'teacher', 'summary', attendanceDate, selectedClassId],
    queryFn: () => attendanceApi.getTeacherSummary(attendanceDate, selectedClassId),
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
    if (!selectedClassId && todayQuery.data?.class_section_id) {
      setSelectedClassId(todayQuery.data.class_section_id)
    }
  }, [selectedClassId, todayQuery.data?.class_section_id])

  useEffect(() => {
    if (!queriedSheet || !storageKey || (draftSheetId === queriedSheet.id && draftRevision === queriedSheet.revision)) return
    let active = true
    void AsyncStorage.getItem(storageKey).then((saved) => {
      if (!active) return
      const parsed = saved ? JSON.parse(saved) as StoredAttendanceDraft : null
      if (parsed?.sheetId === queriedSheet.id && parsed.revision === queriedSheet.revision) {
        setDraft(restoreAttendanceDraft(parsed, queriedSheet.records))
        setClassNote(typeof parsed.classNote === 'string' ? parsed.classNote : queriedSheet.class_note ?? '')
      } else {
        setDraft(statusesFromRecords(queriedSheet.records))
        setClassNote(queriedSheet.class_note ?? '')
        if (saved) void AsyncStorage.removeItem(storageKey)
      }
      setDraftRevision(queriedSheet.revision)
      setDraftSheetId(queriedSheet.id)
    }).catch(() => {
      if (!active) return
      setDraft(statusesFromRecords(queriedSheet.records))
      setClassNote(queriedSheet.class_note ?? '')
      setDraftRevision(queriedSheet.revision)
      setDraftSheetId(queriedSheet.id)
    })
    return () => { active = false }
  }, [draftRevision, draftSheetId, queriedSheet, storageKey])

  useEffect(() => {
    if (!queriedSheet || !storageKey || draftSheetId !== queriedSheet.id || draftRevision !== queriedSheet.revision || !dirty) return
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
  }, [classNote, dirty, draft, draftRevision, draftSheetId, queriedSheet, storageKey])

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
      { text: 'Leave', style: 'destructive', onPress: () => {
        const leave = () => navigation.dispatch(event.data.action)
        if (!storageKey || !queriedSheet || draftRevision !== queriedSheet.revision) {
          leave()
          return
        }
        const payload: StoredAttendanceDraft = { sheetId: queriedSheet.id, revision: queriedSheet.revision, classNote, statuses: draft }
        void AsyncStorage.setItem(storageKey, JSON.stringify(payload)).finally(leave)
      } },
    ])
  }), [classNote, dirty, draft, draftRevision, navigation, queriedSheet, storageKey])

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['attendance', 'teacher', 'today', attendanceDate] }),
      queryClient.invalidateQueries({ queryKey: ['attendance', 'teacher', 'summary', attendanceDate] }),
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
        queryClient.setQueryData(['attendance', 'teacher', 'today', attendanceDate, selectedClassId], (current: typeof todayQuery.data) => current ? { ...current, sheet: next } : current)
        if (next) {
          setDraft(statusesFromRecords(next.records))
          setClassNote(next.class_note ?? '')
          setDraftRevision(next.revision)
          setDraftSheetId(next.id)
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
  const liveRecords = sheet.records.map((record) => ({
    ...record,
    status: draft[record.id]?.status ?? record.status,
    note: draft[record.id]?.note ?? record.note,
  }))
  const liveSummary = {
    total_students: liveRecords.length,
    present_count: liveRecords.filter((record) => record.status === 'present').length,
    absent_count: liveRecords.filter((record) => record.status === 'absent').length,
    late_count: liveRecords.filter((record) => record.status === 'late').length,
    half_day_count: liveRecords.filter((record) => record.status === 'half_day').length,
    excused_count: liveRecords.filter((record) => record.status === 'excused').length,
  }
  const summary = draftSheetId === sheet.id ? liveSummary : (summaryQuery.data ?? sheet.summary)
  const pendingRecords = changedAttendanceRecords(sheet.records, draft)
  const visibleRecords = filterAttendanceRecords(
    liveRecords,
    rosterSearch,
    rosterFilter,
    sheet.records,
    selectedStudentId === 'all' ? null : selectedStudentId,
  )
  const exceptionCount = liveRecords.filter((record) => record.status !== 'present').length
  const classNoteChanged = classNote.trim() !== (sheet.class_note ?? '').trim()
  const detailedRosterFilterActive = rosterFilter !== 'all' && rosterFilter !== 'exceptions' && rosterFilter !== 'changed'
  const locked = sheet.status === 'locked'
  const refreshing = todayQuery.isRefetching || summaryQuery.isRefetching
  const availableSections = classesQuery.data?.length ? classesQuery.data : [{
    class_section_id: sheet.class_section_id,
    standard: sheet.standard,
    division: sheet.division,
  }]
  const selectedSection = availableSections.find((item) => item.class_section_id === sheet.class_section_id) ?? availableSections[0]
  const standardOptions = Array.from(new Set(availableSections.map((item) => item.standard))).map((standard) => ({
    value: standard,
    label: `Class ${standard}`,
  }))
  const divisionOptions = availableSections
    .filter((item) => item.standard === selectedSection.standard)
    .map((item) => ({ value: item.class_section_id, label: `Division ${item.division}` }))
  const studentOptions = [
    { value: 'all', label: `All students (${liveRecords.length})` },
    ...liveRecords.map((record) => ({
      value: record.student_id,
      label: `${record.student_name} · ${record.student_code}`,
    })),
  ]

  const updateRecord = (record: AttendanceRecord, patch: Partial<{ status: AttendanceStatus; note: string }>) => {
    if (locked) return
    setTerminalMessage(null)
    setDraft((current) => ({
      ...current,
      [record.id]: {
        status: patch.status ?? current[record.id]?.status ?? record.status,
        note: patch.note ?? current[record.id]?.note ?? record.note ?? '',
      },
    }))
  }

  const saveDraft = () => sheetMutation.mutate({
    key: 'save',
    run: () => attendanceApi.updateRecords(sheet.id, sheet.revision, pendingRecords, classNote.trim() || null),
  })

  const reloadLatest = () => {
    setConflict(null)
    if (storageKey) void AsyncStorage.removeItem(storageKey)
    setDraftRevision(null)
    setDraftSheetId(null)
    void todayQuery.refetch()
  }

  const changeAttendanceDate = (nextDate: string) => {
    const apply = () => {
      if (dirty && storageKey && queriedSheet && draftRevision === queriedSheet.revision) {
        const payload: StoredAttendanceDraft = { sheetId: queriedSheet.id, revision: queriedSheet.revision, classNote, statuses: draft }
        void AsyncStorage.setItem(storageKey, JSON.stringify(payload))
      }
      setConflict(null)
      setTerminalMessage(null)
      setRosterSearch('')
      setSelectedStudentId('all')
      setRosterFilter('all')
      setShowMoreRosterFilters(false)
      setDraftRevision(null)
      setDraftSheetId(null)
      setAttendanceDate(nextDate)
    }
    if (!dirty) {
      apply()
      return
    }
    Alert.alert('Open another date?', 'Your current draft is saved on this device. You can return to this date later.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Open date', onPress: apply },
    ])
  }

  const changeClassSection = (nextClassId: string) => {
    if (!nextClassId || nextClassId === sheet.class_section_id) return
    const nextSection = availableSections.find((item) => item.class_section_id === nextClassId)
    const apply = () => {
      if (dirty && storageKey && queriedSheet && draftRevision === queriedSheet.revision) {
        const payload: StoredAttendanceDraft = { sheetId: queriedSheet.id, revision: queriedSheet.revision, classNote, statuses: draft }
        void AsyncStorage.setItem(storageKey, JSON.stringify(payload))
      }
      setConflict(null)
      setTerminalMessage(null)
      setRosterSearch('')
      setRosterFilter('all')
      setShowMoreRosterFilters(false)
      setSelectedStudentId('all')
      setDraftRevision(null)
      setDraftSheetId(null)
      setSelectedClassId(nextClassId)
    }
    if (!dirty) {
      apply()
      return
    }
    Alert.alert(
      `Open Class ${nextSection?.standard ?? ''} ${nextSection?.division ?? ''}?`,
      'Your current attendance draft is saved on this device. You can return to this class later.',
      [{ text: 'Stay', style: 'cancel' }, { text: 'Open class', onPress: apply }],
    )
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
    <View style={styles.root}>
    <AppScreen
      protectedChrome
      contentStyle={{ ...styles.screen, ...styles.teacherScreen }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAttendance} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <AttendanceHero
        title={`${sheet.standard} ${sheet.division} · ${formatDate(sheet.attendance_date)}`}
        subtitle={`${sheet.records.length} authorized students · Review exceptions, then submit once.`}
        signal={locked ? 'LOCKED' : dirty ? 'LOCAL DRAFT' : sheet.status === 'submitted' ? 'SUBMITTED' : 'READY'}
      />

      <View style={styles.workflowSection}>
        <WorkflowStepHeader number={1} title="Choose class and day" subtitle="Select the class and division before taking the roll call." />
        <View style={styles.dateControlCard}>
          <View style={styles.scopeFieldsRow}>
            <View style={styles.scopeField}>
              <SelectField
                label="Class"
                value={selectedSection.standard}
                options={standardOptions}
                loading={classesQuery.isLoading}
                disabled={Boolean(busyKey) || standardOptions.length <= 1}
                searchable={false}
                onChange={(standard) => {
                  const firstSection = availableSections.find((item) => item.standard === standard)
                  if (firstSection) changeClassSection(firstSection.class_section_id)
                }}
              />
            </View>
            <View style={styles.scopeField}>
              <SelectField
                label="Division"
                value={sheet.class_section_id}
                options={divisionOptions}
                disabled={Boolean(busyKey) || divisionOptions.length <= 1}
                searchable={false}
                onChange={changeClassSection}
              />
            </View>
          </View>
          <DateField label="Attendance date" value={attendanceDate} onChange={changeAttendanceDate} disabled={Boolean(busyKey)} />
          {classesQuery.isError ? <Text style={styles.controlHint}>Showing the current assigned class. Pull to refresh to load other assigned classes.</Text> : null}
        </View>
      </View>

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

      <View style={styles.workflowSection}>
      <WorkflowStepHeader number={2} title="Prepare the roll call" subtitle="Start from all present, or save work before you leave." />
      <View style={styles.actionCard}>
        <View style={styles.teacherTip}>
          <View style={styles.teacherTipIcon}><Ionicons name="flash-outline" size={17} color={colors.accentStrong} /></View>
          <Text style={styles.teacherTipText}>Fastest method: mark the class present, then change only absent, late, half-day, or on-leave students.</Text>
        </View>
        <TextInputField
          label="Class remark (optional)"
          value={classNote}
          editable={!locked && !Boolean(busyKey)}
          onChangeText={setClassNote}
          placeholder={sheet.class_note || 'Example: Assembly delayed first period'}
          multiline
          left={<Ionicons name="document-text" size={17} color={colors.textMuted} />}
        />
        <View style={styles.actionRow}>
          <AnimatedButton
            label="Mark all present"
            loading={busyKey === 'mark-all'}
            disabled={Boolean(busyKey) || locked || netInfo.isConnected === false || sheet.records.length === 0}
            onPress={() => Alert.alert('Mark everyone present?', 'This saves Present for the full roster immediately and replaces any unsaved local attendance changes.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Mark all', onPress: () => sheetMutation.mutate({
                key: 'mark-all',
                run: async () => {
                  const result = await attendanceApi.markAllPresent(sheet.id, sheet.revision)
                  setRosterFilter('all')
                  setShowMoreRosterFilters(false)
                  setTerminalMessage(`Marked all ${result.records.length} students present.`)
                  return result
                },
              }) },
            ])}
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
      </View>
      </View>

      <View style={styles.workflowSection}>
        <WorkflowStepHeader number={3} title="Review the roster" subtitle={locked ? 'This sheet is locked and read-only.' : 'Mark only exceptions and add context where it helps.'} />
        <SectionHeader title="Class roster" subtitle={locked ? 'Submitted sheets are read-only.' : 'Find a student, mark status, and add context only when useful.'} count={visibleRecords.length} />
        <SelectField
          label="Student"
          value={selectedStudentId}
          options={studentOptions}
          disabled={liveRecords.length === 0}
          placeholder="All students"
          onChange={setSelectedStudentId}
        />
        <TextInputField
          value={rosterSearch}
          onChangeText={setRosterSearch}
          placeholder="Search student name or admission number"
          accessibilityLabel="Search attendance roster"
          left={<Ionicons name="search-outline" size={18} color={colors.textMuted} />}
        />
        <View style={styles.primaryFilterRow}>
          {([
            ['all', `All ${liveRecords.length}`],
            ['exceptions', `Needs attention ${exceptionCount}`],
            ['changed', `Changed ${pendingRecords.length}`],
          ] as Array<[AttendanceRosterFilter, string]>).map(([value, label]) => (
            <SelectableChip key={value} label={label} selected={rosterFilter === value} onPress={() => { setRosterFilter(value); setShowMoreRosterFilters(false) }} style={styles.filterChip} />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showMoreRosterFilters }}
            onPress={() => setShowMoreRosterFilters((current) => !current)}
            style={({ pressed }) => [styles.moreFiltersButton, detailedRosterFilterActive && styles.moreFiltersButtonActive, pressed && styles.pressed]}
          >
            <Text style={[styles.moreFiltersText, detailedRosterFilterActive && styles.moreFiltersTextActive]}>{showMoreRosterFilters ? 'Fewer filters' : detailedRosterFilterActive ? `${statusLabels[rosterFilter as AttendanceStatus]} filter` : 'More filters'}</Text>
            <Ionicons name={showMoreRosterFilters ? 'chevron-up' : detailedRosterFilterActive ? 'funnel' : 'chevron-down'} size={15} color={detailedRosterFilterActive ? colors.accentStrong : colors.textSecondary} />
          </Pressable>
        </View>
        {showMoreRosterFilters ? (
          <View style={styles.secondaryFilterPanel}>
            <Text style={styles.secondaryFilterLabel}>Show only</Text>
            <View style={styles.filterRow}>
              {([
                ['present', `Present ${summary.present_count}`],
                ['absent', `Absent ${summary.absent_count}`],
                ['late', `Late ${summary.late_count}`],
                ['half_day', `Half day ${summary.half_day_count}`],
                ['excused', `On leave ${summary.excused_count}`],
              ] as Array<[AttendanceRosterFilter, string]>).map(([value, label]) => (
                <SelectableChip key={value} label={label} selected={rosterFilter === value} onPress={() => setRosterFilter(value)} style={styles.filterChip} />
              ))}
            </View>
          </View>
        ) : null}
        {sheet.records.length === 0 ? (
          <ErrorState title="No students are enrolled" message="This class roster is empty, so attendance cannot be submitted. Refresh after enrollment is corrected." onAction={() => void todayQuery.refetch()} />
        ) : rosterFilter === 'changed' && pendingRecords.length === 0 && !rosterSearch.trim() ? (
          <View style={styles.filterGuidance}>
            <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
            <View style={styles.filterGuidanceCopy}>
              <Text style={styles.filterGuidanceTitle}>No student changes yet</Text>
              <Text style={styles.filterGuidanceText}>Mark an absent, late, half-day, or on-leave student and they will appear here for a final check.</Text>
            </View>
          </View>
        ) : visibleRecords.length === 0 ? (
          <ErrorState title="No students in this view" message="Clear the student, search, or status filter to see the full class roster." actionLabel="Show all students" onAction={() => { setSelectedStudentId('all'); setRosterSearch(''); setRosterFilter('all'); setShowMoreRosterFilters(false) }} />
        ) : (
          <View style={styles.rosterSurface}>
            {visibleRecords.map((record) => (
              <AttendanceRecordCard
                key={record.id}
                record={record}
                disabled={locked || Boolean(busyKey)}
                busy={false}
                onStatus={(status) => updateRecord(record, { status })}
                onNote={(note) => updateRecord(record, { note })}
              />
            ))}
          </View>
        )}
      </View>
    </AppScreen>
      <View style={[styles.submitDock, { bottom: layout.bottomTabHeight + insets.bottom }]}>
        <View style={[styles.submitSurface, dirty && styles.submitSurfaceActive]}>
          <View style={styles.submitStatusRow}>
            <View style={[styles.submitStatusIcon, !dirty && !locked && styles.submitStatusIconReady]}>
              <Ionicons name={locked ? 'lock-closed-outline' : dirty ? 'create-outline' : 'shield-checkmark-outline'} size={18} color={locked ? colors.textMuted : dirty ? colors.accent : colors.success} />
            </View>
            <View style={styles.submitCopy}>
              <Text style={styles.submitTitle}>{locked ? 'Attendance locked' : dirty ? pendingRecords.length ? `${pendingRecords.length} student ${pendingRecords.length === 1 ? 'change' : 'changes'} ready` : classNoteChanged ? 'Class note updated' : 'Attendance changes ready' : sheet.status === 'submitted' ? 'Attendance submitted' : 'Roster ready to submit'}</Text>
              <Text style={styles.submitMeta}>{netInfo.isConnected === false ? 'Reconnect to submit safely.' : `${summary.present_count} present · ${exceptionCount} exceptions`}</Text>
            </View>
          </View>
          <AnimatedButton
            label={locked ? 'Attendance locked' : sheet.status === 'submitted' ? 'Resubmit attendance' : 'Submit attendance'}
            loading={busyKey === 'submit'}
            disabled={Boolean(busyKey) || locked || netInfo.isConnected === false || sheet.records.length === 0}
            onPress={() => Alert.alert(sheet.status === 'submitted' ? 'Resubmit attendance?' : 'Submit attendance?', `${sheet.standard} ${sheet.division} · ${formatDate(sheet.attendance_date)} · ${sheet.records.length} students. You can update and resubmit this sheet until leadership locks it.`, [
              { text: 'Review roster', style: 'cancel' },
              { text: 'Submit', onPress: () => sheetMutation.mutate({ key: 'submit', run: async () => {
                const result = await attendanceApi.submitSheet(sheet.id, sheet.revision, classNote.trim() || null, pendingRecords)
                setTerminalMessage(`Submitted ${result.standard} ${result.division} for ${formatDate(result.attendance_date)}. You can still correct and resubmit until leadership locks it.`)
                return result
              } }) },
            ])}
          />
        </View>
      </View>
    </View>
  )
}

function AttendanceHero({ title, subtitle, signal }: { title: string; subtitle: string; signal: string }) {
  return (
    <View style={styles.attendanceHero}>
      <View style={styles.heroTopline}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>ATTENDANCE</Text>
          <Text style={styles.heroTitle}>{title}</Text>
        </View>
        <View style={styles.heroSignal}><View style={styles.heroSignalDot} /><Text style={styles.heroSignalText}>{signal}</Text></View>
      </View>
      <Text style={styles.heroSubtitle}>{subtitle}</Text>
    </View>
  )
}

function LeadershipAttendance() {
  const queryClient = useQueryClient()
  const [attendanceDate, setAttendanceDate] = useState(todaySchoolDate)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [reopenReason, setReopenReason] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [queueSearch, setQueueSearch] = useState('')
  const [queueFilter, setQueueFilter] = useState<LeadershipQueueFilter>('all')
  const [reviewSearch, setReviewSearch] = useState('')
  const [reviewFilter, setReviewFilter] = useState<AttendanceRosterFilter>('all')
  const [terminalMessage, setTerminalMessage] = useState<string | null>(null)

  const summaryQuery = useQuery({
    queryKey: ['attendance', 'leadership', 'summary', attendanceDate],
    queryFn: () => attendanceApi.getLeadershipSummary(attendanceDate),
  })

  const correctionsQuery = useQuery({
    queryKey: ['attendance', 'corrections'],
    queryFn: attendanceApi.getCorrections,
  })

  const selectedSheetQuery = useQuery({
    queryKey: ['attendance', 'leadership', 'sheet', selectedClassId, attendanceDate],
    queryFn: () => attendanceApi.getSheet(selectedClassId!, attendanceDate),
    enabled: Boolean(selectedClassId),
    retry: false,
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
    mutationFn: ({ sheetId, reason }: { sheetId: string; reason: string }) => {
      setBusyKey('reopen')
      return attendanceApi.reopenSheet(sheetId, reason)
    },
    onSuccess: async (result) => {
      setReopenReason('')
      setTerminalMessage(`Reopened ${result.standard} ${result.division}. The assigned teacher can now correct this roster.`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance', 'leadership', 'summary'] }),
        queryClient.invalidateQueries({ queryKey: ['attendance', 'leadership', 'sheet'] }),
      ])
    },
    onError: (error) => Alert.alert('Sheet not reopened', extractDetail(error, 'Unable to reopen this attendance sheet.')),
    onSettled: () => setBusyKey(null),
  })

  const overrideMutation = useMutation({
    mutationFn: ({ record, status }: { record: AttendanceRecord; status: AttendanceStatus }) => {
      setBusyKey(`override-${record.id}`)
      return attendanceApi.overrideRecord(record.id, status, overrideReason.trim(), record.note)
    },
    onSuccess: async (result) => {
      setOverrideReason('')
      setTerminalMessage(`Updated ${result.standard} ${result.division}. The leadership correction is recorded in the audit trail.`)
      queryClient.setQueryData(['attendance', 'leadership', 'sheet', selectedClassId, attendanceDate], result)
      await queryClient.invalidateQueries({ queryKey: ['attendance', 'leadership', 'summary', attendanceDate] })
    },
    onError: (error) => Alert.alert('Attendance not changed', extractDetail(error, 'Unable to override this attendance record.')),
    onSettled: () => setBusyKey(null),
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
  const allClasses = summary.classes.length > 0 ? summary.classes : summary.pending
  const queueQuery = queueSearch.trim().toLowerCase()
  const queueItems = allClasses.filter((item) => {
    if (queueQuery && !`${item.standard} ${item.division} ${item.class_teacher_name ?? ''}`.toLowerCase().includes(queueQuery)) return false
    if (queueFilter === 'all') return true
    if (queueFilter === 'missing') return !item.status
    if (queueFilter === 'submitted') return item.status === 'submitted' || item.status === 'locked'
    return item.status === queueFilter
  })
  const queueCounts: Record<LeadershipQueueFilter, number> = {
    all: allClasses.length,
    missing: allClasses.filter((item) => !item.status).length,
    draft: allClasses.filter((item) => item.status === 'draft').length,
    submitted: allClasses.filter((item) => item.status === 'submitted' || item.status === 'locked').length,
    reopened: allClasses.filter((item) => item.status === 'reopened').length,
  }
  const reviewRecords = filterAttendanceRecords(selectedSheetQuery.data?.records ?? [], reviewSearch, reviewFilter)
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

      <View style={styles.dateControlCard}>
        <DateField
          label="Review date"
          value={attendanceDate}
          disabled={Boolean(busyKey)}
          onChange={(value) => {
            setAttendanceDate(value)
            setSelectedClassId(null)
            setQueueFilter('all')
            setQueueSearch('')
            setReviewFilter('all')
            setReviewSearch('')
            setTerminalMessage(null)
          }}
        />
        <Text style={styles.controlHint}>Review a past or current school day without changing today’s records.</Text>
      </View>

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
        <SectionHeader title="Class queue" subtitle="Find any class, then inspect its sheet and exceptions." count={queueItems.length} />
        <TextInputField
          value={queueSearch}
          onChangeText={setQueueSearch}
          placeholder="Search class, division, or class teacher"
          accessibilityLabel="Search attendance classes"
          left={<Ionicons name="search-outline" size={18} color={colors.textMuted} />}
        />
        <View style={styles.filterRow}>
          {(['all', 'missing', 'draft', 'submitted', 'reopened'] as LeadershipQueueFilter[]).map((value) => (
            <SelectableChip
              key={value}
              label={`${leadershipQueueLabels[value]} ${queueCounts[value]}`}
              selected={queueFilter === value}
              onPress={() => setQueueFilter(value)}
              style={styles.filterChip}
            />
          ))}
        </View>
        {queueItems.map((item) => (
          <Pressable
            key={item.class_section_id}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedClassId === item.class_section_id }}
            onPress={() => {
              setSelectedClassId(item.class_section_id)
              setReopenReason('')
              setOverrideReason('')
              setReviewSearch('')
              setReviewFilter('all')
            }}
          >
            <AnimatedCard style={selectedClassId === item.class_section_id ? { ...styles.classCard, ...styles.selectedClassCard } : styles.classCard}>
              <View style={styles.recordTop}>
                <View style={styles.iconBubble}><Ionicons name="people" size={18} color={colors.accent} /></View>
                <View style={styles.recordCopy}>
                  <Text style={styles.recordTitle}>{item.standard} {item.division}</Text>
                  <Text style={styles.recordMeta}>{item.student_count} students · {item.class_teacher_name || 'Teacher unassigned'}</Text>
                </View>
                <SelectableChip label={leadershipStatusLabel(item.status)} selected={selectedClassId === item.class_section_id} />
              </View>
            </AnimatedCard>
          </Pressable>
        ))}
        {queueItems.length === 0 ? (
          <ErrorState title="No classes match this view" message="Clear the search or choose All to review the full school day." actionLabel="Clear filters" onAction={() => { setQueueSearch(''); setQueueFilter('all') }} />
        ) : null}
        {selectedSheetQuery.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
        {selectedSheetQuery.isError ? <ErrorState title="Sheet not available" message={extractDetail(selectedSheetQuery.error, 'This class may not have started attendance for the selected date.')} onAction={() => void selectedSheetQuery.refetch()} /> : null}
      </View>

      {selectedSheetQuery.data ? (
        <View style={styles.section}>
          <SectionHeader title={`${selectedSheetQuery.data.standard} ${selectedSheetQuery.data.division} review`} subtitle="Use an override only for a verified single-student correction." count={reviewRecords.length} />
          <TextInputField
            value={reviewSearch}
            onChangeText={setReviewSearch}
            placeholder="Search student in this class"
            accessibilityLabel="Search selected attendance sheet"
            left={<Ionicons name="search-outline" size={18} color={colors.textMuted} />}
          />
          <View style={styles.filterRow}>
            {(['all', 'exceptions', 'present', 'absent', 'late', 'half_day', 'excused'] as AttendanceRosterFilter[]).map((value) => (
              <SelectableChip key={value} label={value === 'half_day' ? 'Half day' : value === 'excused' ? 'On leave' : value.charAt(0).toUpperCase() + value.slice(1)} selected={reviewFilter === value} onPress={() => setReviewFilter(value)} style={styles.filterChip} />
            ))}
          </View>

          <AnimatedCard style={styles.actionCard}>
            <Text style={styles.recordTitle}>Correction controls</Text>
            <Text style={styles.noteText}>Reopen a full sheet for teacher resubmission, or enter a reason below before changing one student.</Text>
            <TextInputField label="Leadership correction reason" value={overrideReason} onChangeText={setOverrideReason} placeholder="Why is this single record changing?" left={<Ionicons name="shield-checkmark-outline" size={17} color={colors.textMuted} />} />
            {['submitted', 'locked'].includes(selectedSheetQuery.data.status) ? (
              <View style={styles.reopenBox}>
                <TextInputField label="Reopen reason" value={reopenReason} onChangeText={setReopenReason} placeholder="Why should the teacher resubmit this sheet?" left={<Ionicons name="refresh" size={17} color={colors.textMuted} />} />
                <AnimatedButton label="Reopen for correction" variant="secondary" loading={reopenMutation.isPending} disabled={Boolean(busyKey) || reopenReason.trim().length < 3} onPress={() => reopenMutation.mutate({ sheetId: selectedSheetQuery.data.id, reason: reopenReason.trim() })} />
              </View>
            ) : null}
          </AnimatedCard>

          {reviewRecords.map((record) => (
            <View key={record.id} style={styles.recordRow}>
              <View style={styles.recordTop}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{record.student_name.slice(0, 1).toUpperCase()}</Text></View>
                <View style={styles.recordCopy}>
                  <Text style={styles.recordTitle}>{record.student_name}</Text>
                  <Text style={styles.recordMeta}>{record.student_code}{record.is_override ? ' · Leadership override' : ''}</Text>
                </View>
                {busyKey === `override-${record.id}` ? <ActivityIndicator color={colors.accent} /> : null}
              </View>
              <View style={styles.statusGrid}>
                {(Object.keys(statusLabels) as AttendanceStatus[]).map((status) => (
                  <StatusChip
                    key={status}
                    status={status}
                    selected={record.status === status}
                    disabled={record.status === status || overrideReason.trim().length < 3 || Boolean(busyKey)}
                    onPress={() => {
                      Alert.alert('Confirm leadership override?', `${record.student_name}: ${statusLabels[record.status]} → ${statusLabels[status]}\n\nReason: ${overrideReason.trim()}`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Override', onPress: () => overrideMutation.mutate({ record, status }) },
                      ])
                    }}
                  />
                ))}
              </View>
              {overrideReason.trim().length < 3 ? <Text style={styles.controlHint}>Enter a correction reason above to enable status changes.</Text> : null}
              {record.note ? <Text style={styles.noteText}>{record.note}</Text> : null}
            </View>
          ))}
          {reviewRecords.length === 0 ? (
            <ErrorState title="No students match this review" message="Clear the search or choose a broader status filter." actionLabel="Clear filters" onAction={() => { setReviewSearch(''); setReviewFilter('all') }} />
          ) : null}
        </View>
      ) : null}

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
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    paddingBottom: spacing[5],
  },
  teacherScreen: {
    paddingBottom: spacing[20] + spacing[16],
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
    gap: spacing[3],
    paddingVertical: spacing[3],
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
  },
  dateControlCard: {
    gap: spacing[4],
  },
  scopeFieldsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  scopeField: {
    flex: 1,
    minWidth: 0,
  },
  controlHint: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  primaryFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing[2],
  },
  filterChip: {
    minHeight: 44,
  },
  moreFiltersButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  moreFiltersText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  moreFiltersButtonActive: {
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
  },
  moreFiltersTextActive: {
    color: colors.accentStrong,
  },
  secondaryFilterPanel: {
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
  },
  secondaryFilterLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  filterGuidance: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: radius.lg,
    backgroundColor: colors.successSurface,
  },
  filterGuidanceCopy: {
    flex: 1,
    gap: spacing[1],
  },
  filterGuidanceTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  filterGuidanceText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  workflowSection: {
    gap: spacing[4],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  workflowStepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  workflowStepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurfaceStrong,
  },
  workflowStepNumberText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  workflowStepCopy: {
    flex: 1,
    gap: 1,
  },
  workflowStepTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
  },
  workflowStepSubtitle: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
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
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundElevated,
  },
  teacherTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: colors.accentSurface,
  },
  teacherTipIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundElevated,
  },
  teacherTipText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  attendanceHero: {
    gap: spacing[2],
    paddingHorizontal: spacing[1],
    paddingTop: spacing[1],
  },
  heroTopline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  heroCopy: {
    flex: 1,
    gap: spacing[1],
  },
  heroEyebrow: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.5,
  },
  heroSignal: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  heroSignalDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  heroSignalText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.7,
  },
  heroTitle: {
    color: colors.text,
    fontFamily: typography.fonts.heading,
    fontSize: 27,
    lineHeight: 32,
    letterSpacing: -0.45,
  },
  heroSubtitle: {
    maxWidth: 540,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
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
  submitDock: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
  },
  submitSurface: {
    gap: spacing[3],
    padding: spacing[3],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundElevated,
    ...shadows.md,
  },
  submitSurfaceActive: {
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
  },
  submitStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  submitStatusIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundMuted,
  },
  submitStatusIconReady: {
    backgroundColor: colors.successSurface,
  },
  submitCopy: {
    flex: 1,
    gap: 2,
  },
  submitTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
    lineHeight: 20,
  },
  submitMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
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
  disabledControl: {
    opacity: 0.58,
  },
  statusDot: {
    width: 14,
    height: 14,
    borderRadius: radius.full,
  },
})
