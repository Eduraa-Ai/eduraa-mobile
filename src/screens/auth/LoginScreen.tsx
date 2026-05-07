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

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Login'>

export default function LoginScreen() {
  const navigation = useNavigation<Nav>()
  const { setAuth } = useAuthStore()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const emailRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)

  // Screen entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(24)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start()
  }, [fadeAnim, slideAnim])

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.')
      return
    }
    setLoading(true)
    try {
      const authToken = await authApi.login({ username: email.trim(), password })
      await setAuth(authToken)
    } catch (err: any) {
      const message = err?.response?.data?.detail || 'Login failed. Please check your credentials.'
      Alert.alert('Login failed', message)
    } finally {
      setLoading(false)
    }
  }

  const isSmall = width < 380
  const hPad = isSmall ? spacing[5] : spacing[6]

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: hPad, paddingTop: insets.top + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {/* Brand */}
          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <Ionicons name="sparkles" size={26} color={colors.white} />
            </View>
            <Text style={styles.brandName}>Eduraa</Text>
            <Text style={styles.brandTagline}>AI-powered exam prep</Text>
          </View>

          {/* Card */}
          <View style={[styles.card, shadows.sm]}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to continue your prep</Text>

            {/* Email */}
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TouchableOpacity
                style={[styles.inputWrap, emailFocused && styles.inputWrapFocused]}
                onPress={() => emailRef.current?.focus()}
                activeOpacity={1}
              >
                <Ionicons
                  name="mail-outline"
                  size={17}
                  color={emailFocused ? colors.accent : colors.subtle}
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={emailRef}
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.placeholder}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
              </TouchableOpacity>
            </View>

            {/* Password */}
            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TouchableOpacity
                style={[styles.inputWrap, passwordFocused && styles.inputWrapFocused]}
                onPress={() => passwordRef.current?.focus()}
                activeOpacity={1}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={17}
                  color={passwordFocused ? colors.accent : colors.subtle}
                  style={styles.inputIcon}
                />
                <TextInput
                  ref={passwordRef}
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Your password"
                  placeholderTextColor={colors.placeholder}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(v => !v)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.eyeBtn}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={17}
                    color={colors.subtle}
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            </View>

            {/* Sign In Button */}
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.82}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.registerLink}
              onPress={() => navigation.navigate('RegisterPath')}
              activeOpacity={0.7}
            >
              <Text style={styles.registerLinkText}>
                New to Eduraa?{'  '}
                <Text style={styles.registerLinkAccent}>Create account</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 40,
  },

  brand: {
    alignItems: 'center',
    marginBottom: spacing[8],
  },
  brandMark: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[3],
    ...shadows.md,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    fontFamily: fonts.displayBold,
    color: colors.ink,
    letterSpacing: -0.5,
  },
  brandTagline: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginTop: 4,
    letterSpacing: 0.1,
  },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius['2xl'],
    padding: spacing[6],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: fonts.displaySemibold,
    color: colors.ink,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginBottom: spacing[6],
  },

  field: { marginBottom: spacing[4] },
  label: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.semibold,
    color: colors.ink,
    marginBottom: spacing[1] + 2,
    letterSpacing: 0.1,
  },
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
  inputIcon: { marginRight: spacing[2] },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: colors.ink,
    paddingVertical: 0,
  },
  eyeBtn: {
    paddingLeft: spacing[2],
  },

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

  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing[4],
    gap: spacing[3],
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 12,
    color: colors.subtle,
  },

  registerLink: {
    alignItems: 'center',
    paddingVertical: spacing[1],
  },
  registerLinkText: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.muted,
  },
  registerLinkAccent: {
    color: colors.accent,
    fontWeight: '700',
    fontFamily: fonts.bold,
  },
})
