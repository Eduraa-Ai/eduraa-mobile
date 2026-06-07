import React, { useMemo, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
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

export default function RegisterIndividualScreen() {
  const navigation = useNavigation<Nav>()
  const [form, setForm] = useState<FormState>(initialForm)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const isSchoolProfile = form.education_level === 'school'
  const selectedExamText = useMemo(
    () => form.science_exams.map((exam) => optionLabel(scienceExamOptions, exam)).filter(Boolean).join(', '),
    [form.science_exams],
  )

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const toggleExam = (exam: ScienceExam) => {
    setForm((prev) => ({
      ...prev,
      science_exams: prev.science_exams.includes(exam)
        ? prev.science_exams.filter((item) => item !== exam)
        : [...prev.science_exams, exam],
    }))
  }

  const handleRegister = async () => {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim() || !form.password.trim() || !form.confirm_password.trim()) {
      Alert.alert('Missing fields', 'Fill in all required fields to continue.')
      return
    }
    if (form.password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.')
      return
    }
    if (form.password !== form.confirm_password) {
      Alert.alert('Password mismatch', 'Passwords do not match.')
      return
    }
    if (isSchoolProfile && !form.school_board) {
      Alert.alert('Board required', 'Select your school board.')
      return
    }
    if (isSchoolProfile && !form.school_standard) {
      Alert.alert('Standard required', 'Select your standard.')
      return
    }
    if (!isSchoolProfile && form.science_exams.length === 0) {
      Alert.alert('Exam required', 'Select at least one competitive exam.')
      return
    }

    setLoading(true)
    try {
      const challenge = await authApi.registerIndividual({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
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
      Alert.alert('Registration failed', message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppScreen>
        <View style={styles.topRow}>
          <View style={styles.leftHeader}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={18} color={colors.text} />
            </TouchableOpacity>
            <AuthLogoMark size={42} />
          </View>
          <View style={styles.stepPill}>
            <Text style={styles.stepText}>Individual learner</Text>
          </View>
        </View>

        <View style={styles.heroBlock}>
          <Text style={styles.kicker}>Personal profile</Text>
          <Text style={styles.title}>Create your profile</Text>
          <Text style={styles.subtitle}>
            Set your exam goal, secure the account, then verify your email to open your learner dashboard.
          </Text>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionEyebrow}>Personal information</Text>
          <View style={styles.fieldStack}>
            <TextInputField label="First name" value={form.first_name} onChangeText={(value) => update('first_name', value)} placeholder="First" />
            <TextInputField label="Last name" value={form.last_name} onChangeText={(value) => update('last_name', value)} placeholder="Last" />
          </View>
          <TextInputField
            label="Email"
            value={form.email}
            onChangeText={(value) => update('email', value)}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            left={<Ionicons name="mail-outline" size={18} color={colors.accentStrong} />}
            placeholder="you@example.com"
          />
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionEyebrow}>Account information</Text>
          <TextInputField
            label="Password"
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
          />
          <TextInputField
            label="Confirm password"
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
          />
        </View>

        <View style={styles.formCard}>
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
              <SelectField label="Board" value={form.school_board} options={schoolBoardOptions} placeholder="Select board" onChange={(value) => update('school_board', value)} />
              <SelectField label="Standard" value={form.school_standard} options={schoolStandardOptions} placeholder="Select standard" onChange={(value) => update('school_standard', value)} searchable={false} />
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
                {form.science_exams.length ? `${form.science_exams.length} exam${form.science_exams.length > 1 ? 's' : ''} selected` : 'Select at least one exam'}
              </Text>
            </View>
          )}

          <AnimatedButton label="Create account" onPress={handleRegister} loading={loading} style={styles.cta} />
        </View>
      </AppScreen>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  stepPill: {
    borderRadius: radius.full,
    backgroundColor: colors.accentMid,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  stepText: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  heroBlock: {
    gap: spacing[1],
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundElevated,
    padding: spacing[4],
    ...shadows.sm,
  },
  kicker: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontFamily: fonts.displayBold,
    fontSize: 25,
    lineHeight: 29,
    letterSpacing: 0,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 20,
  },
  formCard: {
    gap: spacing[3],
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundElevated,
    padding: spacing[4],
    ...shadows.sm,
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
  },
})
