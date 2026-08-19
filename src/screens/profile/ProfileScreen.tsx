import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '../../api/auth'
import { b2cApi } from '../../api/b2c'
import {
  optionLabel,
  schoolBoardOptions,
  schoolStandardOptions,
  scienceExamOptions,
  type ScienceExam,
} from '../../data/authOptions'
import { useAuthStore } from '../../stores/authStore'
import type { AccountMinimal, B2CProfileRead, EducationLevel } from '../../types'
import { SelectField } from '../../components/ui/SelectField'
import { typography } from '../../theme'
import B2BProfileScreen from './B2BProfileScreen'

// ── Canonical row palette (main-html-whole-workflow.html · Competitive Profile) ──
const NAVY = '#07152d'
const CREAM = '#fbf6ec'
const ORANGE = '#f36c21'
const RUST = '#c2410c'
const INK = '#101828'
const MUTED = '#667085'
const LINE = '#e0d6c8'
const HERO_SUB = '#aab5c6'
const HERO_KICKER = '#ff8a4d'
const SUCCESS = '#26734d'
const SUCCESS_TEXT = '#17603d'
const SUCCESS_BG = '#eefaf2'
const SUCCESS_BORDER = '#bfe5ce'
const VERIFIED_DOT = '#57c284'

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' })

type EditableEducationLevel = Extract<EducationLevel, 'school' | 'competitive_exams'>
type SheetState = 'view' | 'edit' | 'security' | 'security-sent'

type FormState = {
  firstName: string
  lastName: string
  email: string
  educationLevel: EditableEducationLevel
  schoolBoard: string
  schoolStandard: string
  scienceExams: ScienceExam[]
}

type FieldErrors = Partial<
  Record<'firstName' | 'lastName' | 'schoolBoard' | 'schoolStandard' | 'scienceExams', string>
>

const emptyForm: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  educationLevel: 'competitive_exams',
  schoolBoard: '',
  schoolStandard: '',
  scienceExams: [],
}

function valueOrDash(value?: string | null) {
  const cleaned = value?.trim()
  return cleaned || '—'
}

function normalizeEducationLevel(value?: string | null): EditableEducationLevel {
  return value === 'school' ? 'school' : 'competitive_exams'
}

