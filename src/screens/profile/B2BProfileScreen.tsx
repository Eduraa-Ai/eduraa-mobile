import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { authApi } from '../../api/auth'
import {
  b2bProfileApi,
  type PrincipalProfile,
  type StudentMasterProfile,
  type TeacherMasterProfile,
  type TeacherProfileSnapshot,
  type TeacherProfileUpdateRequest,
} from '../../api/b2bProfile'
import { MultiSelectField } from '../../components/ui/MultiSelectField'
import { SelectField } from '../../components/ui/SelectField'
import { ProfileDisclosure } from '../../components/ui/ProfileDisclosure'
import { useAuthStore } from '../../stores/authStore'
import { typography } from '../../theme'
import type { B2BProfileRole, TeacherProfileApprovalDraft, TeacherDraftErrors } from './b2bProfileModel'
import {
  buildTeacherApprovalPayload,
  normalizeProfileList,
  retainAvailableSelections,
  teachingScopeOptions,
  validateTeacherApprovalDraft,
} from './b2bProfileModel'

const NAVY = '#07152D'
const CREAM = '#FBF6EC'
const PAPER = '#FFFCF7'
const ORANGE = '#F36C21'
const RUST = '#C2410C'
const INK = '#101828'
const MUTED = '#667085'
const LINE = '#E0D6C8'
const SUBTLE = '#F3ECE1'
const WHITE = '#FFFFFF'
const GREEN = '#26734D'
const GREEN_BG = '#EEF9F1'
const GREEN_LINE = '#BFE5CE'
const AMBER = '#9A4C0A'
const AMBER_BG = '#FFF2DD'
const AMBER_LINE = '#F2C994'
const ERROR = '#B42318'
const ERROR_BG = '#FFF1F0'
const ERROR_LINE = '#FDA29B'

type Surface = 'view' | 'teacher-edit' | 'security' | 'security-sent' | 'logout-confirm'

const emptyTeacherDraft: TeacherProfileApprovalDraft = {
  firstName: '',
  lastName: '',
  email: '',
  teacherId: '',
  branchId: '',
  board: '',
  standardsTaught: [],
  divisionsTaught: [],
  subjectsTaught: [],
}

function valueOrDash(value?: string | null) {
  return value?.trim() || 'Not available'
}

function compactStatus(value?: string | null, fallback = 'Current') {
  const normalized = value?.trim()
  if (!normalized) return fallback
  return normalized
    .replace(/_/g, ' ')
    .toLocaleLowerCase()
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase())
}

function initials(first?: string | null, last?: string | null, fallback = 'ED') {
  return `${first?.trim().charAt(0) ?? ''}${last?.trim().charAt(0) ?? ''}`.toLocaleUpperCase() || fallback
}

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function listLabel(values?: readonly string[] | null) {
  return (values ?? []).map((value) => value.trim()).filter(Boolean).join(', ') || 'Not assigned'
}

function teacherDraftFromProfile(profile: TeacherMasterProfile): TeacherProfileApprovalDraft {
  const source: TeacherProfileSnapshot = profile.pending_update_request?.requested_profile ?? profile.profile
  return {
    firstName: source.first_name ?? '',
    lastName: source.last_name ?? '',
    email: source.email ?? '',
    teacherId: source.teacher_id ?? '',
    branchId: source.branch_id ?? profile.profile.branch_id ?? '',
    board: source.board ?? '',
    standardsTaught: [...(source.standards_taught ?? [])],
    divisionsTaught: [...(source.divisions_taught ?? [])],
    subjectsTaught: [...(source.subjects_taught ?? [])],
  }
}

function profileErrorMessage(error: unknown) {
  const apiError = error as {
    code?: string
    message?: string
    response?: { status?: number; data?: { detail?: string | Array<{ msg?: string }> } }
  }
  const detail = apiError.response?.data?.detail
  if (apiError.code === 'ERR_NETWORK' || !apiError.response) {
    return 'Eduraa is offline right now. Your changes are safe—reconnect and try again.'
  }
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).filter(Boolean).join('\n') || 'Please review the profile fields.'
  }
  if (typeof detail === 'string') return detail
  if (apiError.response?.status === 403) return 'This account is not permitted to change that profile.'
  return apiError.message || 'Something interrupted this request. Please try again.'
}

