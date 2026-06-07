import React, { useState } from 'react'
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { authApi } from '../../api/auth'
import { API_BASE_URL, API_TARGET } from '../../api/client'
import { AnimatedCard, AppScreen, AuthLogoMark, TextInputField } from '../../components/ui'
import type { AuthStackParamList } from '../../navigation'
import { useAuthStore } from '../../stores/authStore'
import { colors, motion, radius, shadows, spacing, typography } from '../../theme'

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>

const authPalette = {
  paper: '#fffaf2',
  card: '#ffffff',
  navy: '#111827',
  orange: '#f97316',
  orangeDark: '#c2410c',
  peach: '#fff7ed',
  sky: '#2f80ed',
  sun: '#ffbf33',
  sunSoft: '#fff2cc',
  line: '#eadfce',
  fieldLine: '#e4e9ef',
  muted: '#667085',
}

const formatLoginError = (err: any) => {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message || JSON.stringify(item))
      .filter(Boolean)
      .join('\n')
  }
  if (err?.response?.status) return `Login request failed with status ${err.response.status}.`
  if (err?.message) return err.message
  return 'Login failed. Please check your credentials.'
}

const buildGoogleSignInUrl = () => {
  const params = new URLSearchParams()
  params.set('next', '/student/dashboard-lab')
  params.set('intent', 'login')
  return `${API_BASE_URL}/api/v1/auth/google/start?${params.toString()}`
}

