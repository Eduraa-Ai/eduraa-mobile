import React from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius, spacing, typography } from '../../theme'
import { AnimatedButton } from './AnimatedButton'

interface ErrorStateProps {
  title?: string
  message?: string
  actionLabel?: string
  onAction?: () => void
  loading?: boolean
  kind?: 'error' | 'offline'
  style?: ViewStyle
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'Try again in a moment.',
  actionLabel = 'Retry',
  onAction,
  loading = false,
  kind = 'error',
  style,
}: ErrorStateProps) {
  const isOffline = kind === 'offline'
  return (
    <View style={[styles.root, style]} accessibilityRole="alert">
      <View style={[styles.icon, isOffline && styles.offlineIcon]}>
        <Ionicons name={isOffline ? 'cloud-offline-outline' : 'alert-circle-outline'} size={22} color={isOffline ? colors.warning : colors.danger} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onAction ? (
        <AnimatedButton
          label={loading ? 'Reconnecting…' : actionLabel}
          loading={loading}
          variant="secondary"
          size="compact"
          onPress={onAction}
          style={styles.action}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[6],
    borderRadius: radius.card,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSurface,
    marginBottom: spacing[3],
  },
  offlineIcon: {
    backgroundColor: colors.warningSurface,
  },
  title: {
    ...typography.roles.section,
    color: colors.nav,
    textAlign: 'center',
  },
  message: {
    ...typography.roles.caption,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing[1],
    maxWidth: 300,
  },
  action: {
    marginTop: spacing[4],
    minWidth: 140,
  },
})

export default ErrorState
