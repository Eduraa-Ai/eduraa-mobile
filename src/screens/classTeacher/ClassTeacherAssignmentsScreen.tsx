import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatedButton, AppScreen, SelectField } from '../../components/ui'
import {
  AssignmentTeacherOption,
  ClassTeacherAssignmentInput,
  ClassTeacherRequest,
  classTeacherApi,
  classTeacherAssignmentSubjects,
  toApiFailure,
} from '../../api/classTeacher'
import { classTeacherKeys, useActiveSemester, useClassTeacherAccess, useClassTeacherIdentity } from '../../hooks/useClassTeacherAccess'
import { useAppResume } from '../../hooks/useAppResume'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import { ClassContextBar, EmptyCard, FailureCard, InlineLoading } from './components'

const maximumAssignments = 15

function statusCopy(request: ClassTeacherRequest | undefined) {
  if (!request) return 'No plan has been sent for principal approval yet.'
  if (request.status === 'pending') return 'Waiting for principal approval. You can keep managing your class while the plan is reviewed.'
  if (request.status === 'approved') return 'Approved assignments are active for your class.'
  return `This assignment plan is currently ${request.status}.`
}

function teacherLabel(teacher: AssignmentTeacherOption) {
  return `${teacher.first_name} ${teacher.last_name}`.trim() + ` (${teacher.teacher_id})`
}

