import React from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import { ProgressRing } from './ProgressRing'

interface ScoreCardProps {
  score: number
  title?: string
  subtitle?: string
  style?: ViewStyle
}

export function ScoreCard({ score, title = 'Learning score', subtitle, style }: ScoreCardProps) {
  const tone = score >= 80 ? colors.success : score >= 55 ? colors.warning : colors.danger

  return (
    <View style={[styles.root, style]}>
      <View style={styles.copy}>
        <Text style={styles.kicker}>Progress</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <ProgressRing value={score} color={tone} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[5],
    padding: spacing[5],
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  copy: {
    flex: 1,
  },
  kicker: {
    ...typography.roles.eyebrow,
    color: colors.accent,
    marginBottom: spacing[2],
  },
  title: {
    ...typography.roles.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.roles.body,
    color: colors.textMuted,
    marginTop: spacing[2],
  },
})

export default ScoreCard
