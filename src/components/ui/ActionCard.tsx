import React, { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius, shadows, spacing, typography } from '../../theme'

interface ActionCardProps {
  title: string
  body?: string
  meta?: string
  icon?: ReactNode
  onPress?: () => void
  style?: ViewStyle
}

export function ActionCard({ title, body, meta, icon, onPress, style }: ActionCardProps) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.root, pressed && styles.pressed, style]}>
      <View style={styles.iconWrap}>{icon ?? <Ionicons name="sparkles" size={20} color={colors.accent} />}</View>
      <View style={styles.copy}>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textSoft} /> : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    padding: spacing[4],
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  copy: {
    flex: 1,
  },
  meta: {
    ...typography.roles.eyebrow,
    color: colors.accent,
    marginBottom: spacing[1],
  },
  title: {
    ...typography.roles.title,
    color: colors.text,
  },
  body: {
    ...typography.roles.body,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
})

export default ActionCard
