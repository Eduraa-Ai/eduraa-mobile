import React, { useState } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { AppScreen, AuthLogoMark } from '../../components/ui'
import type { AuthStackParamList } from '../../navigation'
import { shadows, spacing, typography } from '../../theme'

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Register'>

type LearningPathProps = {
  title: string
  relationship: string
  compactRelationship: string
  description: string
  icon: keyof typeof Ionicons.glyphMap
  tone: 'warm' | 'navy'
  selected: boolean
  compact: boolean
  onPressIn: () => void
  onPress: () => void
}

function LearningPath({ title, relationship, compactRelationship, description, icon, tone, selected, compact, onPressIn, onPress }: LearningPathProps) {
  const dark = tone === 'navy'

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${relationship}. ${description}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.path,
        compact && styles.pathCompact,
        dark && styles.pathInstitution,
        (pressed || selected) && styles.pathSelected,
      ]}
    >
      <View style={[styles.icon, compact && styles.iconCompact, dark && styles.iconInstitution]}>
        <Ionicons name={icon} size={22} color={dark ? '#c2410c' : '#ffffff'} />
      </View>

      <View style={styles.copy}>
        <Text style={[styles.relationship, compact && styles.relationshipCompact]}>{compact ? compactRelationship : relationship}</Text>
        <Text style={[styles.pathTitle, compact && styles.pathTitleCompact]}>{title}</Text>
        <Text style={[styles.description, compact && styles.descriptionCompact]}>{description}</Text>
      </View>
      {selected ? <Ionicons name="checkmark" size={22} color="#c2410c" accessibilityElementsHidden /> : null}
    </Pressable>
  )
}

export default function RegisterScreen() {
  const navigation = useNavigation<Nav>()
  const { width } = useWindowDimensions()
  const [selectedPath, setSelectedPath] = useState<'individual' | 'institution' | null>(null)
  const compact = width < 360

  useFocusEffect(
    React.useCallback(() => {
      setSelectedPath(null)
    }, []),
  )

  const selectAndNavigate = (path: 'individual' | 'institution') => {
    setSelectedPath(path)
    setTimeout(() => {
      navigation.navigate(path === 'individual' ? 'RegisterIndividual' : 'RegisterSchool')
    }, 420)
  }

  return (
    <AppScreen tone="auth" ambient={false} contentStyle={styles.screen}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back to sign in"
        >
          <Ionicons name="arrow-back" size={19} color="#07152d" />
        </Pressable>
        <View style={styles.identity}>
          <AuthLogoMark size={40} />
          <View>
            <Text style={styles.brandName}>Eduraa AI</Text>
            <Text style={styles.brandContext}>Create your account</Text>
          </View>
        </View>
      </View>

      <View style={[styles.intro, compact && styles.introCompact]}>
        <Text style={styles.eyebrow}>Your learning relationship</Text>
        <Text style={[styles.title, compact && styles.titleCompact]}>Choose your path.</Text>
        <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>Who should shape your Eduraa experience?</Text>
      </View>

      <View style={styles.paths}>
        <LearningPath
          relationship="Learn on my terms"
          compactRelationship="On my own"
          title="Individual learner"
          description="Your own space, shaped around your goals and pace."
          icon="person-outline"
          tone="warm"
          compact={compact}
          selected={selectedPath === 'individual'}
          onPressIn={() => setSelectedPath('individual')}
          onPress={() => selectAndNavigate('individual')}
        />
        <LearningPath
          relationship="Learn with my institution"
          compactRelationship="With my institution"
          title="Institution workspace"
          description="Verify your school membership as a student, teacher, or principal."
          icon="people-outline"
          tone="navy"
          compact={compact}
          selected={selectedPath === 'institution'}
          onPressIn={() => setSelectedPath('institution')}
          onPress={() => selectAndNavigate('institution')}
        />
      </View>

      <View style={styles.footer}>
        <View style={styles.reassurance}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#c2410c" />
          <Text style={styles.reassuranceText}>Preferences can be updated later.</Text>
        </View>
        <View style={styles.loginRow}>
          <Text style={styles.loginText}>Already learning with Eduraa?</Text>
          <Pressable onPress={() => navigation.navigate('Login')} hitSlop={10} accessibilityRole="link">
            <Text style={styles.loginLink}>Sign in</Text>
          </Pressable>
        </View>
      </View>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: { gap: 0 },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e0d6c8',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  brandName: {
    color: '#101828',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 15,
    letterSpacing: -0.2,
  },
  brandContext: {
    marginTop: 1,
    color: '#667085',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  intro: { paddingTop: 22, paddingBottom: 21 },
  introCompact: { paddingTop: 16, paddingBottom: 16 },
  eyebrow: { ...typography.roles.eyebrow, color: '#c2410c' },
  title: {
    marginTop: spacing[2],
    color: '#07152d',
    fontFamily: typography.fonts.heading,
    fontSize: 32,
    lineHeight: 37,
    letterSpacing: -0.65,
  },
  titleCompact: { fontSize: 24, lineHeight: 29 },
  subtitle: {
    marginTop: spacing[2],
    maxWidth: 330,
    color: '#667085',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 21,
  },
  subtitleCompact: { fontSize: 12, lineHeight: 18 },
  paths: {
    marginHorizontal: -spacing[5],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#ddd2c3',
  },
  path: {
    minHeight: 148,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    paddingHorizontal: spacing[5],
    paddingVertical: 19,
    backgroundColor: '#fffaf2',
  },
  pathCompact: { minHeight: 118, gap: 10, paddingHorizontal: 14, paddingVertical: 14 },
  pathInstitution: {
    borderTopWidth: 1,
    borderTopColor: '#ddd2c3',
    backgroundColor: '#f6efe4',
  },
  pathSelected: { backgroundColor: '#ffead8' },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    marginTop: 2,
    backgroundColor: '#07152d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInstitution: {
    borderWidth: 1,
    borderColor: '#d9cbbb',
    backgroundColor: '#ffffff',
  },
  iconCompact: { width: 36, height: 36, borderRadius: 11 },
  copy: { flex: 1, minWidth: 0 },
  relationship: {
    color: '#c2410c',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
    lineHeight: 16,
  },
  relationshipCompact: { fontSize: 11, lineHeight: 15 },
  pathTitle: {
    marginTop: 3,
    color: '#101828',
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: -0.25,
  },
  pathTitleCompact: { fontSize: 15, lineHeight: 19 },
  description: {
    marginTop: 5,
    color: '#667085',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  descriptionCompact: { fontSize: 11, lineHeight: 16 },
  footer: { paddingTop: spacing[4] },
  reassurance: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[2],
  },
  reassuranceText: {
    flexShrink: 1,
    color: '#667085',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  loginRow: {
    minHeight: 52,
    marginTop: spacing[3],
    paddingTop: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  loginText: { color: '#667085', fontFamily: typography.fonts.bodyMedium, fontSize: 13 },
  loginLink: { color: '#c2410c', fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  pressed: { transform: [{ scale: 0.985 }], opacity: 0.92 },
})
