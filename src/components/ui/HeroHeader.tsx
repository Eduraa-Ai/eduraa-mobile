import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../../theme/colors'
import { fonts } from '../../theme/fonts'
import { gradients } from '../../theme/gradients'
import { radius, spacing } from '../../theme/spacing'

interface HeroHeaderProps {
  eyebrow?: string
  title: string
  subtitle?: string
  icon?: keyof typeof Ionicons.glyphMap
}

export function HeroHeader({ eyebrow, title, subtitle, icon = 'sparkles' }: HeroHeaderProps) {
  return (
    <LinearGradient colors={[...gradients.hero]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.row}>
        <View style={styles.copy}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={22} color={colors.textOnBrand} />
        </View>
      </View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius['2xl'],
    padding: spacing[5],
    gap: spacing[2],
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[4],
  },
  copy: {
    flex: 1,
    gap: spacing[2],
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.textOnBrand,
    fontFamily: fonts.displayBold,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.6,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
