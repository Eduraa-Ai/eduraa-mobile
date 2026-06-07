import React, { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { colors, motion, typography } from '../../theme'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

interface ProgressRingProps {
  value: number
  size?: number
  strokeWidth?: number
  label?: string
  color?: string
  trackColor?: string
  textColor?: string
  labelColor?: string
}

export function ProgressRing({
  value,
  size = 92,
  strokeWidth = 9,
  label,
  color = colors.accent,
  trackColor = colors.surface2,
  textColor = colors.text,
  labelColor = colors.textMuted,
}: ProgressRingProps) {
  const progress = useRef(new Animated.Value(0)).current
  const radiusValue = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radiusValue
  const clamped = Math.max(0, Math.min(100, value))

  useEffect(() => {
    Animated.timing(progress, {
      toValue: clamped,
      duration: motion.progress.duration,
      easing: motion.easing.emphasized,
      useNativeDriver: false,
    }).start()
  }, [clamped, progress])

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  })

  return (
    <View style={[styles.root, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radiusValue} stroke={trackColor} strokeWidth={strokeWidth} fill="transparent" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radiusValue}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.center}>
        <Text style={[styles.value, { color: textColor }]}>{Math.round(clamped)}%</Text>
        {label ? <Text style={[styles.label, { color: labelColor }]}>{label}</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    ...typography.roles.title,
  },
  label: {
    ...typography.roles.label,
  },
})

export default ProgressRing
