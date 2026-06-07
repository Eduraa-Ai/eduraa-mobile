import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { AppScreen, AuthLogoMark } from '../../components/ui'
import type { AuthStackParamList } from '../../navigation'
import { colors, radius, shadows, spacing, typography } from '../../theme'

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Register'>

const authPalette = {
  card: '#ffffff',
  navy: '#12141f',
  orange: '#f97316',
  orangeDark: '#c2410c',
  peach: '#fff7ed',
  sky: '#2f80ed',
  skySoft: '#e7f0ff',
  sun: '#ffbf33',
  sunSoft: '#fff2cc',
  coral: '#ff695f',
  coralSoft: '#ffe8e3',
  line: '#eadfce',
}

export default function RegisterScreen() {
  const navigation = useNavigation<Nav>()

  return (
    <AppScreen contentStyle={styles.screen}>
      <View style={styles.topRow}>
        <View style={styles.leftHeader}>
          <Pressable style={({ pressed }) => [styles.backButton, pressed && styles.pressed]} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={18} color={colors.text} />
          </Pressable>
          <AuthLogoMark size={42} />
        </View>
        <View style={styles.stepPill}>
          <Text style={styles.stepText}>Choose path</Text>
        </View>
      </View>

      <LinearGradient colors={['#ffffff', '#fffaf2', '#fff2cc']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.introPanel}>
        <View style={styles.introCopy}>
          <Text style={styles.kicker}>Create account</Text>
          <Text style={styles.introTitle}>Choose your path</Text>
          <Text style={styles.introBody}>Select the workspace that matches your account.</Text>
        </View>
        <View style={styles.routeSpark} />
      </LinearGradient>

      <View style={styles.pathStack}>
        <Pressable style={({ pressed }) => [styles.pathCard, styles.schoolCard, pressed && styles.pressed]} onPress={() => navigation.navigate('RegisterSchool')}>
          <View style={[styles.pathAccent, styles.schoolAccent]} />
          <View style={styles.pathTop}>
            <View style={[styles.pathIcon, styles.schoolIcon]}>
              <Ionicons name="business-outline" size={22} color={colors.white} />
            </View>
            <View style={styles.pathPill}>
              <Text style={styles.pathPillText}>School</Text>
            </View>
          </View>
          <View style={styles.pathCopy}>
            <Text style={styles.pathTitle}>Institution workspace</Text>
            <Text style={styles.pathSubtitle}>Student, teacher, or principal account connected to a school branch.</Text>
          </View>
          <View style={styles.pathFooter}>
            <Text style={styles.pathMeta}>Role, branch, approvals</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.text} />
          </View>
        </Pressable>

        <Pressable style={({ pressed }) => [styles.pathCard, styles.learnerCard, pressed && styles.pressed]} onPress={() => navigation.navigate('RegisterIndividual')}>
          <View style={[styles.pathAccent, styles.learnerAccent]} />
          <View style={styles.pathTop}>
            <View style={[styles.pathIcon, styles.learnerIcon]}>
              <Ionicons name="sparkles-outline" size={22} color={authPalette.orangeDark} />
            </View>
            <View style={styles.pathPill}>
              <Text style={styles.pathPillText}>JEE / Self prep</Text>
            </View>
          </View>
          <View style={styles.pathCopy}>
            <Text style={styles.pathTitle}>Individual learner</Text>
            <Text style={styles.pathSubtitle}>Build a personal study profile and verify your email with OTP.</Text>
          </View>
          <View style={styles.pathFooter}>
            <Text style={styles.pathMeta}>Exam goals, AI path, PYQs</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.text} />
          </View>
        </Pressable>
      </View>

      <View style={styles.loginRow}>
        <Text style={styles.loginText}>Already have an account?</Text>
        <Pressable onPress={() => navigation.navigate('Login')} hitSlop={8}>
          <Text style={styles.loginLink}>Sign in</Text>
        </Pressable>
      </View>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'flex-start',
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
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: authPalette.line,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  stepPill: {
    borderRadius: radius.full,
    backgroundColor: authPalette.peach,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  stepText: {
    ...typography.roles.eyebrow,
    color: authPalette.orangeDark,
  },
  introPanel: {
    flexDirection: 'row',
    gap: spacing[3],
    alignItems: 'center',
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: authPalette.line,
    padding: spacing[4],
    ...shadows.sm,
  },
  introCopy: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    ...typography.roles.eyebrow,
    color: authPalette.orangeDark,
  },
  introTitle: {
    color: colors.text,
    fontFamily: typography.fonts.heading,
    fontSize: 28,
    lineHeight: 32,
    marginTop: spacing[2],
  },
  introBody: {
    ...typography.roles.body,
    color: colors.textMuted,
    marginTop: spacing[2],
  },
  routeSpark: {
    width: 6,
    alignSelf: 'stretch',
    borderRadius: radius.full,
    backgroundColor: authPalette.orange,
  },
  pathStack: {
    gap: spacing[3],
  },
  pathCard: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 148,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: authPalette.line,
    padding: spacing[4],
    justifyContent: 'space-between',
    gap: spacing[3],
    ...shadows.sm,
  },
  pathAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
  },
  schoolAccent: {
    backgroundColor: authPalette.navy,
  },
  learnerAccent: {
    backgroundColor: authPalette.orange,
  },
  schoolCard: {
    backgroundColor: authPalette.card,
  },
  learnerCard: {
    backgroundColor: authPalette.card,
  },
  pathTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pathIcon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  schoolIcon: {
    backgroundColor: authPalette.navy,
  },
  learnerIcon: {
    backgroundColor: authPalette.card,
  },
  pathPill: {
    borderRadius: radius.full,
    backgroundColor: authPalette.peach,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  pathPillText: {
    ...typography.roles.label,
    color: authPalette.orangeDark,
    fontFamily: typography.fonts.bodyBold,
  },
  pathCopy: {
    gap: spacing[1],
  },
  pathMeta: {
    ...typography.roles.eyebrow,
    color: authPalette.orangeDark,
  },
  pathTitle: {
    color: colors.text,
    fontFamily: typography.fonts.heading,
    fontSize: 20,
    lineHeight: 24,
  },
  pathSubtitle: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  pathFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  loginText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  loginLink: {
    ...typography.roles.body,
    fontFamily: typography.fonts.bodyBold,
    color: authPalette.orangeDark,
  },
})
