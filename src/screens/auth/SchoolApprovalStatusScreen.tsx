import React, { useMemo, useState } from 'react'
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import { authApi, type SchoolApprovalStatus } from '../../api/auth'
import { AnimatedButton, AppScreen, TextInputField } from '../../components/ui'
import type { AuthStackParamList } from '../../navigation'
import { colors, radius, shadows, spacing, typography } from '../../theme'

type Nav = NativeStackNavigationProp<AuthStackParamList, 'SchoolApprovalStatus'>
type Route = RouteProp<AuthStackParamList, 'SchoolApprovalStatus'>

function supervisor(role?: 'student' | 'teacher' | 'principal') {
  if (role === 'student') return 'your class teacher'
  if (role === 'teacher') return 'your branch principal'
  if (role === 'principal') return 'your branch or school administrator'
  return 'your assigned school reviewer'
}

function requestError(error: unknown) {
  const candidate = error as { code?: string; response?: { status?: number; data?: { detail?: string } } }
  if (candidate.code === 'ERR_NETWORK') return 'We could not reach your school status. Check your connection and try again.'
  if (candidate.response?.status === 401) return 'That ID or password does not match a school account.'
  if (candidate.response?.status === 429) return 'Too many checks were made. Wait a little before trying again.'
  return candidate.response?.data?.detail || 'Your approval status is unavailable right now. Try again shortly.'
}

