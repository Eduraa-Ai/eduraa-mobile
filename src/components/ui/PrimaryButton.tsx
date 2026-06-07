import React from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors } from '../../theme/colors'
import { fonts } from '../../theme/fonts'
import { radius, spacing, shadows } from '../../theme/spacing'
import { gradients } from '../../theme/gradients'

interface PrimaryButtonProps {
  label: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  variant?: 'solid' | 'secondary' | 'ghost'
  style?: ViewStyle
}

export function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'solid',
  style,
}: PrimaryButtonProps) {
  const isSolid = variant === 'solid'
  const isSecondary = variant === 'secondary'

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.touchable, style, disabled && styles.disabled]}
    >
      {isSolid ? (
        <LinearGradient colors={[...gradients.hero]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.solid}>
          {loading ? <ActivityIndicator color={colors.textOnBrand} /> : <Text style={styles.solidText}>{label}</Text>}
        </LinearGradient>
      ) : (
        <LinearGradient
          colors={isSecondary ? [...gradients.heroSoft] : ['transparent', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.secondary, isSecondary ? styles.secondaryBorder : styles.ghostBorder]}
        >
          {loading ? (
            <ActivityIndicator color={colors.accentStrong} />
          ) : (
            <Text style={[styles.secondaryText, variant === 'ghost' && styles.ghostText]}>{label}</Text>
          )}
        </LinearGradient>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  touchable: {
    borderRadius: radius.full,
  },
  disabled: {
    opacity: 0.6,
  },
  solid: {
    minHeight: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
    ...shadows.sm,
  },
  solidText: {
    color: colors.textOnBrand,
    fontFamily: fonts.bold,
    fontSize: 15,
    letterSpacing: 0.2,
  },
  secondary: {
    minHeight: 54,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  secondaryBorder: {
    borderWidth: 1.5,
    borderColor: colors.borderBrand,
  },
  ghostBorder: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  secondaryText: {
    color: colors.accentStrong,
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  ghostText: {
    color: colors.text,
  },
})
