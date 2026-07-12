import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '../../api/auth'
import { b2cApi } from '../../api/b2c'
import { optionLabel, schoolBoardOptions, schoolStandardOptions, scienceExamOptions, type ScienceExam } from '../../data/authOptions'
import { useAuthStore } from '../../stores/authStore'
import { colors } from '../../theme/colors'
import { fonts } from '../../theme/fonts'
import { radius, shadows, spacing } from '../../theme/spacing'
import type { AccountMinimal, B2CProfileRead, EducationLevel } from '../../types'
import { AnimatedButton } from '../../components/ui/AnimatedButton'
import { Screen } from '../../components/ui/Screen'
import { SelectField } from '../../components/ui/SelectField'
import { TextInputField } from '../../components/ui/TextInputField'

type EditableEducationLevel = Extract<EducationLevel, 'school' | 'competitive_exams'>

type FormState = {
  firstName: string
  lastName: string
  email: string
  educationLevel: EditableEducationLevel
  schoolBoard: string
  schoolStandard: string
  scienceExams: ScienceExam[]
}

type FieldErrors = Partial<Record<'firstName' | 'lastName' | 'schoolBoard' | 'schoolStandard' | 'scienceExams', string>>

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
  return cleaned || '-'
}

function titleCase(value?: string | null) {
  return valueOrDash(value)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase())
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
    schoolStandard: educationLevel === 'school' ? profile.school_standard || profile.standard || '' : '',
    scienceExams:
      educationLevel === 'competitive_exams'
        ? scienceExamOptions.filter((option) => choices.has(option.label)).map((option) => option.value)
        : [],
  }
}

function DetailRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={16} color={colors.accentStrong} />
      </View>
      <View style={styles.detailCopy}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  )
}

type ProfileScreenProps = {
  mode?: 'profile' | 'onboarding'
}