export default function ClassTeacherAssignmentsScreen() {
  const queryClient = useQueryClient()
  const access = useClassTeacherAccess()
  const { identity } = useClassTeacherIdentity()
  const { activeSemester } = useActiveSemester()
  const classSection = access.classSections[0]
  const [rows, setRows] = useState<ClassTeacherAssignmentInput[]>([{ teacher_id: '', subject: '' }])
  const [editing, setEditing] = useState(false)
  const submitGuard = useRef(false)

  const requestsQuery = useQuery<ClassTeacherRequest[], unknown>({
    queryKey: classTeacherKeys.requests,
    queryFn: classTeacherApi.getMyRequests,
    enabled: access.isAuthorized,
    retry: false,
  })
  const teachersQuery = useQuery<AssignmentTeacherOption[], unknown>({
    queryKey: ['class-teacher', 'assignment-teachers'],
    queryFn: classTeacherApi.getAssignmentTeachers,
    enabled: access.isAuthorized && (!requestsQuery.data?.[0] || editing),
    retry: false,
    staleTime: 30_000,
  })

  const activeRequest = requestsQuery.data?.[0]
  const canEdit = !activeRequest || activeRequest.status === 'approved'
  const teachers = teachersQuery.data ?? []
  const selectedTeacherIds = useMemo(() => new Set(rows.map((row) => row.teacher_id).filter(Boolean)), [rows])

  useEffect(() => {
    if (!activeRequest || editing) return
    setRows(activeRequest.assignments.map(({ teacher_id, subject }) => ({ teacher_id, subject })).slice(0, maximumAssignments))
  }, [activeRequest, editing])

  const submitMutation = useMutation({
    mutationFn: (assignments: ClassTeacherAssignmentInput[]) => classTeacherApi.createRequest(assignments),
    onSuccess: (request) => {
      queryClient.setQueryData<ClassTeacherRequest[]>(classTeacherKeys.requests, (current) => [request, ...(current ?? [])])
      setEditing(false)
      Alert.alert('Submitted for approval', 'Assignments submitted for principal approval.')
      void queryClient.invalidateQueries({ queryKey: classTeacherKeys.requests })
      void queryClient.invalidateQueries({ queryKey: classTeacherKeys.subjects })
      void queryClient.invalidateQueries({ queryKey: ['class-teacher', 'config'] })
    },
    onError: (error) => Alert.alert('Assignments not submitted', toApiFailure(error).message),
    onSettled: () => { submitGuard.current = false },
  })

  useAppResume(() => {
    void requestsQuery.refetch()
    if (editing) void teachersQuery.refetch()
  }, access.isAuthorized)

  const beginEdit = () => {
    if (!canEdit) return
    setRows(activeRequest?.assignments.map(({ teacher_id, subject }) => ({ teacher_id, subject })) || [{ teacher_id: '', subject: '' }])
    setEditing(true)
  }

  const cancelEdit = () => {
    setRows(activeRequest?.assignments.map(({ teacher_id, subject }) => ({ teacher_id, subject })) || [{ teacher_id: '', subject: '' }])
    setEditing(false)
  }

  const updateRow = (index: number, key: keyof ClassTeacherAssignmentInput, value: string) => {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row))
  }

  const removeRow = (index: number) => {
    setRows((current) => current.length === 1 ? current : current.filter((_, rowIndex) => rowIndex !== index))
  }

  const addRow = () => setRows((current) => current.length < maximumAssignments ? [...current, { teacher_id: '', subject: '' }] : current)

  const submit = () => {
    if (submitGuard.current || submitMutation.isPending) return
    if (rows.some((row) => !row.teacher_id || !row.subject)) {
      Alert.alert('Complete every assignment', 'Select both a teacher and a subject for every row.')
      return
    }
    if (selectedTeacherIds.size !== rows.length) {
      Alert.alert('Teacher selected twice', 'Each teacher can only be assigned once in this plan.')
      return
    }
    submitGuard.current = true
    submitMutation.mutate(rows)
  }

  if (access.isLoading) {
    return <AppScreen scroll={false} contentStyle={styles.center}><ActivityIndicator color={colors.accent} /><Text style={styles.loadingText}>Checking your class assignment</Text></AppScreen>
  }

  if (access.failure || access.hasNoClass || !classSection) {
    return (
      <AppScreen contentStyle={styles.padded}>
        {access.failure ? <FailureCard failure={access.failure} onRetry={() => void access.refetch()} /> : <EmptyCard icon="school-outline" title="No class assigned to you" body="Teacher assignments appear here once your class-teacher profile has a class and division." />}
      </AppScreen>
    )
  }

  const requestFailure = requestsQuery.error ? toApiFailure(requestsQuery.error) : null
  const teachersFailure = teachersQuery.error ? toApiFailure(teachersQuery.error) : null
  const teacherOptions = (index: number) => teachers
    .filter((teacher) => !selectedTeacherIds.has(teacher.id) || teacher.id === rows[index]?.teacher_id)
    .map((teacher) => ({ value: teacher.id, label: teacherLabel(teacher) }))
  const subjectOptions = classTeacherAssignmentSubjects.map((subject) => ({ value: subject, label: subject }))

  return (
    <AppScreen protectedChrome contentStyle={styles.screen} refreshControl={<RefreshControl refreshing={requestsQuery.isFetching} onRefresh={() => void requestsQuery.refetch()} tintColor={colors.accent} />}>
      <ClassContextBar identity={identity} standard={classSection.standard} division={classSection.division} semesterName={activeSemester?.name} />

      {requestFailure ? <FailureCard failure={requestFailure} onRetry={() => void requestsQuery.refetch()} /> : null}
      {requestsQuery.isLoading ? <InlineLoading label="Loading assignment status" /> : null}

      {activeRequest ? (
        <View style={[styles.statusCard, activeRequest.status === 'pending' ? styles.statusPending : styles.statusApproved]}>
          <View style={styles.statusHeading}>
            <View style={styles.statusIcon}><Ionicons name={activeRequest.status === 'pending' ? 'time-outline' : 'checkmark-circle-outline'} size={19} color={activeRequest.status === 'pending' ? colors.warning : colors.success} /></View>
            <View style={styles.statusCopy}>
              <Text style={styles.kicker}>Assignment status</Text>
              <Text style={styles.statusTitle}>{activeRequest.status}</Text>
            </View>
          </View>
          <Text style={styles.statusBody}>{statusCopy(activeRequest)}</Text>
          <View style={styles.assignmentList}>
            {activeRequest.assignments.map((assignment) => (
              <View key={`${assignment.teacher_id}-${assignment.subject}`} style={styles.assignmentRow}>
                <View style={styles.assignmentCopy}><Text style={styles.assignmentTeacher}>{assignment.teacher_name}</Text><Text style={styles.assignmentSubject}>{assignment.subject}</Text></View>
              </View>
            ))}
          </View>
          {canEdit ? <AnimatedButton label="Update assignments" onPress={beginEdit} /> : null}
        </View>
      ) : null}

      {!activeRequest || editing ? (
        <View style={styles.editorCard}>
          <View style={styles.editorHeading}>
            <View style={styles.editorCopy}><Text style={styles.editorTitle}>{activeRequest ? 'Update assignments' : 'Assign subject teachers'}</Text><Text style={styles.editorBody}>Choose up to {maximumAssignments} approved teachers for this class. The plan is sent to your principal.</Text></View>
            {editing ? <Pressable onPress={cancelEdit} accessibilityRole="button" style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable> : null}
          </View>

          {teachersFailure ? <FailureCard failure={teachersFailure} onRetry={() => void teachersQuery.refetch()} /> : teachersQuery.isLoading ? <InlineLoading label="Loading approved teachers" /> : null}

          <ScrollView contentContainerStyle={styles.rows} keyboardShouldPersistTaps="handled">
            {rows.map((row, index) => (
              <View key={`assignment-${index}`} style={styles.assignmentEditor}>
                <View style={styles.rowNumber}><Text style={styles.rowNumberText}>{index + 1}</Text></View>
                <View style={styles.rowFields}>
                  <SelectField label="Teacher" value={row.teacher_id} placeholder="Select approved teacher" options={teacherOptions(index)} onChange={(value) => updateRow(index, 'teacher_id', value)} disabled={teachersQuery.isLoading || Boolean(teachersFailure)} />
                  <SelectField label="Subject" value={row.subject} placeholder="Select subject" options={subjectOptions} onChange={(value) => updateRow(index, 'subject', value)} />
                </View>
                {rows.length > 1 ? <Pressable onPress={() => removeRow(index)} accessibilityRole="button" accessibilityLabel={`Remove assignment ${index + 1}`} style={styles.removeButton}><Ionicons name="trash-outline" size={18} color={colors.danger} /></Pressable> : null}
              </View>
            ))}
          </ScrollView>

          <Pressable onPress={addRow} disabled={rows.length >= maximumAssignments || submitMutation.isPending} accessibilityRole="button" style={({ pressed }) => [styles.addButton, pressed && styles.pressed, rows.length >= maximumAssignments && styles.disabled]}><Ionicons name="add-circle-outline" size={18} color={colors.accentStrong} /><Text style={styles.addText}>Add teacher</Text></Pressable>
          <AnimatedButton label={submitMutation.isPending ? 'Submitting' : 'Submit for approval'} loading={submitMutation.isPending} disabled={submitMutation.isPending || Boolean(teachersFailure) || teachers.length === 0} onPress={submit} />
        </View>
      ) : null}

      {activeRequest?.status === 'pending' ? <Text style={styles.note}>The principal approval workflow is managed in the school approvals queue. Pull to refresh to see the server-confirmed decision.</Text> : null}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: { gap: spacing[4], paddingBottom: spacing[20] },
  padded: { paddingBottom: spacing[20] },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing[3] },
  loadingText: { ...typography.roles.body, color: colors.textMuted },
  statusCard: { gap: spacing[3], borderRadius: radius.lg, borderWidth: 1, padding: spacing[4], ...shadows.xs },
  statusPending: { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
  statusApproved: { backgroundColor: colors.successBg, borderColor: colors.successBorder },
  statusHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  statusIcon: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundElevated },
  statusCopy: { flex: 1, gap: 1 },
  kicker: { ...typography.roles.eyebrow, color: colors.textMuted },
  statusTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 20, textTransform: 'capitalize' },
  statusBody: { color: colors.textSecondary, fontFamily: typography.fonts.bodyMedium, fontSize: 13, lineHeight: 19 },
  assignmentList: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  assignmentRow: { minHeight: 54, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  assignmentCopy: { gap: 2 },
  assignmentTeacher: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 14 },
  assignmentSubject: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  editorCard: { gap: spacing[4], borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.card, padding: spacing[4], ...shadows.xs },
  editorHeading: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' },
  editorCopy: { flex: 1, gap: spacing[1] },
  editorTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 19 },
  editorBody: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  cancelButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing[2] },
  cancelText: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  rows: { gap: spacing[3] },
  assignmentEditor: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: spacing[3] },
  rowNumber: { width: 24, height: 24, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSurface, marginTop: 25 },
  rowNumberText: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  rowFields: { flex: 1, gap: spacing[3] },
  removeButton: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  addButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], alignSelf: 'flex-start', paddingHorizontal: spacing[3] },
  addText: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  note: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18, paddingHorizontal: spacing[1] },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.78 },
})
