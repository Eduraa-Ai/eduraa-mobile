import React, { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, spacing, typography } from '../../theme'

interface PremiumHeaderProps {
  eyebrow?: string
  title: string
  subtitle?: string
  right?: ReactNode
  onBack?: () => void
  style?: ViewStyle
}

export function PremiumHeader({ eyebrow, title, subtitle, right, onBack, style }: PremiumHeaderProps) {
  return (
    <View style={[styles.root, style]}>
      <View style={styles.left}>
        {onBack ? (
          <Pressable onPress={onBack} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
        ) : null}
        <View style={styles.copy}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[4],
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  copy: {
    flex: 1,
  },
  eyebrow: {
    ...typography.roles.eyebrow,
    color: colors.accent,
    marginBottom: spacing[1],
  },
  title: {
    ...typography.roles.screenTitle,
    color: colors.text,
  },
  subtitle: {
    ...typography.roles.body,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  right: {
    flexShrink: 0,
  },
})

export default PremiumHeader