export default function ProfileScreen({ mode = 'profile' }: ProfileScreenProps) {
  const isOnboarding = mode === 'onboarding'
  const queryClient = useQueryClient()
  const { logout, user } = useAuthStore()
  const { data: profile, isLoading } = useQuery({
    queryKey: ['b2c-profile'],
    queryFn: b2cApi.getProfile,
  })

  const [isEditing, setIsEditing] = useState(isOnboarding)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)

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
      if (isOnboarding) setIsEditing(true)
    }
  }, [isOnboarding, profile])

  const fullName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : (user?.display_name || 'Student')
  const initials = fullName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'ED'
  const trackValue =
    profile?.education_level === 'school'
      ? `${valueOrDash(profile.school_board || profile.board)} - ${valueOrDash(profile.school_standard || profile.standard)}`
      : valueOrDash(profile?.competitive_exam || profile?.board || profile?.standard || user?.b2c_target_exam)
  const subjectsValue = profile?.subjects?.length ? profile.subjects.join(', ') : '-'

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setSaveError(null)
  }

  const resetForm = () => {
    if (profile) {
      setForm(toFormState(profile))
    }
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
      if (!validate()) {
        throw new Error('validation')
      }

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
      queryClient.setQueryData(['b2c-profile'], updatedProfile)
      queryClient.invalidateQueries({ queryKey: ['b2c-profile'] })
      useAuthStore.setState({ user: refreshedUser })
      if (!isOnboarding) setIsEditing(false)
    },
    onError: (err: any) => {
      if (err?.message === 'validation') return
      const detail = err?.response?.data?.detail
      const message =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((item: any) => item.msg || JSON.stringify(item)).join('\n')
            : 'Unable to save profile.'
      setSaveError(message)
    },
  })

  const handleCancel = () => {
    resetForm()
    setIsEditing(false)
  }

  if (isLoading) {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen keyboardShouldPersistTaps="handled" contentStyle={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>{isOnboarding ? 'Welcome to Eduraa' : 'Profile'}</Text>
            <Text style={styles.title}>{isOnboarding ? 'Complete your profile' : 'Account'}</Text>
          </View>
          {!isOnboarding ? <TouchableOpacity
            activeOpacity={0.86}
            style={[styles.headerAction, isEditing && styles.headerActionActive]}
            onPress={() => {
              if (isEditing) {
                handleCancel()
              } else {
                setIsEditing(true)
              }
            }}
          >
            <Ionicons name={isEditing ? 'close' : 'create-outline'} size={19} color={isEditing ? colors.accentStrong : colors.text} />
          </TouchableOpacity> : null}
        </View>

        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.identityCopy}>
            <Text style={styles.identityName}>{isEditing ? `${form.firstName} ${form.lastName}`.trim() || fullName : fullName}</Text>
            <Text style={styles.identitySub}>{profile?.email || user?.identifier || ''}</Text>
          </View>
          <View style={[styles.statusPill, profile?.is_email_verified ? styles.statusPillSuccess : styles.statusPillNeutral]}>
            <Ionicons
              name={profile?.is_email_verified ? 'shield-checkmark-outline' : 'mail-unread-outline'}
              size={14}
              color={profile?.is_email_verified ? colors.success : colors.textMuted}
            />
            <Text style={[styles.statusText, profile?.is_email_verified ? styles.statusTextSuccess : styles.statusTextNeutral]}>
              {profile?.is_email_verified ? 'Verified' : 'Unverified'}
            </Text>
          </View>
        </View>

        {isEditing ? (
          <View style={styles.editPanel}>
            <Text style={styles.sectionLabel}>Personal information</Text>
            <View style={styles.fieldStack}>
              <TextInputField
                label="First name"
                value={form.firstName}
                onChangeText={(value) => update('firstName', value)}
                error={errors.firstName}
                autoCapitalize="words"
                placeholder="First name"
              />
              <TextInputField
                label="Last name"
                value={form.lastName}
                onChangeText={(value) => update('lastName', value)}
                error={errors.lastName}
                autoCapitalize="words"
                placeholder="Last name"
              />
              <TextInputField
                label="Email"
                value={form.email}
                editable={false}
                left={<Ionicons name="mail-outline" size={18} color={colors.textMuted} />}
              />
            </View>

            <View style={styles.sectionDivider} />

            <Text style={styles.sectionLabel}>Learning profile</Text>
            <View style={styles.segment}>
              {[
                { label: 'School', value: 'school' as const },
                { label: 'Competitive Exam', value: 'competitive_exams' as const },
              ].map((item) => {
                const active = form.educationLevel === item.value
                return (
                  <TouchableOpacity
                    key={item.value}
                    style={[styles.segmentItem, active && styles.segmentItemActive]}
                    activeOpacity={0.88}
                    onPress={() => setEducationLevel(item.value)}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{item.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {isSchoolProfile ? (
              <View style={styles.fieldStack}>
                <SelectField
                  label="Board"
                  value={form.schoolBoard}
                  options={schoolBoardOptions}
                  placeholder="Select board"
                  error={errors.schoolBoard}
                  onChange={(value) => update('schoolBoard', value)}
                />
                <SelectField
                  label="Standard"
                  value={form.schoolStandard}
                  options={schoolStandardOptions}
                  placeholder="Select standard"
                  searchable={false}
                  error={errors.schoolStandard}
                  onChange={(value) => update('schoolStandard', value)}
                />
              </View>
            ) : (
              <View style={styles.examStack}>
                {scienceExamOptions.map((option) => {
                  const active = form.scienceExams.includes(option.value)
                  return (
                    <TouchableOpacity
                      key={option.value}
                      activeOpacity={0.88}
                      style={[styles.examRow, active && styles.examRowActive]}
                      onPress={() => toggleExam(option.value)}
                    >
                      <View style={[styles.examCheck, active && styles.examCheckActive]}>
                        {active ? <Ionicons name="checkmark" size={14} color={colors.textOnBrand} /> : null}
                      </View>
                      <Text style={[styles.examText, active && styles.examTextActive]}>{option.label}</Text>
                    </TouchableOpacity>
                  )
                })}
                <Text style={[styles.examHint, errors.scienceExams && styles.errorText]}>
                  {errors.scienceExams ?? (form.scienceExams.length ? `${form.scienceExams.length} exam${form.scienceExams.length > 1 ? 's' : ''} selected` : 'Select at least one exam')}
                </Text>
              </View>
            )}

            {saveError ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={17} color={colors.danger} />
                <Text style={styles.errorBoxText}>{saveError}</Text>
              </View>
            ) : null}

            <View style={styles.editActions}>
              {!isOnboarding ? <TouchableOpacity activeOpacity={0.86} style={styles.cancelButton} onPress={handleCancel} disabled={updateMutation.isPending}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity> : null}
              <AnimatedButton
                label={isOnboarding ? 'Continue' : 'Save'}
                loading={updateMutation.isPending}
                disabled={updateMutation.isPending}
                icon={<Ionicons name="checkmark" size={18} color={colors.textOnBrand} />}
                onPress={() => updateMutation.mutate()}
                style={isOnboarding ? styles.onboardingSaveButton : styles.saveButton}
              />
            </View>
          </View>
        ) : (
          <>
            <View style={styles.detailsCard}>
              <Text style={styles.sectionLabel}>Learning profile</Text>
              <DetailRow icon="school-outline" label="Education level" value={titleCase(profile?.education_level)} />
              <DetailRow icon="reader-outline" label={profile?.education_level === 'school' ? 'Board and standard' : 'Target exam'} value={trackValue} />
              <DetailRow icon="book-outline" label="Subjects" value={subjectsValue} />
              <DetailRow icon="person-circle-outline" label="Account type" value={titleCase(profile?.auth_provider || 'password')} />
            </View>

            <TouchableOpacity activeOpacity={0.86} style={styles.signOutButton} onPress={logout}>
              <Ionicons name="log-out-outline" size={18} color={colors.danger} />
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  screen: {
    gap: spacing[4],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[4],
  },
  kicker: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontFamily: fonts.displayBold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: 0,
  },
  headerAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  headerActionActive: {
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
  },
  identityCard: {
    minHeight: 104,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundElevated,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    ...shadows.sm,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.nav,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.textOnBrand,
    fontFamily: fonts.displayBold,
    fontSize: 18,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing[1],
  },
  identityName: {
    color: colors.text,
    fontFamily: fonts.displaySemibold,
    fontSize: 18,
    lineHeight: 23,
  },
  identitySub: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 17,
  },
  statusPill: {
    minHeight: 32,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
  },
  statusPillSuccess: {
    backgroundColor: colors.successSurface,
  },
  statusPillNeutral: {
    backgroundColor: colors.backgroundMuted,
  },
  statusText: {
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  statusTextSuccess: {
    color: colors.success,
  },
  statusTextNeutral: {
    color: colors.textMuted,
  },
  detailsCard: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundElevated,
    padding: spacing[4],
    gap: spacing[3],
    ...shadows.sm,
  },
  editPanel: {
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundElevated,
    padding: spacing[4],
    gap: spacing[4],
    ...shadows.sm,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
  },
  fieldStack: {
    gap: spacing[4],
  },
  detailRow: {
    minHeight: 58,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
  },
  detailIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing[1],
  },
  detailLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  detailValue: {
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 19,
  },
  segment: {
    minHeight: 48,
    flexDirection: 'row',
    gap: spacing[1],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing[1],
  },
  segmentItem: {
    flex: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  segmentItemActive: {
    backgroundColor: colors.backgroundElevated,
    ...shadows.xs,
  },
  segmentText: {
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 13,
    textAlign: 'center',
  },
  segmentTextActive: {
    color: colors.text,
    fontFamily: fonts.bold,
  },
  examStack: {
    gap: spacing[2],
  },
  examRow: {
    minHeight: 54,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
  },
  examRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurfaceStrong,
  },
  examCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  examCheckActive: {
    borderColor: colors.accentStrong,
    backgroundColor: colors.accentStrong,
  },
  examText: {
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 14,
  },
  examTextActive: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
  },
  examHint: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
    marginTop: spacing[1],
  },
  errorText: {
    color: colors.danger,
  },
  errorBox: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerSurface,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    padding: spacing[3],
  },
  errorBoxText: {
    flex: 1,
    color: colors.danger,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  cancelButton: {
    minHeight: 56,
    flex: 0.72,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  cancelText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  saveButton: {
    flex: 1,
  },
  onboardingSaveButton: {
    flex: 1,
  },
  signOutButton: {
    minHeight: 54,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  signOutText: {
    color: colors.danger,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
})