export default function SchoolApprovalStatusScreen() {
  const navigation = useNavigation<Nav>()
  const route = useRoute<Route>()
  const [identifier, setIdentifier] = useState(route.params?.identifier ?? '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<SchoolApprovalStatus | null>(route.params?.role ? {
    role: route.params.role,
    display_name: route.params.displayName ?? 'your account',
    state: 'pending',
    submitted_at: new Date().toISOString(),
  } : null)

  const message = useMemo(() => {
    if (!status) return null
    if (status.state === 'approved') return { icon: 'checkmark' as const, eyebrow: 'ACCESS APPROVED', title: 'Your school space is ready.', body: 'Sign in with the same ID and password to continue.', color: colors.success, surface: '#0B2B25' }
    if (status.state === 'rejected') return { icon: 'close' as const, eyebrow: 'REQUEST REVIEWED', title: 'Your request was not approved.', body: `Contact ${supervisor(status.role)} if your details need to be corrected before registering again.`, color: colors.danger, surface: '#301518' }
    return { icon: 'hourglass-outline' as const, eyebrow: 'REQUEST RECEIVED', title: 'Your school will review this.', body: `Access begins after ${supervisor(status.role)} confirms your membership. You can check again here without seeing anyone else’s data.`, color: colors.accent, surface: colors.nav }
  }, [status])

  const checkStatus = async () => {
    if (loading) return
    if (!identifier.trim() || !password) {
      const nextError = 'Enter your school email or ID and password to check your private status.'
      setError(nextError)
      AccessibilityInfo.announceForAccessibility(nextError)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const nextStatus = await authApi.getSchoolApprovalStatus(identifier.trim(), password)
      setStatus(nextStatus)
      setPassword('')
      AccessibilityInfo.announceForAccessibility(`School approval status: ${nextStatus.state}`)
    } catch (statusError) {
      const nextError = requestError(statusError)
      setError(nextError)
      AccessibilityInfo.announceForAccessibility(nextError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppScreen tone="auth" contentStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <View style={styles.topRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to sign in" onPress={() => navigation.navigate('Login')} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><Ionicons name="arrow-back" size={20} color={colors.nav} /></Pressable>
        <View><Text style={styles.brand}>EDURAA</Text><Text style={styles.brandLine}>INSTITUTION WORKSPACE</Text></View>
      </View>

      {message ? (
        <View style={[styles.statusStage, { backgroundColor: message.surface }]} accessibilityRole="summary">
          <View style={styles.statusIcon}><Ionicons name={message.icon} size={29} color={message.color} /></View>
          <Text style={styles.statusEyebrow}>{message.eyebrow}</Text>
          <Text style={styles.statusTitle}>{message.title}</Text>
          <Text style={styles.statusBody}>{message.body}</Text>
          <Text style={styles.privateName}>Private status for {status?.display_name}</Text>
        </View>
      ) : (
        <View style={styles.intro}><Text style={styles.introEyebrow}>SCHOOL ACCESS</Text><Text style={styles.introTitle}>Check only your own request.</Text><Text style={styles.introBody}>Your password confirms who you are. This page never opens approval queues or administrative actions.</Text></View>
      )}

      <View style={styles.panel}>
        <View style={styles.panelHead}><View style={styles.lock}><Ionicons name="lock-closed" size={18} color={colors.accent} /></View><View style={styles.panelCopy}><Text style={styles.panelTitle}>Private status check</Text><Text style={styles.panelBody}>Use the credentials you registered with.</Text></View></View>
        <TextInputField label="School email or ID" value={identifier} onChangeText={(value) => { setIdentifier(value); setError(null) }} autoCapitalize="none" autoCorrect={false} autoComplete="username" accessibilityLabel="School email or ID" placeholder="Email, student ID, or teacher ID" left={<Ionicons name="person-outline" size={18} color={colors.textMuted} />} />
        <TextInputField label="Password" value={password} onChangeText={(value) => { setPassword(value); setError(null) }} secureTextEntry autoComplete="current-password" accessibilityLabel="Password" placeholder="Your password" left={<Ionicons name="key-outline" size={18} color={colors.textMuted} />} onSubmitEditing={checkStatus} />
        {error ? <View style={styles.error} accessibilityRole="alert"><Ionicons name="alert-circle" size={18} color={colors.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}
        <AnimatedButton label={loading ? 'Checking securely' : 'Check my status'} loading={loading} disabled={loading} onPress={checkStatus} />
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel="Back to sign in" onPress={() => navigation.navigate('Login')} style={styles.signIn}><Text style={styles.signInText}>{status?.state === 'approved' ? 'Sign in to Eduraa' : 'Back to sign in'}</Text><Ionicons name="arrow-forward" size={17} color={colors.accentStrong} /></Pressable>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: { minHeight: 700, paddingBottom: spacing[8], gap: spacing[6] }, topRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  back: { width: 44, height: 44, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, ...shadows.xs }, pressed: { transform: [{ scale: 0.97 }], opacity: 0.86 },
  brand: { color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 13, letterSpacing: 2.7 }, brandLine: { marginTop: 2, color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 8, letterSpacing: 0.9 },
  statusStage: { alignItems: 'center', paddingHorizontal: spacing[4], paddingVertical: spacing[6], borderRadius: 30, ...shadows.lg }, statusIcon: { width: 72, height: 72, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  statusEyebrow: { ...typography.roles.eyebrow, marginTop: spacing[5], color: '#FFD9C2' }, statusTitle: { maxWidth: 310, marginTop: spacing[2], color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 29, lineHeight: 35, letterSpacing: -0.6, textAlign: 'center' }, statusBody: { ...typography.roles.body, maxWidth: 320, marginTop: spacing[3], color: '#AAB5C6', textAlign: 'center' }, privateName: { marginTop: spacing[5], paddingTop: spacing[4], color: '#D9E2EE', fontFamily: typography.fonts.bodyBold, fontSize: 11, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  intro: { paddingVertical: spacing[5] }, introEyebrow: { ...typography.roles.eyebrow, color: colors.accentStrong }, introTitle: { ...typography.roles.screenTitle, marginTop: spacing[2], color: colors.nav }, introBody: { ...typography.roles.body, marginTop: spacing[3], color: colors.textMuted },
  panel: { gap: spacing[4], padding: spacing[5], borderRadius: 28, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, ...shadows.sm }, panelHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] }, lock: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSurface }, panelCopy: { flex: 1 }, panelTitle: { color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 18 }, panelBody: { marginTop: 2, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 17 },
  error: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing[2], padding: spacing[3], borderRadius: radius.lg, backgroundColor: colors.dangerSurface }, errorText: { ...typography.roles.body, flex: 1, color: colors.dangerText },
  signIn: { minHeight: 48, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[4] }, signInText: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 14 },
})