export default function B2BProfileScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const role = user?.role as B2BProfileRole | undefined
  const accountKey = user?.id ?? 'signed-out'

  const studentQuery = useQuery({
    queryKey: ['b2b-profile', accountKey, 'student'],
    queryFn: b2bProfileApi.getStudentProfile,
    enabled: role === 'student',
  })
  const teacherQuery = useQuery({
    queryKey: ['b2b-profile', accountKey, 'teacher'],
    queryFn: b2bProfileApi.getTeacherProfile,
    enabled: role === 'teacher',
  })
  const principalQuery = useQuery({
    queryKey: ['b2b-profile', accountKey, 'principal'],
    queryFn: b2bProfileApi.getPrincipalProfile,
    enabled: role === 'principal',
  })

  const [surface, setSurface] = useState<Surface>('view')
  const [draft, setDraft] = useState<TeacherProfileApprovalDraft>(emptyTeacherDraft)
  const [draftErrors, setDraftErrors] = useState<TeacherDraftErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)
  const [submittedRequest, setSubmittedRequest] = useState<TeacherProfileUpdateRequest | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  const teacher = teacherQuery.data
  useEffect(() => {
    if (!teacher) return
    setDraft(teacherDraftFromProfile(teacher))
    if (!teacher.pending_update_request) setSubmittedRequest(null)
  }, [teacher])

  useEffect(() => {
    setSurface('view')
    setDraftErrors({})
    setSaveError(null)
    setResetError(null)
    setSubmittedRequest(null)
    setSigningOut(false)
  }, [accountKey])

  const branchQuery = useQuery({
    queryKey: ['b2b-profile', accountKey, 'teacher-branches', teacher?.profile.school_id],
    queryFn: () => authApi.listBranches(teacher?.profile.school_id ?? ''),
    enabled: role === 'teacher' && surface === 'teacher-edit' && Boolean(teacher?.profile.school_id),
  })
  const branchOptions = useMemo(() => {
    const options = (branchQuery.data ?? []).map((branch) => ({ label: branch.name, value: branch.id }))
    const currentId = draft.branchId
    const currentName = teacher?.pending_update_request?.requested_profile.branch_name ?? teacher?.profile.branch_name
    if (currentId && !options.some((option) => option.value === currentId)) {
      options.unshift({ label: currentName || 'Current branch', value: currentId })
    }
    return options
  }, [branchQuery.data, draft.branchId, teacher])

  const selectedBranch = useMemo(
    () => (branchQuery.data ?? []).find((branch) => branch.id === draft.branchId),
    [branchQuery.data, draft.branchId],
  )
  const boardOptions = useMemo(
    () => normalizeProfileList(selectedBranch?.boards ?? []).map((board) => ({ label: board, value: board })),
    [selectedBranch?.boards],
  )
  const offeringsQuery = useQuery({
    queryKey: ['b2b-profile', accountKey, 'teacher-offerings', teacher?.profile.school_id, draft.branchId],
    queryFn: () => authApi.listOfferings(teacher?.profile.school_id ?? '', draft.branchId),
    enabled: role === 'teacher' && surface === 'teacher-edit' && Boolean(teacher?.profile.school_id && draft.branchId),
  })
  const subjectsQuery = useQuery({
    queryKey: ['b2b-profile', 'teacher-subject-options'],
    queryFn: b2bProfileApi.listTeacherProfileSubjects,
    enabled: role === 'teacher' && surface === 'teacher-edit',
    staleTime: 10 * 60 * 1000,
  })
  const scopeOptions = useMemo(
    () => teachingScopeOptions(offeringsQuery.data ?? [], draft.standardsTaught),
    [offeringsQuery.data, draft.standardsTaught],
  )
  const standardOptions = useMemo(
    () => scopeOptions.standards.map((standard) => ({
      label: /^(std|class)\s/i.test(standard) ? standard : `Std ${standard}`,
      value: standard,
    })),
    [scopeOptions.standards],
  )
  const divisionOptions = useMemo(
    () => scopeOptions.divisions.map((division) => ({ label: division, value: division })),
    [scopeOptions.divisions],
  )
  const subjectOptions = useMemo(
    () => (subjectsQuery.data ?? []).map((subject) => ({ label: subject.name, value: subject.name })),
    [subjectsQuery.data],
  )

  useEffect(() => {
    if (!branchQuery.isSuccess || !selectedBranch || boardOptions.length === 0) return
    if (boardOptions.some((option) => option.value === draft.board)) return
    setDraft((current) => ({ ...current, board: '' }))
  }, [boardOptions, branchQuery.isSuccess, draft.board, selectedBranch])

  useEffect(() => {
    if (!offeringsQuery.isSuccess) return
    setDraft((current) => {
      const standardsTaught = retainAvailableSelections(current.standardsTaught, scopeOptions.standards)
      const divisionsForStandards = teachingScopeOptions(offeringsQuery.data ?? [], standardsTaught).divisions
      const divisionsTaught = retainAvailableSelections(current.divisionsTaught, divisionsForStandards)
      if (
        normalizeProfileList(current.standardsTaught).join('\0') === standardsTaught.join('\0') &&
        normalizeProfileList(current.divisionsTaught).join('\0') === divisionsTaught.join('\0')
      ) return current
      return { ...current, standardsTaught, divisionsTaught }
    })
  }, [offeringsQuery.data, offeringsQuery.isSuccess, scopeOptions.standards])

  useEffect(() => {
    if (!subjectsQuery.isSuccess || subjectOptions.length === 0) return
    setDraft((current) => {
      const subjectsTaught = retainAvailableSelections(current.subjectsTaught, subjectOptions.map((option) => option.value))
      if (normalizeProfileList(current.subjectsTaught).join('\0') === subjectsTaught.join('\0')) return current
      return { ...current, subjectsTaught }
    })
  }, [subjectOptions, subjectsQuery.isSuccess])

  const updateMutation = useMutation({
    mutationFn: async () => {
      const nextErrors = validateTeacherApprovalDraft(draft)
      setDraftErrors(nextErrors)
      if (Object.keys(nextErrors).length) throw new Error('validation')
      return b2bProfileApi.submitTeacherProfileUpdate(buildTeacherApprovalPayload(draft))
    },
    onSuccess: async (request) => {
      setSubmittedRequest(request)
      setSaveError(null)
      setSurface('view')
      await queryClient.invalidateQueries({ queryKey: ['b2b-profile', accountKey, 'teacher'] })
      await queryClient.refetchQueries({ queryKey: ['b2b-profile', accountKey, 'teacher'], type: 'active' })
    },
    onError: (error) => {
      if ((error as Error)?.message === 'validation') {
        setSaveError('Please review the highlighted fields. Your valid entries are still here.')
        return
      }
      setSaveError(profileErrorMessage(error))
    },
  })

  const student = studentQuery.data
  const principal = principalQuery.data
  const securityIdentifier =
    role === 'student'
      ? student?.profile.email
      : role === 'teacher'
        ? teacher?.profile.email
        : user?.identifier

  const resetMutation = useMutation({
    mutationFn: async () => {
      const identifier = securityIdentifier?.trim()
      if (!identifier) throw new Error('missing_identifier')
      return authApi.forgotPassword(identifier)
    },
    onSuccess: () => {
      setResetError(null)
      setSurface('security-sent')
    },
    onError: (error) => {
      setResetError(
        (error as Error)?.message === 'missing_identifier'
          ? 'No account identifier is available. Ask your school administrator for help.'
          : profileErrorMessage(error),
      )
    },
  })

  if (!role || !['student', 'teacher', 'principal'].includes(role)) {
    return (
      <ProfileLoadState
        title="Profile unavailable"
        body="This account does not use an institution profile."
        icon="person-circle-outline"
        topInset={insets.top}
      />
    )
  }

  const activeQuery = role === 'student' ? studentQuery : role === 'teacher' ? teacherQuery : principalQuery
  if (activeQuery.isLoading) {
    return <ProfileLoading role={role} topInset={insets.top} />
  }
  if (activeQuery.isError || !activeQuery.data) {
    return (
      <ProfileLoadState
        title="Your profile paused here."
        body={profileErrorMessage(activeQuery.error)}
        icon="cloud-offline-outline"
        topInset={insets.top}
        actionLabel="Try again"
        onAction={() => void activeQuery.refetch()}
      />
    )
  }

  const identity = resolveIdentity(role, user?.display_name, user?.identifier, student, teacher, principal)
  const isSecurity = surface === 'security' || surface === 'security-sent'

  const refresh = () => {
    if (role === 'student') void studentQuery.refetch()
    if (role === 'teacher') void teacherQuery.refetch()
    if (role === 'principal') void principalQuery.refetch()
  }

  const openEdit = () => {
    if (!teacher || updateMutation.isPending) return
    setDraft(teacherDraftFromProfile(teacher))
    setDraftErrors({})
    setSaveError(null)
    setSubmittedRequest(null)
    setSurface('teacher-edit')
  }

  const closeToView = () => {
    setSurface('view')
    setDraftErrors({})
    setSaveError(null)
    setResetError(null)
  }

  const confirmSignOut = () => {
    if (signingOut) return
    setSigningOut(true)
    void logout().catch(() => setSigningOut(false))
  }

  const updateDraft = <K extends keyof TeacherProfileApprovalDraft>(
    key: K,
    value: TeacherProfileApprovalDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setDraftErrors((current) => ({ ...current, [key]: undefined }))
    setSaveError(null)
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 104 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          surface === 'view' ? (
            <RefreshControl
              refreshing={activeQuery.isRefetching}
              onRefresh={refresh}
              tintColor={ORANGE}
              colors={[ORANGE]}
            />
          ) : undefined
        }
      >
        <ProfileHero
          role={role}
          surface={surface}
          identity={identity}
          topInset={insets.top}
          onClose={closeToView}
        />

        <View style={styles.sheet}>
          {surface === 'view' ? (
            <>
              {role === 'student' && student ? <StudentProfileView data={student} /> : null}
              {role === 'teacher' && teacher ? (
                <TeacherProfileView
                  data={teacher}
                  submittedRequest={submittedRequest}
                  onEdit={openEdit}
                />
              ) : null}
              {role === 'principal' && principal ? <PrincipalProfileView data={principal} /> : null}
              <AccountActions
                role={role}
                onSecurity={() => {
                  setResetError(null)
                  setSurface('security')
                }}
                onLogout={() => setSurface('logout-confirm')}
              />
            </>
          ) : null}

          {surface === 'teacher-edit' && teacher ? (
            <TeacherEditView
              schoolName={teacher.profile.school_name}
              hasPendingRequest={Boolean(teacher.pending_update_request)}
              draft={draft}
              errors={draftErrors}
              saveError={saveError}
              saving={updateMutation.isPending}
              branchOptions={branchOptions}
              branchesLoading={branchQuery.isLoading}
              branchesError={branchQuery.isError ? profileErrorMessage(branchQuery.error) : null}
              onRetryBranches={() => void branchQuery.refetch()}
              boardOptions={boardOptions}
              standardOptions={standardOptions}
              divisionOptions={divisionOptions}
              subjectOptions={subjectOptions}
              scopeLoading={offeringsQuery.isLoading}
              subjectsLoading={subjectsQuery.isLoading}
              scopeError={offeringsQuery.isError ? profileErrorMessage(offeringsQuery.error) : null}
              subjectsError={subjectsQuery.isError ? profileErrorMessage(subjectsQuery.error) : null}
              onRetryScope={() => void offeringsQuery.refetch()}
              onRetrySubjects={() => void subjectsQuery.refetch()}
              onChange={updateDraft}
              onCancel={closeToView}
              onSave={() => {
                if (!updateMutation.isPending) updateMutation.mutate()
              }}
            />
          ) : null}

          {surface === 'security' ? (
            <SecurityView
              role={role}
              identifier={securityIdentifier ?? ''}
              sending={resetMutation.isPending}
              error={resetError}
              onCancel={closeToView}
              onSend={() => {
                if (!resetMutation.isPending) resetMutation.mutate()
              }}
            />
          ) : null}

          {surface === 'security-sent' ? (
            <SecuritySentView
              identifier={securityIdentifier ?? ''}
              sending={resetMutation.isPending}
              onBack={closeToView}
              onResend={() => {
                if (!resetMutation.isPending) resetMutation.mutate()
              }}
            />
          ) : null}

          {surface === 'logout-confirm' ? (
            <LogoutConfirmView
              role={role}
              signingOut={signingOut}
              onCancel={closeToView}
              onConfirm={confirmSignOut}
            />
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

type ResolvedIdentity = {
  firstName: string
  lastName: string
  fullName: string
  identifier: string
  school: string
  branch: string
}

function resolveIdentity(
  role: B2BProfileRole,
  displayName?: string | null,
  identifier?: string | null,
  student?: StudentMasterProfile,
  teacher?: TeacherMasterProfile,
  principal?: PrincipalProfile,
): ResolvedIdentity {
  const profile = role === 'student' ? student?.profile : role === 'teacher' ? teacher?.profile : principal?.profile
  const firstName = profile?.first_name ?? displayName?.trim().split(/\s+/)[0] ?? ''
  const lastName = profile?.last_name ?? displayName?.trim().split(/\s+/).slice(1).join(' ') ?? ''
  const email = role === 'principal' ? identifier : profile && 'email' in profile ? profile.email : identifier
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim() || displayName || compactStatus(role),
    identifier: email || '',
    school: profile?.school_name ?? '',
    branch: profile?.branch_name ?? '',
  }
}

function ProfileHero({
  role,
  surface,
  identity,
  topInset,
  onClose,
}: {
  role: B2BProfileRole
  surface: Surface
  identity: ResolvedIdentity
  topInset: number
  onClose: () => void
}) {
  const isView = surface === 'view'
  const [compact, setCompact] = useState(false)
  const title =
    surface === 'teacher-edit'
      ? 'Request changes'
      : surface === 'security' || surface === 'security-sent'
        ? 'Account security'
        : surface === 'logout-confirm'
          ? 'Sign out safely'
        : 'Profile'
  const roleLabel = role === 'student' ? 'Student' : role === 'teacher' ? 'Teacher' : 'Principal'

  return (
    <View
      onLayout={(event) => setCompact(event.nativeEvent.layout.width <= 340)}
      style={[styles.hero, compact && styles.heroCompact, { paddingTop: topInset + 18 }]}
    >
      <View style={styles.heroTop}>
        <View style={styles.heroTitleBlock}>
          {!isView ? <Text style={styles.heroEyebrow}>ACCOUNT PROFILE</Text> : null}
          <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>{title}</Text>
        </View>
        {!isView ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close profile panel"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [styles.heroButton, pressed && styles.pressed]}
          >
            <Ionicons name="close" color={WHITE} size={19} />
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.identityRow, compact && styles.identityRowCompact]}>
        <View style={[styles.avatar, compact && styles.avatarCompact]}>
          <Text style={[styles.avatarText, compact && styles.avatarTextCompact]}>{initials(identity.firstName, identity.lastName, roleLabel.slice(0, 2))}</Text>
          <View style={styles.avatarSignal} />
        </View>
        <View style={styles.identityCopy}>
          <View style={styles.roleLine}>
            <View style={styles.rolePill}>
              <Ionicons
                name={role === 'student' ? 'school-outline' : role === 'teacher' ? 'easel-outline' : 'shield-checkmark-outline'}
                size={12}
                color="#FFD1B8"
              />
              <Text style={styles.rolePillText}>{roleLabel}</Text>
            </View>
          </View>
          <Text style={[styles.identityName, compact && styles.identityNameCompact]} numberOfLines={compact ? 2 : 3}>
            {identity.fullName.replace(/-/g, '‑')}
          </Text>
          <Text style={styles.identityIdentifier} numberOfLines={1} ellipsizeMode="middle">
            {valueOrDash(identity.identifier)}
          </Text>
        </View>
      </View>

      <View style={[styles.schoolPath, compact && styles.schoolPathCompact]}>
        <Ionicons name="business-outline" size={16} color="#FFD1B8" />
        <View style={styles.schoolPathCopy}>
          <Text style={[styles.schoolPathValue, compact && styles.schoolPathValueCompact]}>
            {valueOrDash(identity.school)}
            {identity.branch ? `  ·  ${identity.branch}` : ''}
          </Text>
        </View>
      </View>
    </View>
  )
}

