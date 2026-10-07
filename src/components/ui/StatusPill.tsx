import React from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius, typography } from '../../theme'

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand'

const tones: Record<StatusTone, { surface: string; ink: string }> = {
  success: { surface: colors.successSurface, ink: colors.successText },
  warning: { surface: colors.warningSurface, ink: colors.warning },
  danger: { surface: colors.dangerSurface, ink: colors.dangerText },
  info: { surface: colors.infoSurface, ink: colors.info },
  neutral: { surface: colors.backgroundMuted, ink: colors.textSecondary },
  brand: { surface: colors.accentSurface, ink: colors.accentStrong },
}

interface StatusPillProps {
  label: string
  tone?: StatusTone
  icon?: keyof typeof Ionicons.glyphMap
  style?: ViewStyle
}

/** Read-only state label (Published, Saved, Pending). Not a button. */
export function StatusPill({ label, tone = 'neutral', icon, style }: StatusPillProps) {
  const { surface, ink } = tones[tone]
  return (
    <View style={[styles.root, { backgroundColor: surface }, style]}>
      {icon ? <Ionicons name={icon} size={12} color={ink} /> : null}
      <Text style={[styles.label, { color: ink }]} numberOfLines={1}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 24,
    paddingHorizontal: 9,
    borderRadius: radius.full,
  },
  label: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11.5,
    lineHeight: 15,
  },
})
