import React, { ReactNode, useRef } from 'react'
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, ViewStyle } from 'react-native'
import { colors, motion, radius, spacing, typography } from '../../theme'
import { useReducedMotion } from '../../hooks/useReducedMotion'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'auth'

interface AnimatedButtonProps {
  label: string
  accessibilityLabel?: string
  onPress: () => void
  icon?: ReactNode
  loading?: boolean
  disabled?: boolean
  /**
   * primary: the one solid action on a screen. secondary: bordered, for
   * supporting actions such as Retry. ghost: quiet text action. auth: sign-in
   * flows only.
   */
  variant?: ButtonVariant
  size?: 'regular' | 'compact'
  style?: ViewStyle
}

const labelColors: Record<ButtonVariant, string> = {
  primary: colors.textOnBrand,
  auth: colors.textOnBrand,
  secondary: colors.accentStrong,
  ghost: colors.text,
}

export function AnimatedButton({ label, accessibilityLabel, onPress, icon, loading = false, disabled = false, variant = 'primary', size = 'regular', style }: AnimatedButtonProps) {
  const scale = useRef(new Animated.Value(1)).current
  const reducedMotion = useReducedMotion()

  const animateTo = (value: number) => {
    if (reducedMotion) {
      scale.setValue(1)
      return
    }
    Animated.timing(scale, {
      toValue: value,
      duration: motion.press.duration,
      easing: motion.easing.standard,
      useNativeDriver: true,
    }).start()
  }

  const labelColor = labelColors[variant]
  const spinnerColor = variant === 'primary' || variant === 'auth' ? colors.white : colors.accent

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
        onPress={onPress}
        onPressIn={() => animateTo(motion.press.scale)}
        onPressOut={() => animateTo(1)}
        style={({ pressed }) => [styles.fill, size === 'compact' && styles.compact, styles[variant], pressed && styles.pressed, disabled && styles.disabled]}
      >
        {loading ? <ActivityIndicator color={spinnerColor} /> : null}
        {!loading && icon ? icon : null}
        {!loading ? <Text style={[styles.label, size === 'compact' && styles.compactLabel, { color: labelColor }]}>{label}</Text> : null}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  fill: {
    minHeight: 48,
    borderRadius: radius.control,
    paddingHorizontal: spacing[5],
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing[2],
  },
  compact: {
    minHeight: 40,
    borderRadius: radius.sm,
    paddingHorizontal: spacing[4],
  },
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  auth: {
    minHeight: 56,
    borderRadius: 16,
    backgroundColor: '#07152d',
    shadowColor: '#07152d',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  pressed: {
    opacity: 0.86,
  },
  label: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 15,
    lineHeight: 20,
  },
  compactLabel: {
    fontSize: 13,
    lineHeight: 18,
  },
  disabled: {
    opacity: 0.5,
  },
})

export default AnimatedButton
