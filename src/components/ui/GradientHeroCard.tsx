import React, { ReactNode } from 'react'
import { StyleSheet, Text, View, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, gradients, radius, shadows, spacing, typography } from '../../theme'

interface GradientHeroCardProps {
  eyebrow?: string
  title: string
  subtitle?: string
  children?: ReactNode
  style?: ViewStyle
}

export function GradientHeroCard({ eyebrow, title, subtitle, children, style }: GradientHeroCardProps) {
  return (
    <LinearGradient colors={[...gradients.hero]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.root, style]}>
      <View style={styles.highlight} />
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children ? <View style={styles.content}>{children}</View> : null}
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
    borderRadius: radius['2xl'],
    padding: spacing[6],
    ...shadows.hero,
  },
  highlight: {
    position: 'absolute',
    top: -70,
    right: -40,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  eyebrow: {
    ...typography.roles.eyebrow,
    color: 'rgba(255,255,255,0.78)',
    marginBottom: spacing[3],
  },
  title: {
    ...typography.roles.hero,
    color: colors.white,
  },
  subtitle: {
    ...typography.roles.bodyLarge,
    color: 'rgba(255,255,255,0.78)',
    marginTop: spacing[3],
  },
  content: {
    marginTop: spacing[5],
  },
})

export default GradientHeroCard
