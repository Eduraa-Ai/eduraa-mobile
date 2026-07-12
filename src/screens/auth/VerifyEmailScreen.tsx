import React, { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { authApi } from '../../api/auth'
import { AnimatedButton, AppScreen, AuthLogoMark } from '../../components/ui'
import type { AuthStackParamList } from '../../navigation'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'

type Nav = NativeStackNavigationProp<AuthStackParamList, 'VerifyEmail'>
type Route = RouteProp<AuthStackParamList, 'VerifyEmail'>

export default function VerifyEmailScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const { setAuth } = useAuthStore()
  const { email, devOtp, message, deliveryChannel } = route.params

  const [otp, setOtp] = useState(devOtp ?? '')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  const startCountdown = () => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    setCountdown(60)
    countdownRef.current = setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current)
          return 0
        }
        return value - 1
      })
    }, 1000)
  }

  const handleVerify = async () => {
    if (loading) return
    if (!otp.trim()) {
      setError('Enter the verification code from your email.')
      return
    }

    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      const authToken = await authApi.verifyEmailOtp(email, otp.trim())
      await setAuth(authToken)
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'That code is invalid or has expired. Request a fresh one and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (countdown > 0 || resending) return
    setError(null)
    setNotice(null)
    setResending(true)
    try {
      const challenge = await authApi.resendEmailOtp(email)
      if (challenge.dev_otp) setOtp(challenge.dev_otp)
      startCountdown()
      setNotice(challenge.delivery_channel === 'console'
        ? 'A fresh development code is ready below.'
        : 'A fresh code is on its way. Only the newest code will work.')
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'We could not resend the code. Check your connection and try again.')
    } finally {
      setResending(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppScreen tone="auth" contentStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <View style={styles.leftHeader}>
            <Pressable style={({ pressed }) => [styles.backButton, pressed && styles.pressed]} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={18} color={colors.text} />
            </Pressable>
            <AuthLogoMark size={42} />
            <View>
              <Text style={styles.brandName}>Eduraa AI</Text>
              <Text style={styles.brandContext}>Secure verification</Text>
            </View>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIcon}><Ionicons name="mail-unread-outline" size={22} color="#f36c21" /></View>
          <Text style={styles.heroEyebrow}>Almost there</Text>
          <Text style={styles.heroTitle}>Check your inbox.</Text>
          <Text style={styles.heroSubtitle}>{deliveryChannel === 'console' ? 'Use the development code below to verify this account.' : `We sent a secure code to ${email}.`}</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEyebrow}>Verification code</Text>
            <Text style={styles.cardTitle}>Enter your code</Text>
            <Text style={styles.cardSubtitle}>{message || 'Use the latest code from your email. Resending will replace the previous code.'}</Text>
          </View>

          {devOtp ? (
            <View style={styles.devBanner}>
              <Ionicons name="code-slash-outline" size={16} color={colors.warning} />
              <Text style={styles.devText}>Dev mode code: {devOtp}</Text>
            </View>
          ) : null}

          {error ? <View style={styles.errorBanner} accessibilityRole="alert"><Ionicons name="alert-circle-outline" size={18} color="#c2410c" /><Text style={styles.errorText}>{error}</Text></View> : null}
          {notice ? <View style={styles.noticeBanner} accessibilityRole="alert"><Ionicons name="checkmark-circle-outline" size={18} color="#166534" /><Text style={styles.noticeText}>{notice}</Text></View> : null}

          <View style={styles.otpWrap}>
            <Ionicons name="key-outline" size={19} color={colors.accentStrong} />
            <TextInput
              value={otp}
              onChangeText={(value) => { setOtp(value); setError(null) }}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={8}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Enter code"
              placeholderTextColor={colors.textSubtle}
              style={styles.otpInput}
              returnKeyType="done"
              onSubmitEditing={handleVerify}
              accessibilityLabel="Email verification code"
            />
          </View>

          <AnimatedButton label="Verify and continue" onPress={handleVerify} loading={loading} variant="auth" />

          <Pressable disabled={resending || countdown > 0} onPress={handleResend} style={styles.resend}>
            <Text style={[styles.resendText, (resending || countdown > 0) && styles.resendTextDisabled]}>
              {countdown > 0 ? `Resend available in ${countdown}s` : resending ? 'Resending...' : 'Did not receive it? Resend code'}
            </Text>
          </Pressable>
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
    justifyContent: 'flex-start',
  },
  topRow: {
    flexDirection: 'row',
  },
  leftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  brandName: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 15, letterSpacing: -0.2 },
  brandContext: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11, marginTop: 1 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  hero: {
    gap: spacing[2],
    marginHorizontal: -spacing[5],
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    backgroundColor: '#07152d',
    padding: spacing[5],
  },
  heroIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(243,108,33,0.12)', borderWidth: 1, borderColor: 'rgba(243,108,33,0.28)' },
  heroEyebrow: { ...typography.roles.eyebrow, color: '#f36c21', marginTop: spacing[1] },
  heroTitle: { color: '#f8fafc', fontFamily: typography.fonts.heading, fontSize: 29, lineHeight: 34 },
  heroSubtitle: { ...typography.roles.body, color: '#aab5c6' },
  card: {
    gap: spacing[4],
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: '#e0d6c8',
    backgroundColor: '#ffffff',
    padding: spacing[5],
    ...shadows.sm,
  },
  cardHeader: {
    gap: spacing[1],
  },
  cardEyebrow: {
    ...typography.roles.eyebrow,
    color: colors.accent,
  },
  cardTitle: {
    ...typography.roles.screenTitle,
    color: colors.text,
    fontSize: 25,
  },
  cardSubtitle: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  devBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    backgroundColor: colors.warningSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.amber[100],
  },
  devText: {
    ...typography.roles.body,
    fontFamily: typography.fonts.bodySemibold,
    color: colors.warning,
  },
  otpWrap: {
    minHeight: 66,
    borderRadius: radius.authInput,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    ...shadows.authInput,
  },
  otpInput: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 23,
    letterSpacing: 2,
    paddingVertical: 0,
  },
  resend: {
    alignItems: 'center',
    paddingVertical: spacing[1],
  },
  resendText: {
    ...typography.roles.body,
    fontFamily: typography.fonts.bodySemibold,
    color: colors.accentStrong,
  },
  resendTextDisabled: {
    color: colors.textSubtle,
  },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], borderRadius: radius.lg, borderWidth: 1, borderColor: '#fed7aa', backgroundColor: '#fff7ed', padding: spacing[3] },
  errorText: { flex: 1, color: '#7c2d12', fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  noticeBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], borderRadius: radius.lg, borderWidth: 1, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', padding: spacing[3] },
  noticeText: { flex: 1, color: '#166534', fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
})
