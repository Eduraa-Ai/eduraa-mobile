import React from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { colors, radius, shadows, spacing, typography } from '../../theme'

interface MetricCardProps {
  label: string
  value: string
  helper?: string
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  style?: ViewStyle
}

const toneMap = {
  default: { bg: colors.card, fg: colors.accent },
  success: { bg: colors.successSurface, fg: colors.success },
  warning: { bg: colors.warningSurface, fg: colors.warning },
  danger: { bg: colors.dangerSurface, fg: colors.danger },
  info: { bg: colors.infoSurface, fg: colors.info },
}

export function MetricCard({ label, value, helper, tone = 'default', style }: MetricCardProps) {
  const toneColors = toneMap[tone]

  return (
    <View style={[styles.root, { backgroundColor: toneColors.bg }, style]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: toneColors.fg }]}>{value}</Text>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 112,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[4],
    justifyContent: 'space-between',
    ...shadows.xs,
  },
  label: {
    ...typography.roles.label,
    color: colors.textMuted,
  },
  value: {
    ...typography.roles.screenTitle,
    fontSize: 30,
  },
  helper: {
    ...typography.roles.body,
    color: colors.textSecondary,
  },
})

export default MetricCard