export default function LoginScreen() {
  const navigation = useNavigation<Nav>()
  const { setAuth } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Enter your email or student ID and password to continue.')
      return
    }

    setLoading(true)
    try {
      const authToken = await authApi.login({ username: email.trim(), password })
      await setAuth(authToken)
    } catch (err: any) {
      Alert.alert('Login failed', formatLoginError(err))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    const url = buildGoogleSignInUrl()

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = url
      return
    }

    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert('Google sign-in unavailable', 'Unable to open Google sign-in on this device.')
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <AppScreen contentStyle={styles.screen}>
        <View style={styles.brandRow}>
          <AuthLogoMark size={44} />
          <View>
            <Text style={styles.brandName}>Eduraa AI</Text>
            <Text style={styles.brandMeta}>JEE + school workspace</Text>
          </View>
        </View>

        <LinearGradient colors={['#ffffff', '#fffaf2', authPalette.sunSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.authPanel}>
          <View style={styles.authCopy}>
            <Text style={styles.kicker}>Welcome back</Text>
            <Text style={styles.authTitle}>Continue learning</Text>
            <Text style={styles.authSubtitle}>Resume your papers, results, lessons, and AI study support from one secure account.</Text>
          </View>
          <View style={styles.pathMini} pointerEvents="none">
            <View style={styles.pathRail} />
            <View style={styles.pathRailActive} />
            <View style={[styles.pathNode, styles.pathNodeStart]} />
            <View style={[styles.pathNode, styles.pathNodeMid]} />
            <View style={[styles.pathNode, styles.pathNodeEnd]} />
          </View>
        </LinearGradient>

        <AnimatedCard delay={motion.cardEntrance.stagger} elevated style={styles.formCard}>
          <View style={styles.formHeader}>
            <Text style={styles.kicker}>Sign in</Text>
            <Text style={styles.formTitle}>Enter your account</Text>
            <Text style={styles.formSubtitle}>Use your teacher ID, student ID, or email.</Text>
            {__DEV__ ? (
              <Text style={styles.apiTargetText} numberOfLines={1}>
                API {API_TARGET}: {API_BASE_URL}
              </Text>
            ) : null}
          </View>

          <View style={styles.form}>
            <TextInputField
              label="Teacher ID / Student ID / Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              left={<Ionicons name="mail-outline" size={18} color={authPalette.orangeDark} />}
              placeholder="teacher ID, student ID, or email"
            />

            <TextInputField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              left={<Ionicons name="lock-closed-outline" size={18} color={authPalette.orangeDark} />}
              right={
                <Pressable onPress={() => setShowPassword((value) => !value)} hitSlop={8}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
                </Pressable>
              }
              placeholder="Enter your password"
            />

            <Pressable disabled={loading} onPress={handleLogin} style={({ pressed }) => [styles.darkCta, pressed && styles.darkCtaPressed, loading && styles.darkCtaDisabled]}>
              {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.darkCtaText}>Continue</Text>}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable onPress={handleGoogleSignIn} style={({ pressed }) => [styles.googleButton, pressed && styles.googleButtonPressed]}>
              <View style={styles.googleMark}>
                <Text style={styles.googleLetter}>G</Text>
              </View>
              <Text style={styles.googleText}>Continue with Google</Text>
            </Pressable>
          </View>

          <View style={styles.createRow}>
            <Text style={styles.helper}>New to Eduraa?</Text>
            <Pressable onPress={() => navigation.navigate('Register')} hitSlop={8}>
              <Text style={styles.link}>Create account</Text>
            </Pressable>
          </View>
        </AnimatedCard>

        <View style={styles.promiseRow}>
          <Ionicons name="lock-closed-outline" size={16} color={authPalette.orangeDark} />
          <Text style={styles.promiseText}>Secure session. Local and production API modes supported.</Text>
        </View>
      </AppScreen>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: authPalette.paper,
  },
  screen: {
    justifyContent: 'flex-start',
    gap: spacing[3],
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  brandName: {
    ...typography.roles.title,
    color: colors.text,
  },
  brandMeta: {
    ...typography.roles.label,
    color: colors.textMuted,
  },
  authPanel: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 150,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: authPalette.line,
    padding: spacing[4],
    ...shadows.sm,
  },
  authCopy: {
    maxWidth: 272,
  },
  kicker: {
    ...typography.roles.eyebrow,
    color: authPalette.orangeDark,
  },
  authTitle: {
    color: colors.text,
    fontFamily: typography.fonts.heading,
    fontSize: 24,
    lineHeight: 27,
    marginTop: spacing[1],
  },
  authSubtitle: {
    ...typography.roles.body,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  pathMini: {
    position: 'absolute',
    right: spacing[4],
    bottom: spacing[4],
    width: 92,
    height: 56,
  },
  pathRail: {
    position: 'absolute',
    left: 8,
    top: 29,
    width: 76,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: '#d8e2ea',
    transform: [{ rotate: '-15deg' }],
  },
  pathRailActive: {
    position: 'absolute',
    left: 8,
    top: 29,
    width: 58,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: authPalette.orange,
    transform: [{ rotate: '-15deg' }],
  },
  pathNode: {
    position: 'absolute',
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 4,
    borderColor: colors.white,
  },
  pathNodeStart: {
    left: 4,
    top: 34,
    backgroundColor: authPalette.orange,
  },
  pathNodeMid: {
    left: 58,
    top: 11,
    backgroundColor: authPalette.sun,
  },
  pathNodeEnd: {
    right: 2,
    top: 19,
    backgroundColor: authPalette.sky,
  },
  formCard: {
    borderColor: authPalette.line,
    backgroundColor: authPalette.card,
    padding: spacing[4],
  },
  formHeader: {
    gap: spacing[1],
  },
  formTitle: {
    ...typography.roles.screenTitle,
    color: colors.text,
    fontSize: 24,
  },
  formSubtitle: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  apiTargetText: {
    ...typography.roles.label,
    color: colors.textSoft,
  },
  form: {
    gap: spacing[3],
    marginTop: spacing[4],
  },
  darkCta: {
    minHeight: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: authPalette.navy,
    ...shadows.sm,
  },
  darkCtaPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  darkCtaDisabled: {
    opacity: 0.62,
  },
  darkCtaText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 15,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: authPalette.fieldLine,
  },
  dividerText: {
    ...typography.roles.label,
    color: colors.textSoft,
    textTransform: 'uppercase',
  },
  googleButton: {
    minHeight: 56,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: authPalette.fieldLine,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    ...shadows.sm,
  },
  googleButtonPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.9,
  },
  googleMark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  googleLetter: {
    color: '#4285f4',
    fontFamily: typography.fonts.heading,
    fontSize: 18,
    lineHeight: 22,
  },
  googleText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    marginTop: spacing[4],
  },
  helper: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  link: {
    ...typography.roles.body,
    fontFamily: typography.fonts.bodyBold,
    color: authPalette.orangeDark,
  },
  promiseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[2],
  },
  promiseText: {
    ...typography.roles.label,
    flex: 1,
    color: colors.textMuted,
  },
})
