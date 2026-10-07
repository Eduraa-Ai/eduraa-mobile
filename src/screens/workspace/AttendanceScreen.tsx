import AsyncStorage from '@react-native-async-storage/async-storage'
import { useNetInfo } from '@react-native-community/netinfo'
import { useNavigation } from '@react-navigation/native'
import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, AppState, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import { Directory, File as ExpoFile, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatedButton, AnimatedCard, AppScreen, Avatar, DateField, ErrorState, SectionHeading, SegmentedTabs, SelectableChip, SelectField, SkeletonCard, StatusPill, StatusTone, TextInputField } from '../../components/ui'
import {
  AttendanceCorrectionRequest,
  AttendanceLeaveApplication,
  AttendanceLeaveAttachment,
  AttendanceLeaveAttachmentInput,
  AttendanceLeaveStatus,
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

type LeaveDecision = {
  application: AttendanceLeaveApplication
  status: Extract<AttendanceLeaveStatus, 'approved' | 'rejected'>
  note: string
}

const MAX_LEAVE_ATTACHMENT_BYTES = 5 * 1024 * 1024
const LEAVE_ATTACHMENT_TYPES = [
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv',
]
const LEAVE_ATTACHMENT_TYPES_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv',
}

type LeaveAttachmentAction = 'view' | 'download'

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

function leaveAttachmentContentType(asset: DocumentPicker.DocumentPickerAsset) {
  const mimeType = (asset.mimeType || asset.file?.type || '').split(';', 1)[0].toLowerCase()
  if (LEAVE_ATTACHMENT_TYPES.includes(mimeType)) return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType
  return LEAVE_ATTACHMENT_TYPES_BY_EXTENSION[asset.name.split('.').pop()?.toLowerCase() ?? ''] ?? null
}

function browserFileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected attachment.'))
    reader.onload = () => {
      const value = typeof reader.result === 'string' ? reader.result : ''
      const comma = value.indexOf(',')
      if (comma < 0) reject(new Error('Could not encode the selected attachment.'))
      else resolve(value.slice(comma + 1))
    }
    reader.readAsDataURL(file)
  })
}

function normalizeBase64(value: string) {
  const encoded = value.includes(',') && /^data:/i.test(value.trim())
    ? value.slice(value.indexOf(',') + 1)
    : value
  const normalized = encoded.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  return normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
}

async function pickLeaveAttachments(): Promise<AttendanceLeaveAttachmentInput[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: LEAVE_ATTACHMENT_TYPES,
    multiple: true,
    copyToCacheDirectory: true,
    base64: Platform.OS === 'web',
  })
  if (result.canceled || !result.assets?.length) return []
  return Promise.all(result.assets.map(async (asset) => {
    const contentType = leaveAttachmentContentType(asset)
    if (!contentType) throw new Error('Choose PDF, image, Word, Excel, or CSV files.')
    if ((asset.size ?? 0) > MAX_LEAVE_ATTACHMENT_BYTES) throw new Error(`${asset.name} must be 5 MB or smaller.`)
    const rawBase64 = Platform.OS === 'web'
      ? asset.base64 || (asset.file ? await browserFileBase64(asset.file) : '')
      : await new ExpoFile(asset.uri).base64()
    const dataBase64 = normalizeBase64(rawBase64)
    if (!dataBase64) throw new Error(`${asset.name} is empty.`)
    if (Math.floor((dataBase64.length * 3) / 4) > MAX_LEAVE_ATTACHMENT_BYTES) throw new Error(`${asset.name} must be 5 MB or smaller.`)
    return { file_name: asset.name || 'leave-attachment', content_type: contentType, data_base64: dataBase64 }
  }))
}

function safeAttachmentName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^-+|-+$/g, '') || 'leave-attachment'
}

async function handleLeaveAttachment(
  application: AttendanceLeaveApplication,
  attachment: AttendanceLeaveAttachment,
  action: LeaveAttachmentAction,
) {
  const data = await attendanceApi.getLeaveAttachment(application.id, attachment.id)
  const fileName = attachment.file_name
  const contentType = attachment.content_type
  if (Platform.OS === 'web') {
    const blobUrl = URL.createObjectURL(new Blob([data], { type: contentType }))
    if (action === 'view') {
      const opened = window.open(blobUrl, '_blank', 'noopener,noreferrer')
      if (!opened) {
        URL.revokeObjectURL(blobUrl)
        throw new Error('Allow pop-ups to open this attachment, then try again.')
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
      return
    }
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1_000)
    return
  }

  const directory = new Directory(Paths.cache, 'leave-attachments')
  directory.create({ idempotent: true, intermediates: true })
  const file = new ExpoFile(directory, `${application.id}-${safeAttachmentName(fileName)}`)
  file.create({ overwrite: true, intermediates: true })
  file.write(new Uint8Array(data))
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Attachment opening is not available on this device.')
  }
  try {
    await Sharing.shareAsync(file.uri, {
      dialogTitle: action === 'view' ? `View ${fileName}` : `Save ${fileName}`,
      mimeType: contentType,
      ...(contentType === 'application/pdf' ? { UTI: 'com.adobe.pdf' } : {}),
    })
  } finally {
    if (file.exists) file.delete()
  }
}

function leaveInboxErrorMessage(error: unknown) {
  const statusCode = (error as { response?: { status?: number } }).response?.status
  if (statusCode === 401 || statusCode === 403) return 'Your session no longer has access to leave requests. Sign in again and retry.'
  if (statusCode && statusCode >= 500) return 'We couldn’t load leave requests right now. Please try again shortly.'
  return 'We couldn’t load leave requests. Check your connection and try again.'
}

function isTeacherRole(role?: Role) {
  return role === 'teacher'
}

function isStudentRole(role?: Role) {
  return role === 'student' || role === 'b2c_student'
}

