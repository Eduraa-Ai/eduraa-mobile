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
    <View style={[styles.root, isOffline && styles.offlineRoot, style]} accessibilityRole="alert">
      <View style={styles.icon}>
        <Ionicons name={isOffline ? 'cloud-offline-outline' : 'alert-circle'} size={24} color={isOffline ? colors.warning : colors.danger} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onAction ? <AnimatedButton label={loading ? 'Reconnecting…' : actionLabel} loading={loading} variant="secondary" onPress={onAction} style={styles.action} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
    borderRadius: radius.card,
    backgroundColor: colors.dangerSurface,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  offlineRoot: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    marginBottom: spacing[4],
  },
  title: {
    ...typography.roles.title,
    color: colors.text,
    textAlign: 'center',
  },
  message: {
    ...typography.roles.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing[2],
  },
  action: {
    marginTop: spacing[5],
    alignSelf: 'stretch',
  },
})

export default ErrorState
