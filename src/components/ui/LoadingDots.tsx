import React, { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View, ViewStyle } from 'react-native'
import { colors, motion, spacing } from '../../theme'

interface LoadingDotsProps {
  color?: string
  style?: ViewStyle
}

export function LoadingDots({ color = colors.accent, style }: LoadingDotsProps) {
  const dots = [useRef(new Animated.Value(0.35)).current, useRef(new Animated.Value(0.35)).current, useRef(new Animated.Value(0.35)).current]

  useEffect(() => {
    const animations = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * motion.aiTyping.dotDelay),
          Animated.timing(dot, {
            toValue: 1,
            duration: motion.aiTyping.dotDuration / 2,
            easing: motion.easing.standard,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.35,
            duration: motion.aiTyping.dotDuration / 2,
            easing: motion.easing.standard,
            useNativeDriver: true,
          }),
        ]),
      ),
    )

    animations.forEach((animation) => animation.start())
    return () => animations.forEach((animation) => animation.stop())
  }, [dots])

  return (
    <View style={[styles.root, style]}>
      {dots.map((opacity, index) => (
        <Animated.View key={index} style={[styles.dot, { backgroundColor: color, opacity }]} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
})

export default LoadingDots
