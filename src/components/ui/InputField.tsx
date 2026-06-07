import React, { ReactNode, useState } from 'react'
import { StyleSheet, Text, TextInput, TextInputProps, TouchableOpacity, View } from 'react-native'
import { colors } from '../../theme/colors'
import { fonts } from '../../theme/fonts'
import { radius, spacing } from '../../theme/spacing'

interface InputFieldProps extends TextInputProps {
  label: string
  left?: ReactNode
  right?: ReactNode
}

export function InputField({ label, left, right, style, ...props }: InputFieldProps) {
  const [focused, setFocused] = useState(false)

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity activeOpacity={1} style={[styles.wrap, focused && styles.focused]}>
        {left ? <View style={styles.slot}>{left}</View> : null}
        <TextInput
          {...props}
          style={[styles.input, style]}
          placeholderTextColor={colors.textSubtle}
          onFocus={(e) => {
            setFocused(true)
            props.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            props.onBlur?.(e)
          }}
        />
        {right ? <View style={styles.slot}>{right}</View> : null}
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing[2],
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 12,
    letterSpacing: 0.3,
  },
  wrap: {
    minHeight: 56,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
  },
  focused: {
    borderColor: colors.accent,
    backgroundColor: colors.backgroundElevated,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 15,
    paddingVertical: 0,
  },
  slot: {
    marginRight: spacing[2],
  },
})
