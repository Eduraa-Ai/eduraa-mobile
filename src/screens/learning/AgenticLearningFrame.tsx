import React, { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { AuthLogoMark, MathText } from '../../components/ui'
import { colors, layout, radius, shadows, spacing, typography } from '../../theme'

export function AgenticHeader({ meta, pill, onBack }: { meta: string; pill?: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerIdentity}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          accessibilityHint="Returns to the previous learning screen."
          hitSlop={6}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </Pressable>
        <AuthLogoMark size={38} />
        <View style={styles.brandCopy}>
          <Text style={styles.brandName}>Eduraa AI</Text>
          <Text style={styles.brandMeta} numberOfLines={2}>{meta}</Text>
        </View>
      </View>
      {pill ? (
        <View style={styles.headerPill} accessibilityLabel={pill}>
          <Text style={styles.headerPillText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{pill}</Text>
        </View>
      ) : null}
    </View>
  )
}

export function AgenticIntro({ kicker, title, subtitle }: { kicker: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.intro}>
      <Text style={styles.kicker}>{kicker}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <MathText style={styles.subtitle} value={subtitle} /> : null}
    </View>
  )
}

export function AgenticSectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null}
    </View>
  )
}

export function AgenticSurface({ children, dark = false, style }: { children: ReactNode; dark?: boolean; style?: object }) {
  return <View style={[styles.surface, dark && styles.surfaceDark, style]}>{children}</View>
}

const styles = StyleSheet.create({
  header: {
    minHeight: layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  headerIdentity: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  backButton: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.xs,
  },
  brandCopy: {
    minWidth: 0,
    flex: 1,
  },
  brandName: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
    lineHeight: 18,
  },
  brandMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 14,
  },
  headerPill: {
    minHeight: 32,
    maxWidth: 120,
    flexShrink: 0,
    justifyContent: 'center',
    borderRadius: radius.full,
    paddingHorizontal: spacing[2],
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  headerPillText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
  intro: {
    gap: spacing[1],
  },
  kicker: {
    ...typography.roles.eyebrow,
    color: colors.accentStrong,
    fontSize: 10,
    lineHeight: 13,
  },
  title: {
    color: colors.text,
    fontFamily: typography.fonts.heading,
    fontSize: 25,
    lineHeight: 29,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  sectionHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
    lineHeight: 22,
  },
  sectionMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    lineHeight: 14,
  },
  surface: {
    borderRadius: radius.lg,
    backgroundColor: '#FFFCF6',
    borderWidth: 1,
    borderColor: '#E9DFD2',
    padding: spacing[3],
  },
  surfaceDark: {
    backgroundColor: '#07152D',
    borderColor: 'rgba(255,255,255,0.08)',
  },
})
