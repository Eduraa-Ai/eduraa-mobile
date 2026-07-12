import React, { ReactNode, useRef } from 'react'
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, gradients, motion, radius, shadows, spacing, typography } from '../../theme'

interface AnimatedButtonProps {
  label: string
  onPress: () => void
  icon?: ReactNode
  loading?: boolean
  disabled?: boolean
  variant?: 'primary' | 'secondary' | 'ghost' | 'auth'
  style?: ViewStyle
}

export function AnimatedButton({ label, onPress, icon, loading = false, disabled = false, variant = 'primary', style }: AnimatedButtonProps) {
  const scale = useRef(new Animated.Value(1)).current

  const animateTo = (value: number) => {
    Animated.timing(scale, {
      toValue: value,
      duration: motion.press.duration,
      easing: motion.easing.standard,
      useNativeDriver: true,
    }).start()
  }

  const isPrimary = variant === 'primary'
  const isAuth = variant === 'auth'
  const labelColor = isPrimary || isAuth ? colors.textOnBrand : variant === 'secondary' ? colors.accentStrong : colors.text

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        disabled={disabled || loading}
        onPress={onPress}
        onPressIn={() => animateTo(motion.press.scale)}
        onPressOut={() => animateTo(1)}
        style={[styles.pressable, disabled && styles.disabled]}
      >
        {isPrimary ? (
          <LinearGradient colors={[...gradients.tealAction]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fill}>
            {loading ? <ActivityIndicator color={colors.white} /> : null}
            {!loading && icon ? icon : null}
            {!loading ? <Text style={[styles.label, { color: labelColor }]}>{label}</Text> : null}
          </LinearGradient>
        ) : (
          <Animated.View style={[styles.fill, isAuth ? styles.auth : variant === 'secondary' ? styles.secondary : styles.ghost]}>
            {loading ? <ActivityIndicator color={isAuth ? colors.white : colors.accent} /> : null}
            {!loading && icon ? icon : null}
            {!loading ? <Text style={[styles.label, { color: labelColor }]}>{label}</Text> : null}
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: radius.full,
  },
  fill: {
    minHeight: 56,
    borderRadius: radius.full,
    paddingHorizontal: spacing[6],
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    ...shadows.sm,
  },
  secondary: {
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  auth: {
    borderRadius: 16,
    backgroundColor: '#07152d',
    shadowColor: '#07152d',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  ghost: {
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    ...typography.roles.body,
    fontFamily: typography.fonts.bodyBold,
  },
  disabled: {
    opacity: 0.56,
  },
})

export default AnimatedButton
