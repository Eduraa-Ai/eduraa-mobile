import React, { useEffect, useState } from 'react'
import { AccessibilityInfo, AppState, StyleSheet, Text, View } from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle, Path } from 'react-native-svg'
import { AuthLogoMark } from '../ui/AuthLogoMark'
import { typography } from '../../theme'

export type AuthMotionState = 'intro' | 'idle' | 'identity' | 'password' | 'submitting' | 'error' | 'offline' | 'success'

type Props = {
  state: AuthMotionState
  compact?: boolean
  height?: number
}

type CircuitGroup = 'center' | 'identity' | 'password'
type CircuitRoute = { d: string; group: CircuitGroup }

const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const ROUTES: CircuitRoute[] = [
  { d: 'M180 191 V103', group: 'center' },
  { d: 'M166 184 V142 L139 115 V78', group: 'identity' },
  { d: 'M158 163 H128 L105 140 V104', group: 'identity' },
  { d: 'M155 143 H124 L101 120 H73', group: 'identity' },
  { d: 'M158 123 H139 L119 103 H92', group: 'identity' },
  { d: 'M194 184 V142 L221 115 V78', group: 'password' },
  { d: 'M202 163 H232 L255 140 V104', group: 'password' },
  { d: 'M205 143 H236 L259 120 H287', group: 'password' },
  { d: 'M202 123 H221 L241 103 H268', group: 'password' },
]

const NODES = [
  { cx: 180, cy: 98, group: 'center' as const },
  { cx: 139, cy: 73, group: 'identity' as const },
  { cx: 105, cy: 99, group: 'identity' as const },
  { cx: 68, cy: 120, group: 'identity' as const },
  { cx: 87, cy: 103, group: 'identity' as const },
  { cx: 221, cy: 73, group: 'password' as const },
  { cx: 255, cy: 99, group: 'password' as const },
  { cx: 292, cy: 120, group: 'password' as const },
  { cx: 273, cy: 103, group: 'password' as const },
]

function routeTarget(state: AuthMotionState, group: CircuitGroup) {
  if (state === 'success') return 1
  if (state === 'offline') return 0.12
  if (state === 'error') return group === 'center' ? 0.38 : 0.2
  if (state === 'submitting') return group === 'center' ? 0.92 : 0.62
  if (state === 'identity') return group === 'identity' ? 0.78 : group === 'center' ? 0.5 : 0.2
  if (state === 'password') return group === 'password' ? 0.78 : group === 'center' ? 0.5 : 0.2
  return group === 'center' ? 0.28 : 0.2
}

