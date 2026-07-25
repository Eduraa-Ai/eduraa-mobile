import React from 'react'
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native'
import { colors, radius, spacing, typography } from '../../theme'

interface SelectableChipProps {
  label: string
  selected?: boolean
  onPress?: () => void
  style?: ViewStyle
}

export function SelectableChip({ label, selected = false, onPress, style }: SelectableChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.root, selected && styles.selected, pressed && styles.pressed, style]}
    >
      <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: {
    minHeight: 44,
    borderRadius: radius.full,
    paddingHorizontal: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  selected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  label: {
    ...typography.roles.label,
    color: colors.textSecondary,
  },
  selectedLabel: {
    color: colors.accentStrong,
  },
})

export default SelectableChip
