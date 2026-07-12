import React, { useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation'
import { authApi } from '../../api/auth'
import { colors, radius, shadows, spacing } from '../../theme'
import { fonts } from '../../theme/fonts'
import type { EducationLevel } from '../../types'
import { optionLabel, schoolBoardOptions, schoolStandardOptions, scienceExamOptions, type ScienceExam } from '../../data/authOptions'
import { AnimatedButton, AppScreen, AuthLogoMark, TextInputField } from '../../components/ui'
import { SelectField } from '../../components/ui/SelectField'

type Nav = NativeStackNavigationProp<AuthStackParamList, 'RegisterIndividual'>

type FormState = {
  first_name: string
  last_name: string
  email: string
  password: string
  confirm_password: string
  education_level: Extract<EducationLevel, 'school' | 'competitive_exams'>
  school_board: string
  school_standard: string
  science_exams: ScienceExam[]
}

type FormErrors = Partial<Record<keyof FormState | 'submit', string>>

const initialForm: FormState = {
  first_name: '',
  last_name: '',
  email: '',
  password: '',
  confirm_password: '',
  education_level: 'competitive_exams',
  school_board: '',
  school_standard: '',
  science_exams: [],
}

const hasSpecialCharacter = (value: string) => /[^A-Za-z0-9\s]/.test(value)

function PasswordRequirement({ met, label }: { met: boolean; label: string }) {
  return (
    <View style={styles.passwordRequirement}>
      <View style={[styles.requirementIcon, met && styles.requirementIconMet]}>
        <Ionicons name={met ? 'checkmark' : 'ellipse'} size={met ? 12 : 6} color={met ? colors.textOnBrand : colors.textSubtle} />
      </View>
      <Text style={[styles.requirementText, met && styles.requirementTextMet]}>{label}</Text>
    </View>
  )
}

export default function RegisterIndividualScreen() {
  const navigation = useNavigation<Nav>()
  const [form, setForm] = useState<FormState>(initialForm)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})

  const isSchoolProfile = form.education_level === 'school'
  const selectedExamText = useMemo(
    () => form.science_exams.map((exam) => optionLabel(scienceExamOptions, exam)).filter(Boolean).join(', '),
    [form.science_exams],
  )

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined, submit: undefined }))
  }

  const toggleExam = (exam: ScienceExam) => {
    setErrors((prev) => ({ ...prev, science_exams: undefined, submit: undefined }))
    setForm((prev) => ({
      ...prev,
      science_exams: prev.science_exams.includes(exam)
        ? prev.science_exams.filter((item) => item !== exam)
        : [...prev.science_exams, exam],
    }))
  }

  const handleRegister = async () => {
    if (loading) return
    const nextErrors: FormErrors = {}
    if (!form.first_name.trim()) nextErrors.first_name = 'Enter your first name.'
    if (!form.last_name.trim()) nextErrors.last_name = 'Enter your last name.'
    if (!form.email.trim()) nextErrors.email = 'Enter your email address.'
    else if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) nextErrors.email = 'Enter a valid email address.'
    if (!form.password) nextErrors.password = 'Create a password.'
    else if (form.password.length < 8) nextErrors.password = 'Use at least 8 characters.'
    else if (!hasSpecialCharacter(form.password)) nextErrors.password = 'Add at least one special character.'
    if (!form.confirm_password) nextErrors.confirm_password = 'Confirm your password.'
    else if (form.password !== form.confirm_password) nextErrors.confirm_password = 'The passwords do not match.'
    if (isSchoolProfile && !form.school_board) nextErrors.school_board = 'Choose your school board.'
    if (isSchoolProfile && !form.school_standard) nextErrors.school_standard = 'Choose your standard.'
    if (!isSchoolProfile && form.science_exams.length === 0) nextErrors.science_exams = 'Choose at least one exam goal.'
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      return
    }

    setLoading(true)
    try {
      const challenge = await authApi.registerIndividual({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        confirm_password: form.confirm_password,
        education_level: form.education_level,
        school_name: null,
        competitive_exam: isSchoolProfile ? null : selectedExamText || null,
        school_board: isSchoolProfile ? form.school_board : selectedExamText || null,
        school_standard: isSchoolProfile ? form.school_standard : selectedExamText || null,
        subjects: null,
      })

      navigation.navigate('VerifyEmail', {
        email: challenge.email,
        devOtp: challenge.dev_otp ?? undefined,
        message: challenge.message,
        deliveryChannel: challenge.delivery_channel,
      })
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      const message =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((item: any) => item.msg || JSON.stringify(item)).join('\n')
            : 'Registration failed. Please try again.'
      setErrors({ submit: message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppScreen tone="auth" contentStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <View style={styles.leftHeader}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={18} color={colors.text} />
            </TouchableOpacity>
            <AuthLogoMark size={42} />
            <View>
              <Text style={styles.brandName}>Eduraa AI</Text>
              <Text style={styles.brandContext}>Individual learner</Text>
            </View>
          </View>
        </View>

        <View style={styles.identityIntro}>
          <Text style={styles.kicker}>Individual learner</Text>
          <Text style={styles.title}>Create your learning space.</Text>
          <Text style={styles.subtitle}>Tell us where you are headed. You can change your goals anytime.</Text>
          <View style={styles.intelligenceCue}>
            <View style={styles.cueIcon}><Ionicons name="sparkles" size={15} color="#ffffff" /></View>
            <Text style={styles.cueText}>Your goal shapes what Eduraa recommends first.</Text>
          </View>
        </View>

        {errors.submit ? (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Ionicons name="alert-circle-outline" size={19} color="#c2410c" />
            <View style={styles.errorBannerCopy}>
              <Text style={styles.errorBannerTitle}>We couldn’t create your account</Text>
              <Text style={styles.errorBannerText}>{errors.submit}</Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.formCard, styles.identityCard]}>
          <View style={[styles.sectionMarker, styles.sectionMarkerActive]}><Text style={styles.sectionMarkerText}>1</Text></View>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionEyebrow}>Personal information</Text>
              <Text style={styles.sectionTitle}>A little about you</Text>
            </View>
          </View>
          <View style={styles.fieldStack}>
            <TextInputField label="First name" error={errors.first_name} value={form.first_name} onChangeText={(value) => update('first_name', value)} placeholder="Your first name" autoComplete="given-name" textContentType="givenName" />
            <TextInputField label="Last name" error={errors.last_name} value={form.last_name} onChangeText={(value) => update('last_name', value)} placeholder="Your last name" autoComplete="family-name" textContentType="familyName" />
          </View>
          <TextInputField
            label="Email address"
            error={errors.email}
            value={form.email}
            onChangeText={(value) => update('email', value)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            left={<Ionicons name="mail-outline" size={18} color={colors.accentStrong} />}
            placeholder="you@example.com"
            autoComplete="email"
            textContentType="emailAddress"
          />
          <View style={styles.identityNote}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.accentStrong} />
            <Text style={styles.identityNoteText}>We’ll send a verification code to this email.</Text>
          </View>
        </View>

        <View style={styles.formCard}>
          <View style={styles.sectionMarker}><Text style={styles.sectionMarkerText}>2</Text></View>
          <Text style={styles.sectionEyebrow}>Account information</Text>
          <TextInputField
            label="Password"
            error={errors.password}
            value={form.password}
            onChangeText={(value) => update('password', value)}
            secureTextEntry={!showPassword}
            left={<Ionicons name="lock-closed-outline" size={18} color={colors.accentStrong} />}
            right={(
              <TouchableOpacity onPress={() => setShowPassword((value) => !value)} hitSlop={8}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
            placeholder="Minimum 8 characters"
            autoComplete="new-password"
            textContentType="newPassword"
          />
          {form.password.length > 0 || form.confirm_password.length > 0 ? (
            <View style={styles.passwordGuide}>
              <View style={styles.passwordGuideHeader}>
                <Text style={styles.passwordGuideTitle}>Password guide</Text>
                <Text style={styles.passwordStrength}>
                  {form.password.length >= 8 && hasSpecialCharacter(form.password) && form.password === form.confirm_password
                    ? 'Ready'
                    : 'Keep going'}
                </Text>
              </View>
              <PasswordRequirement met={form.password.length >= 8} label="At least 8 characters long" />
              <PasswordRequirement met={hasSpecialCharacter(form.password)} label="Includes a special character" />
              <PasswordRequirement
                met={form.confirm_password.length > 0 && form.password === form.confirm_password}
                label="Passwords match"
              />
            </View>
          ) : null}
          <TextInputField
            label="Confirm password"
            error={errors.confirm_password}
            value={form.confirm_password}
            onChangeText={(value) => update('confirm_password', value)}
            secureTextEntry={!showConfirmPassword}
            left={<Ionicons name="checkmark-circle-outline" size={18} color={colors.accentStrong} />}
            right={(
              <TouchableOpacity onPress={() => setShowConfirmPassword((value) => !value)} hitSlop={8}>
                <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
            placeholder="Repeat your password"
            autoComplete="new-password"
            textContentType="newPassword"
          />
        </View>

        <View style={styles.formCard}>
          <View style={styles.sectionMarker}><Text style={styles.sectionMarkerText}>3</Text></View>
          <Text style={styles.sectionEyebrow}>Education profile</Text>
          <View style={styles.segment}>
            {[
              { label: 'School', value: 'school' as const },
              { label: 'Competitive Exam', value: 'competitive_exams' as const },
            ].map((item) => {
              const active = form.education_level === item.value
              return (
                <TouchableOpacity
                  key={item.value}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                  onPress={() => {
                    setForm((prev) => ({
                      ...prev,
                      education_level: item.value,
                      school_board: item.value === 'school' ? prev.school_board : '',
                      school_standard: item.value === 'school' ? prev.school_standard : '',
                      science_exams: item.value === 'competitive_exams' ? prev.science_exams : [],
                    }))
                  }}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{item.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {isSchoolProfile ? (
            <View style={styles.fieldStack}>
              <SelectField label="Board" error={errors.school_board} value={form.school_board} options={schoolBoardOptions} placeholder="Select board" onChange={(value) => update('school_board', value)} />
              <SelectField label="Standard" error={errors.school_standard} value={form.school_standard} options={schoolStandardOptions} placeholder="Select standard" onChange={(value) => update('school_standard', value)} searchable={false} />
            </View>
          ) : (
            <View style={styles.examStack}>
              {scienceExamOptions.map((option) => {
                const active = form.science_exams.includes(option.value)
                return (
                  <TouchableOpacity key={option.value} activeOpacity={0.88} style={[styles.examRow, active && styles.examRowActive]} onPress={() => toggleExam(option.value)}>
                    <View style={[styles.examCheck, active && styles.examCheckActive]}>
                      {active ? <Ionicons name="checkmark" size={14} color={colors.textOnBrand} /> : null}
                    </View>
                    <Text style={[styles.examText, active && styles.examTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                )
              })}
              <Text style={styles.examHint}>
                {errors.science_exams ?? (form.science_exams.length ? `${form.science_exams.length} exam${form.science_exams.length > 1 ? 's' : ''} selected` : 'Select at least one exam')}
              </Text>
            </View>
          )}

          <AnimatedButton label="Create account" onPress={handleRegister} loading={loading} variant="auth" style={styles.cta} />
        </View>
      </AppScreen>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screen: {
    gap: spacing[4],
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  brandName: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  brandContext: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
    marginTop: 1,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  stepPill: {
    borderRadius: radius.full,
    backgroundColor: '#fff0e5',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  stepText: {
    color: '#c2410c',
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  identityIntro: {
    gap: spacing[1],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
  },
  kicker: {
    color: '#c2410c',
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#07152d',
    fontFamily: fonts.displayBold,
    fontSize: 28,
    lineHeight: 33,
    letterSpacing: -0.45,
  },
  subtitle: {
    color: '#667085',
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 20,
  },
  intelligenceCue: {
    marginTop: spacing[3],
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: '#07152d',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    overflow: 'hidden',
  },
  cueIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f36c21',
  },
  cueText: {
    flex: 1,
    color: '#d9e2ee',
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 17,
  },
  formCard: {
    position: 'relative',
    gap: spacing[3],
    marginLeft: spacing[2],
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(7,21,45,0.16)',
    paddingLeft: spacing[5],
    paddingTop: spacing[4],
    paddingBottom: spacing[1],
  },
  identityCard: {
    borderTopWidth: 0,
    paddingTop: spacing[2],
  },
  sectionMarker: {
    position: 'absolute',
    left: -13,
    top: 14,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#fbf6ec',
    backgroundColor: '#07152d',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#07152d',
    shadowOpacity: 0.15,
    shadowRadius: 7,
  },
  sectionMarkerActive: { backgroundColor: '#f36c21' },
  sectionMarkerText: { color: '#ffffff', fontFamily: fonts.bold, fontSize: 11 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.displaySemibold,
    fontSize: 19,
    marginTop: spacing[1],
  },
  identityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    paddingHorizontal: spacing[1],
  },
  identityNoteText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 17,
  },
  sectionEyebrow: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
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
  fieldStack: {
    gap: spacing[4],
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
  cta: {
    marginTop: spacing[2],
    marginBottom: spacing[5],
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#fed7aa',
    backgroundColor: '#fff7ed',
    padding: spacing[4],
  },
  errorBannerCopy: { flex: 1, gap: 2 },
  errorBannerTitle: { color: '#9a3412', fontFamily: fonts.bold, fontSize: 13 },
  errorBannerText: { color: '#7c2d12', fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  passwordGuide: {
    gap: spacing[2],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.background,
    padding: spacing[3],
  },
  passwordGuideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passwordGuideTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  passwordStrength: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  passwordRequirement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  requirementIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requirementIconMet: {
    borderColor: colors.accentStrong,
    backgroundColor: colors.accentStrong,
  },
  requirementText: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  requirementTextMet: {
    color: colors.text,
  },
})