export default function AuthIntelligenceHero({ state, compact = false, height }: Props) {
  const entrance = useSharedValue(0)
  const lockupEntrance = useSharedValue(0)
  const signalProgress = useSharedValue(0)
  const centerEnergy = useSharedValue(0.18)
  const identityEnergy = useSharedValue(0.14)
  const passwordEnergy = useSharedValue(0.14)
  const seamOffset = useSharedValue(250)
  const nodeBloom = useSharedValue(0.18)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [active, setActive] = useState(true)

  useEffect(() => {
    const motionSubscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion)
    const appSubscription = AppState.addEventListener('change', (next) => setActive(next === 'active'))
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion)
    return () => {
      motionSubscription.remove()
      appSubscription.remove()
    }
  }, [])

  useEffect(() => {
    cancelAnimation(entrance)
    cancelAnimation(lockupEntrance)
    cancelAnimation(signalProgress)
    cancelAnimation(centerEnergy)
    cancelAnimation(identityEnergy)
    cancelAnimation(passwordEnergy)
    cancelAnimation(seamOffset)
    cancelAnimation(nodeBloom)

    if (!active || reducedMotion) {
      entrance.value = 1
      lockupEntrance.value = 1
      signalProgress.value = 1
      centerEnergy.value = state === 'success' ? 0.8 : 0.28
      identityEnergy.value = routeTarget(state, 'identity')
      passwordEnergy.value = routeTarget(state, 'password')
      seamOffset.value = 0
      nodeBloom.value = state === 'success' ? 0.86 : 0.24
      return
    }

    const standard = { duration: 240, easing: Easing.inOut(Easing.cubic) }
    entrance.value = state === 'intro' ? withDelay(120, withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) })) : 1
    lockupEntrance.value = state === 'intro'
      ? withTiming(1, { duration: 440, easing: Easing.out(Easing.cubic) })
      : 1
    centerEnergy.value = withTiming(routeTarget(state, 'center'), standard)
    identityEnergy.value = withTiming(routeTarget(state, 'identity'), standard)
    passwordEnergy.value = withTiming(routeTarget(state, 'password'), standard)

    if (state === 'intro') {
      signalProgress.value = 0
      seamOffset.value = 250
      seamOffset.value = withDelay(120, withTiming(-70, { duration: 680, easing: Easing.inOut(Easing.cubic) }))
      signalProgress.value = withDelay(360, withTiming(1, { duration: 430, easing: Easing.inOut(Easing.cubic) }))
      centerEnergy.value = withDelay(600, withSequence(withTiming(0.94, { duration: 190 }), withTiming(0.28, { duration: 390 })))
      identityEnergy.value = withDelay(710, withSequence(withTiming(0.84, { duration: 230 }), withTiming(0.2, { duration: 360 })))
      passwordEnergy.value = withDelay(820, withSequence(withTiming(0.84, { duration: 230 }), withTiming(0.2, { duration: 340 })))
      nodeBloom.value = withDelay(900, withSequence(withTiming(1, { duration: 140 }), withTiming(0.24, { duration: 300 })))
    } else if (state === 'submitting') {
      seamOffset.value = withRepeat(withTiming(-80, { duration: 1200, easing: Easing.inOut(Easing.cubic) }), -1, false)
      centerEnergy.value = withRepeat(withSequence(withTiming(0.95, { duration: 520 }), withTiming(0.58, { duration: 520 })), -1, true)
      nodeBloom.value = withRepeat(withSequence(withTiming(0.62, { duration: 520 }), withTiming(0.26, { duration: 520 })), -1, true)
    } else if (state === 'success') {
      seamOffset.value = 230
      seamOffset.value = withTiming(-80, { duration: 480, easing: Easing.out(Easing.cubic) })
      nodeBloom.value = withSequence(withTiming(1, { duration: 220 }), withTiming(0.48, { duration: 300 }))
    } else if (state === 'error') {
      nodeBloom.value = withSequence(withTiming(0.48, { duration: 140 }), withTiming(0.2, { duration: 260 }))
    } else if (state === 'offline') {
      nodeBloom.value = withTiming(0.12, standard)
    } else {
      nodeBloom.value = withTiming(0.24, standard)
    }
  }, [active, centerEnergy, entrance, identityEnergy, lockupEntrance, nodeBloom, passwordEnergy, reducedMotion, seamOffset, signalProgress, state])

  const heroStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ translateY: (1 - entrance.value) * 5 }],
  }))
  const lockupStyle = useAnimatedStyle(() => ({
    opacity: lockupEntrance.value,
    transform: [
      { translateY: (1 - lockupEntrance.value) * -5 },
      { scale: 0.97 + lockupEntrance.value * 0.03 },
    ],
  }))
  const centerProps = useAnimatedProps(() => ({ opacity: centerEnergy.value, strokeDashoffset: (1 - centerEnergy.value) * 22 }))
  const identityProps = useAnimatedProps(() => ({ opacity: identityEnergy.value, strokeDashoffset: (1 - identityEnergy.value) * 28 }))
  const passwordProps = useAnimatedProps(() => ({ opacity: passwordEnergy.value, strokeDashoffset: (1 - passwordEnergy.value) * 28 }))
  const nodeCenterProps = useAnimatedProps(() => ({ opacity: Math.max(centerEnergy.value, nodeBloom.value) }))
  const nodeIdentityProps = useAnimatedProps(() => ({ opacity: Math.max(identityEnergy.value, nodeBloom.value * 0.72) }))
  const nodePasswordProps = useAnimatedProps(() => ({ opacity: Math.max(passwordEnergy.value, nodeBloom.value * 0.72) }))
  const seamProps = useAnimatedProps(() => ({ strokeDashoffset: seamOffset.value }))
  const signalProps = useAnimatedProps(() => ({
    cy: 210 - signalProgress.value * 112,
    opacity: state === 'intro' ? Math.sin(signalProgress.value * Math.PI) : 0,
    r: 3.5 + Math.sin(signalProgress.value * Math.PI) * 2,
  }))

  const pathProps = { center: centerProps, identity: identityProps, password: passwordProps }
  const nodeProps = { center: nodeCenterProps, identity: nodeIdentityProps, password: nodePasswordProps }
  const stroke = state === 'error' ? '#ff817b' : state === 'offline' ? '#8b96a8' : state === 'success' ? '#ffbf33' : '#c8b8a5'

  return (
    <View style={[styles.root, compact && styles.compact, height ? { height } : null]}>
      <Animated.View style={[styles.lockup, lockupStyle]}>
        <AuthLogoMark size={compact ? 30 : 36} style={styles.logo} />
        <Text style={[styles.wordmark, compact && styles.wordmarkCompact]}>EDURAA</Text>
        {!compact ? <Text style={styles.tagline}>INTELLIGENCE FOR SERIOUS LEARNING</Text> : null}
      </Animated.View>
      <Animated.View style={[styles.canvas, compact && styles.canvasCompact, height ? { height: Math.max(150, height - 70) } : null, heroStyle]} pointerEvents="none" accessible={false}>
        <Svg width="100%" height="100%" viewBox="0 0 360 250">
          <Path d="M180 50 C136 28 88 52 83 98 C48 112 49 160 79 177 C76 218 119 238 153 216 C163 229 172 236 180 239 C188 236 197 229 207 216 C241 238 284 218 281 177 C311 160 312 112 277 98 C272 52 224 28 180 50 Z" fill="#fbf6ec" stroke="#d8cdbe" strokeWidth="2" opacity="0.9" />
          <Path d="M180 50 C136 28 88 52 83 98 C48 112 49 160 79 177 C76 218 119 238 153 216 C163 229 172 236 180 239" fill="none" stroke="#fffdf8" strokeWidth="3" opacity="0.88" />
          {ROUTES.map(({ d, group }) => (
            <AnimatedPath key={d} d={d} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="28 3" animatedProps={pathProps[group]} />
          ))}
          {NODES.map(({ cx, cy, group }) => (
            <AnimatedCircle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" fill="#fbf6ec" stroke={stroke} strokeWidth="2" animatedProps={nodeProps[group]} />
          ))}
          {!reducedMotion ? <AnimatedCircle cx="180" cy="210" r="4" fill="#fff8e8" stroke="#f36c21" strokeWidth="2.2" animatedProps={signalProps} /> : null}
          <Path d="M0 226 C88 264 236 270 360 224" fill="none" stroke="#c2410c" strokeWidth="5" opacity="0.16" />
          <Path d="M0 226 C88 264 236 270 360 224" fill="none" stroke="#f36c21" strokeWidth="2.3" opacity="0.75" />
          {!reducedMotion ? <AnimatedPath d="M0 226 C88 264 236 270 360 224" fill="none" stroke="#ffe0a3" strokeWidth="6" strokeLinecap="round" strokeDasharray="24 236" animatedProps={seamProps} opacity="0.98" /> : null}
        </Svg>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { height: 372, justifyContent: 'flex-start', backgroundColor: '#fbf6ec' },
  compact: { height: 270 },
  lockup: { zIndex: 2, alignItems: 'center', paddingTop: 22 },
  logo: { borderWidth: 0, shadowOpacity: 0, backgroundColor: 'transparent' },
  wordmark: { marginTop: 8, color: '#101828', fontFamily: typography.fonts.heading, fontSize: 23, letterSpacing: 7 },
  wordmarkCompact: { marginTop: 4, fontSize: 17, letterSpacing: 5 },
  tagline: { marginTop: 3, color: '#c2410c', fontFamily: typography.fonts.bodyBold, fontSize: 8, letterSpacing: 1.2 },
  canvas: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 255 },
  canvasCompact: { height: 200 },
})
