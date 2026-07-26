import React, { useEffect, useRef, useState } from 'react'
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
import { LinearGradient } from 'expo-linear-gradient'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Ellipse } from 'react-native-svg'
import { authApi } from '../../api/auth'
import { AuthLogoMark } from '../../components/ui'
import type { AuthStackParamList } from '../../navigation'
import { radius, shadows, spacing, typography } from '../../theme'

type Nav = NativeStackNavigationProp<AuthStackParamList, 'VerifyEmail'>
type Route = RouteProp<AuthStackParamList, 'VerifyEmail'>

const STARS = [
  [18, 95, 1.1, 0.75], [48, 154, 0.7, 0.5], [77, 112, 1.3, 0.7], [110, 77, 0.8, 0.5],
  [142, 128, 0.65, 0.55], [174, 90, 1, 0.8], [207, 144, 0.7, 0.5], [239, 66, 1.2, 0.65],
  [273, 117, 0.8, 0.55], [311, 82, 1.1, 0.72], [351, 145, 0.7, 0.55], [374, 103, 1.2, 0.6],
  [22, 232, 0.7, 0.5], [59, 278, 1.2, 0.65], [93, 207, 0.8, 0.55], [128, 254, 1.1, 0.75],
  [166, 219, 0.7, 0.5], [214, 272, 1.15, 0.68], [248, 214, 0.7, 0.5], [291, 249, 0.9, 0.6],
  [332, 211, 1.15, 0.72], [371, 287, 0.7, 0.5], [31, 365, 1.1, 0.68], [83, 329, 0.7, 0.5],
  [129, 387, 0.9, 0.6], [186, 342, 1.2, 0.72], [238, 393, 0.65, 0.5], [284, 344, 1, 0.65],
  [337, 382, 0.75, 0.55], [376, 351, 1.1, 0.68], [18, 512, 0.8, 0.45], [69, 584, 1.1, 0.5],
  [151, 536, 0.65, 0.45], [227, 611, 0.9, 0.5], [308, 548, 0.7, 0.42], [368, 635, 1, 0.5],
] as const

function CelestialBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        {STARS.map(([cx, cy, r, opacity], index) => (
          <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={index % 4 === 0 ? '#f7a56f' : '#ffffff'} opacity={opacity} />
        ))}
        <Ellipse cx="195" cy="278" rx="151" ry="151" fill="none" stroke="#91a9cd" strokeOpacity={0.14} strokeWidth={1.2} />
        <Ellipse cx="195" cy="278" rx="117" ry="117" fill="none" stroke="#f36c21" strokeOpacity={0.13} strokeWidth={1} />
        <Ellipse cx="195" cy="278" rx="162" ry="72" rotation="-24" origin="195, 278" fill="none" stroke="#91a9cd" strokeOpacity={0.12} strokeWidth={1} />
        <Circle cx="342" cy="214" r="3" fill="#f36c21" opacity={0.75} />
        <Circle cx="48" cy="337" r="2.2" fill="#ffbf7b" opacity={0.7} />
      </Svg>
      <View style={styles.ambientGlow} />
    </View>
  )
}

