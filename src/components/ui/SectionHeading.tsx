import React, { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, spacing, typography } from '../../theme'

interface SectionHeadingProps {
  title: string
  subtitle?: string
  /** Short right-aligned fact, e.g. "12 students" or "2 saved". */
  meta?: string
  /** One small trailing control, e.g. a search or filter icon button. */
  action?: ReactNode
}

/** The one section header used inside page bodies. */
export function SectionHeading({ title, subtitle, meta, action }: SectionHeadingProps) {
  return (
    <View style={styles.root}>
      <View style={styles.copy}>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      {action ?? null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    ...typography.roles.section,
    color: colors.nav,
  },
  subtitle: {
    ...typography.roles.caption,
    color: colors.textMuted,
  },
  meta: {
    ...typography.roles.caption,
    fontFamily: typography.fonts.bodyBold,
    color: colors.textMuted,
  },
})
