import React, { useEffect, useRef, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { authApi } from '../../api/auth'
import { AnimatedButton, AnimatedCard, AppScreen, AuthLogoMark, GradientHeroCard } from '../../components/ui'
import type { AuthStackParamList } from '../../navigation'
import { useAuthStore } from '../../stores/authStore'
import { colors, motion, radius, shadows, spacing, typography } from '../../theme'

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
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [])

  const startCountdown = () => {
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
    if (!otp.trim()) {
      Alert.alert('Enter code', 'Please enter the verification code first.')
      return
    }

    setLoading(true)
    try {
      const authToken = await authApi.verifyEmailOtp(email, otp.trim())
      await setAuth(authToken)
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      Alert.alert('Verification failed', typeof detail === 'string' ? detail : 'Invalid or expired code.')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (countdown > 0) return
    setResending(true)
    try {
      const challenge = await authApi.resendEmailOtp(email)
      if (challenge.dev_otp) setOtp(challenge.dev_otp)
      startCountdown()
      Alert.alert(
        'Code sent',
        challenge.delivery_channel === 'console'
          ? 'Email delivery is unavailable in this environment. Use the Dev OTP shown below.'
          : 'A fresh verification code has been sent.',
      )
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      Alert.alert('Resend failed', typeof detail === 'string' ? detail : 'Could not resend the code.')
    } finally {
      setResending(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppScreen contentStyle={styles.screen}>
        <View style={styles.topRow}>
          <View style={styles.leftHeader}>
            <Pressable style={({ pressed }) => [styles.backButton, pressed && styles.pressed]} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={18} color={colors.text} />
            </Pressable>
            <AuthLogoMark size={42} />
          </View>
        </View>

        <GradientHeroCard
          eyebrow="Email verification"
          title="One checkpoint before Atlas opens."
          subtitle={
            deliveryChannel === 'console'
              ? 'Email delivery is unavailable in this environment. Use the Dev OTP below.'
              : `We sent a verification code to ${email}.`
          }
        />

        <AnimatedCard delay={motion.cardEntrance.stagger} elevated style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardEyebrow}>Verification code</Text>
            <Text style={styles.cardTitle}>Enter the OTP</Text>
            <Text style={styles.cardSubtitle}>{message || 'Use the latest code from your email. Resending will replace the previous code.'}</Text>
          </View>

          {devOtp ? (
            <View style={styles.devBanner}>
              <Ionicons name="code-slash-outline" size={16} color={colors.warning} />
              <Text style={styles.devText}>Dev mode code: {devOtp}</Text>
            </View>
          ) : null}

          <View style={styles.otpWrap}>
            <Ionicons name="key-outline" size={19} color={colors.accentStrong} />
            <TextInput
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Enter code"
              placeholderTextColor={colors.textSubtle}
              style={styles.otpInput}
            />
          </View>

          <AnimatedButton label="Verify and continue" onPress={handleVerify} loading={loading} />

          <Pressable disabled={resending || countdown > 0} onPress={handleResend} style={styles.resend}>
            <Text style={[styles.resendText, (resending || countdown > 0) && styles.resendTextDisabled]}>
              {countdown > 0 ? `Resend available in ${countdown}s` : resending ? 'Resending...' : 'Did not receive it? Resend code'}
            </Text>
          </Pressable>
        </AnimatedCard>
      </AppScreen>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screen: {
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
  },
  leftHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
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
  card: {
    gap: spacing[4],
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
})
