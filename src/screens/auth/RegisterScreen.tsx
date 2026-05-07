/**
 * Register Screen — B2C Individual Learner
 */

import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Animated,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { AuthStackParamList } from '../../navigation'
import { authApi } from '../../api/auth'
import { useAuthStore } from '../../stores/authStore'
import { colors } from '../../theme/colors'
import { radius, spacing, shadows } from '../../theme/spacing'
import { fonts } from '../../theme/fonts'
import type { EducationLevel } from '../../types'

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Register'>

const EDUCATION_OPTIONS: { label: string; sublabel: string; value: EducationLevel; icon: string }[] = [
  { label: 'JEE / NEET', sublabel: 'Competitive exams', value: 'competitive_exams', icon: '🎯' },
]

export default function RegisterScreen() {
  const navigation = useNavigation<Nav>()
  useAuthStore()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [educationLevel, setEducationLevel] = useState<EducationLevel>('competitive_exams')
  const [standard, setStandard] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  const firstNameRef = useRef<TextInput>(null)
  const lastNameRef = useRef<TextInput>(null)
  const emailRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)
  const confirmPasswordRef = useRef<TextInput>(null)
  const standardRef = useRef<TextInput>(null)

  // Entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(20)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start()
  }, [fadeAnim, slideAnim])

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please fill in all required fields.')
      return
    }
    if (password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      Alert.alert('Password mismatch', 'Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const challenge = await authApi.registerIndividual({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        password,
        confirm_password: confirmPassword,
        education_level: educationLevel,
        school_standard: standard.trim() || undefined,
        competitive_exam: 'JEE',
        exam_stream: 'JEE',
      })
      navigation.navigate('VerifyEmail', {
        email: challenge.email,
        devOtp: challenge.dev_otp ?? undefined,
      })
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      const status = err?.response?.status
      let message: string
      if (typeof detail === 'string') {
        message = detail
      } else if (Array.isArray(detail)) {
        message = detail.map((d: any) => d.msg || JSON.stringify(d)).join('\n')
      } else if (!err?.response) {
        message = 'Network error — could not reach the server.'
      } else {
        message = `Error ${status}: ${JSON.stringify(err?.response?.data)}`
      }
      Alert.alert('Registration failed', message)
    } finally {
      setLoading(false)
    }
  }

  const isSmall = width < 380
  const hPad = isSmall ? spacing[4] : spacing[5]

  const inputStyle = (field: string) => [
    styles.inputWrap,
    focusedField === field && styles.inputWrapFocused,
  ]

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: hPad, paddingTop: insets.top + 16 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={20} color={colors.ink} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Create account</Text>
              <Text style={styles.subtitle}>Join Eduraa and start practising</Text>
            </View>
          </View>

          {/* Form Card */}
          <View style={[styles.card, shadows.sm]}>

            {/* Name row */}
            <View style={styles.row}>
              <View style={[styles.field, { flex: 1, marginRight: spacing[2] }]}>
                <Text style={styles.label}>First name</Text>
                <TouchableOpacity style={inputStyle('firstName')} onPress={() => firstNameRef.current?.focus()} activeOpacity={1}>
                  <TextInput
                    ref={firstNameRef}
                    style={[styles.input, { flex: 1 }]}
                    placeholder="First"
                    placeholderTextColor={colors.placeholder}
                    value={firstName}
                    onChangeText={setFirstName}
                    autoCapitalize="words"
                    onFocus={() => setFocusedField('firstName')}
                    onBlur={() => setFocusedField(null)}
                    returnKeyType="next"
                    onSubmitEditing={() => lastNameRef.current?.focus()}
                  />
                </TouchableOpacity>
              </View>
              <View style={[styles.field, { flex: 1 }]}>
                <Text style={styles.label}>Last name</Text>
                <TouchableOpacity style={inputStyle('lastName')} onPress={() => lastNameRef.current?.focus()} activeOpacity={1}>
                  <TextInput
                    ref={lastNameRef}
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Last"
                    placeholderTextColor={colors.placeholder}
                    value={lastName}
                    onChangeText={setLastName}
                    autoCapitalize="words"
                    onFocus={() => setFocusedField('lastName')}
                    onBlur={() => setFocusedField(null)}
                    returnKeyType="next"
                    onSubmitEditing={() => emailRef.current?.focus()}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Email */}
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TouchableOpacity style={inputStyle('email')} onPress={() => emailRef.current?.focus()} activeOpacity={1}>
                <Ionicons name="mail-outline" size={16} color={focusedField === 'email' ? colors.accent : colors.subtle} style={styles.fieldIcon} />
                <TextInput
                  ref={emailRef}
                  style={[styles.input, { flex: 1 }]}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.placeholder}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
              </TouchableOpacity>
            </View>

            {/* Password */}
            <View style={styles.field}>
              <Text style={styles.label}>Password <Text style={styles.hint}>(min 8 characters)</Text></Text>
              <TouchableOpacity style={inputStyle('password')} onPress={() => passwordRef.current?.focus()} activeOpacity={1}>
                <Ionicons name="lock-closed-outline" size={16} color={focusedField === 'password' ? colors.accent : colors.subtle} style={styles.fieldIcon} />
                <TextInput
                  ref={passwordRef}
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Create a password"
                  placeholderTextColor={colors.placeholder}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                />
                <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.subtle} />
                </TouchableOpacity>
              </TouchableOpacity>
            </View>

            {/* Confirm Password */}
            <View style={styles.field}>
              <Text style={styles.label}>Confirm password</Text>
              <TouchableOpacity style={inputStyle('confirmPassword')} onPress={() => confirmPasswordRef.current?.focus()} activeOpacity={1}>
                <Ionicons name="lock-closed-outline" size={16} color={focusedField === 'confirmPassword' ? colors.accent : colors.subtle} style={styles.fieldIcon} />
                <TextInput
                  ref={confirmPasswordRef}
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Repeat your password"
                  placeholderTextColor={colors.placeholder}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  onFocus={() => setFocusedField('confirmPassword')}
                  onBlur={() => setFocusedField(null)}
                  returnKeyType="next"
                  onSubmitEditing={() => standardRef.current?.focus()}
                />
              </TouchableOpacity>
            </View>

            {/* Education Level */}
            <View style={styles.field}>
              <Text style={styles.label}>I'm preparing for</Text>
              <View style={styles.educationGrid}>
                {EDUCATION_OPTIONS.map((opt) => {
                  const active = educationLevel === opt.value
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.eduCard, active && styles.eduCardActive]}
                      onPress={() => setEducationLevel(opt.value)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.eduIcon}>{opt.icon}</Text>
                      <Text style={[styles.eduLabel, active && styles.eduLabelActive]}>{opt.label}</Text>
                      <Text style={[styles.eduSub, active && styles.eduSubActive]}>{opt.sublabel}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            {/* Class */}
            <View style={styles.field}>
              <Text style={styles.label}>Class / Standard <Text style={styles.optional}>(optional)</Text></Text>
              <TouchableOpacity style={inputStyle('standard')} onPress={() => standardRef.current?.focus()} activeOpacity={1}>
                <Ionicons name="school-outline" size={16} color={focusedField === 'standard' ? colors.accent : colors.subtle} style={styles.fieldIcon} />
                <TextInput
                  ref={standardRef}
                  style={[styles.input, { flex: 1 }]}
                  placeholder="e.g. 11 or 12"
                  placeholderTextColor={colors.placeholder}
                  value={standard}
                  onChangeText={setStandard}
                  keyboardType="numeric"
                  onFocus={() => setFocusedField('standard')}
                  onBlur={() => setFocusedField(null)}
                  returnKeyType="done"
                />
              </TouchableOpacity>
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.82}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.buttonText}>Create Account</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.loginLink} onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLinkText}>
                Already have an account?{'  '}
                <Text style={styles.loginLinkAccent}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface1 },
  scroll: { flexGrow: 1, paddingBottom: 32 },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    marginBottom: spacing[5],
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    fontFamily: fonts.displayBold,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginTop: 3,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius['2xl'],
    padding: spacing[5],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },

  row: { flexDirection: 'row' },
  field: { marginBottom: spacing[4] },
  label: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.semibold,
    color: colors.ink,
    marginBottom: 6,
    letterSpacing: 0.1,
  },
  hint: { color: colors.subtle, fontWeight: '400', fontFamily: fonts.regular },
  optional: { color: colors.subtle, fontWeight: '400', fontFamily: fonts.regular },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing[3],
  },
  inputWrapFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.card,
  },
  fieldIcon: { marginRight: spacing[2] },
  input: {
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.ink,
    paddingVertical: 0,
  },

  educationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: 4,
  },
  eduCard: {
    width: '47.5%',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    padding: spacing[3],
    alignItems: 'flex-start',
    gap: 2,
  },
  eduCardActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
  },
  eduIcon: { fontSize: 18, marginBottom: 2 },
  eduLabel: { fontSize: 12, fontWeight: '700', fontFamily: fonts.bold, color: colors.ink },
  eduLabelActive: { color: colors.accentStrong },
  eduSub: { fontSize: 10, fontFamily: fonts.regular, color: colors.muted },
  eduSubActive: { color: colors.accent },

  button: {
    height: 52,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[2],
  },
  buttonDisabled: { opacity: 0.65 },
  buttonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.bold,
    letterSpacing: 0.2,
  },

  loginLink: {
    marginTop: spacing[4],
    alignItems: 'center',
    paddingVertical: spacing[1],
  },
  loginLinkText: { fontSize: 14, fontFamily: fonts.regular, color: colors.muted },
  loginLinkAccent: { color: colors.accent, fontWeight: '700', fontFamily: fonts.bold },
})