function StudentProfileView({ data }: { data: StudentMasterProfile }) {
  const profile = data.profile
  const subjects = data.subjects.map((subject) => subject.subject_name).filter(Boolean)
  return (
    <>
      <ProfileDisclosure
        title="Enrollment & subjects"
        summary={`${valueOrDash(profile.board)} · ${valueOrDash(profile.standard)}${profile.division ? ` · Division ${profile.division}` : ''}`}
        icon="school-outline"
      >
        <StudentLearningLane data={data} />
        <ChipSection title="Subjects" values={subjects} empty="Subjects will appear as soon as your school assigns them." />
      </ProfileDisclosure>
    </>
  )
}

function TeacherProfileView({
  data,
  submittedRequest,
  onEdit,
}: {
  data: TeacherMasterProfile
  submittedRequest: TeacherProfileUpdateRequest | null
  onEdit: () => void
}) {
  const profile = data.profile
  const pending = data.pending_update_request ?? submittedRequest
  const classTeacher = profile.class_teacher_opt_in
    ? `${valueOrDash(profile.class_teacher_standard)}${profile.class_teacher_division ? ` · ${profile.class_teacher_division}` : ''}`
    : 'Not assigned'

  return (
    <>
      {pending ? <PendingRequestCard request={pending} onEdit={onEdit} /> : null}
      {submittedRequest && !pending ? (
        <StatusNote
          tone="success"
          title="Request received"
          body={`Reference ${shortRequestId(submittedRequest.id)} is ready for principal review.`}
        />
      ) : null}

      <ProfileDisclosure
        title="Teaching details"
        summary={`${countLabel(profile.subjects_taught.length, 'subject')} · ${countLabel(profile.standards_taught.length, 'standard')} · ${countLabel(profile.divisions_taught.length, 'division')}`}
        icon="easel-outline"
      >
        <TeacherDetailRow label="Teacher ID" value={valueOrDash(profile.teacher_id)} />
        <TeacherDetailRow label="Board" value={valueOrDash(profile.board)} />
        <TeacherDetailRow label="Class teacher" value={classTeacher} />
        <TeacherDetailRow label="Status" value={compactStatus(data.assignment_status)} />
        <TeacherDetailRow label="Subjects" value={listLabel(profile.subjects_taught)} />
        <TeacherDetailRow label="Standards" value={listLabel(profile.standards_taught)} />
        <TeacherDetailRow label="Divisions" value={listLabel(profile.divisions_taught)} last />
      </ProfileDisclosure>

      <ProfileDisclosure
        title="Classes & subjects"
        summary={data.subject_mappings.length ? `${data.subject_mappings.length} confirmed class assignment${data.subject_mappings.length === 1 ? '' : 's'}` : 'Awaiting confirmed class assignments'}
        icon="albums-outline"
      >
        <View style={styles.mappingSection}>
          {data.subject_mappings.length ? (
            <>
              <TeacherDetailRow
                label="Assignment"
                value={Array.from(new Set(data.subject_mappings.map((mapping) => compactStatus(mapping.assignment_type)))).join(', ')}
              />
              {data.subject_mappings.map((mapping, index) => (
                <View key={`${mapping.subject_name}-${mapping.standard}-${mapping.division}-${index}`} style={[styles.mappingRow, index === data.subject_mappings.length - 1 && styles.rowLast]}>
                  <View style={styles.mappingCopy}>
                    <Text style={styles.mappingSubject}>{mapping.subject_name}</Text>
                    <Text style={styles.mappingClass}>{mapping.standard} · Division {mapping.division}</Text>
                  </View>
                </View>
              ))}
            </>
          ) : (
            <EmptyInline icon="albums-outline" text="Class mappings will appear after your school confirms assignments." />
          )}
        </View>
      </ProfileDisclosure>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={pending ? 'Update pending profile request' : 'Request profile changes'}
        onPress={onEdit}
        style={({ pressed }) => [styles.primaryAction, pressed && styles.pressedFirm]}
      >
        <Ionicons name="create-outline" size={19} color={RUST} />
        <View style={styles.primaryActionCopy}>
          <Text style={styles.primaryActionTitle}>{pending ? 'Update your pending request' : 'Request profile changes'}</Text>
        </View>
        <Ionicons name="arrow-forward" size={18} color={NAVY} />
      </Pressable>
    </>
  )
}

