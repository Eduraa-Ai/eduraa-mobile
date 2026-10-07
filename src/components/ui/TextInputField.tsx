import React, { ReactNode, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native'
import { colors, motion, radius, shadows, spacing, typography } from '../../theme'

interface TextInputFieldProps extends TextInputProps {
  label?: string
  error?: string
  left?: ReactNode
  right?: ReactNode
  /** compact: in-app forms (default). large: sign-in and registration. */
  size?: 'compact' | 'large'
}

export function TextInputField({ label, error, left, right, size = 'compact', style, onFocus, onBlur, ...props }: TextInputFieldProps) {
  const large = size === 'large'
  const [focused, setFocused] = useState(false)
  const focus = useRef(new Animated.Value(0)).current

  const setFocus = (value: boolean) => {
    setFocused(value)
    Animated.timing(focus, {
      toValue: value ? 1 : 0,
      duration: motion.duration.quick,
      easing: motion.easing.standard,
      useNativeDriver: false,
    }).start()
  }

  const borderColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? colors.danger : colors.border, colors.accent],
  })

  return (
    <View style={styles.root}>
      {label ? <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text> : null}
      <Animated.View style={[styles.field, large && styles.fieldLarge, { borderColor }, error && styles.errorField]}>
        {left ? <View style={styles.leftSlot}>{left}</View> : null}
        <TextInput
          {...props}
          style={[styles.input, large && styles.inputLarge, style]}
          placeholderTextColor={colors.placeholder}
          onFocus={(event) => {
            setFocus(true)
            onFocus?.(event)
          }}
          onBlur={(event) => {
            setFocus(false)
            onBlur?.(event)
          }}
        />
        {right ? <View style={styles.rightSlot}>{right}</View> : null}
      </Animated.View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing[1] + 2,
  },
  label: {
    ...typography.roles.label,
    color: colors.textMuted,
  },
  labelFocused: {
    color: colors.accent,
  },
  field: {
    minHeight: 46,
    borderRadius: radius.control,
    borderWidth: 1,
    backgroundColor: colors.backgroundElevated,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[3],
  },
  fieldLarge: {
    minHeight: 56,
    borderRadius: radius.authInput,
    borderWidth: 1.5,
    paddingHorizontal: spacing[4],
    ...shadows.xs,
  },
  errorField: {
    backgroundColor: colors.dangerSurface,
  },
  input: {
    flex: 1,
    minHeight: 44,
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: typography.sizes.base,
    paddingVertical: 0,
  },
  inputLarge: {
    minHeight: 52,
    fontSize: typography.sizes.md,
  },
  leftSlot: {
    marginRight: spacing[2],
  },
  rightSlot: {
    marginLeft: spacing[2],
  },
  error: {
    ...typography.roles.label,
    color: colors.danger,
  },
})

export default TextInputField
