import React from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { colors, radius, spacing, typography } from '../../theme'

export interface SummaryStat {
  label: string
  value: string
  /** Colours the value only; use for a number that needs attention. */
  tone?: 'default' | 'success' | 'warning' | 'danger'
}

const valueColors = {
  default: colors.nav,
  success: colors.successText,
  warning: colors.warning,
  danger: colors.dangerText,
}

/**
 * The slim stats row that replaces hero cards at the top of a screen.
 * Two to four facts, each said once.
 */
export function SummaryStrip({ stats, style }: { stats: SummaryStat[]; style?: ViewStyle }) {
  return (
    <View style={[styles.root, style]}>
      {stats.map((stat, index) => (
        <View
          key={stat.label}
          accessible
          accessibilityLabel={`${stat.label}: ${stat.value}`}
          style={[styles.item, index > 0 && styles.divider]}
        >
          <Text style={[styles.value, { color: valueColors[stat.tone ?? 'default'] }]} numberOfLines={1}>{stat.value}</Text>
          <Text style={styles.label} numberOfLines={1}>{stat.label}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    paddingVertical: spacing[3],
  },
  item: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing[3],
    gap: 2,
  },
  divider: {
    borderLeftWidth: 1,
    borderLeftColor: colors.borderSubtle,
  },
  value: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 20,
    lineHeight: 26,
    fontVariant: ['tabular-nums'],
  },
  label: {
    ...typography.roles.caption,
    color: colors.textMuted,
  },
})