function splitChoiceValues(...values: Array<string | null | undefined>) {
  return values
    .flatMap((value) => String(value ?? '').split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

function toFormState(profile: B2CProfileRead): FormState {
  const educationLevel = normalizeEducationLevel(profile.education_level)
  const choices = new Set(
    splitChoiceValues(
      profile.competitive_exam,
      profile.board,
      profile.standard,
      profile.school_board,
      profile.school_standard,
    ),
  )

  return {
    firstName: profile.first_name || '',
    lastName: profile.last_name || '',
    email: profile.email || '',
    educationLevel,
    schoolBoard: educationLevel === 'school' ? profile.school_board || profile.board || '' : '',
    schoolStandard:
      educationLevel === 'school' ? profile.school_standard || profile.standard || '' : '',
    scienceExams:
      educationLevel === 'competitive_exams'
        ? scienceExamOptions.filter((option) => choices.has(option.label)).map((option) => option.value)
        : [],
  }
}

type ProfileScreenProps = {
  mode?: 'profile' | 'onboarding'
}

export default function ProfileScreen(props: ProfileScreenProps) {
  const role = useAuthStore((state) => state.user?.role)
  if (props.mode !== 'onboarding' && role && role !== 'b2c_student') {
    return <B2BProfileScreen />
  }
  return <B2CProfileScreen {...props} />
}

function B2CProfileScreen({ mode = 'profile' }: ProfileScreenProps) {
  const isOnboarding = mode === 'onboarding'
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const { logout, user } = useAuthStore()
  const accountKey = user ? `${user.role}:${user.id}` : 'signed-out'
  const { data: profile, isLoading } = useQuery({
    queryKey: ['b2c-profile', accountKey],
    queryFn: b2cApi.getProfile,
  })

  const [sheet, setSheet] = useState<SheetState>(isOnboarding ? 'edit' : 'view')
  const [justSaved, setJustSaved] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [resetError, setResetError] = useState<string | null>(null)

  const isSchoolProfile = form.educationLevel === 'school'
  const selectedExamText = useMemo(
    () => form.scienceExams.map((exam) => optionLabel(scienceExamOptions, exam)).filter(Boolean).join(', '),
    [form.scienceExams],
  )

  useEffect(() => {
    if (profile) {
      setForm(toFormState(profile))
      setErrors({})
      setSaveError(null)
      if (isOnboarding) setSheet('edit')
    }
  }, [isOnboarding, profile])

  const fullName = profile
    ? `${profile.first_name} ${profile.last_name}`.trim()
    : user?.display_name || 'Student'
  const initials =
    fullName
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'ED'
  const email = profile?.email || user?.identifier || ''
  const verified = Boolean(profile?.is_email_verified)
  const accountType =
    normalizeEducationLevel(profile?.education_level) === 'school' ? 'School learner' : 'Competitive learner'
  const memberSince = useMemo(() => {
    if (!profile?.created_at) return ''
    const date = new Date(profile.created_at)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }, [profile?.created_at])

  const targetChips = useMemo(() => {
    if (!profile) return [] as string[]
    if (normalizeEducationLevel(profile.education_level) === 'school') {
      return [profile.school_board || profile.board, profile.school_standard || profile.standard]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    }
    const raw = profile.competitive_exam || profile.board || profile.standard || user?.b2c_target_exam
    return splitChoiceValues(raw)
  }, [profile, user?.b2c_target_exam])

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setSaveError(null)
  }

  const resetForm = () => {
    if (profile) setForm(toFormState(profile))
    setErrors({})
    setSaveError(null)
  }

  const setEducationLevel = (educationLevel: EditableEducationLevel) => {
    setForm((current) => ({
      ...current,
      educationLevel,
      schoolBoard: educationLevel === 'school' ? current.schoolBoard : '',
      schoolStandard: educationLevel === 'school' ? current.schoolStandard : '',
      scienceExams: educationLevel === 'competitive_exams' ? current.scienceExams : [],
    }))
    setErrors({})
    setSaveError(null)
  }

  const toggleExam = (exam: ScienceExam) => {
    setForm((current) => ({
      ...current,
      scienceExams: current.scienceExams.includes(exam)
        ? current.scienceExams.filter((item) => item !== exam)
        : [...current.scienceExams, exam],
    }))
    setErrors((current) => ({ ...current, scienceExams: undefined }))
    setSaveError(null)
  }

  const validate = () => {
    const nextErrors: FieldErrors = {}
    if (!form.firstName.trim()) nextErrors.firstName = 'First name is required.'
    if (!form.lastName.trim()) nextErrors.lastName = 'Last name is required.'
    if (isSchoolProfile) {
      if (!form.schoolBoard.trim()) nextErrors.schoolBoard = 'Board is required.'
      if (!form.schoolStandard.trim()) nextErrors.schoolStandard = 'Standard is required.'
    } else if (!form.scienceExams.length) {
      nextErrors.scienceExams = 'Select at least one target exam.'
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setSaveError('Please review the highlighted fields.')
      return false
    }
    return true
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error('validation')

      const updatedProfile = await b2cApi.completeOnboarding({
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        education_level: form.educationLevel,
        school_name: null,
        competitive_exam: isSchoolProfile ? null : selectedExamText || null,
        school_board: isSchoolProfile ? form.schoolBoard : selectedExamText || null,
        school_standard: isSchoolProfile ? form.schoolStandard : selectedExamText || null,
        subjects: null,
      })
      let refreshedUser: AccountMinimal
      try {
        refreshedUser = await authApi.me()
      } catch {
        if (!user) throw new Error('identity_refresh_failed')
        refreshedUser = {
          ...user,
          profile_completed: updatedProfile.profile_completed,
          b2c_education_level: updatedProfile.education_level,
          b2c_board: updatedProfile.school_board || updatedProfile.board || null,
          b2c_standard: updatedProfile.school_standard || updatedProfile.standard || null,
          b2c_target_exam: updatedProfile.competitive_exam || null,
          b2c_subjects: updatedProfile.subjects || null,
          is_email_verified: updatedProfile.is_email_verified,
        }
      }
      return { updatedProfile, refreshedUser }
    },
    onSuccess: ({ updatedProfile, refreshedUser }) => {
      queryClient.setQueryData(['b2c-profile', accountKey], updatedProfile)
      queryClient.invalidateQueries({ queryKey: ['b2c-profile', accountKey] })
      useAuthStore.setState({ user: refreshedUser })
      if (!isOnboarding) {
        setJustSaved(true)
        setSheet('view')
      }
    },
    onError: (err: any) => {
      if (err?.message === 'validation') return
      const detail = err?.response?.data?.detail
      const message =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((item: any) => item.msg || JSON.stringify(item)).join('\n')
            : 'Unable to save profile. Please try again.'
      setSaveError(message)
    },
  })

  const resetMutation = useMutation({
    mutationFn: async () => {
      const identifier = (email || user?.identifier || '').trim()
      if (!identifier) throw new Error('no_email')
      return authApi.forgotPassword(identifier)
    },
    onSuccess: () => {
      setResetError(null)
      setSheet('security-sent')
    },
    onError: (err: any) => {
      if (err?.message === 'no_email') {
        setResetError('No verified email is connected to this account.')
        return
      }
      const detail = err?.response?.data?.detail
      const message =
        err?.code === 'ERR_NETWORK'
          ? 'We could not reach Eduraa. Check your connection and try again.'
          : typeof detail === 'string'
            ? detail
            : 'We could not send the reset link. Please try again.'
      setResetError(message)
    },
  })

  const openEdit = () => {
    resetForm()
    setJustSaved(false)
    setSheet('edit')
  }

  const openSecurity = () => {
    setResetError(null)
    setJustSaved(false)
    setSheet('security')
  }

  const backToView = () => {
    setSaveError(null)
    setResetError(null)
    setSheet('view')
  }

  const cancelEdit = () => {
    resetForm()
    backToView()
  }

  if (isLoading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={ORANGE} />
        <Text style={styles.loadingText}>Loading your profile</Text>
      </View>
    )
  }

  const isSecurity = sheet === 'security' || sheet === 'security-sent'
  const heroTop = insets.top + 18

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Hero ── */}
        <View style={[styles.hero, { paddingTop: heroTop }]}>
          <View style={styles.heroTop}>
            <View style={styles.heroTitleBlock}>
              <Text style={styles.heroKicker}>
                {isOnboarding ? 'Welcome to Eduraa' : isSecurity ? 'Account recovery' : accountType}
              </Text>
              <Text style={styles.heroTitle}>
                {isOnboarding
                  ? 'Set up profile'
                  : isSecurity
                    ? 'Security'
                    : sheet === 'edit'
                      ? 'Make it yours.'
                      : 'Profile'}
              </Text>
            </View>

            {!isOnboarding ? (
              <Pressable
                onPress={sheet === 'view' ? openEdit : backToView}
                accessibilityRole="button"
                accessibilityLabel={sheet === 'view' ? 'Edit profile' : 'Close'}
                hitSlop={8}
                style={({ pressed }) => [styles.heroIconButton, pressed && styles.pressedSoft]}
              >
                <Ionicons name={sheet === 'view' ? 'create-outline' : 'close'} size={19} color="#ffffff" />
              </Pressable>
            ) : null}
          </View>

          {isSecurity ? (
            <View style={styles.securityCopy}>
              <View style={styles.securitySymbol}>
                <Ionicons
                  name={sheet === 'security' ? 'shield-checkmark-outline' : 'mail-outline'}
                  size={27}
                  color={ORANGE}
                />
              </View>
              <Text style={styles.securityHeading}>
                {sheet === 'security' ? 'Reset your password.' : 'Check your inbox.'}
              </Text>
              <Text style={styles.securityBody}>
                {sheet === 'security'
                  ? 'We’ll send a secure reset link to the verified email connected to this account.'
                  : 'A secure password reset link has been sent to your verified email.'}
              </Text>
            </View>
          ) : (
            <View style={styles.identity}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <Text style={styles.identityName} numberOfLines={2}>
                {fullName}
              </Text>
              {sheet === 'edit' ? (
                <Text style={styles.identitySub}>Verified {accountType.toLowerCase()}</Text>
              ) : (
                <View style={styles.identitySubRow}>
                  {verified ? <View style={styles.verifiedDot} /> : null}
                  <Text style={styles.identitySub}>
                    {email}
                    {verified ? ' · Verified' : ''}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Contextual sheet ── */}
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 92 }]}>
          <View style={styles.grab} />

          {sheet === 'view' ? (
            <ViewSheet
              justSaved={justSaved}
              isSchool={normalizeEducationLevel(profile?.education_level) === 'school'}
              targetChips={targetChips}
              accountType={accountType}
              memberSince={memberSince}
              onEdit={openEdit}
              onSecurity={openSecurity}
              onSignOut={logout}
            />
          ) : null}

          {sheet === 'edit' ? (
            <EditSheet
              isOnboarding={isOnboarding}
              form={form}
              errors={errors}
              saveError={saveError}
              isSchool={isSchoolProfile}
              saving={updateMutation.isPending}
              onFirstName={(value) => update('firstName', value)}
              onLastName={(value) => update('lastName', value)}
              onEducationLevel={setEducationLevel}
              onToggleExam={toggleExam}
              onBoard={(value) => update('schoolBoard', value)}
              onStandard={(value) => update('schoolStandard', value)}
              onCancel={cancelEdit}
              onSave={() => updateMutation.mutate()}
            />
          ) : null}

          {sheet === 'security' ? (
            <SecuritySheet
              email={email}
              sending={resetMutation.isPending}
              error={resetError}
              onSend={() => resetMutation.mutate()}
              onCancel={backToView}
            />
          ) : null}

          {sheet === 'security-sent' ? (
            <SecuritySentSheet
              email={email}
              sending={resetMutation.isPending}
              onResend={() => resetMutation.mutate()}
              onBack={backToView}
            />
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ── Sheet: Profile view (states 01 + 03 saved) ──
function ViewSheet({
  justSaved,
  isSchool,
  targetChips,
  accountType,
  memberSince,
  onEdit,
  onSecurity,
  onSignOut,
}: {
  justSaved: boolean
  isSchool: boolean
  targetChips: string[]
  accountType: string
  memberSince: string
  onEdit: () => void
  onSecurity: () => void
  onSignOut: () => void
}) {
  return (
    <>
      {justSaved ? (
        <View style={styles.successNote}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={13} color="#ffffff" />
          </View>
          <Text style={styles.successText}>
            <Text style={styles.successStrong}>Profile updated{'\n'}</Text>
            Your learning identity and exam targets are saved.
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>{isSchool ? 'School track' : 'Competitive exams'}</Text>
      {targetChips.length ? (
        <View style={styles.targets}>
          {targetChips.map((chip) => (
            <View key={chip} style={styles.targetItem}>
              <View style={styles.targetDot} />
              <Text style={styles.targetText}>{chip}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.targetsEmpty}>No exam targets yet — add them to personalize Eduraa.</Text>
      )}

      <ActionRow
        small="Personal information"
        title="Edit name and learning profile"
        onPress={onEdit}
        accessibilityLabel="Edit name and learning profile"
      />
      <ActionRow
        small="Security"
        title="Change password"
        leading="lock-closed-outline"
        onPress={onSecurity}
        accessibilityLabel="Change password"
      />

      <Text style={[styles.sectionLabel, styles.sectionSpacer]}>Account</Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>Account type</Text>
        <Text style={styles.metaValue}>{accountType}</Text>
      </View>
      {memberSince ? (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Member since</Text>
          <Text style={styles.metaValue}>{memberSince}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={onSignOut}
        accessibilityRole="button"
        style={({ pressed }) => [styles.signOut, pressed && styles.pressedSoft]}
      >
        <Ionicons name="log-out-outline" size={18} color={RUST} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </>
  )
}

// ── Sheet: Edit profile (state 02) ──
function EditSheet({
  isOnboarding,
  form,
  errors,
  saveError,
  isSchool,
  saving,
  onFirstName,
  onLastName,
  onEducationLevel,
  onToggleExam,
  onBoard,
  onStandard,
  onCancel,
  onSave,
}: {
  isOnboarding: boolean
  form: FormState
  errors: FieldErrors
  saveError: string | null
  isSchool: boolean
  saving: boolean
  onFirstName: (value: string) => void
  onLastName: (value: string) => void
  onEducationLevel: (value: EditableEducationLevel) => void
  onToggleExam: (value: ScienceExam) => void
  onBoard: (value: string) => void
  onStandard: (value: string) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <>
      <Text style={styles.sectionLabel}>Personal information</Text>
      <Field label="First name" value={form.firstName} onChangeText={onFirstName} error={errors.firstName} autoCapitalize="words" placeholder="Your first name" />
      <Field label="Last name" value={form.lastName} onChangeText={onLastName} error={errors.lastName} autoCapitalize="words" placeholder="Your last name" />
      <Field label="Email" value={form.email} locked showLockTag />
      <Field label="Learner type" value={isSchool ? 'School learner' : 'Competitive learner'} locked showLockTag />

      <Text style={[styles.sectionLabel, styles.sectionSpacer]}>Learning profile</Text>
      <View style={styles.segment}>
        {[
          { label: 'School', value: 'school' as const },
          { label: 'Competitive exam', value: 'competitive_exams' as const },
        ].map((item) => {
          const active = form.educationLevel === item.value
          return (
            <Pressable
              key={item.value}
              onPress={() => onEducationLevel(item.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.segmentItem, active && styles.segmentItemActive]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{item.label}</Text>
            </Pressable>
          )
        })}
      </View>

      {isSchool ? (
        <View style={styles.schoolFields}>
          <SelectField
            label="Board"
            value={form.schoolBoard}
            options={schoolBoardOptions}
            placeholder="Select board"
            error={errors.schoolBoard}
            onChange={onBoard}
          />
          <SelectField
            label="Standard"
            value={form.schoolStandard}
            options={schoolStandardOptions}
            placeholder="Select standard"
            searchable={false}
            error={errors.schoolStandard}
            onChange={onStandard}
          />
        </View>
      ) : (
        <View style={styles.examList}>
          {scienceExamOptions.map((option) => {
            const active = form.scienceExams.includes(option.value)
            return (
              <Pressable
                key={option.value}
                onPress={() => onToggleExam(option.value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: active }}
                style={[styles.examRow, active && styles.examRowActive]}
              >
                <View style={[styles.examCheck, active && styles.examCheckActive]}>
                  {active ? <Ionicons name="checkmark" size={13} color="#ffffff" /> : null}
                </View>
                <Text style={styles.examText}>{option.label}</Text>
              </Pressable>
            )
          })}
          {errors.scienceExams ? <Text style={styles.inlineError}>{errors.scienceExams}</Text> : null}
        </View>
      )}

      {saveError ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={17} color="#b42318" />
          <Text style={styles.errorBoxText}>{saveError}</Text>
        </View>
      ) : null}

      <View style={isOnboarding ? styles.buttonsSingle : styles.buttons}>
        {!isOnboarding ? (
          <Pressable
            onPress={onCancel}
            disabled={saving}
            accessibilityRole="button"
            style={({ pressed }) => [styles.cancelButton, pressed && styles.pressedSoft]}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving, busy: saving }}
          style={({ pressed }) => [styles.saveButton, pressed && styles.pressedFirm, saving && styles.buttonBusy]}
        >
          {saving ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.saveText}>{isOnboarding ? 'Continue' : 'Save changes'}</Text>
          )}
        </Pressable>
      </View>
    </>
  )
}

// ── Sheet: Password reset (state 04) ──
function SecuritySheet({
  email,
  sending,
  error,
  onSend,
  onCancel,
}: {
  email: string
  sending: boolean
  error: string | null
  onSend: () => void
  onCancel: () => void
}) {
  return (
    <>
      <Text style={styles.sectionLabel}>Account access</Text>
      <Text style={styles.securitySheetTitle}>Password reset</Text>
      <Text style={styles.securitySheetBody}>
        Your learner profile and exam targets will stay unchanged.
      </Text>

      <Field label="Verified email" value={email || '—'} locked showLockTag />
      <Text style={styles.helper}>
        For your security, the reset link is sent only to this verified address.
      </Text>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={17} color="#b42318" />
          <Text style={styles.errorBoxText}>{error}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={onSend}
        disabled={sending}
        accessibilityRole="button"
        accessibilityState={{ disabled: sending, busy: sending }}
        style={({ pressed }) => [styles.resetButton, pressed && styles.pressedFirm, sending && styles.buttonBusy]}
      >
        {sending ? (
          <>
            <ActivityIndicator color="#ffffff" size="small" />
            <Text style={styles.resetText}>Sending link…</Text>
          </>
        ) : (
          <>
            <Ionicons name="paper-plane-outline" size={17} color="#ffffff" />
            <Text style={styles.resetText}>Send reset link</Text>
          </>
        )}
      </Pressable>
      <Pressable onPress={onCancel} accessibilityRole="button" style={styles.ghostButton}>
        <Text style={styles.ghostText}>Cancel</Text>
      </Pressable>
    </>
  )
}

// ── Sheet: Reset link sent (state 05) ──
function SecuritySentSheet({
  email,
  sending,
  onResend,
  onBack,
}: {
  email: string
  sending: boolean
  onResend: () => void
  onBack: () => void
}) {
  const steps = [
    { index: '01', title: 'Open the latest Eduraa email' },
    { index: '02', title: 'Choose a new secure password' },
    { index: '03', title: 'Return and sign in' },
  ]
  return (
    <>
      <View style={styles.successNote}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark" size={13} color="#ffffff" />
        </View>
        <Text style={styles.successText}>
          <Text style={styles.successStrong}>Reset link sent{'\n'}</Text>
          Check {email || 'your inbox'} and follow the secure instructions.
        </Text>
      </View>

      <Text style={styles.sectionLabel}>What happens next</Text>
      {steps.map((step) => (
        <View key={step.index} style={styles.stepRow}>
          <Text style={styles.stepIndex}>{step.index}</Text>
          <Text style={styles.stepTitle}>{step.title}</Text>
        </View>
      ))}

      <View style={styles.stepGap} />

      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        style={({ pressed }) => [styles.resetButton, pressed && styles.pressedFirm]}
      >
        <Ionicons name="arrow-back" size={17} color="#ffffff" />
        <Text style={styles.resetText}>Back to profile</Text>
      </Pressable>
      <Pressable
        onPress={onResend}
        disabled={sending}
        accessibilityRole="button"
        accessibilityState={{ disabled: sending, busy: sending }}
        style={styles.ghostButton}
      >
        <Text style={styles.ghostText}>{sending ? 'Sending…' : 'Send another link'}</Text>
      </Pressable>
    </>
  )
}

// ── Shared: action row ──
function ActionRow({
  small,
  title,
  leading,
  chevron = true,
  muted = false,
  onPress,
  accessibilityLabel,
}: {
  small: string
  title: string
  leading?: keyof typeof Ionicons.glyphMap
  chevron?: boolean
  muted?: boolean
  onPress?: () => void
  accessibilityLabel?: string
}) {
  const content = (
    <>
      {leading ? (
        <View style={styles.actionLeading}>
          <Ionicons name={leading} size={16} color={RUST} />
        </View>
      ) : null}
      <View style={styles.actionCopy}>
        <Text style={styles.actionSmall}>{small}</Text>
        <Text style={[styles.actionTitle, muted && styles.actionTitleMuted]} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {chevron ? <Ionicons name="chevron-forward" size={17} color="#9a6b4e" /> : null}
    </>
  )

  if (!onPress) {
    return <View style={styles.actionRow}>{content}</View>
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
    >
      {content}
    </Pressable>
  )
}

// ── Shared: form field ──
function Field({
  label,
  value,
  onChangeText,
  error,
  locked = false,
  showLockTag = false,
  placeholder,
  autoCapitalize,
}: {
  label: string
  value: string
  onChangeText?: (value: string) => void
  error?: string
  locked?: boolean
  showLockTag?: boolean
  placeholder?: string
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {locked && showLockTag ? <Text style={styles.lockTag}>LOCKED</Text> : null}
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={!locked}
        placeholder={placeholder}
        placeholderTextColor="#98a2b3"
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        style={[styles.fieldInput, locked && styles.fieldInputLocked, error && styles.fieldInputError]}
        accessibilityLabel={label}
      />
      {error ? <Text style={styles.inlineError}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: HERO_SUB, fontFamily: typography.fonts.bodyMedium, fontSize: 13 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, backgroundColor: CREAM },

  // Hero
  hero: {
    minHeight: 300,
    paddingHorizontal: 22,
    paddingBottom: 54,
    backgroundColor: NAVY,
    overflow: 'hidden',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  heroTitleBlock: { flex: 1, minWidth: 0 },
  heroKicker: {
    color: HERO_KICKER,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  heroTitle: {
    marginTop: 3,
    color: '#ffffff',
    fontFamily: serif,
    fontSize: 29,
    lineHeight: 34,
  },
  heroIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },

  identity: { alignItems: 'center', zIndex: 2 },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    marginTop: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ORANGE,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.82)',
  },
  avatarText: { color: NAVY, fontFamily: serif, fontSize: 24, fontWeight: '600' },
  identityName: {
    marginTop: 12,
    maxWidth: 300,
    textAlign: 'center',
    color: '#ffffff',
    fontFamily: serif,
    fontSize: 25,
    fontWeight: '600',
  },
  identitySubRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  verifiedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: VERIFIED_DOT },
  identitySub: { color: HERO_SUB, fontFamily: typography.fonts.body, fontSize: 11, textAlign: 'center' },

  securityCopy: { alignItems: 'center', marginTop: 8, zIndex: 2 },
  securitySymbol: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  securityHeading: { marginTop: 16, color: '#ffffff', fontFamily: serif, fontSize: 24, fontWeight: '600', textAlign: 'center' },
  securityBody: {
    marginTop: 8,
    maxWidth: 300,
    color: HERO_SUB,
    fontFamily: typography.fonts.body,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },

  // Sheet
  sheet: {
    marginTop: -30,
    paddingHorizontal: 22,
    paddingTop: 12,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: CREAM,
    flexGrow: 1,
  },
  grab: { width: 38, height: 4, borderRadius: 999, backgroundColor: '#c7b7a3', alignSelf: 'center', marginBottom: 18 },

  sectionLabel: {
    color: RUST,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionSpacer: { marginTop: 20 },

  targets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 20,
    rowGap: 8,
    marginTop: 12,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  targetItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  targetDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ORANGE },
  targetText: { color: INK, fontFamily: serif, fontSize: 16, fontWeight: '600' },
  targetsEmpty: {
    marginTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    color: MUTED,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
  },

  actionRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  actionRowPressed: { opacity: 0.6 },
  actionLeading: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff0e5',
  },
  actionCopy: { flex: 1, minWidth: 0 },
  actionSmall: { color: MUTED, fontFamily: typography.fonts.bodyMedium, fontSize: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  actionTitle: { marginTop: 4, color: INK, fontFamily: typography.fonts.bodySemibold, fontSize: 12 },
  actionTitleMuted: { color: '#475467', fontFamily: typography.fonts.bodyMedium },

  metaRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  metaLabel: { color: MUTED, fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  metaValue: { color: INK, fontFamily: typography.fonts.bodySemibold, fontSize: 12 },

  stepRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  stepIndex: { width: 26, color: RUST, fontFamily: typography.fonts.bodyBold, fontSize: 13, letterSpacing: 0.5 },
  stepTitle: { flex: 1, color: INK, fontFamily: typography.fonts.bodySemibold, fontSize: 13 },
  stepGap: { height: 22 },

  signOut: {
    minHeight: 52,
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#ffffff',
  },
  signOutText: { color: RUST, fontFamily: typography.fonts.bodyBold, fontSize: 13 },

  // Fields
  field: { marginTop: 13 },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 2, marginBottom: 6 },
  fieldLabel: { color: '#475467', fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  lockTag: { color: '#98a2b3', fontFamily: typography.fonts.bodyBold, fontSize: 8, letterSpacing: 0.6 },
  fieldInput: {
    minHeight: 50,
    paddingHorizontal: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#ffffff',
    color: INK,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
  },
  fieldInputLocked: { color: '#5c6270', backgroundColor: '#f1ebe2', borderColor: '#d6cabc' },
  fieldInputError: { borderColor: '#f04438' },
  inlineError: { marginTop: 6, marginLeft: 2, color: '#b42318', fontFamily: typography.fonts.bodyMedium, fontSize: 11 },

  segment: {
    minHeight: 52,
    flexDirection: 'row',
    gap: 4,
    marginTop: 13,
    padding: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#f0e8dd',
  },
  segmentItem: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentItemActive: { backgroundColor: NAVY },
  segmentText: { color: MUTED, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  segmentTextActive: { color: '#ffffff' },

  examList: { gap: 7, marginTop: 10 },
  examRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#ffffff',
  },
  examRowActive: { borderColor: ORANGE, backgroundColor: '#fff7f1' },
  examCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#c7b7a3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  examCheckActive: { borderColor: ORANGE, backgroundColor: ORANGE },
  examText: { color: INK, fontFamily: typography.fonts.bodyBold, fontSize: 11 },

  schoolFields: { gap: 14, marginTop: 12 },

  errorBox: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  errorBoxText: { flex: 1, color: '#b42318', fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 17 },

  buttons: { flexDirection: 'row', gap: 9, marginTop: 18 },
  buttonsSingle: { marginTop: 18 },
  cancelButton: {
    flex: 0.8,
    minHeight: 52,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: NAVY, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  saveButton: {
    flex: 1.2,
    minHeight: 52,
    borderRadius: 15,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: NAVY,
    shadowOpacity: 0.18,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
  },
  saveText: { color: '#ffffff', fontFamily: typography.fonts.bodyBold, fontSize: 12 },

  securitySheetTitle: { marginTop: 7, color: INK, fontFamily: serif, fontSize: 22, fontWeight: '600' },
  securitySheetBody: { marginTop: 4, color: MUTED, fontFamily: typography.fonts.body, fontSize: 11, lineHeight: 16 },
  helper: { marginTop: 10, marginHorizontal: 2, color: MUTED, fontFamily: typography.fonts.body, fontSize: 10, lineHeight: 15 },

  resetButton: {
    minHeight: 54,
    marginTop: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 16,
    backgroundColor: NAVY,
    shadowColor: NAVY,
    shadowOpacity: 0.2,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
  },
  resetText: { color: '#ffffff', fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  ghostButton: { minHeight: 46, marginTop: 6, alignItems: 'center', justifyContent: 'center' },
  ghostText: { color: MUTED, fontFamily: typography.fonts.bodyMedium, fontSize: 11 },

  successNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginBottom: 16,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SUCCESS_BORDER,
    backgroundColor: SUCCESS_BG,
  },
  successIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: SUCCESS },
  successText: { flex: 1, color: SUCCESS_TEXT, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 16 },
  successStrong: { fontFamily: typography.fonts.bodyBold },

  pressedSoft: { opacity: 0.85 },
  pressedFirm: { transform: [{ scale: 0.985 }], opacity: 0.94 },
  buttonBusy: { opacity: 0.8 },
})
