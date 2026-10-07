import React, { ReactNode } from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { colors, radius, spacing, typography } from '../../theme'

interface NoticeCardProps {
  eyebrow?: string
  title: string
  subtitle?: string
  children?: ReactNode
  style?: ViewStyle
}

/** A calm status/setup message: one white card, said once, no decoration. */
export function NoticeCard({ eyebrow, title, subtitle, children, style }: NoticeCardProps) {
  return (
    <View style={[styles.root, style]}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children ? <View style={styles.content}>{children}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing[1],
    padding: spacing[4],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  eyebrow: {
    ...typography.roles.groupLabel,
    color: colors.textMuted,
  },
  title: {
    ...typography.roles.section,
    fontSize: 17,
    color: colors.nav,
  },
  subtitle: {
    ...typography.roles.caption,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  content: {
    marginTop: spacing[3],
  },
})
