import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius, spacing, typography } from '../../theme'

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  body: string
}

export function EmptyState({ icon, title, body }: EmptyStateProps) {
  return (
    <View style={styles.root}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={19} color={colors.iconInk} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    paddingVertical: spacing[5],
    paddingHorizontal: spacing[4],
    gap: spacing[1],
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.iconSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  title: {
    ...typography.roles.section,
    color: colors.nav,
    textAlign: 'center',
  },
  body: {
    ...typography.roles.caption,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 280,
  },
})