export default function VerifyEmailScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const insets = useSafeAreaInsets()
  const { email, devOtp, message, deliveryChannel } = route.params

  const [otp, setOtp] = useState((devOtp ?? '').replace(/\D/g, '').slice(0, 6))
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    if (countdownRef.current) clearInterval(countdownRef.current)
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
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the complete 6-digit code from your email.')
      return
    }

    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      const authToken = await authApi.verifyEmailOtp(email, otp)
      navigation.reset({
        index: 0,
        routes: [{ name: 'RegistrationComplete', params: { authToken } }],
      })
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
      if (challenge.dev_otp) setOtp(challenge.dev_otp.replace(/\D/g, '').slice(0, 6))
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

  const resendDisabled = resending || countdown > 0
  const destinationCopy = deliveryChannel === 'console'
    ? 'Use the development code below to confirm this account.'
    : `Enter the private code sent to ${email}.`

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={['#0a1b36', '#07152d', '#030b1a']} locations={[0, 0.55, 1]} style={styles.root}>
        <CelestialBackground />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.screen, { paddingTop: insets.top + spacing[3], paddingBottom: insets.bottom + spacing[6] }]}
        >
          <View style={styles.topRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={18} color="#ffffff" />
            </Pressable>
            <AuthLogoMark size={40} style={styles.logo} />
            <View style={styles.brandCopy}>
              <Text style={styles.brandName}>Eduraa AI</Text>
              <Text style={styles.brandContext}>Identity confirmation</Text>
            </View>
            <View style={styles.stepPill}><Text style={styles.stepText}>03 · VERIFY</Text></View>
          </View>

          <View style={styles.hero}>
            <View style={styles.signalHaloOuter}>
              <View style={styles.signalHaloInner}>
                <LinearGradient colors={['#ff8746', '#f35d13']} style={styles.heroIcon}>
                  <Ionicons name="mail-outline" size={31} color="#07152d" />
                  <View style={styles.iconHighlight} />
                </LinearGradient>
              </View>
            </View>
            <Text style={styles.heroEyebrow}>ONE FINAL STEP</Text>
            <Text style={styles.heroTitle}>Confirm it’s really you.</Text>
            <Text style={styles.heroSubtitle}>{destinationCopy}</Text>
            <View style={styles.trustRow}>
              <View style={styles.trustDot} />
              <Text style={styles.trustText}>ENCRYPTED · EXPIRES IN 10 MINUTES</Text>
            </View>
          </View>

          <View style={styles.card}>
            {message ? <Text style={styles.cardMessage}>{message}</Text> : null}
            {devOtp ? (
              <View style={styles.devBanner}>
                <Ionicons name="code-slash-outline" size={16} color="#9a3412" />
                <Text style={styles.devText}>Development code: {devOtp}</Text>
              </View>
            ) : null}
            {error ? (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Ionicons name="alert-circle-outline" size={18} color="#c2410c" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            {notice ? (
              <View style={styles.noticeBanner} accessibilityRole="alert">
                <Ionicons name="checkmark-circle-outline" size={18} color="#166534" />
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            ) : null}

            <View>
              <View style={styles.codeLabelRow}>
                <Text style={styles.codeLabel}>Verification code</Text>
                <Text style={styles.codeHint}>{otp.length}/6 digits</Text>
              </View>
              <View style={[styles.otpWrap, error && styles.otpWrapError]}>
                <TextInput
                  value={otp}
                  onChangeText={(value) => {
                    setOtp(value.replace(/\D/g, '').slice(0, 6))
                    setError(null)
                  }}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={6}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="••••••"
                  placeholderTextColor="#7d8798"
                  style={styles.otpInput}
                  returnKeyType="done"
                  onSubmitEditing={handleVerify}
                  accessibilityLabel="Six-digit email verification code"
                />
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirm and continue"
              accessibilityState={{ disabled: loading, busy: loading }}
              disabled={loading}
              onPress={handleVerify}
              style={({ pressed }) => [styles.confirmButton, pressed && !loading && styles.confirmPressed]}
            >
              <LinearGradient colors={['#ff7c35', '#f35d13']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.confirmFill}>
                {loading ? <ActivityIndicator color="#07152d" /> : (
                  <>
                    <Text style={styles.confirmText}>Confirm and continue</Text>
                    <Ionicons name="arrow-forward" size={16} color="#07152d" />
                  </>
                )}
              </LinearGradient>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={countdown > 0 ? `Send a new code in ${countdown} seconds` : 'Send a new verification code'}
              accessibilityState={{ disabled: resendDisabled, busy: resending }}
              disabled={resendDisabled}
              onPress={handleResend}
              style={({ pressed }) => [styles.resend, pressed && !resendDisabled && styles.resendPressed]}
            >
              <Text style={[styles.resendLead, resendDisabled && styles.resendDisabled]}>
                {countdown > 0 ? `Send a new code in ${countdown}s` : resending ? 'Sending a new code…' : 'No code yet? '}
                {!resendDisabled ? <Text style={styles.resendAction}>Send a new one</Text> : null}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07152d' },
  screen: { flexGrow: 1, paddingHorizontal: spacing[5] },
  ambientGlow: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    left: 65,
    top: 150,
    backgroundColor: 'rgba(243,108,33,0.055)',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', minHeight: 46 },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.055)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { transform: [{ scale: 0.96 }], opacity: 0.82 },
  logo: { marginLeft: spacing[2], borderRadius: 10 },
  brandCopy: { marginLeft: spacing[2], flexShrink: 1 },
  brandName: { color: '#ffffff', fontFamily: typography.fonts.bodyBold, fontSize: 14, letterSpacing: -0.2 },
  brandContext: { color: '#aab5c6', fontFamily: typography.fonts.bodyMedium, fontSize: 9.5, marginTop: 1 },
  stepPill: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: 'rgba(243,108,33,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(243,108,33,0.12)',
  },
  stepText: { color: '#ffd9c2', fontFamily: typography.fonts.bodyBold, fontSize: 8, letterSpacing: 1 },
  hero: { alignItems: 'center', paddingTop: spacing[8], paddingBottom: spacing[5] },
  signalHaloOuter: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 1,
    borderColor: 'rgba(243,108,33,0.08)',
    backgroundColor: 'rgba(243,108,33,0.035)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signalHaloInner: {
    width: 98,
    height: 98,
    borderRadius: 49,
    backgroundColor: 'rgba(243,108,33,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIcon: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,226,205,0.42)',
    shadowColor: '#000000',
    shadowOpacity: 0.34,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  iconHighlight: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    right: 10,
    top: 12,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  heroEyebrow: {
    marginTop: spacing[3],
    color: '#f97336',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 2,
  },
  heroTitle: {
    maxWidth: 310,
    marginTop: spacing[6],
    color: '#fffaf2',
    fontFamily: typography.fonts.heading,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -1,
    textAlign: 'center',
  },
  heroSubtitle: {
    maxWidth: 295,
    marginTop: spacing[3],
    color: '#aab5c6',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing[4] },
  trustDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f36c21', shadowColor: '#f36c21', shadowOpacity: 0.8, shadowRadius: 5 },
  trustText: { color: '#c2cad6', fontFamily: typography.fonts.bodyBold, fontSize: 8, letterSpacing: 0.55 },
  card: {
    gap: spacing[3],
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,226,205,0.52)',
    backgroundColor: '#fffaf2',
    padding: spacing[4],
    shadowColor: '#000000',
    shadowOpacity: 0.34,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  cardMessage: { color: '#667085', fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 16 },
  codeLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[2], paddingHorizontal: 2 },
  codeLabel: { color: '#475467', fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  codeHint: { color: '#98a2b3', fontFamily: typography.fonts.bodyMedium, fontSize: 9 },
  otpWrap: {
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e3d4c3',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.authInput,
  },
  otpWrapError: { borderColor: '#f36c21' },
  otpInput: {
    width: '100%',
    minHeight: 62,
    paddingHorizontal: spacing[4],
    paddingVertical: 0,
    color: '#07152d',
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 25,
    letterSpacing: 9,
    textAlign: 'center',
  },
  confirmButton: { borderRadius: 16, overflow: 'hidden', shadowColor: '#f36c21', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 9 }, elevation: 7 },
  confirmPressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
  confirmFill: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingHorizontal: spacing[5] },
  confirmText: { color: '#07152d', fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  resend: { minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[2] },
  resendPressed: { opacity: 0.68 },
  resendLead: { color: '#9a3412', fontFamily: typography.fonts.bodyMedium, fontSize: 10.5, textAlign: 'center' },
  resendAction: { fontFamily: typography.fonts.bodyBold, color: '#c2410c' },
  resendDisabled: { color: '#98a2b3' },
  devBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], padding: spacing[3], backgroundColor: '#fff0e5', borderRadius: radius.lg, borderWidth: 1, borderColor: '#fed7aa' },
  devText: { flex: 1, color: '#9a3412', fontFamily: typography.fonts.bodySemibold, fontSize: 11 },
  errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], borderRadius: radius.lg, borderWidth: 1, borderColor: '#fed7aa', backgroundColor: '#fff7ed', padding: spacing[3] },
  errorText: { flex: 1, color: '#7c2d12', fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 16 },
  noticeBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], borderRadius: radius.lg, borderWidth: 1, borderColor: '#bbf7d0', backgroundColor: '#f0fdf4', padding: spacing[3] },
  noticeText: { flex: 1, color: '#166534', fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 16 },
})
