import React, { ReactNode, useEffect, useRef } from 'react'
import { Animated, StyleSheet, ViewStyle } from 'react-native'
import { colors, motion, radius, shadows, spacing } from '../../theme'

interface AnimatedCardProps {
  children: ReactNode
  delay?: number
  style?: ViewStyle
  elevated?: boolean
}

export function AnimatedCard({ children, delay = 0, style, elevated = false }: AnimatedCardProps) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(motion.cardEntrance.translateY)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.cardEntrance.duration,
        delay,
        easing: motion.easing.entrance,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: motion.cardEntrance.duration,
        delay,
        easing: motion.easing.entrance,
        useNativeDriver: true,
      }),
    ]).start()
  }, [delay, opacity, translateY])

  return (
    <Animated.View
      style={[
        styles.card,
        elevated ? shadows.md : shadows.sm,
        {
          opacity,
          transform: [{ translateY }],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    padding: spacing[5],
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
})

export default AnimatedCard
