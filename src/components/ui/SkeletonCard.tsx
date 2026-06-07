import React, { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, gradients, motion, radius, spacing } from '../../theme'

interface SkeletonCardProps {
  lines?: number
  style?: ViewStyle
}

export function SkeletonCard({ lines = 3, style }: SkeletonCardProps) {
  const translateX = useRef(new Animated.Value(-motion.skeleton.shimmerWidth)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(translateX, {
        toValue: motion.skeleton.shimmerWidth,
        duration: motion.skeleton.duration,
        easing: motion.easing.standard,
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [translateX])

  return (
    <View style={[styles.root, style]}>
      <View style={styles.media} />
      {Array.from({ length: lines }).map((_, index) => (
        <View key={index} style={[styles.line, index === lines - 1 && styles.shortLine]} />
      ))}
      <Animated.View style={[styles.shimmer, { transform: [{ translateX }] }]}>
        <LinearGradient colors={[...gradients.skeleton]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
    borderRadius: radius.card,
    padding: spacing[5],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: spacing[3],
  },
  media: {
    height: 92,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
  },
  line: {
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
  },
  shortLine: {
    width: '62%',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: motion.skeleton.shimmerWidth,
    opacity: 0.42,
  },
})

export default SkeletonCard