function PrincipalProfileView({ data }: { data: PrincipalProfile }) {
  return (
    <>
      <ProfileDisclosure
        title="School activity"
        summary={`${countLabel(data.summary.active_teachers, 'active teacher')} · ${countLabel(data.summary.active_students, 'active student')}`}
        icon="pulse-outline"
      >
        <PrincipalAccountabilityView data={data} />
        <View style={styles.scopeLine}>
          <View style={styles.scopePulse} />
          <Text style={styles.scopeText}>
            {data.filters.standards.length || data.filters.divisions.length
              ? `${data.filters.standards.length} standards · ${data.filters.divisions.length} divisions in your current scope`
              : 'School structure will appear as soon as classes are configured.'}
          </Text>
        </View>
      </ProfileDisclosure>
    </>
  )
}

function StudentLearningLane({ data }: { data: StudentMasterProfile }) {
  const { profile } = data
  const steps = [
    { label: 'Standard', value: valueOrDash(profile.standard) },
    { label: 'Division', value: profile.division ? `Division ${profile.division}` : 'Awaiting' },
    { label: 'Status', value: compactStatus(data.assignment_status, 'Enrolled') },
  ]
  return (
    <View style={styles.learningLane}>
      <View style={styles.laneTop}>
        <View>
          <Text style={styles.laneMeta}>STUDENT ID</Text>
          <Text style={styles.laneIdentity}>{valueOrDash(profile.student_id)}</Text>
        </View>
        <Text style={styles.laneBoard}>{valueOrDash(profile.board)}</Text>
      </View>
      <View style={styles.laneTrack}>
        {steps.map((step, index) => (
          <React.Fragment key={step.label}>
            <View style={styles.laneStep}>
              <View style={[styles.laneNode, index === steps.length - 1 && styles.laneNodeActive]} />
              <Text style={styles.laneStepLabel}>{step.label}</Text>
              <Text style={styles.laneStepValue}>{step.value}</Text>
            </View>
            {index < steps.length - 1 ? <View style={styles.laneConnector} /> : null}
          </React.Fragment>
        ))}
      </View>
      <View style={styles.laneTeacher}>
        <Ionicons name="person-outline" size={18} color={RUST} />
        <View style={styles.laneTeacherCopy}>
          <Text style={styles.laneTeacherLabel}>CLASS TEACHER</Text>
          <Text style={styles.laneTeacherName}>{valueOrDash(data.class_teacher_name)}</Text>
        </View>
      </View>
    </View>
  )
}

function TeacherDetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.teacherDetailRow, last && styles.rowLast]}>
      <Text style={styles.teacherDetailLabel}>{label}</Text>
      <Text style={styles.teacherDetailValue}>{value}</Text>
    </View>
  )
}

function PrincipalAccountabilityView({ data }: { data: PrincipalProfile }) {
  const teacherPercent = data.summary.total_teachers
    ? Math.round((data.summary.active_teachers / data.summary.total_teachers) * 100)
    : 0
  const studentPercent = data.summary.total_students
    ? Math.round((data.summary.active_students / data.summary.total_students) * 100)
    : 0
  return (
    <View style={styles.accountabilityView}>
      <View style={styles.accountabilityHeader}>
        <Text style={styles.accountabilityEyebrow}>CURRENTLY ACTIVE</Text>
        <Ionicons name="pulse-outline" size={20} color="#FFB085" />
      </View>
      <AccountabilityMetric label="Teachers" active={data.summary.active_teachers} total={data.summary.total_teachers} percent={teacherPercent} />
      <AccountabilityMetric label="Students" active={data.summary.active_students} total={data.summary.total_students} percent={studentPercent} />
    </View>
  )
}

function AccountabilityMetric({ label, active, total, percent }: { label: string; active: number; total: number; percent: number }) {
  const width = `${Math.min(100, Math.max(0, percent))}%` as `${number}%`
  return (
    <View style={styles.accountabilityMetric}>
      <View style={styles.accountabilityLine}>
        <Text style={styles.accountabilityLabel}>{label}</Text>
        <Text style={styles.accountabilityValue}>{active} active · {total} total</Text>
      </View>
      <View style={styles.accountabilityTrack}>
        <View style={[styles.accountabilityFill, { width }]} />
      </View>
      <Text style={styles.accountabilityPercent}>{percent}% active</Text>
    </View>
  )
}

function PendingRequestCard({ request, onEdit }: { request: TeacherProfileUpdateRequest; onEdit: () => void }) {
  return (
    <View style={styles.pendingCard} accessibilityRole="summary">
      <View style={styles.pendingTop}>
        <View style={styles.pendingIcon}>
          <Ionicons name="time-outline" size={19} color={AMBER} />
        </View>
        <View style={styles.pendingCopy}>
          <Text style={styles.pendingEyebrow}>PRINCIPAL REVIEW · {shortRequestId(request.id)}</Text>
          <Text style={styles.pendingTitle}>Your update is in one safe queue.</Text>
          <Text style={styles.pendingBody}>You can leave now. This status will stay here until your principal reviews it.</Text>
        </View>
      </View>
      <View style={styles.pendingFooter}>
        <Text style={styles.pendingStatus}>{compactStatus(request.status)}</Text>
        <Pressable accessibilityRole="button" onPress={onEdit} hitSlop={8}>
          <Text style={styles.pendingLink}>Review request</Text>
        </Pressable>
      </View>
    </View>
  )
}

function shortRequestId(id: string) {
  const compact = id.replace(/-/g, '')
  return `#${compact.slice(-8).toLocaleUpperCase()}`
}

