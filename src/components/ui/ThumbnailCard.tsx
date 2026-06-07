import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { colors } from '../../theme/colors'
import { fonts } from '../../theme/fonts'
import { gradients } from '../../theme/gradients'
import { radius, spacing } from '../../theme/spacing'

interface ThumbnailCardProps {
  title: string
  subtitle: string
  metric?: string
  icon?: keyof typeof Ionicons.glyphMap
  onPress?: () => void
}

export function ThumbnailCard({
  title,
  subtitle,
  metric,
  icon = 'sparkles-outline',
  onPress,
}: ThumbnailCardProps) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} disabled={!onPress}>
      <View style={styles.card}>
        <LinearGradient colors={[...gradients.hero]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.thumbnail}>
          <View style={styles.badge}>
            <Ionicons name={icon} size={18} color={colors.textOnBrand} />
          </View>
          {metric ? <Text style={styles.metric}>{metric}</Text> : null}
        </LinearGradient>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbnail: {
    height: 112,
    padding: spacing[4],
    justifyContent: 'space-between',
  },
  badge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metric: {
    color: colors.textOnBrand,
    fontFamily: fonts.displayBold,
    fontSize: 24,
    letterSpacing: -0.6,
  },
  body: {
    padding: spacing[4],
    gap: spacing[1],
  },
  title: {
    color: colors.text,
    fontFamily: fonts.displaySemibold,
    fontSize: 15,
    lineHeight: 20,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
  },
})
