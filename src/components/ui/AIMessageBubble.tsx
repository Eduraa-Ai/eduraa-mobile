import React from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import { LoadingDots } from './LoadingDots'

interface AIMessageBubbleProps {
  role: 'assistant' | 'user'
  text?: string
  typing?: boolean
  timestamp?: string
  style?: ViewStyle
}

export function AIMessageBubble({ role, text, typing = false, timestamp, style }: AIMessageBubbleProps) {
  const isUser = role === 'user'

  return (
    <View style={[styles.row, isUser && styles.userRow, style]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        {typing ? <LoadingDots color={isUser ? colors.white : colors.accent} /> : <Text style={[styles.text, isUser && styles.userText]}>{text}</Text>}
        {timestamp ? <Text style={[styles.time, isUser && styles.userTime]}>{timestamp}</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '84%',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.xl,
  },
  assistantBubble: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: radius.sm,
    ...shadows.xs,
  },
  userBubble: {
    backgroundColor: colors.slate[900],
    borderBottomRightRadius: radius.sm,
  },
  text: {
    ...typography.roles.body,
    color: colors.text,
  },
  userText: {
    color: colors.white,
  },
  time: {
    ...typography.roles.label,
    color: colors.textSoft,
    marginTop: spacing[2],
  },
  userTime: {
    color: 'rgba(255,255,255,0.58)',
  },
})

export default AIMessageBubble