function TeacherEditView({
  schoolName,
  hasPendingRequest,
  draft,
  errors,
  saveError,
  saving,
  branchOptions,
  branchesLoading,
  branchesError,
  onRetryBranches,
  boardOptions,
  standardOptions,
  divisionOptions,
  subjectOptions,
  scopeLoading,
  subjectsLoading,
  scopeError,
  subjectsError,
  onRetryScope,
  onRetrySubjects,
  onChange,
  onCancel,
  onSave,
}: {
  schoolName?: string | null
  hasPendingRequest: boolean
  draft: TeacherProfileApprovalDraft
  errors: TeacherDraftErrors
  saveError: string | null
  saving: boolean
  branchOptions: Array<{ label: string; value: string }>
  branchesLoading: boolean
  branchesError: string | null
  onRetryBranches: () => void
  boardOptions: Array<{ label: string; value: string }>
  standardOptions: Array<{ label: string; value: string }>
  divisionOptions: Array<{ label: string; value: string }>
  subjectOptions: Array<{ label: string; value: string }>
  scopeLoading: boolean
  subjectsLoading: boolean
  scopeError: string | null
  subjectsError: string | null
  onRetryScope: () => void
  onRetrySubjects: () => void
  onChange: <K extends keyof TeacherProfileApprovalDraft>(key: K, value: TeacherProfileApprovalDraft[K]) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <>
      <StatusNote
        tone="approval"
        title={hasPendingRequest ? 'This updates your current request.' : 'Changes need principal approval.'}
        body={hasPendingRequest
          ? 'Eduraa keeps one traceable request, so a second tap or revision cannot create a duplicate queue item.'
          : 'Your current profile stays active until the request is approved. School and class-teacher assignments remain locked.'}
      />

      <Text style={styles.sectionLabel}>Identity</Text>
      <ProfileInput label="First name" value={draft.firstName} error={errors.firstName} onChangeText={(value) => onChange('firstName', value)} autoCapitalize="words" returnKeyType="next" maxLength={100} />
      <ProfileInput label="Last name" value={draft.lastName} error={errors.lastName} onChangeText={(value) => onChange('lastName', value)} autoCapitalize="words" returnKeyType="next" maxLength={100} />
      <ProfileInput label="Email" value={draft.email} error={errors.email} onChangeText={(value) => onChange('email', value)} autoCapitalize="none" keyboardType="email-address" autoComplete="email" returnKeyType="next" />
      <ProfileInput label="Teacher ID" value={draft.teacherId} error={errors.teacherId} onChangeText={(value) => onChange('teacherId', value)} autoCapitalize="characters" returnKeyType="next" maxLength={120} />

      <Text style={[styles.sectionLabel, styles.sectionGap]}>School & teaching scope</Text>
      <ProfileInput label="School" value={valueOrDash(schoolName)} locked helper="School identity is administrator-managed." />
      <SelectField
        label="Branch"
        value={draft.branchId}
        options={branchOptions}
        loading={branchesLoading}
        disabled={branchesLoading || !branchOptions.length}
        placeholder={branchesLoading ? 'Loading branches' : 'Choose branch'}
        error={errors.branchId}
        onChange={(value) => {
          onChange('branchId', value)
          onChange('board', '')
          onChange('standardsTaught', [])
          onChange('divisionsTaught', [])
        }}
      />
      {branchesError ? (
        <InlineError message={branchesError} actionLabel="Retry" onAction={onRetryBranches} />
      ) : null}
      {boardOptions.length > 0 ? (
        <SelectField
          label="Board"
          value={draft.board}
          options={boardOptions}
          loading={scopeLoading}
          disabled={scopeLoading}
          placeholder={scopeLoading ? 'Loading boards' : 'Choose board'}
          error={errors.board}
          onChange={(value) => onChange('board', value)}
        />
      ) : (
        <ProfileInput
          label="Board"
          value={draft.board}
          error={errors.board}
          onChangeText={(value) => onChange('board', value)}
          autoCapitalize="characters"
          returnKeyType="next"
          maxLength={100}
          locked={scopeLoading}
          helper={scopeLoading ? 'Loading the boards configured for this branch.' : 'No board list is configured, so enter the official board name.'}
        />
      )}
      <MultiSelectField
        label="Standards"
        values={normalizeProfileList(draft.standardsTaught)}
        options={standardOptions}
        loading={scopeLoading}
        disabled={scopeLoading || standardOptions.length === 0}
        placeholder={scopeLoading ? 'Loading standards' : 'Choose standards'}
        error={errors.standardsTaught}
        onChange={(values) => onChange('standardsTaught', values)}
      />
      <MultiSelectField
        label="Divisions"
        values={normalizeProfileList(draft.divisionsTaught)}
        options={divisionOptions}
        loading={scopeLoading}
        disabled={scopeLoading || normalizeProfileList(draft.standardsTaught).length === 0 || divisionOptions.length === 0}
        placeholder={normalizeProfileList(draft.standardsTaught).length === 0 ? 'Choose standards first' : 'Choose divisions'}
        error={errors.divisionsTaught}
        onChange={(values) => onChange('divisionsTaught', values)}
      />
      <MultiSelectField
        label="Subjects"
        values={normalizeProfileList(draft.subjectsTaught)}
        options={subjectOptions}
        loading={subjectsLoading}
        disabled={subjectsLoading || subjectOptions.length === 0}
        placeholder={subjectsLoading ? 'Loading subjects' : 'Choose subjects'}
        error={errors.subjectsTaught}
        onChange={(values) => onChange('subjectsTaught', values)}
      />

      {scopeError ? <InlineError message={`Teaching scope could not load. ${scopeError}`} actionLabel="Retry" onAction={onRetryScope} /> : null}
      {subjectsError ? <InlineError message={`Subjects could not load. ${subjectsError}`} actionLabel="Retry" onAction={onRetrySubjects} /> : null}

      {saveError ? <InlineError message={saveError} /> : null}

      <View style={styles.buttonRow}>
        <Pressable disabled={saving} accessibilityRole="button" onPress={onCancel} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          disabled={saving}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving, busy: saving }}
          onPress={onSave}
          style={({ pressed }) => [styles.submitButton, pressed && styles.pressedFirm, saving && styles.disabled]}
        >
          {saving ? <ActivityIndicator color={WHITE} /> : <Text style={styles.submitButtonText}>{hasPendingRequest ? 'Update request' : 'Send for approval'}</Text>}
        </Pressable>
      </View>
    </>
  )
}

function AccountActions({
  role,
  onSecurity,
  onLogout,
}: {
  role: B2BProfileRole
  onSecurity: () => void
  onLogout: () => void
}) {
  return (
    <View style={styles.accountSection}>
      <ProfileDisclosure
        title="Account & security"
        summary="Password recovery · Sign out"
        icon="shield-checkmark-outline"
      >
        <ActionRow icon="shield-checkmark-outline" title="Password recovery" caption={`Secure reset for this ${role} account`} onPress={onSecurity} />
        <Pressable accessibilityRole="button" onPress={onLogout} style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}>
          <Ionicons name="log-out-outline" size={19} color={RUST} />
          <View style={styles.logoutCopy}>
            <Text style={styles.logoutTitle}>Sign out</Text>
            <Text style={styles.logoutCaption}>Clear this account from the device</Text>
          </View>
        </Pressable>
      </ProfileDisclosure>
    </View>
  )
}

function SecurityView({
  role,
  identifier,
  sending,
  error,
  onCancel,
  onSend,
}: {
  role: B2BProfileRole
  identifier: string
  sending: boolean
  error: string | null
  onCancel: () => void
  onSend: () => void
}) {
  return (
    <>
      <SectionIntro eyebrow="CONFIRM SECURE RESET" title="Reset your password safely." body={`Only the verified identifier for this ${role} account can receive recovery instructions.`} />
      <StatusNote
        tone="approval"
        title="This sends a link—nothing changes yet."
        body="Your current password remains active until you open the verified email and choose a replacement."
      />
      <ProfileInput label="Verified account" value={identifier || 'Not available'} locked helper="This value comes from your canonical school account." />
      {error ? <InlineError message={error} /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: sending, busy: sending }}
        disabled={sending}
        onPress={onSend}
        style={({ pressed }) => [styles.fullButton, pressed && styles.pressedFirm, sending && styles.disabled]}
      >
        {sending ? <ActivityIndicator color={WHITE} /> : <Ionicons name="paper-plane-outline" size={18} color={WHITE} />}
        <Text style={styles.fullButtonText}>{sending ? 'Sending secure link…' : 'Confirm & send reset link'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onCancel} style={styles.ghostButton}>
        <Text style={styles.ghostButtonText}>Cancel</Text>
      </Pressable>
    </>
  )
}

