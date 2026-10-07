import React, { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { AppHeaderConfig, MathText } from '../../components/ui'
import { colors, radius, spacing, typography } from '../../theme'

// Agentic learning screens set the shared app header: back keeps each screen's own
// return logic, the status pill takes the action slot, and the curriculum context
// stays on the page as one muted line.
export function AgenticHeader({ title, meta, pill, onBack }: { title?: string; meta: string; pill?: string; onBack: () => void }) {
  return (
    <>
      <AppHeaderConfig
        title={title}
        onBack={onBack}
        rightKey={pill}
        right={pill ? () => (
          <View style={styles.headerPill} accessibilityLabel={pill}>
            <Text style={styles.headerPillText} numberOfLines={1}>{pill}</Text>
          </View>
        ) : undefined}
      />
      {meta ? <Text style={styles.contextLine} numberOfLines={1}>{meta}</Text> : null}
    </>
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

export function AgenticSurface({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.surface, style]}>{children}</View>
}

const styles = StyleSheet.create({
  contextLine: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  headerPill: {
    minHeight: 32,
    maxWidth: 120,
    flexShrink: 0,
    justifyContent: 'center',
    borderRadius: radius.full,
    paddingHorizontal: spacing[2],
    backgroundColor: colors.backgroundMuted,
  },
  headerPillText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  intro: {
    gap: spacing[1],
  },
  kicker: {
    ...typography.roles.eyebrow,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 13,
  },
  title: {
    color: colors.nav,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 19,
    lineHeight: 25,
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
    fontFamily: typography.fonts.bodyBold,
    fontSize: 16,
    lineHeight: 22,
  },
  sectionMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    lineHeight: 14,
  },
  surface: {
    borderRadius: radius.card,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[3],
  },
})
