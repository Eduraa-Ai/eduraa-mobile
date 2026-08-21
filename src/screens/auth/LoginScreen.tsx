import React, { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { authApi } from '../../api/auth'
import AuthIntelligenceHero, { type AuthMotionState } from '../../components/auth/AuthIntelligenceHero'
import type { AuthStackParamList } from '../../navigation'
import { useAuthStore } from '../../stores/authStore'
import { typography } from '../../theme'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { getAuthHandoffDelay } from '../../components/auth/authMotionModel'

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>

const messageFromError = (error: unknown) => {
  const candidate = error as { response?: { status?: number; data?: { detail?: string } }; code?: string }
  if (candidate.code === 'ERR_NETWORK') return 'We could not reach Eduraa. Check your connection and try again.'
  if (candidate.response?.status === 401) return 'That ID or password does not match. Please try again.'
  if (typeof candidate.response?.data?.detail === 'string') return candidate.response.data.detail
  return 'Sign in is unavailable right now. Please try again.'
}

export default function LoginScreen() {
  const navigation = useNavigation<Nav>()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const reducedMotion = useReducedMotion()
  const passwordInputRef = useRef<TextInput>(null)
  const { setAuth } = useAuthStore()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [identifierError, setIdentifierError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [motionState, setMotionState] = useState<AuthMotionState>('intro')
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null)
  const [recoveryCooldown, setRecoveryCooldown] = useState(0)
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const hasFeedback = Boolean(error || recoveryMessage)
  const compact = height < 720 || keyboardVisible || hasFeedback
  const heroHeight = keyboardVisible ? 152 : compact ? 240 : Math.min(320, Math.max(280, Math.round(height * 0.35)))

  useEffect(() => {
    const timer = setTimeout(() => setMotionState((current) => current === 'intro' ? 'idle' : current), 1240)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  useEffect(() => {
    if (!recoveryMessage || recoveryCooldown <= 0) return
    const timer = setTimeout(() => setRecoveryCooldown((current) => Math.max(0, current - 1)), 1000)
    return () => clearTimeout(timer)
  }, [recoveryCooldown, recoveryMessage])

  const validate = () => {
    const missingIdentifier = identifier.trim() ? null : 'Enter your email or student ID.'
    const missingPassword = password ? null : 'Enter your password.'
    setIdentifierError(missingIdentifier)
    setPasswordError(missingPassword)
    const firstError = missingIdentifier || missingPassword
    if (firstError) AccessibilityInfo.announceForAccessibility(firstError)
    if (missingIdentifier) setMotionState('identity')
    else if (missingPassword) setMotionState('password')
    return !missingIdentifier && !missingPassword
  }

  const handleLogin = async () => {
    if (loading || !validate()) return
    setError(null)
    setLoading(true)
    setMotionState('submitting')
    try {
      const token = await authApi.login({ username: identifier.trim(), password })
      setMotionState('success')
      const handoffDelay = getAuthHandoffDelay(reducedMotion, 'login')
      if (handoffDelay) await new Promise((resolve) => setTimeout(resolve, handoffDelay))
      await setAuth(token)
    } catch (loginError) {
      const message = messageFromError(loginError)
      setError(message)
      const isOffline = message.includes('could not reach')
      setMotionState(isOffline ? 'offline' : 'error')
      AccessibilityInfo.announceForAccessibility(message)
    } finally {
      setLoading(false)
    }
  }

  const handleRecovery = async () => {
    if (loading || recoveryCooldown > 0) return
    const isResend = Boolean(recoveryMessage)
    const value = identifier.trim()
    if (!value) {
      const message = 'Enter your email or student ID first.'
      setIdentifierError(message)
      AccessibilityInfo.announceForAccessibility(message)
      return
    }
    setLoading(true)
    setError(null)
    if (!isResend) setRecoveryMessage(null)
    try {
      const message = await authApi.forgotPassword(value)
      setRecoveryMessage(message)
      setRecoveryCooldown(60)
      AccessibilityInfo.announceForAccessibility(message)
    } catch (recoveryError) {
      const message = messageFromError(recoveryError)
      setRecoveryMessage(null)
      setRecoveryCooldown(0)
      setError(message)
      AccessibilityInfo.announceForAccessibility(message)
    } finally {
      setLoading(false)
    }
  }

  const returnToIdleFrom = (expected: AuthMotionState) => {
    setMotionState((current) => current === expected ? 'idle' : current)
  }

  const returnToSignIn = () => {
    setRecoveryMode(false)
    setRecoveryMessage(null)
    setRecoveryCooldown(0)
    setError(null)
    setIdentifierError(null)
    setMotionState('idle')
  }

  const toggleRecoveryMode = () => {
    if (recoveryMode) returnToSignIn()
    else {
      setRecoveryMode(true)
      setError(null)
      setRecoveryMessage(null)
      setIdentifierError(null)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { paddingTop: insets.top }]}>
          <AuthIntelligenceHero state={motionState} compact={compact} height={heroHeight} />
        </View>

        <View style={[styles.authArea, compact && styles.authAreaCompact, { paddingBottom: Math.max(insets.bottom, 16) + 18 }]}>
          <View style={styles.content}>
            <Text style={[styles.title, compact && styles.titleCompact]}>{recoveryMode ? 'Reset access' : 'Welcome back'}</Text>
            <Text style={styles.subtitle}>{recoveryMode ? 'We will send recovery instructions to your registered email.' : 'Continue where you left off.'}</Text>

            {error ? (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Ionicons name="alert-circle-outline" size={18} color="#ff817b" />
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            ) : null}
            {recoveryMessage ? (
              <View style={styles.successBanner} accessibilityRole="alert">
                <Ionicons name="checkmark-circle-outline" size={18} color="#ffbf33" />
                <Text style={styles.successBannerText}>{recoveryMessage}</Text>
              </View>
            ) : null}

            <View style={styles.form}>
              <View>
                <View style={[styles.field, identifierError && styles.fieldError]}>
                  <Ionicons name="person-outline" size={20} color="#667085" />
                  <TextInput
                    value={identifier}
                    onChangeText={(value) => { setIdentifier(value); setIdentifierError(null); setError(null) }}
                    onFocus={() => setMotionState('identity')}
                    onBlur={() => returnToIdleFrom('identity')}
                    placeholder="Email or student ID"
                    placeholderTextColor="#77808f"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                    style={[styles.input, styles.identifierInput]}
                    accessibilityLabel="Email or student ID"
                  />
                </View>
                {identifierError ? <Text style={styles.fieldMessage}>{identifierError}</Text> : null}
              </View>

              {!recoveryMode ? <View>
                <View style={[styles.field, passwordError && styles.fieldError]}>
                  <Ionicons name="lock-closed-outline" size={19} color="#667085" />
                  <TextInput
                    ref={passwordInputRef}
                    value={password}
                    onChangeText={(value) => { setPassword(value); setPasswordError(null); setError(null) }}
                    onFocus={() => setMotionState('password')}
                    onBlur={() => returnToIdleFrom('password')}
                    placeholder="Password"
                    placeholderTextColor="#77808f"
                    secureTextEntry={!showPassword}
                    autoComplete="current-password"
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    style={styles.input}
                    accessibilityLabel="Password"
                  />
                  <Pressable
                    onPress={() => setShowPassword((current) => !current)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    accessibilityState={{ checked: showPassword }}
                    style={styles.iconButton}
                  >
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color="#667085" />
                  </Pressable>
                </View>
                {passwordError ? <Text style={styles.fieldMessage}>{passwordError}</Text> : null}
              </View> : null}

              <Pressable
                onPress={recoveryMessage ? returnToSignIn : recoveryMode ? handleRecovery : handleLogin}
                disabled={loading}
                accessibilityRole="button"
                accessibilityState={{ disabled: loading, busy: loading }}
                style={({ pressed }) => [styles.continueButton, pressed && !reducedMotion && styles.continuePressed]}
              >
                {loading && !recoveryMessage ? (
                  <>
                    <ActivityIndicator color="#101828" />
                    <Text style={styles.continueText} accessibilityLiveRegion="polite">
                      {recoveryMode ? 'Sending…' : 'Signing in…'}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.continueText}>
                      {recoveryMessage ? 'Back to sign in' : recoveryMode ? 'Send recovery email' : 'Continue'}
                    </Text>
                    <Ionicons name="arrow-forward" size={21} color="#101828" />
                  </>
                )}
              </Pressable>

              <Pressable
                onPress={recoveryMessage ? handleRecovery : toggleRecoveryMode}
                disabled={loading || Boolean(recoveryMessage && recoveryCooldown > 0)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{
                  disabled: loading || Boolean(recoveryMessage && recoveryCooldown > 0),
                  busy: Boolean(recoveryMessage && loading),
                }}
                style={styles.recoveryButton}
              >
                <Text
                  style={[styles.recoveryText, recoveryMessage && recoveryCooldown > 0 && styles.recoveryTextDisabled]}
                  accessibilityLiveRegion={recoveryMessage ? 'polite' : undefined}
                >
                  {recoveryMessage
                    ? loading
                      ? 'Sending…'
                      : recoveryCooldown > 0
                      ? `Resend available in ${recoveryCooldown}s`
                      : 'Resend recovery email'
                    : recoveryMode
                      ? 'Back to sign in'
                      : 'Forgot password?'}
                </Text>
              </Pressable>
            </View>

            {!recoveryMode ? <View style={styles.createRow}>
              <Text style={styles.createPrompt}>New to Eduraa?</Text>
              <Pressable onPress={() => navigation.navigate('Register')} hitSlop={10} accessibilityRole="link">
                <Text style={styles.createLink}>Create account</Text>
              </Pressable>
            </View> : null}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07152d' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, backgroundColor: '#07152d' },
  hero: { zIndex: 2, overflow: 'hidden', marginHorizontal: -54, paddingHorizontal: 54, backgroundColor: '#fbf6ec', borderBottomLeftRadius: 210, borderBottomRightRadius: 210 },
  authArea: { flexGrow: 1, minHeight: 454, marginTop: -2, paddingTop: 30, paddingHorizontal: 28, backgroundColor: '#07152d' },
  authAreaCompact: { paddingTop: 22, minHeight: 430 },
  content: { width: '100%', maxWidth: 310, alignSelf: 'center' },
  title: { color: '#f8fafc', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }), fontSize: 31, lineHeight: 37, letterSpacing: -0.5 },
  titleCompact: { fontSize: 27, lineHeight: 32 },
  subtitle: { marginTop: 4, color: '#aab5c6', fontFamily: typography.fonts.body, fontSize: 14, lineHeight: 20 },
  errorBanner: { marginTop: 18, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,129,123,0.38)', backgroundColor: 'rgba(255,107,107,0.10)' },
  errorBannerText: { flex: 1, color: '#ffd2cf', fontFamily: typography.fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  successBanner: { marginTop: 18, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,191,51,0.32)', backgroundColor: 'rgba(255,191,51,0.08)' },
  successBannerText: { flex: 1, color: '#f8e1ad', fontFamily: typography.fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  form: { marginTop: 21, gap: 12 },
  field: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 11, paddingLeft: 16, paddingRight: 8, borderRadius: 16, borderWidth: 1, borderColor: '#e0d6c8', backgroundColor: '#fbf6ec' },
  fieldError: { borderColor: '#ff817b', borderWidth: 1.5 },
  input: { flex: 1, minWidth: 0, minHeight: 54, paddingVertical: 0, color: '#101828', fontFamily: typography.fonts.bodyMedium, fontSize: 15 },
  identifierInput: { paddingRight: Platform.select({ web: 34, default: 0 }) },
  iconButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  fieldMessage: { marginTop: 6, marginLeft: 4, color: '#ffb0aa', fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 17 },
  continueButton: { minHeight: 56, marginTop: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 16, backgroundColor: '#f36c21', shadowColor: '#f36c21', shadowOpacity: 0.22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  continuePressed: { transform: [{ scale: 0.987 }], opacity: 0.92 },
  continueText: { color: '#101828', fontFamily: typography.fonts.bodyBold, fontSize: 16 },
  recoveryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  recoveryText: { color: '#d4dbe6', fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  recoveryTextDisabled: { color: '#7d8a9c' },
  createRow: { minHeight: 48, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  createPrompt: { color: '#aab5c6', fontFamily: typography.fonts.body, fontSize: 14 },
  createLink: { color: '#f36c21', fontFamily: typography.fonts.bodyBold, fontSize: 14 },
})