function SecuritySentView({
  identifier,
  sending,
  onBack,
  onResend,
}: {
  identifier: string
  sending: boolean
  onBack: () => void
  onResend: () => void
}) {
  return (
    <>
      <StatusNote tone="success" title="Recovery instructions sent." body={`Check ${identifier || 'your verified account'} and use the latest Eduraa message.`} />
      <Text style={styles.sectionLabel}>What happens next</Text>
      {['Open the latest Eduraa email', 'Choose a new secure password', 'Return and sign in'].map((step, index) => (
        <View key={step} style={styles.stepRow}>
          <Text style={styles.stepNumber}>{String(index + 1).padStart(2, '0')}</Text>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}
      <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.fullButton, pressed && styles.pressedFirm]}>
        <Ionicons name="arrow-back" size={18} color={WHITE} />
        <Text style={styles.fullButtonText}>Back to profile</Text>
      </Pressable>
      <Pressable
        disabled={sending}
        accessibilityRole="button"
        accessibilityState={{ disabled: sending, busy: sending }}
        onPress={onResend}
        style={({ pressed }) => [styles.resendButton, pressed && styles.pressed, sending && styles.disabled]}
      >
        <Ionicons name="refresh" size={16} color={NAVY} />
        <Text style={styles.resendButtonText}>{sending ? 'Sending…' : 'Send another link'}</Text>
      </Pressable>
    </>
  )
}

function LogoutConfirmView({
  role,
  signingOut,
  onCancel,
  onConfirm,
}: {
  role: B2BProfileRole
  signingOut: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <>
      <View style={styles.logoutConfirmMark}>
        <Ionicons name="log-out-outline" size={27} color={RUST} />
      </View>
      <SectionIntro
        eyebrow="ACCOUNT SWITCHING"
        title="Leave no school data behind."
        body={`Signing out clears this ${role} account and its cached institution profile from this device before another account can open.`}
      />
      <View style={styles.logoutSafetyList}>
        {[
          'Unsaved profile changes will be discarded',
          'The next account loads fresh canonical data',
          'You can sign back in with your school account',
        ].map((item) => (
          <View key={item} style={styles.logoutSafetyRow}>
            <Ionicons name="checkmark-circle" size={18} color={GREEN} />
            <Text style={styles.logoutSafetyText}>{item}</Text>
          </View>
        ))}
      </View>
      <View style={styles.buttonRow}>
        <Pressable disabled={signingOut} accessibilityRole="button" onPress={onCancel} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed, signingOut && styles.disabled]}>
          <Text style={styles.secondaryButtonText}>Stay signed in</Text>
        </Pressable>
        <Pressable disabled={signingOut} accessibilityRole="button" accessibilityState={{ disabled: signingOut, busy: signingOut }} onPress={onConfirm} style={({ pressed }) => [styles.logoutConfirmButton, pressed && styles.pressedFirm, signingOut && styles.disabled]}>
          {signingOut ? <ActivityIndicator color={WHITE} /> : <Text style={styles.logoutConfirmButtonText}>Sign out</Text>}
        </Pressable>
      </View>
    </>
  )
}

function SectionIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <View style={styles.sectionIntro}>
      <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  )
}

function ChipSection({ title, values, empty, compact = false }: { title: string; values: readonly string[]; empty: string; compact?: boolean }) {
  const cleaned = values.map((value) => value.trim()).filter(Boolean)
  return (
    <View style={[styles.chipSection, compact && styles.chipSectionCompact]}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {cleaned.length ? (
        <View style={styles.chips}>
          {cleaned.map((value) => (
            <View key={value} style={styles.chip}>
              <View style={styles.chipDot} />
              <Text style={styles.chipText}>{value}</Text>
            </View>
          ))}
        </View>
      ) : (
        <EmptyInline icon="sparkles-outline" text={empty} />
      )}
    </View>
  )
}

function EmptyInline({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.emptyInline}>
      <Ionicons name={icon} size={18} color={MUTED} />
      <Text style={styles.emptyInlineText}>{text}</Text>
    </View>
  )
}

function StatusNote({ tone, title, body }: { tone: 'approval' | 'success'; title: string; body: string }) {
  const success = tone === 'success'
  return (
    <View style={[styles.statusNote, success ? styles.statusSuccess : styles.statusApproval]} accessibilityRole="summary">
      <View style={[styles.statusIcon, success ? styles.statusIconSuccess : styles.statusIconApproval]}>
        <Ionicons name={success ? 'checkmark' : 'hourglass-outline'} size={15} color={success ? WHITE : AMBER} />
      </View>
      <View style={styles.statusCopy}>
        <Text style={[styles.statusTitle, success ? styles.statusTitleSuccess : styles.statusTitleApproval]}>{title}</Text>
        <Text style={styles.statusBody}>{body}</Text>
      </View>
    </View>
  )
}