function isLeadershipRole(role?: Role) {
  return role === 'principal' || role === 'school_super_admin'
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
    <SectionHeading
      title={title}
      subtitle={subtitle}
      action={count ? <StatusPill label={String(count)} tone="brand" /> : undefined}
    />
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

const quickStatuses: AttendanceStatus[] = ['present', 'absent', 'late']
const quickLetters: Record<AttendanceStatus, string> = { present: 'P', absent: 'A', late: 'L', half_day: 'Half', excused: 'Leave' }

/**
 * Attendance is mostly Present with a few exceptions, so the row shows one-tap
 * P / A / L and keeps Half day / On leave one step away. Every segment keeps a
 * full-word accessibility label.
 */
function StatusPicker({
  value,
  disabled = false,
  isDisabled,
  onChange,
}: {
  value: AttendanceStatus
  disabled?: boolean
  isDisabled?: (status: AttendanceStatus) => boolean
  onChange: (status: AttendanceStatus) => void
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreSelected = !quickStatuses.includes(value)
  const blocked = (status: AttendanceStatus) => disabled || Boolean(isDisabled?.(status))

  return (
    <View style={styles.picker} accessibilityRole="radiogroup">
      {quickStatuses.map((status) => {
        const selected = value === status
        return (
          <Pressable
            key={status}
            accessibilityRole="radio"
            accessibilityLabel={statusLabels[status]}
            accessibilityState={{ checked: selected, disabled: blocked(status) }}
            disabled={blocked(status)}
            onPress={() => onChange(status)}
            hitSlop={{ top: 6, bottom: 6 }}
            style={({ pressed }) => [styles.pickerSegment, selected && { backgroundColor: statusTones[status] }, pressed && styles.pressed, blocked(status) && !selected && styles.disabledControl]}
          >
            <Text style={[styles.pickerText, selected && styles.pickerTextSelected]}>{quickLetters[status]}</Text>
          </Pressable>
        )
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={moreSelected ? `${statusLabels[value]}. More statuses` : 'More statuses: half day or on leave'}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setMoreOpen(true)}
        hitSlop={{ top: 6, bottom: 6 }}
        style={({ pressed }) => [styles.pickerSegment, styles.pickerMore, moreSelected && { backgroundColor: statusTones[value] }, pressed && styles.pressed, disabled && !moreSelected && styles.disabledControl]}
      >
        {moreSelected
          ? <Text style={[styles.pickerText, styles.pickerTextSelected]}>{quickLetters[value]}</Text>
          : <Ionicons name="ellipsis-horizontal" size={16} color={colors.textSecondary} />}
      </Pressable>
      <Modal visible={moreOpen} transparent animationType="fade" onRequestClose={() => setMoreOpen(false)}>
        <Pressable style={styles.pickerScrim} accessibilityLabel="Close status options" onPress={() => setMoreOpen(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerSheetTitle}>Mark as</Text>
            {(Object.keys(statusLabels) as AttendanceStatus[]).map((status) => {
              const selected = value === status
              return (
                <Pressable
                  key={status}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: blocked(status) }}
                  disabled={blocked(status)}
                  onPress={() => { setMoreOpen(false); onChange(status) }}
                  style={({ pressed }) => [styles.pickerOption, pressed && styles.pressed, blocked(status) && !selected && styles.disabledControl]}
                >
                  <View style={[styles.pickerDot, { backgroundColor: statusTones[status] }]} />
                  <Text style={styles.pickerOptionText}>{statusLabels[status]}</Text>
                  {selected ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
                </Pressable>
              )
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
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
        <Avatar name={record.student_name} seed={record.student_id ?? record.id} size={36} />
        <View style={styles.recordCopy}>
          <Text style={styles.recordTitle} numberOfLines={1}>{record.student_name}</Text>
          <Text style={styles.recordMeta} numberOfLines={1}>{record.student_code}</Text>
        </View>
        {busy ? <ActivityIndicator color={colors.accent} /> : <StatusPicker value={record.status} disabled={disabled} onChange={onStatus} />}
      </View>
      {onNote && (record.status !== 'present' || Boolean(record.note?.trim())) ? (
        <TextInputField
          value={record.note ?? ''}
          editable={!disabled}
          onChangeText={onNote}
          accessibilityLabel={`Note for ${record.student_name}`}
          placeholder="Add a note (optional)"
          style={styles.noteInput}
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
                <Text style={styles.recordTitle}>{item.student_name || 'Student'}{item.student_code ? ` · ${item.student_code}` : ''}</Text>
                <Text style={styles.recordMeta}>
                  {item.attendance_date ? `${formatDate(item.attendance_date)} · ` : ''}{item.standard || 'Class'} {item.division ?? ''}{item.current_status ? ` · Currently ${statusLabels[item.current_status]}` : ''}
                </Text>
              </View>
            </View>
            <Text style={styles.noteText}>{item.reason}</Text>
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

function monthStartSchoolDate() {
  return `${todaySchoolDate().slice(0, 8)}01`
}

function LeaveApplicationsList({
  applications,
  canResolve,
  mode = 'all',
  busyKey,
  decisionOpen = false,
  decisionError,
  isLoading = false,
  error,
  onRetry,
  onResolve,
}: {
  applications: AttendanceLeaveApplication[]
  canResolve: boolean
  mode?: 'all' | 'pending' | 'history'
  busyKey: string | null
  decisionOpen?: boolean
  decisionError?: string | null
  isLoading?: boolean
  error?: string | null
  onRetry?: () => Promise<unknown>
  onResolve: (item: AttendanceLeaveApplication, status: Extract<AttendanceLeaveStatus, 'approved' | 'rejected'>, note: string) => void
}) {
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [isRetrying, setIsRetrying] = useState(false)
  const [attachmentAction, setAttachmentAction] = useState<string | null>(null)
  const pendingApplications = mode === 'history' ? [] : canResolve ? applications.filter((item) => item.status === 'pending') : applications
  const resolvedApplications = mode === 'pending' ? [] : canResolve ? applications.filter((item) => item.status !== 'pending') : []
  const visibleCount = pendingApplications.length + resolvedApplications.length
  const openAttachment = async (item: AttendanceLeaveApplication, attachment: AttendanceLeaveAttachment, action: LeaveAttachmentAction) => {
    if (attachmentAction) return
    setAttachmentAction(`${action}:${item.id}:${attachment.id}`)
    try {
      await handleLeaveAttachment(item, attachment, action)
    } catch (error) {
      Alert.alert(
        action === 'view' ? 'Could not open attachment' : 'Could not download attachment',
        error instanceof Error ? error.message : 'Please try again.',
      )
    } finally {
      setAttachmentAction(null)
    }
  }
  const renderAttachments = (item: AttendanceLeaveApplication) => {
    const attachments = item.attachments?.length ? item.attachments : item.attachment ? [item.attachment] : []
    return attachments.map((attachment) => (
      <View key={attachment.id} style={styles.leaveAttachment}>
        <View style={styles.leaveAttachmentCopy}>
          <Ionicons name="document-attach-outline" size={18} color={colors.accent} />
          <Text numberOfLines={1} style={styles.leaveAttachmentName}>{attachment.file_name}</Text>
        </View>
        <View style={styles.leaveAttachmentActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${attachment.file_name}`} disabled={Boolean(attachmentAction)} onPress={() => { void openAttachment(item, attachment, 'view') }} style={({ pressed }) => [styles.leaveAttachmentButton, pressed && styles.pressed, attachmentAction && styles.disabledControl]}>
            {attachmentAction === `view:${item.id}:${attachment.id}` ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="eye-outline" size={17} color={colors.accent} />}
            <Text style={styles.leaveAttachmentButtonText}>View</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Download ${attachment.file_name}`} disabled={Boolean(attachmentAction)} onPress={() => { void openAttachment(item, attachment, 'download') }} style={({ pressed }) => [styles.leaveAttachmentButton, pressed && styles.pressed, attachmentAction && styles.disabledControl]}>
            {attachmentAction === `download:${item.id}:${attachment.id}` ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="download-outline" size={17} color={colors.accent} />}
            <Text style={styles.leaveAttachmentButtonText}>Download</Text>
          </Pressable>
        </View>
      </View>
    ))
  }
  const retry = async () => {
    if (!onRetry || isRetrying) return
    setIsRetrying(true)
    try {
      await Promise.all([
        onRetry(),
        new Promise<void>((resolve) => setTimeout(resolve, 450)),
      ])
    } finally {
      setIsRetrying(false)
    }
  }
  return (
    <View style={styles.section}>
      <SectionHeader
        title={mode === 'history' ? 'Decision history' : canResolve ? 'Leave requests' : 'My leave requests'}
        subtitle={mode === 'history' ? 'Past decisions and supporting evidence stay here.' : canResolve ? 'Review requests from your assigned class.' : 'Track requests and supporting PDFs sent to your class teacher.'}
        count={!isLoading && !error ? visibleCount : undefined}
      />
      {decisionError ? (
        <View style={styles.leaveDecisionError} accessibilityRole="alert">
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <Text style={styles.leaveDecisionErrorText}>{decisionError}</Text>
        </View>
      ) : null}
      {isLoading ? (
        <SkeletonCard lines={2} />
      ) : error ? (
        <AnimatedCard style={styles.leaveStateCard}>
          <View style={styles.leaveErrorContent} accessibilityRole="alert">
            <Ionicons name="cloud-offline-outline" size={20} color={colors.warning} />
            <View style={styles.leaveStateCopy}>
              <Text style={styles.leaveStateTitle}>Leave requests could not load</Text>
              <Text style={styles.emptyText}>{error}</Text>
            </View>
          </View>
          {onRetry ? <AnimatedButton label={isRetrying ? 'Retrying…' : 'Retry'} variant="ghost" disabled={isRetrying} onPress={() => { void retry() }} /> : null}
        </AnimatedCard>
      ) : visibleCount === 0 ? (
        <AnimatedCard style={styles.leaveEmptyCard}>
          <View style={styles.leaveEmptyIcon}>
            <Ionicons name={mode === 'history' ? 'time-outline' : 'checkmark-done-outline'} size={24} color={colors.accentStrong} />
          </View>
          <Text style={styles.leaveEmptyTitle}>{mode === 'history' ? 'No decisions yet' : canResolve ? 'All caught up' : 'No leave requests yet'}</Text>
          <Text style={styles.leaveEmptyBody}>{mode === 'history' ? 'Approved and rejected requests will appear here with their evidence.' : canResolve ? 'New requests from your class will appear here for review.' : 'Requests and supporting documents will appear here after you submit them.'}</Text>
        </AnimatedCard>
      ) : (
        <>
        {mode === 'all' && canResolve && pendingApplications.length === 0 ? (
          <AnimatedCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>No leave requests need your review. Past decisions remain below.</Text>
          </AnimatedCard>
        ) : null}
        {pendingApplications.map((item) => (
        <AnimatedCard key={item.id} style={styles.correctionCard}>
          <View style={styles.recordTop}>
            <View style={styles.iconBubble}><Ionicons name="calendar-outline" size={18} color={colors.accent} /></View>
            <View style={styles.recordCopy}>
              <Text style={styles.recordTitle}>{canResolve ? item.student_name : `${formatDate(item.start_date)} – ${formatDate(item.end_date)}`}</Text>
              <Text style={styles.recordMeta}>{canResolve ? `${item.standard} ${item.division ?? ''} · ${formatDate(item.start_date)} – ${formatDate(item.end_date)}` : item.status}</Text>
            </View>
          </View>
          <Text style={styles.noteText}>{item.reason}</Text>
          {renderAttachments(item)}
          {item.resolution_note ? <Text style={styles.recordMeta}>Teacher note: {item.resolution_note}</Text> : null}
          {canResolve && item.status === 'pending' ? (
            <View style={styles.correctionActions}>
              <TextInputField
                label="Optional decision note"
                value={notes[item.id] ?? ''}
                onChangeText={(value) => setNotes((current) => ({ ...current, [item.id]: value }))}
                placeholder="Add context for the student"
                left={<Ionicons name="chatbox-ellipses-outline" size={17} color={colors.textMuted} />}
              />
              <View style={styles.actionRow}>
                <AnimatedButton label="Approve" loading={busyKey === `approve:${item.id}`} disabled={Boolean(busyKey) || decisionOpen} onPress={() => onResolve(item, 'approved', notes[item.id] ?? '')} style={styles.actionButton} />
                <AnimatedButton label="Reject" variant="ghost" loading={busyKey === `reject:${item.id}`} disabled={Boolean(busyKey) || decisionOpen} onPress={() => onResolve(item, 'rejected', notes[item.id] ?? '')} style={styles.actionButton} />
              </View>
            </View>
          ) : null}
        </AnimatedCard>
        ))}
        {mode === 'all' && canResolve && resolvedApplications.length > 0 ? (
          <View style={styles.leaveHistory}>
            <Text style={styles.leaveHistoryTitle}>Decision history</Text>
            <Text style={styles.leaveHistorySubtitle}>Approved and rejected requests remain available with all their original attachments.</Text>
          </View>
        ) : null}
        {resolvedApplications.map((item) => (
          <AnimatedCard key={item.id} style={styles.correctionCard}>
            <View style={styles.recordTop}>
              <View style={styles.iconBubble}><Ionicons name="calendar-outline" size={18} color={item.status === 'approved' ? colors.success : colors.danger} /></View>
              <View style={styles.recordCopy}>
                <Text style={styles.recordTitle}>{item.student_name}</Text>
                <Text style={styles.recordMeta}>{item.standard} {item.division ?? ''} · {formatDate(item.start_date)} – {formatDate(item.end_date)} · {item.status}</Text>
              </View>
            </View>
            <Text style={styles.noteText}>{item.reason}</Text>
            {renderAttachments(item)}
            {item.resolution_note ? <Text style={styles.recordMeta}>Teacher note: {item.resolution_note}</Text> : null}
            {item.resolved_at ? <Text style={styles.recordMeta}>Decided {formatDate(item.resolved_at)}</Text> : null}
          </AnimatedCard>
        ))}
        </>
      )}
    </View>
  )
}

function LeaveDecisionDialog({
  decision,
  busy,
  confirmReady,
  onCancel,
  onConfirm,
}: {
  decision: LeaveDecision | null
  busy: boolean
  confirmReady: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const approving = decision?.status === 'approved'
  const action = approving ? 'Approve' : 'Reject'
  const application = decision?.application

  return (
    <Modal
      visible={Boolean(decision)}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onCancel()
      }}
    >
      <View style={styles.leaveDecisionBackdrop}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Keep leave request pending"
          disabled={busy}
          onPress={onCancel}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.leaveDecisionSheet} accessibilityRole="alert">
          <View style={[styles.leaveDecisionIcon, approving ? styles.leaveDecisionApproveIcon : styles.leaveDecisionRejectIcon]}>
            <Ionicons name={approving ? 'checkmark-circle-outline' : 'close-circle-outline'} size={24} color={approving ? colors.success : colors.danger} />
          </View>
          <Text style={styles.leaveDecisionEyebrow}>LEAVE REQUEST DECISION</Text>
          <Text style={styles.leaveDecisionTitle}>{action} this leave request?</Text>
          <Text style={styles.leaveDecisionBody}>
            {application ? `${application.student_name} · ${formatDate(application.start_date)} – ${formatDate(application.end_date)}` : ''}
          </Text>
          {decision?.note.trim() ? <Text style={styles.leaveDecisionNote}>Teacher note: {decision.note.trim()}</Text> : null}
          <Text style={styles.leaveDecisionHint}>
            {approving ? 'The student will see this as approved, and eligible attendance entries will be updated.' : 'The student will see this request as rejected.'}
          </Text>
          <View style={styles.leaveDecisionActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Keep leave request pending"
              disabled={busy}
              onPress={onCancel}
              style={({ pressed }) => [styles.leaveDecisionCancel, pressed && !busy && styles.pressed, busy && styles.leaveDecisionDisabled]}
            >
              <Text style={styles.leaveDecisionCancelText}>Keep pending</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${action} leave request`}
              accessibilityState={{ disabled: busy || !confirmReady, busy }}
              disabled={busy || !confirmReady}
              onPress={onConfirm}
              style={({ pressed }) => [approving ? styles.leaveDecisionApprove : styles.leaveDecisionReject, pressed && !busy && confirmReady && styles.pressed, (busy || !confirmReady) && styles.leaveDecisionDisabled]}
            >
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.leaveDecisionConfirmText}>{confirmReady ? `${action} request` : 'Opening confirmation…'}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function TeacherAttendance() {
  const queryClient = useQueryClient()
  const navigation = useNavigation()
  const screenRef = useRef<ScrollView>(null)
  const netInfo = useNetInfo()
  const insets = useSafeAreaInsets()
  const [attendanceDate, setAttendanceDate] = useState(todaySchoolDate)
  const [activeTab, setActiveTab] = useState<'roster' | 'requests' | 'history'>('roster')
  const [showScopeControls, setShowScopeControls] = useState(false)
  const [showClassNote, setShowClassNote] = useState(false)
  const [showRosterTools, setShowRosterTools] = useState(false)
  const [rosterReached, setRosterReached] = useState(false)
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
  const [leaveDecisionKey, setLeaveDecisionKey] = useState<string | null>(null)
  const [pendingLeaveDecision, setPendingLeaveDecision] = useState<LeaveDecision | null>(null)
  const [leaveDecisionReady, setLeaveDecisionReady] = useState(false)
  const leaveDecisionVersionRef = useRef(0)
  const [leaveDecisionError, setLeaveDecisionError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const [terminalMessage, setTerminalMessage] = useState<string | null>(null)

  const dismissLeaveDecision = () => {
    leaveDecisionVersionRef.current += 1
    setLeaveDecisionReady(false)
    setPendingLeaveDecision(null)
  }

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

  const leavesQuery = useQuery({
    queryKey: ['attendance', 'teacher', 'leaves'],
    queryFn: () => attendanceApi.getLeaveApplications(),
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

  const resolveLeaveMutation = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: Extract<AttendanceLeaveStatus, 'approved' | 'rejected'>; note: string }) => {
      setLeaveDecisionKey(`${status === 'approved' ? 'approve' : 'reject'}:${id}`)
      return attendanceApi.resolveLeaveApplication(id, status, note)
    },
    onSuccess: async (application) => {
      dismissLeaveDecision()
      setLeaveDecisionError(null)
      setTerminalMessage(`Leave request ${application.status}. ${application.student_name}'s editable attendance is updated.`)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance', 'teacher', 'leaves'] }),
        queryClient.invalidateQueries({ queryKey: ['attendance', 'teacher', 'today', attendanceDate] }),
        queryClient.invalidateQueries({ queryKey: ['attendance', 'teacher', 'summary', attendanceDate] }),
      ])
    },
    onError: (error) => {
      dismissLeaveDecision()
      setLeaveDecisionError(extractDetail(error, 'The leave request was not updated. Refresh and try again.'))
    },
    onSettled: () => setLeaveDecisionKey(null),
  })

  const requestLeaveDecision = (
    application: AttendanceLeaveApplication,
    status: Extract<AttendanceLeaveStatus, 'approved' | 'rejected'>,
    note: string,
  ) => {
    if (resolveLeaveMutation.isPending || pendingLeaveDecision) return
    const version = leaveDecisionVersionRef.current + 1
    leaveDecisionVersionRef.current = version
    setLeaveDecisionError(null)
    setLeaveDecisionReady(false)
    setPendingLeaveDecision({ application, status, note })
    setTimeout(() => {
      if (leaveDecisionVersionRef.current === version) setLeaveDecisionReady(true)
    }, 250)
  }

  const confirmLeaveDecision = () => {
    if (!pendingLeaveDecision || !leaveDecisionReady || resolveLeaveMutation.isPending) return
    resolveLeaveMutation.mutate({
      id: pendingLeaveDecision.application.id,
      status: pendingLeaveDecision.status,
      note: pendingLeaveDecision.note,
    })
  }

  if (todayQuery.isLoading) {
    return (
      <AppScreen protectedChrome contentStyle={styles.screen}>
        <AttendanceHero subtitle="Loading your assigned class roster." signal="LOADING" />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} />
      </AppScreen>
    )
  }

  if (todayQuery.isError || !todayQuery.data) {
    return (
      <AppScreen protectedChrome contentStyle={styles.screen}>
        <AttendanceHero subtitle="Your assigned class roster could not be loaded." signal="RECOVERY" />
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
      setRosterReached(false)
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
      setRosterReached(false)
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
      scrollRef={screenRef}
      protectedChrome
      contentStyle={{
        ...styles.screen,
        ...styles.teacherScreen,
        paddingBottom: layout.bottomTabHeight + insets.bottom + (activeTab === 'roster' ? 112 : spacing[8]),
      }}
      refreshControl={<RefreshControl refreshing={activeTab === 'roster' ? refreshing : leavesQuery.isRefetching} onRefresh={activeTab === 'roster' ? refreshAttendance : () => { void leavesQuery.refetch() }} tintColor={colors.accent} colors={[colors.accent]} />}
      scrollEventThrottle={16}
      onScroll={(event) => {
        if (activeTab === 'roster' && event.nativeEvent.contentOffset.y > 60 && !rosterReached) setRosterReached(true)
      }}
    >
      <View style={styles.rosterQuickRow}>
        <Text style={styles.rosterQuickText} numberOfLines={1}>
          {`${sheet.standard} ${sheet.division} · ${formatDate(sheet.attendance_date)} · ${sheet.records.length} ${sheet.records.length === 1 ? 'student' : 'students'}`}
        </Text>
        {locked || dirty || sheet.status === 'submitted' ? (
          <StatusPill
            label={locked ? 'Locked' : dirty ? 'Draft' : 'Submitted'}
            tone={locked ? 'neutral' : dirty ? 'brand' : 'success'}
          />
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change class or attendance date"
          accessibilityState={{ expanded: showScopeControls }}
          onPress={() => setShowScopeControls((current) => !current)}
          hitSlop={8}
          style={({ pressed }) => [styles.scopeToggle, pressed && styles.pressed]}
        >
          <Text style={styles.scopeToggleText}>Change</Text>
          <Ionicons name={showScopeControls ? 'chevron-up' : 'chevron-down'} size={14} color={colors.accentStrong} />
        </Pressable>
      </View>

      <SegmentedTabs
        accessibilityLabel="Attendance sections"
        tabs={[
          { id: 'roster', label: 'Roster' },
          { id: 'requests', label: 'Requests', count: leavesQuery.data?.filter((item) => item.status === 'pending').length },
          { id: 'history', label: 'History' },
        ]}
        value={activeTab}
        onChange={(nextTab) => {
          setActiveTab(nextTab)
          screenRef.current?.scrollTo({ y: 0, animated: false })
        }}
      />

      <View style={[styles.attendanceTabPanel, activeTab !== 'roster' && styles.hiddenTabPanel]}>

      {showScopeControls ? (
      <View style={styles.workflowSection}>
        <SectionHeader title="Class and date" subtitle="Choose a different assigned class or school day." />
        <View style={styles.dateControlCard}>
          {standardOptions.length > 1 || divisionOptions.length > 1 ? (
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
          ) : null}
          <DateField label="Attendance date" value={sheet.attendance_date} maxDate={todaySchoolDate()} onChange={changeAttendanceDate} disabled={Boolean(busyKey)} />
          {classesQuery.isError ? <Text style={styles.controlHint}>Showing the current assigned class. Pull to refresh to load other assigned classes.</Text> : null}
          {sheet.attendance_date !== attendanceDate ? <Text style={styles.controlHint}>Showing the date returned by your school for this roster.</Text> : null}
        </View>
      </View>
      ) : null}

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
        <SectionHeading
          title="Class roster"
          subtitle={locked ? 'Locked sheet · read-only' : `${summary.present_count}/${summary.total_students} present${dirty ? '' : ' · Saved'}`}
          action={
            <View style={styles.rosterActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showClassNote ? 'Hide class note' : classNote.trim() ? 'Edit class note' : 'Add class note'}
                accessibilityState={{ expanded: showClassNote }}
                onPress={() => setShowClassNote((current) => !current)}
                style={({ pressed }) => [styles.rosterToolsToggle, (showClassNote || Boolean(classNote.trim())) && styles.rosterToolsToggleActive, pressed && styles.pressed]}
              >
                <Ionicons name="document-text-outline" size={18} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showRosterTools ? 'Hide roster search and filters' : 'Find or filter students'}
                accessibilityState={{ expanded: showRosterTools }}
                onPress={() => setShowRosterTools((current) => !current)}
                style={({ pressed }) => [styles.rosterToolsToggle, showRosterTools && styles.rosterToolsToggleActive, pressed && styles.pressed]}
              >
                <Ionicons name={showRosterTools ? 'close' : 'search-outline'} size={18} color={colors.textSecondary} />
              </Pressable>
              {dirty ? (
                <AnimatedButton
                  label={sheet.status === 'submitted' ? 'Save fixes' : 'Save draft'}
                  accessibilityLabel={sheet.status === 'submitted' ? 'Save corrections' : 'Save draft'}
                  variant="secondary"
                  size="compact"
                  loading={busyKey === 'save'}
                  disabled={Boolean(busyKey) || locked || netInfo.isConnected === false}
                  onPress={saveDraft}
                />
              ) : (
                <AnimatedButton
                  label="All present"
                  accessibilityLabel="Mark all present"
                  variant="secondary"
                  size="compact"
                  loading={busyKey === 'mark-all'}
                  disabled={Boolean(busyKey) || locked || netInfo.isConnected === false || sheet.records.length === 0}
                  onPress={() => Alert.alert('Mark everyone present?', 'This saves Present for the full roster immediately and replaces any unsaved local attendance changes.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Mark all', onPress: () => sheetMutation.mutate({
                      key: 'mark-all',
                      run: async () => {
                        const result = await attendanceApi.markAllPresent(sheet.id, sheet.revision)
                        setRosterReached(true)
                        setRosterFilter('all')
                        setShowMoreRosterFilters(false)
                        setTerminalMessage(`Marked all ${result.records.length} students present.`)
                        return result
                      },
                    }) },
                  ])}
                />
              )}
            </View>
          }
        />
        {showClassNote ? (
          <TextInputField
            label="Class remark (optional)"
            value={classNote}
            editable={!locked && !Boolean(busyKey)}
            onChangeText={setClassNote}
            placeholder={sheet.class_note || 'Example: Assembly delayed first period'}
            multiline
            left={<Ionicons name="document-text" size={17} color={colors.textMuted} />}
          />
        ) : null}
        {showRosterTools ? (
        <>
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
            <SelectField
              label="Student"
              value={selectedStudentId}
              options={studentOptions}
              disabled={liveRecords.length === 0}
              placeholder="All students"
              onChange={setSelectedStudentId}
            />
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
        </>
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
                onStatus={(status) => { setRosterReached(true); updateRecord(record, { status }) }}
                onNote={(note) => updateRecord(record, { note })}
              />
            ))}
          </View>
        )}
      </View>
      </View>
      <View style={activeTab === 'roster' ? styles.hiddenTabPanel : styles.attendanceTabPanel}>
      <LeaveApplicationsList
        applications={leavesQuery.data ?? []}
        canResolve
        mode={activeTab === 'history' ? 'history' : 'pending'}
        busyKey={leaveDecisionKey}
        decisionOpen={Boolean(pendingLeaveDecision)}
        decisionError={leaveDecisionError}
        isLoading={leavesQuery.isLoading}
        error={leavesQuery.isError ? leaveInboxErrorMessage(leavesQuery.error) : null}
        onRetry={() => {
          setLeaveDecisionError(null)
          return leavesQuery.refetch()
        }}
        onResolve={requestLeaveDecision}
      />
      </View>
    </AppScreen>
      {activeTab === 'roster' && rosterReached ? (
      <View style={[styles.submitDock, { bottom: layout.bottomTabHeight + insets.bottom }]}>
        <View style={[styles.submitSurface, dirty && styles.submitSurfaceActive]}>
          <View style={styles.submitStatusRow}>
            <View style={[styles.submitStatusIcon, !dirty && !locked && styles.submitStatusIconReady]}>
              <Ionicons name={locked ? 'lock-closed-outline' : dirty ? 'create-outline' : 'shield-checkmark-outline'} size={18} color={locked ? colors.textMuted : dirty ? colors.accent : colors.success} />
            </View>
            <View style={styles.submitCopy}>
              <Text numberOfLines={2} style={styles.submitTitle}>{locked ? 'Locked' : dirty ? pendingRecords.length ? `${pendingRecords.length} ${pendingRecords.length === 1 ? 'change' : 'changes'} ready` : classNoteChanged ? 'Note ready' : 'Changes ready' : sheet.status === 'submitted' ? 'Submitted' : 'Ready to submit'}</Text>
              <Text numberOfLines={1} style={styles.submitMeta}>{netInfo.isConnected === false ? 'Reconnect first' : dirty ? 'Saved locally' : `${exceptionCount} exceptions`}</Text>
            </View>
          </View>
          <AnimatedButton
            label={locked ? 'Locked' : sheet.status === 'submitted' ? 'Submitted' : 'Submit'}
            accessibilityLabel={locked ? 'Attendance locked' : sheet.status === 'submitted' ? 'Attendance submitted' : 'Submit attendance'}
            loading={busyKey === 'submit'}
            disabled={Boolean(busyKey) || locked || sheet.status === 'submitted' || netInfo.isConnected === false || sheet.records.length === 0}
            onPress={() => sheetMutation.mutate({ key: 'submit', run: async () => {
              const result = await attendanceApi.submitSheet(sheet.id, sheet.revision, classNote.trim() || null, pendingRecords)
              setTerminalMessage(`Submitted ${result.standard} ${result.division} for ${formatDate(result.attendance_date)}. You can still save corrections if needed.`)
              return result
            } })}
            style={styles.submitButton}
          />
        </View>
      </View>
      ) : null}
      <LeaveDecisionDialog
        decision={pendingLeaveDecision}
        busy={resolveLeaveMutation.isPending}
        confirmReady={leaveDecisionReady}
        onCancel={() => {
          if (!resolveLeaveMutation.isPending) dismissLeaveDecision()
        }}
        onConfirm={confirmLeaveDecision}
      />
    </View>
  )
}

