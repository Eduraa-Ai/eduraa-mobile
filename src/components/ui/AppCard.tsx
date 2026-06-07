import React, { ReactNode } from 'react'
import { StyleSheet, View, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors } from '../../theme/colors'
import { gradients } from '../../theme/gradients'
import { radius, shadows } from '../../theme/spacing'

interface AppCardProps {
  children: ReactNode
  style?: ViewStyle
  tone?: 'default' | 'tint' | 'dark'
}

export function AppCard({ children, style, tone = 'default' }: AppCardProps) {
  if (tone === 'dark') {
    return (
      <LinearGradient colors={[...gradients.darkNav]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, styles.dark, style]}>
        {children}
      </LinearGradient>
    )
  }

  if (tone === 'tint') {
    return (
      <LinearGradient colors={[...gradients.heroSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, styles.tint, style]}>
        {children}
      </LinearGradient>
    )
  }

  return <View style={[styles.card, styles.default, style]}>{children}</View>
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: 20,
    ...shadows.sm,
  },
  default: {
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tint: {
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  dark: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
})