function ActionRow({ icon, title, caption, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; caption: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${caption}`} onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={19} color={NAVY} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionCaption}>{caption}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={MUTED} />
    </Pressable>
  )
}

function ProfileInput({
  label,
  value,
  error,
  helper,
  locked = false,
  ...inputProps
}: {
  label: string
  value: string
  error?: string
  helper?: string
  locked?: boolean
} & Omit<React.ComponentProps<typeof TextInput>, 'value' | 'editable'>) {
  const [focused, setFocused] = useState(false)
  const externalOnFocus = inputProps.onFocus
  const externalOnBlur = inputProps.onBlur
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {locked ? <Text style={styles.lockedLabel}>LOCKED</Text> : null}
      </View>
      <View style={[styles.inputWrap, focused && styles.inputFocused, locked && styles.inputLocked, error && styles.inputError]}>
        <TextInput
          {...inputProps}
          onFocus={(event) => {
            setFocused(true)
            externalOnFocus?.(event)
          }}
          onBlur={(event) => {
            setFocused(false)
            externalOnBlur?.(event)
          }}
          value={value}
          editable={!locked}
          accessibilityLabel={label}
          accessibilityState={{ disabled: locked }}
          placeholderTextColor="#98A2B3"
          style={styles.input}
        />
        {locked ? <Ionicons name="lock-closed-outline" size={16} color={MUTED} /> : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : helper ? <Text style={styles.fieldHelper}>{helper}</Text> : null}
    </View>
  )
}

function InlineError({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={styles.inlineError} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" size={18} color={ERROR} />
      <Text style={styles.inlineErrorText}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <Text style={styles.inlineErrorAction}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function ProfileLoading({ role, topInset }: { role: B2BProfileRole; topInset: number }) {
  return (
    <View style={styles.root}>
      <View style={[styles.loadingHero, { paddingTop: topInset + 28 }]}>
        <Text style={styles.heroEyebrow}>INSTITUTION PROFILE</Text>
        <Text style={styles.loadingHeroTitle}>Finding your {role} profile.</Text>
        <View style={styles.loadingIdentity}>
          <View style={styles.loadingAvatar} />
          <View style={styles.loadingLines}>
            <View style={[styles.loadingLine, { width: '72%' }]} />
            <View style={[styles.loadingLine, { width: '54%', opacity: 0.55 }]} />
          </View>
        </View>
      </View>
      <View style={[styles.sheet, styles.loadingSheet]}>
        <ActivityIndicator color={ORANGE} />
        <Text style={styles.loadingText}>Connecting identity and school context…</Text>
      </View>
    </View>
  )
}

function ProfileLoadState({
  title,
  body,
  icon,
  topInset,
  actionLabel,
  onAction,
}: {
  title: string
  body: string
  icon: keyof typeof Ionicons.glyphMap
  topInset: number
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <View style={[styles.loadRoot, { paddingTop: topInset + 28 }]}>
      <View style={styles.loadMark}>
        <Ionicons name={icon} size={27} color={ORANGE} />
      </View>
      <Text style={styles.loadEyebrow}>PROFILE CONNECTION</Text>
      <Text style={styles.loadTitle}>{title}</Text>
      <Text style={styles.loadBody}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.loadButton, pressed && styles.pressedFirm]}>
          <Ionicons name="refresh" size={18} color={WHITE} />
          <Text style={styles.loadButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  scroll: { flex: 1, backgroundColor: CREAM },
  hero: { minHeight: 238, overflow: 'hidden', paddingHorizontal: 22, paddingBottom: 14, backgroundColor: NAVY },
  heroCompact: { minHeight: 224, paddingHorizontal: 18, paddingBottom: 12 },
  heroTop: { minHeight: 38, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroTitleBlock: { flex: 1, minWidth: 0, paddingRight: 12 },
  heroEyebrow: { color: '#FF9A63', fontFamily: typography.fonts.bodyBold, fontSize: 10, lineHeight: 14, letterSpacing: 1.7 },
  heroTitle: { marginTop: 2, color: WHITE, fontFamily: typography.fonts.headingSemibold, fontSize: 25, lineHeight: 30 },
  heroTitleCompact: { fontSize: 23, lineHeight: 28 },
  heroButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23, borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', backgroundColor: 'rgba(255,255,255,0.08)' },
  identityRow: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  identityRowCompact: { minHeight: 82, gap: 12, marginTop: 6 },
  avatar: { width: 66, height: 66, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 2, borderColor: 'rgba(255,255,255,0.74)', backgroundColor: ORANGE },
  avatarText: { color: NAVY, fontFamily: typography.fonts.headingSemibold, fontSize: 22 },
  avatarCompact: { width: 64, height: 64, borderRadius: 22 },
  avatarTextCompact: { fontSize: 21 },
  avatarSignal: { position: 'absolute', right: -2, bottom: 8, width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: NAVY, backgroundColor: '#57C284' },
  identityCopy: { flex: 1, minWidth: 0 },
  roleLine: { flexDirection: 'row', marginBottom: 4 },
  rolePill: { minHeight: 27, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,209,184,0.25)', backgroundColor: 'rgba(243,108,33,0.12)' },
  rolePillText: { color: '#FFD1B8', fontFamily: typography.fonts.bodyBold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  identityName: { color: WHITE, fontFamily: typography.fonts.headingSemibold, fontSize: 22, lineHeight: 27 },
  identityNameCompact: { fontSize: 19, lineHeight: 23 },
  identityIdentifier: { marginTop: 5, color: '#C0C9D5', fontFamily: typography.fonts.bodyMedium, fontSize: 13, lineHeight: 19 },
  schoolPath: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 4, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.16)' },
  schoolPathCompact: { minHeight: 48, marginTop: 2, paddingVertical: 7 },
  schoolPathCopy: { flex: 1, minWidth: 0 },
  schoolPathValue: { color: WHITE, fontFamily: typography.fonts.bodySemibold, fontSize: 12.5, lineHeight: 18 },
  schoolPathValueCompact: { fontSize: 10.5, lineHeight: 15 },
  sheet: { minHeight: 540, marginTop: -12, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 30, borderTopLeftRadius: 22, borderTopRightRadius: 22, backgroundColor: CREAM },
  sectionIntro: { marginBottom: 20 },
  sectionEyebrow: { color: RUST, fontFamily: typography.fonts.bodyBold, fontSize: 9.5, lineHeight: 13, letterSpacing: 1.5 },
  sectionTitle: { marginTop: 6, color: NAVY, fontFamily: typography.fonts.headingSemibold, fontSize: 23, lineHeight: 29 },
  sectionBody: { marginTop: 7, color: MUTED, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 19 },
  sectionLabel: { color: RUST, fontFamily: typography.fonts.bodyBold, fontSize: 9.5, lineHeight: 13, letterSpacing: 1.5, textTransform: 'uppercase' },
  sectionGap: { marginTop: 28 },
  learningLane: { overflow: 'hidden', marginBottom: 24, borderRadius: 22, backgroundColor: NAVY },
  laneTop: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.10)' },
  laneMeta: { color: '#AAB5C6', fontFamily: typography.fonts.bodyBold, fontSize: 8.5, lineHeight: 12, letterSpacing: 1.1 },
  laneIdentity: { marginTop: 3, color: WHITE, fontFamily: typography.fonts.bodyBold, fontSize: 13, lineHeight: 18 },
  laneBoard: { overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, color: NAVY, backgroundColor: '#FFD8C2', fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  laneTrack: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 15, paddingTop: 19, paddingBottom: 17 },
  laneStep: { flex: 1, minWidth: 0 },
  laneNode: { width: 10, height: 10, marginBottom: 9, borderRadius: 5, borderWidth: 2, borderColor: '#FFB085', backgroundColor: NAVY },
  laneNodeActive: { borderColor: '#57C284', backgroundColor: '#57C284' },
  laneStepLabel: { color: '#9EABBC', fontFamily: typography.fonts.bodyMedium, fontSize: 9, lineHeight: 13 },
  laneStepValue: { marginTop: 2, color: WHITE, fontFamily: typography.fonts.bodySemibold, fontSize: 11, lineHeight: 16 },
  laneConnector: { width: 13, height: 1, marginTop: 5, marginHorizontal: 2, backgroundColor: '#52647A' },
  laneTeacher: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, backgroundColor: '#F9E7D9' },
  laneTeacherCopy: { flex: 1, minWidth: 0 },
  laneTeacherLabel: { color: RUST, fontFamily: typography.fonts.bodyBold, fontSize: 8, lineHeight: 11, letterSpacing: 0.8 },
  laneTeacherName: { marginTop: 3, color: INK, fontFamily: typography.fonts.bodyBold, fontSize: 12, lineHeight: 17 },
  teacherDetailRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE },
  teacherDetailLabel: { color: '#475467', fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 17 },
  teacherDetailValue: { flex: 1, color: INK, fontFamily: typography.fonts.bodySemibold, fontSize: 12, lineHeight: 18, textAlign: 'right' },
  rowLast: { borderBottomWidth: 0 },
  accountabilityView: { overflow: 'hidden', marginBottom: 19, borderRadius: 22, backgroundColor: NAVY },
  accountabilityHeader: { minHeight: 51, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.10)' },
  accountabilityEyebrow: { color: '#FFB085', fontFamily: typography.fonts.bodyBold, fontSize: 8.5, lineHeight: 12, letterSpacing: 1 },
  accountabilityMetric: { paddingHorizontal: 16, paddingTop: 15, paddingBottom: 12 },
  accountabilityLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  accountabilityLabel: { color: WHITE, fontFamily: typography.fonts.bodyBold, fontSize: 12, lineHeight: 17 },
  accountabilityValue: { flexShrink: 1, color: '#AFBBCB', fontFamily: typography.fonts.bodyMedium, fontSize: 9.5, lineHeight: 14, textAlign: 'right' },
  accountabilityTrack: { height: 5, overflow: 'hidden', marginTop: 9, borderRadius: 3, backgroundColor: '#31445D' },
  accountabilityFill: { height: 5, borderRadius: 3, backgroundColor: ORANGE },
  accountabilityPercent: { marginTop: 5, color: '#FFB085', fontFamily: typography.fonts.bodySemibold, fontSize: 8.5, lineHeight: 12, textAlign: 'right' },
  chipSection: { marginBottom: 25 },
  chipSectionCompact: { marginBottom: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 11 },
  chip: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 14, borderWidth: 1, borderColor: LINE, backgroundColor: PAPER },
  chipDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: ORANGE },
  chipText: { maxWidth: 250, color: INK, fontFamily: typography.fonts.bodySemibold, fontSize: 12, lineHeight: 17 },
  emptyInline: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 15, borderWidth: 1, borderColor: LINE, backgroundColor: SUBTLE },
  emptyInlineText: { flex: 1, color: MUTED, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 17 },
  mappingSection: { marginTop: 6, marginBottom: 24 },
  mappingRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: LINE },
  mappingCopy: { flex: 1, minWidth: 0 },
  mappingSubject: { color: INK, fontFamily: typography.fonts.bodyBold, fontSize: 12, lineHeight: 17 },
  mappingClass: { marginTop: 3, color: '#475467', fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 16 },
  primaryAction: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, paddingHorizontal: 8, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE },
  primaryActionCopy: { flex: 1, minWidth: 0 },
  primaryActionTitle: { color: NAVY, fontFamily: typography.fonts.bodyBold, fontSize: 13, lineHeight: 18 },
  pendingCard: { marginBottom: 22, overflow: 'hidden', borderRadius: 20, borderWidth: 1, borderColor: AMBER_LINE, backgroundColor: AMBER_BG },
  pendingTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 15 },
  pendingIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: WHITE },
  pendingCopy: { flex: 1, minWidth: 0 },
  pendingEyebrow: { color: AMBER, fontFamily: typography.fonts.bodyBold, fontSize: 8.5, lineHeight: 12, letterSpacing: 1 },
  pendingTitle: { marginTop: 5, color: INK, fontFamily: typography.fonts.bodyBold, fontSize: 13, lineHeight: 18 },
  pendingBody: { marginTop: 4, color: MUTED, fontFamily: typography.fonts.bodyMedium, fontSize: 10.5, lineHeight: 16 },
  pendingFooter: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, borderTopWidth: 1, borderTopColor: AMBER_LINE, backgroundColor: 'rgba(255,255,255,0.45)' },
  pendingStatus: { color: AMBER, fontFamily: typography.fonts.bodyBold, fontSize: 10, textTransform: 'uppercase' },
  pendingLink: { color: NAVY, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  statusNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 22, padding: 14, borderRadius: 18, borderWidth: 1 },
  statusApproval: { borderColor: AMBER_LINE, backgroundColor: AMBER_BG },
  statusSuccess: { borderColor: GREEN_LINE, backgroundColor: GREEN_BG },
  statusIcon: { width: 30, height: 30, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  statusIconApproval: { backgroundColor: WHITE },
  statusIconSuccess: { backgroundColor: GREEN },
  statusCopy: { flex: 1, minWidth: 0 },
  statusTitle: { fontFamily: typography.fonts.bodyBold, fontSize: 12, lineHeight: 17 },
  statusTitleApproval: { color: AMBER },
  statusTitleSuccess: { color: GREEN },
  statusBody: { marginTop: 3, color: MUTED, fontFamily: typography.fonts.bodyMedium, fontSize: 10.5, lineHeight: 16 },
  scopeLine: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: LINE, backgroundColor: SUBTLE },
  scopePulse: { width: 9, height: 9, borderRadius: 5, backgroundColor: ORANGE },
  scopeText: { flex: 1, color: INK, fontFamily: typography.fonts.bodySemibold, fontSize: 11, lineHeight: 17 },
  accountSection: { marginTop: 18 },
  actionRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE },
  actionIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  actionCopy: { flex: 1, minWidth: 0 },
  actionTitle: { color: INK, fontFamily: typography.fonts.bodyBold, fontSize: 13, lineHeight: 18 },
  actionCaption: { marginTop: 3, color: '#475467', fontFamily: typography.fonts.bodyMedium, fontSize: 11.5, lineHeight: 16 },
  logoutButton: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 13 },
  logoutCopy: { flex: 1 },
  logoutTitle: { color: RUST, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  logoutCaption: { marginTop: 3, color: '#475467', fontFamily: typography.fonts.bodyMedium, fontSize: 11.5 },
  logoutConfirmMark: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', marginBottom: 18, borderRadius: 19, borderWidth: 1, borderColor: '#F4BE9E', backgroundColor: '#FFE4D4' },
  logoutSafetyList: { overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: LINE, backgroundColor: PAPER },
  logoutSafetyRow: { minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE },
  logoutSafetyText: { flex: 1, color: INK, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 17 },
  logoutConfirmButton: { minHeight: 54, flex: 1.18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 16, backgroundColor: RUST },
  logoutConfirmButtonText: { color: WHITE, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  field: { marginTop: 14 },
  fieldLabelRow: { minHeight: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 2, marginBottom: 6 },
  fieldLabel: { color: '#475467', fontFamily: typography.fonts.bodyBold, fontSize: 10.5, lineHeight: 14 },
  lockedLabel: { color: '#98A2B3', fontFamily: typography.fonts.bodyBold, fontSize: 8, letterSpacing: 1 },
  inputWrap: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, borderRadius: 15, borderWidth: 1, borderColor: LINE, backgroundColor: WHITE },
  inputFocused: { borderColor: ORANGE, borderWidth: 2, shadowColor: ORANGE, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  inputLocked: { backgroundColor: SUBTLE },
  inputError: { borderColor: ERROR_LINE, backgroundColor: ERROR_BG },
  input: { flex: 1, minHeight: 52, color: INK, fontFamily: typography.fonts.bodyMedium, fontSize: 13, paddingVertical: 0 },
  fieldError: { marginTop: 5, marginHorizontal: 2, color: ERROR, fontFamily: typography.fonts.bodyMedium, fontSize: 10, lineHeight: 15 },
  fieldHelper: { marginTop: 5, marginHorizontal: 2, color: MUTED, fontFamily: typography.fonts.bodyMedium, fontSize: 9.5, lineHeight: 14 },
  inlineError: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 14, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: ERROR_LINE, backgroundColor: ERROR_BG },
  inlineErrorText: { flex: 1, color: ERROR, fontFamily: typography.fonts.bodyMedium, fontSize: 10.5, lineHeight: 16 },
  inlineErrorAction: { color: ERROR, fontFamily: typography.fonts.bodyBold, fontSize: 10.5 },
  buttonRow: { flexDirection: 'row', gap: 9, marginTop: 22 },
  secondaryButton: { minHeight: 54, flex: 0.82, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: LINE, backgroundColor: WHITE },
  secondaryButtonText: { color: NAVY, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  submitButton: { minHeight: 54, flex: 1.18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 16, backgroundColor: NAVY },
  submitButtonText: { color: WHITE, fontFamily: typography.fonts.bodyBold, fontSize: 12, textAlign: 'center' },
  fullButton: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 22, paddingHorizontal: 15, borderRadius: 17, backgroundColor: NAVY },
  fullButtonText: { color: WHITE, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  ghostButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
  ghostButtonText: { color: MUTED, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  resendButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, borderRadius: 16, borderWidth: 1, borderColor: LINE, backgroundColor: PAPER },
  resendButtonText: { color: NAVY, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  stepRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: LINE },
  stepNumber: { width: 30, color: RUST, fontFamily: typography.fonts.bodyBold, fontSize: 10, letterSpacing: 0.8 },
  stepText: { flex: 1, color: INK, fontFamily: typography.fonts.bodySemibold, fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.82 },
  pressedFirm: { opacity: 0.93, transform: [{ scale: 0.988 }] },
  disabled: { opacity: 0.62 },
  loadingHero: { minHeight: 332, paddingHorizontal: 22, paddingBottom: 28, backgroundColor: NAVY },
  loadingHeroTitle: { maxWidth: 300, marginTop: 8, color: WHITE, fontFamily: typography.fonts.headingSemibold, fontSize: 29, lineHeight: 35 },
  loadingIdentity: { flexDirection: 'row', alignItems: 'center', gap: 15, marginTop: 35 },
  loadingAvatar: { width: 76, height: 76, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.11)' },
  loadingLines: { flex: 1, gap: 10 },
  loadingLine: { height: 11, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.15)' },
  loadingSheet: { minHeight: 360, alignItems: 'center', paddingTop: 38 },
  loadingText: { marginTop: 14, color: MUTED, fontFamily: typography.fonts.bodyMedium, fontSize: 11 },
  loadRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, paddingBottom: 60, backgroundColor: CREAM },
  loadMark: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', marginBottom: 22, borderRadius: 22, borderWidth: 1, borderColor: '#F4BE9E', backgroundColor: '#FFE4D4' },
  loadEyebrow: { color: RUST, fontFamily: typography.fonts.bodyBold, fontSize: 9.5, letterSpacing: 1.5 },
  loadTitle: { marginTop: 8, color: NAVY, fontFamily: typography.fonts.headingSemibold, fontSize: 26, lineHeight: 32, textAlign: 'center' },
  loadBody: { maxWidth: 330, marginTop: 9, color: MUTED, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 19, textAlign: 'center' },
  loadButton: { minWidth: 150, minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 23, paddingHorizontal: 20, borderRadius: 17, backgroundColor: NAVY },
  loadButtonText: { color: WHITE, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
})