// The app header already names the screen, so this only carries what is specific
// to today: an optional data headline, the context line and the sheet status.
const signalTones: Record<string, StatusTone> = {
  SUBMITTED: 'success',
  'LOCAL DRAFT': 'brand',
  LOCKED: 'neutral',
  RECOVERY: 'warning',
}

function AttendanceHero({ title, subtitle, signal }: { title?: string; subtitle: string; signal?: string }) {
  const signalPill = signal
    ? <StatusPill label={signal.charAt(0) + signal.slice(1).toLowerCase()} tone={signalTones[signal] ?? 'neutral'} />
    : null
  if (!title) {
    return (
      <View style={styles.heroContextRow}>
        <Text style={[styles.heroSubtitle, styles.heroContextText]} numberOfLines={1}>{subtitle}</Text>
        {signalPill}
      </View>
    )
  }
  return (
    <View style={styles.attendanceHero}>
      <View style={styles.heroTopline}>
        <Text style={[styles.heroTitle, styles.heroContextText]}>{title}</Text>
        {signalPill}
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

      {correctionsQuery.isError ? (
        <ErrorState
          title="Corrections unavailable"
          message={extractDetail(correctionsQuery.error, 'We could not load correction requests. Refresh to review them before making attendance changes.')}
          onAction={() => void correctionsQuery.refetch()}
        />
      ) : (
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
      )}

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
                <Avatar name={record.student_name} seed={record.student_id ?? record.id} size={36} />
                <View style={styles.recordCopy}>
                  <Text style={styles.recordTitle} numberOfLines={1}>{record.student_name}</Text>
                  <Text style={styles.recordMeta} numberOfLines={1}>{record.student_code}{record.is_override ? ' · Override' : ''}</Text>
                </View>
                {busyKey === `override-${record.id}` ? <ActivityIndicator color={colors.accent} /> : (
                  <StatusPicker
                    value={record.status}
                    disabled={overrideReason.trim().length < 3 || Boolean(busyKey)}
                    isDisabled={(status) => record.status === status}
                    onChange={(status) => {
                      Alert.alert('Confirm leadership override?', `${record.student_name}: ${statusLabels[record.status]} → ${statusLabels[status]}\n\nReason: ${overrideReason.trim()}`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Override', onPress: () => overrideMutation.mutate({ record, status }) },
                      ])
                    }}
                  />
                )}
              </View>
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
  const [historyStartDate, setHistoryStartDate] = useState(monthStartSchoolDate)
  const [historyEndDate, setHistoryEndDate] = useState(todaySchoolDate)
  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const [leaveStartDate, setLeaveStartDate] = useState(todaySchoolDate)
  const [leaveEndDate, setLeaveEndDate] = useState(todaySchoolDate)
  const [leaveReason, setLeaveReason] = useState('')
  const [leaveAttachments, setLeaveAttachments] = useState<AttendanceLeaveAttachmentInput[]>([])
  const [pickingLeaveAttachment, setPickingLeaveAttachment] = useState(false)
  const summaryQuery = useQuery({
    queryKey: ['attendance', 'student', 'summary'],
    queryFn: attendanceApi.getStudentSummary,
  })

  const correctionsQuery = useQuery({
    queryKey: ['attendance', 'student', 'corrections'],
    queryFn: attendanceApi.getCorrections,
    retry: false,
  })

  const historyRangeValid = historyEndDate >= historyStartDate
  const historyQuery = useQuery({
    queryKey: ['attendance', 'student', 'history', historyStartDate, historyEndDate],
    queryFn: () => attendanceApi.getStudentHistory(historyStartDate, historyEndDate),
    enabled: historyRangeValid,
  })

  const leavesQuery = useQuery({
    queryKey: ['attendance', 'student', 'leaves'],
    queryFn: () => attendanceApi.getLeaveApplications(),
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

  const leaveMutation = useMutation({
    mutationFn: () => attendanceApi.createLeaveApplication(leaveStartDate, leaveEndDate, leaveReason.trim(), leaveAttachments),
    onSuccess: async (application) => {
      setLeaveReason('')
      setLeaveAttachments([])
      setShowLeaveForm(false)
      Alert.alert('Leave request sent', `Your class teacher can now review ${formatDate(application.start_date)} – ${formatDate(application.end_date)}.`)
      await queryClient.invalidateQueries({ queryKey: ['attendance', 'student', 'leaves'] })
    },
    onError: (error) => Alert.alert('Leave request not sent', extractDetail(error, 'Please review the dates and try again.')),
  })

  const selectLeaveAttachment = async () => {
    if (leaveMutation.isPending || pickingLeaveAttachment) return
    setPickingLeaveAttachment(true)
    try {
      const attachments = await pickLeaveAttachments()
      if (attachments.length) setLeaveAttachments((current) => [...current, ...attachments])
    } catch (error) {
      Alert.alert('Attachments not added', error instanceof Error ? error.message : 'Choose supported files that are each 5 MB or smaller.')
    } finally {
      setPickingLeaveAttachment(false)
    }
  }

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
      refreshControl={<RefreshControl refreshing={summaryQuery.isRefetching || historyQuery.isRefetching || leavesQuery.isRefetching} onRefresh={() => { void summaryQuery.refetch(); void historyQuery.refetch(); void leavesQuery.refetch() }} tintColor={colors.accent} colors={[colors.accent]} />}
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
        <SectionHeader title="Attendance history" subtitle="Choose dates to view any earlier attendance." count={historyQuery.data?.length ?? 0} />
        <View style={styles.scopeFieldsRow}>
          <View style={styles.scopeField}><DateField label="From" value={historyStartDate} onChange={setHistoryStartDate} /></View>
          <View style={styles.scopeField}><DateField label="To" value={historyEndDate} onChange={setHistoryEndDate} /></View>
        </View>
        {!historyRangeValid ? <Text style={styles.controlHint}>The end date must be on or after the start date.</Text> : null}
        {historyQuery.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
        {historyQuery.isError ? <ErrorState title="History could not load" message={extractDetail(historyQuery.error, 'Please try again.')} onAction={() => void historyQuery.refetch()} /> : null}
        {!historyQuery.isLoading && !historyQuery.isError && (historyQuery.data?.length ?? 0) === 0 ? (
          <AnimatedCard style={styles.emptyCard}>
            <Text style={styles.emptyText}>No submitted attendance was found for these dates.</Text>
          </AnimatedCard>
        ) : historyQuery.data && historyQuery.data.length > 0 ? (
          <View style={styles.historyLedger}>
          {historyQuery.data.map((item) => (
            <View key={item.record_id} style={styles.historyRow}>
              <View style={styles.recordTop}>
                <View style={[styles.statusDot, { backgroundColor: statusTones[item.status] }]} />
                <View style={styles.recordCopy}>
                  <Text style={styles.recordTitle}>{formatDate(item.attendance_date)}</Text>
                  <Text style={styles.recordMeta}>{statusLabels[item.status]} · {item.standard} {item.division ?? ''}</Text>
                </View>
                {!correctionsQuery.data?.find((request) => request.record_id === item.record_id) && correctionRecordId !== item.record_id ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Request a correction for ${formatDate(item.attendance_date)}`} onPress={() => setCorrectionRecordId(item.record_id)} hitSlop={8} style={styles.correctionLink}>
                    <Text style={styles.correctionLinkText}>Correct</Text>
                  </Pressable>
                ) : null}
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
              ) : null}
            </View>
          ))}
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Leave application" subtitle="Send a request directly to your class teacher." />
        {showLeaveForm ? (
          <AnimatedCard style={styles.correctionCard}>
            <View style={styles.scopeFieldsRow}>
              <View style={styles.scopeField}><DateField label="First day" value={leaveStartDate} onChange={setLeaveStartDate} disabled={leaveMutation.isPending} /></View>
              <View style={styles.scopeField}><DateField label="Last day" value={leaveEndDate} onChange={setLeaveEndDate} disabled={leaveMutation.isPending} /></View>
            </View>
            <TextInputField label="Reason" value={leaveReason} onChangeText={setLeaveReason} placeholder="Briefly explain your absence" multiline editable={!leaveMutation.isPending} left={<Ionicons name="document-text-outline" size={17} color={colors.textMuted} />} />
            <View style={styles.leaveUploadBox}>
              <View style={styles.leaveUploadCopy}>
                <Ionicons name="document-attach-outline" size={19} color={colors.accent} />
                <View style={styles.recordCopy}>
                  <Text style={styles.leaveUploadTitle}>{leaveAttachments.length ? `${leaveAttachments.length} supporting attachment${leaveAttachments.length === 1 ? '' : 's'} added` : 'Supporting attachments (optional)'}</Text>
                  <Text numberOfLines={1} style={styles.recordMeta}>{leaveAttachments.length ? 'Add as many more files as needed.' : 'PDF, image, Word, Excel, or CSV · 5 MB each'}</Text>
                </View>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Attach leave evidence" disabled={leaveMutation.isPending || pickingLeaveAttachment} onPress={() => { void selectLeaveAttachment() }} style={({ pressed }) => [styles.leaveAttachmentButton, pressed && styles.pressed, (leaveMutation.isPending || pickingLeaveAttachment) && styles.disabledControl]}>
                {pickingLeaveAttachment ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="attach-outline" size={17} color={colors.accent} />}
                <Text style={styles.leaveAttachmentButtonText}>{pickingLeaveAttachment ? 'Adding…' : 'Add files'}</Text>
              </Pressable>
            </View>
            {leaveAttachments.map((attachment, index) => (
              <View key={`${attachment.file_name}:${index}`} style={styles.leaveAttachment}>
                <View style={styles.leaveAttachmentCopy}><Ionicons name="document-outline" size={18} color={colors.accent} /><Text numberOfLines={1} style={styles.leaveAttachmentName}>{attachment.file_name}</Text></View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${attachment.file_name}`} disabled={leaveMutation.isPending} onPress={() => setLeaveAttachments((current) => current.filter((_, attachmentIndex) => attachmentIndex !== index))} style={({ pressed }) => [styles.leaveAttachmentButton, pressed && styles.pressed, leaveMutation.isPending && styles.disabledControl]}>
                  <Ionicons name="close-outline" size={17} color={colors.danger} /><Text style={[styles.leaveAttachmentButtonText, { color: colors.danger }]}>Remove</Text>
                </Pressable>
              </View>
            ))}
            {leaveEndDate < leaveStartDate ? <Text style={styles.controlHint}>The last day must be on or after the first day.</Text> : null}
            <View style={styles.actionRow}>
              <AnimatedButton label="Cancel" variant="ghost" disabled={leaveMutation.isPending || pickingLeaveAttachment} onPress={() => { setShowLeaveForm(false); setLeaveReason(''); setLeaveAttachments([]) }} style={styles.actionButton} />
              <AnimatedButton label="Send request" loading={leaveMutation.isPending} disabled={leaveReason.trim().length < 3 || leaveEndDate < leaveStartDate || netInfo.isConnected === false || pickingLeaveAttachment} onPress={() => leaveMutation.mutate()} style={styles.actionButton} />
            </View>
          </AnimatedCard>
        ) : (
          <AnimatedButton label="Request leave" disabled={netInfo.isConnected === false} onPress={() => setShowLeaveForm(true)} />
        )}
      </View>

      <LeaveApplicationsList
        applications={leavesQuery.data ?? []}
        canResolve={false}
        busyKey={null}
        isLoading={leavesQuery.isLoading}
        error={leavesQuery.isError ? leaveInboxErrorMessage(leavesQuery.error) : null}
        onRetry={() => leavesQuery.refetch()}
        onResolve={() => {}}
      />

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
  noteInput: { minHeight: 38, fontSize: 13 },
  rosterToolsToggleActive: { borderColor: colors.borderBrand, backgroundColor: colors.accentSurface },
  rosterActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pickerOptionText: { ...typography.roles.body, flex: 1, fontFamily: typography.fonts.bodySemibold, color: colors.nav },
  pickerDot: { width: 10, height: 10, borderRadius: 5 },
  pickerOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing[3], borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  pickerSheetTitle: { ...typography.roles.groupLabel, color: colors.textMuted, marginBottom: spacing[2] },
  pickerSheet: { paddingHorizontal: spacing[5], paddingTop: spacing[4], paddingBottom: spacing[8], borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.backgroundElevated },
  pickerScrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2, 6, 23, 0.4)' },
  pickerTextSelected: { color: colors.white },
  pickerText: { fontFamily: typography.fonts.bodyBold, fontSize: 13, color: colors.textSecondary },
  pickerMore: { minWidth: 34 },
  pickerSegment: { minWidth: 34, height: 32, paddingHorizontal: 6, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  picker: { flexDirection: 'row', padding: 2, gap: 2, borderRadius: radius.sm, backgroundColor: colors.backgroundMuted },
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screen: {
    paddingBottom: spacing[5],
  },
  teacherScreen: {
    paddingBottom: spacing[20] + spacing[16],
    gap: spacing[3],
  },
  attendanceTabPanel: { gap: spacing[3] },
  hiddenTabPanel: { display: 'none' },
  rosterQuickRow: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  rosterQuickText: { ...typography.roles.caption, flex: 1, fontSize: 13, fontFamily: typography.fonts.bodySemibold, color: colors.textSecondary },
  scopeToggle: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: spacing[2] },
  scopeToggleText: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  rosterToolsToggle: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.backgroundElevated },
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
    borderRadius: radius.card,
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
    fontSize: 11,
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
    borderRadius: radius.card,
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
  workflowSection: { gap: spacing[3], paddingTop: spacing[2] },
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
    fontFamily: typography.fonts.bodyBold,
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
    fontFamily: typography.fonts.bodyBold,
    fontSize: 20,
    textAlign: 'center',
  },
  metricStripLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
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
    borderRadius: radius.card,
    backgroundColor: colors.backgroundElevated,
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
  heroContextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    paddingHorizontal: spacing[1],
  },
  heroContextText: {
    flex: 1,
    minWidth: 0,
  },
  heroTopline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  heroTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 23,
    lineHeight: 29,
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
    borderRadius: radius.card,
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
    borderRadius: radius.card,
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
  leaveDecisionError: {
    alignItems: 'flex-start',
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3],
  },
  leaveDecisionErrorText: {
    ...typography.roles.body,
    color: colors.danger,
    flex: 1,
  },
  leaveDecisionBackdrop: {
    backgroundColor: 'rgba(7, 21, 45, 0.46)',
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing[4],
  },
  leaveDecisionSheet: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.sheet,
    gap: spacing[3],
    padding: spacing[5],
    ...shadows.lg,
  },
  leaveDecisionIcon: {
    alignItems: 'center',
    borderRadius: radius.full,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  leaveDecisionApproveIcon: {
    backgroundColor: colors.successSurface,
  },
  leaveDecisionRejectIcon: {
    backgroundColor: colors.dangerSurface,
  },
  leaveDecisionEyebrow: {
    ...typography.roles.eyebrow,
    color: colors.textMuted,
  },
  leaveDecisionTitle: {
    ...typography.roles.title,
    color: colors.text,
  },
  leaveDecisionBody: {
    ...typography.roles.body,
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
  },
  leaveDecisionNote: {
    ...typography.roles.body,
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.md,
    color: colors.text,
    padding: spacing[3],
  },
  leaveDecisionHint: {
    ...typography.roles.body,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  leaveDecisionActions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[1],
  },
  leaveDecisionCancel: {
    alignItems: 'center',
    backgroundColor: colors.backgroundElevated,
    borderColor: colors.border,
    borderRadius: radius.full,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: layout.touchTarget,
  },
  leaveDecisionApprove: {
    alignItems: 'center',
    backgroundColor: colors.success,
    borderRadius: radius.full,
    flex: 1,
    justifyContent: 'center',
    minHeight: layout.touchTarget,
  },
  leaveDecisionReject: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: radius.full,
    flex: 1,
    justifyContent: 'center',
    minHeight: layout.touchTarget,
  },
  leaveDecisionCancelText: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  leaveDecisionConfirmText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  leaveDecisionDisabled: {
    opacity: 0.62,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[2],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.backgroundElevated,
  },
  submitSurfaceActive: {
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
  },
  submitStatusRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  submitStatusIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundMuted,
  },
  submitStatusIconReady: {
    backgroundColor: colors.successSurface,
  },
  submitCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  submitTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
    lineHeight: 17,
  },
  submitMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  submitButton: { width: 108 },
  reopenBox: {
    gap: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing[4],
  },
  section: {
    gap: spacing[3],
  },
  recordRow: { gap: spacing[2], paddingHorizontal: spacing[3], paddingVertical: spacing[2] + 2, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, backgroundColor: colors.backgroundElevated },
  correctionCard: {
    gap: spacing[4],
  },
  correctionActions: {
    gap: spacing[3],
  },
  leaveUploadBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing[3],
    gap: spacing[3],
  },
  leaveUploadCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  leaveUploadTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  leaveAttachment: {
    borderRadius: radius.md,
    backgroundColor: colors.cardMuted,
    padding: spacing[3],
    gap: spacing[3],
  },
  leaveAttachmentCopy: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  leaveAttachmentName: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
  },
  leaveAttachmentActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  leaveAttachmentButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    alignSelf: 'flex-start',
  },
  leaveAttachmentButtonText: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  leaveHistory: {
    gap: spacing[1],
    marginTop: spacing[3],
  },
  leaveHistoryTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 16,
  },
  leaveHistorySubtitle: {
    color: colors.textMuted,
    fontFamily: typography.fonts.body,
    fontSize: 13,
  },
  correctionLink: { minHeight: 32, paddingHorizontal: spacing[2], justifyContent: 'center', borderRadius: radius.xs },
  correctionLinkText: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 12.5 },
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
    borderRadius: radius.card,
    backgroundColor: colors.backgroundElevated,
  },
  rosterSurface: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.card, backgroundColor: colors.backgroundElevated },
  historyRow: { gap: spacing[2], paddingHorizontal: spacing[3], paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  selectedClassCard: {
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
  },
  recordTop: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], minHeight: 44 },
  recordCopy: { flex: 1, minWidth: 0 },
  recordTitle: { ...typography.roles.body, fontFamily: typography.fonts.bodyBold, color: colors.nav },
  recordMeta: { ...typography.roles.caption, fontSize: 11.5, color: colors.textMuted },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  noteText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  emptyCard: {
    backgroundColor: colors.backgroundElevated,
  },
  leaveEmptyCard: {
    alignItems: 'center',
    paddingVertical: spacing[8],
    backgroundColor: colors.backgroundElevated,
  },
  leaveEmptyIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  leaveEmptyTitle: {
    marginTop: spacing[3],
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 16,
  },
  leaveEmptyBody: {
    marginTop: spacing[1],
    maxWidth: 260,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  leaveStateCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing[3],
  },
  leaveStateCopy: {
    flex: 1,
    gap: spacing[1],
  },
  leaveErrorContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing[3],
  },
  leaveStateTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.72,
  },
  disabledControl: {
    opacity: 0.58,
  },
  statusDot: { width: 10, height: 10, borderRadius: radius.full },
})
