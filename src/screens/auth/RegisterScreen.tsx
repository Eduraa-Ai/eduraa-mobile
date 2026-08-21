import React, { useState } from 'react'
import { LayoutChangeEvent, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import Svg, { Circle, Path } from 'react-native-svg'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AuthLogoMark } from '../../components/ui'
import type { AuthStackParamList } from '../../navigation'
import { typography } from '../../theme'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { getAuthHandoffDelay, shouldStackRegistrationChoices } from '../../components/auth/authMotionModel'

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Register'>

// ── Canonical row palette (main-html-whole-workflow.html · id="register" orbit) ──
const NAVY = '#07152d'
const NAVY_PLANET = '#10223d'
const CREAM = '#fbf6ec'
const ORANGE = '#f36c21'
const GOLD = '#ffbf33'
const RUST_LIGHT = '#ff8a4d'
const STEP_BG = '#fff0e5'
const STEP_TEXT = '#9a3412'
const MUTED_LIGHT = '#aab5c6'
const MUTED_ON_LIGHT = '#667085'

const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' })

// Orbit-map coordinate space matches the canonical SVG viewBox exactly.
const MAP_W = 350
const MAP_H = 545
const PLANET_D = 146

// Deterministic starfield scatter — approximates the canonical tri-color radial-gradient tiling.
const STARS: Array<{ x: number; y: number; r: number; color: string }> = [
  { x: 6, y: 4, r: 1.4, color: 'rgba(243,108,33,0.7)' }, { x: 34, y: 9, r: 1, color: 'rgba(148,163,184,0.55)' },
  { x: 62, y: 5, r: 1.2, color: 'rgba(255,191,51,0.7)' }, { x: 88, y: 11, r: 1, color: 'rgba(148,163,184,0.55)' },
  { x: 16, y: 16, r: 1, color: 'rgba(148,163,184,0.55)' }, { x: 48, y: 20, r: 1.3, color: 'rgba(243,108,33,0.7)' },
  { x: 76, y: 15, r: 1, color: 'rgba(148,163,184,0.55)' }, { x: 4, y: 26, r: 1.2, color: 'rgba(255,191,51,0.7)' },
  { x: 30, y: 30, r: 1, color: 'rgba(148,163,184,0.55)' }, { x: 58, y: 27, r: 1.4, color: 'rgba(243,108,33,0.7)' },
  { x: 92, y: 33, r: 1, color: 'rgba(148,163,184,0.55)' }, { x: 12, y: 38, r: 1, color: 'rgba(148,163,184,0.55)' },
  { x: 40, y: 42, r: 1.2, color: 'rgba(255,191,51,0.7)' }, { x: 70, y: 39, r: 1, color: 'rgba(148,163,184,0.55)' },
  { x: 96, y: 45, r: 1.3, color: 'rgba(243,108,33,0.7)' }, { x: 20, y: 50, r: 1, color: 'rgba(148,163,184,0.55)' },
  { x: 52, y: 54, r: 1, color: 'rgba(148,163,184,0.55)' }, { x: 82, y: 51, r: 1.2, color: 'rgba(255,191,51,0.7)' },
  { x: 8, y: 60, r: 1, color: 'rgba(148,163,184,0.55)' }, { x: 36, y: 64, r: 1.4, color: 'rgba(243,108,33,0.7)' },
  { x: 64, y: 61, r: 1, color: 'rgba(148,163,184,0.55)' }, { x: 90, y: 67, r: 1, color: 'rgba(148,163,184,0.55)' },
  { x: 14, y: 72, r: 1.2, color: 'rgba(255,191,51,0.7)' }, { x: 44, y: 76, r: 1, color: 'rgba(148,163,184,0.55)' },
  { x: 72, y: 73, r: 1.3, color: 'rgba(243,108,33,0.7)' }, { x: 98, y: 79, r: 1, color: 'rgba(148,163,184,0.55)' },
  { x: 24, y: 84, r: 1, color: 'rgba(148,163,184,0.55)' }, { x: 56, y: 88, r: 1.2, color: 'rgba(255,191,51,0.7)' },
  { x: 80, y: 85, r: 1, color: 'rgba(148,163,184,0.55)' }, { x: 2, y: 91, r: 1.4, color: 'rgba(243,108,33,0.7)' },
  { x: 46, y: 95, r: 1, color: 'rgba(148,163,184,0.55)' }, { x: 68, y: 92, r: 1, color: 'rgba(148,163,184,0.55)' },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

type OrbitChoiceProps = {
  tone: 'planet' | 'cream'
  titleLines: [string, string]
  descriptionLines: [string, string]
  scale: number
  positionStyle?: { left?: number; top?: number; right?: number; bottom?: number }
  stacked?: boolean
  selected: boolean
  disabled: boolean
  onPressIn: () => void
  onPress: () => void
}

function OrbitChoice({ tone, titleLines, descriptionLines, scale, positionStyle, stacked = false, selected, disabled, onPressIn, onPress }: OrbitChoiceProps) {
  const dark = tone === 'planet'
  const diameter = PLANET_D * scale

  return (
    <Pressable
      onPressIn={onPressIn}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${titleLines.join(' ')}. ${descriptionLines.join(' ')}`}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.planet,
        stacked && styles.planetStacked,
        dark ? styles.planetDark : styles.planetCream,
        stacked
          ? styles.planetStackedSize
          : { width: diameter, height: diameter, borderRadius: diameter / 2, ...positionStyle },
        (pressed || selected) && (dark ? styles.planetDarkActive : styles.planetCreamActive),
        (pressed || selected) && styles.planetSelected,
        disabled && !selected && styles.planetDisabled,
      ]}
    >
      <Text style={[styles.planetTitle, stacked && styles.planetTextStacked, { color: dark ? '#ffffff' : NAVY, fontSize: Math.round(17 * scale), lineHeight: Math.round(19 * scale) }]}>
        {stacked ? titleLines.join(' ') : <>{titleLines[0]}{`\n`}{titleLines[1]}</>}
      </Text>
      <Text style={[styles.planetDescription, stacked && styles.planetTextStacked, { color: dark ? '#c5ceda' : '#526071', fontSize: Math.round(11 * scale), lineHeight: Math.round(15 * scale) }]}>
        {stacked ? descriptionLines.join(' ') : <>{descriptionLines[0]}{`\n`}{descriptionLines[1]}</>}
      </Text>
      <Ionicons name="arrow-forward" size={14} color={ORANGE} style={styles.planetArrow} />
    </Pressable>
  )
}

export default function RegisterScreen() {
  const navigation = useNavigation<Nav>()
  const insets = useSafeAreaInsets()
  const { fontScale } = useWindowDimensions()
  const reducedMotion = useReducedMotion()
  const useAccessibleChoices = shouldStackRegistrationChoices(fontScale)
  const [selectedPath, setSelectedPath] = useState<'individual' | 'institution' | null>(null)
  const [isNavigating, setIsNavigating] = useState(false)
  const [mapWidth, setMapWidth] = useState(0)
  const navigateTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigationPending = React.useRef(false)

  const clearPendingNavigation = React.useCallback(() => {
    if (navigateTimeout.current) {
      clearTimeout(navigateTimeout.current)
      navigateTimeout.current = null
    }
    navigationPending.current = false
  }, [])

  useFocusEffect(
    React.useCallback(() => {
      setSelectedPath(null)
      setIsNavigating(false)
      return clearPendingNavigation
    }, [clearPendingNavigation]),
  )

  const selectAndNavigate = (path: 'individual' | 'institution') => {
    if (navigationPending.current) return
    navigationPending.current = true
    setSelectedPath(path)
    setIsNavigating(true)
    const destination = path === 'individual' ? 'RegisterIndividual' : 'RegisterSchool'
    const handoffDelay = getAuthHandoffDelay(reducedMotion, 'registration')
    if (!handoffDelay) {
      navigation.navigate(destination)
      return
    }
    navigateTimeout.current = setTimeout(() => {
      navigateTimeout.current = null
      navigation.navigate(destination)
    }, handoffDelay)
  }

  const onMapLayout = (event: LayoutChangeEvent) => {
    setMapWidth(event.nativeEvent.layout.width)
  }

  const scale = mapWidth ? clamp(mapWidth / MAP_W, 0.82, 1.15) : 0
  const mapHeight = mapWidth ? MAP_H * (mapWidth / MAP_W) : 0

  return (
    <View style={styles.root}>
      <View style={styles.starLayer} pointerEvents="none">
        {STARS.map((star, index) => (
          <View
            key={index}
            style={[
              styles.star,
              {
                left: `${star.x}%`,
                top: `${star.y}%`,
                width: star.r * 2,
                height: star.r * 2,
                borderRadius: star.r,
                backgroundColor: star.color,
              },
            ]}
          />
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 22, paddingBottom: insets.bottom + 26 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, useAccessibleChoices && styles.headerAccessible]}>
          <Pressable
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Back to login"
            hitSlop={8}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressedSoft]}
          >
            <Ionicons name="arrow-back" size={18} color="#ffffff" />
          </Pressable>
          <View style={styles.brand}>
            <AuthLogoMark size={40} />
            <View>
              <Text style={styles.brandName}>Eduraa AI</Text>
              <Text style={styles.brandContext}>Create your account</Text>
            </View>
          </View>
          <View style={[styles.stepPill, useAccessibleChoices && styles.stepPillAccessible]}>
            <Text style={styles.stepPillText}>01 · Choose</Text>
          </View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>Your learning relationship</Text>
          <Text style={styles.title}>Choose your orbit.</Text>
          <Text style={styles.subtitle}>Every learning path starts with who shapes the journey.</Text>
        </View>

        {useAccessibleChoices ? (
          <View style={styles.choiceStack}>
            <OrbitChoice
              tone="planet"
              titleLines={['Individual', 'learner']}
              descriptionLines={['My goals. My pace.', 'My space.']}
              scale={1}
              stacked
              selected={selectedPath === 'individual'}
              disabled={isNavigating}
              onPressIn={() => setSelectedPath('individual')}
              onPress={() => selectAndNavigate('individual')}
            />
            <OrbitChoice
              tone="cream"
              titleLines={['Institution', 'workspace']}
              descriptionLines={['My school. My role.', 'Connected learning.']}
              scale={1}
              stacked
              selected={selectedPath === 'institution'}
              disabled={isNavigating}
              onPressIn={() => setSelectedPath('institution')}
              onPress={() => selectAndNavigate('institution')}
            />
          </View>
        ) : (
          <View style={[styles.map, mapWidth ? { height: mapHeight } : null]} onLayout={onMapLayout}>
          {mapWidth ? (
            <>
              <Svg width={mapWidth} height={mapHeight} viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={StyleSheet.absoluteFill}>
                <Path
                  d="M77 112 C198 115 159 366 272 408"
                  fill="none"
                  stroke={ORANGE}
                  strokeWidth={2}
                  strokeDasharray="5 8"
                  opacity={0.78}
                />
                <Circle cx={77} cy={112} r={4} fill={ORANGE} />
                <Circle cx={272} cy={408} r={4} fill={GOLD} />
              </Svg>

              <OrbitChoice
                tone="planet"
                titleLines={['Individual', 'learner']}
                descriptionLines={['My goals. My pace.', 'My space.']}
                scale={scale}
                positionStyle={{ left: 4 * scale, top: 38 * scale }}
                selected={selectedPath === 'individual'}
                disabled={isNavigating}
                onPressIn={() => setSelectedPath('individual')}
                onPress={() => selectAndNavigate('individual')}
              />
              <OrbitChoice
                tone="cream"
                titleLines={['Institution', 'workspace']}
                descriptionLines={['My school. My role.', 'Connected learning.']}
                scale={scale}
                positionStyle={{ right: 1 * scale, bottom: 35 * scale }}
                selected={selectedPath === 'institution'}
                disabled={isNavigating}
                onPressIn={() => setSelectedPath('institution')}
                onPress={() => selectAndNavigate('institution')}
              />
            </>
          ) : null}
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already learning with Eduraa? </Text>
          <Pressable onPress={() => navigation.navigate('Login')} hitSlop={10} accessibilityRole="link">
            <Text style={styles.footerLink}>Sign in</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  starLayer: { ...StyleSheet.absoluteFillObject },
  star: { position: 'absolute' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20 },

  header: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 9, zIndex: 2 },
  headerAccessible: { flexWrap: 'wrap' },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandName: { color: '#ffffff', fontFamily: typography.fonts.bodyBold, fontSize: 15 },
  brandContext: { marginTop: 1, color: '#c5ceda', fontFamily: typography.fonts.bodyMedium, fontSize: 11 },
  stepPill: {
    marginLeft: 'auto',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: STEP_BG,
  },
  stepPillText: { color: STEP_TEXT, fontFamily: typography.fonts.bodyBold, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },

  intro: { paddingTop: 22, zIndex: 2 },
  eyebrow: { color: ORANGE, fontFamily: typography.fonts.bodyBold, fontSize: 10, letterSpacing: 1.7, textTransform: 'uppercase' },
  title: { marginTop: 7, color: '#ffffff', fontFamily: serif, fontSize: 30, lineHeight: 33, letterSpacing: -0.5 },
  subtitle: { marginTop: 5, color: '#d4dbe6', fontFamily: typography.fonts.bodyMedium, fontSize: 13, lineHeight: 19 },

  map: { marginTop: 4, position: 'relative', zIndex: 2, width: '100%' },
  choiceStack: { marginTop: 28, gap: 16, zIndex: 2 },

  planet: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 42,
    shadowOffset: { width: 0, height: 20 },
    elevation: 10,
  },
  stepPillAccessible: { marginLeft: 52, marginRight: 'auto', marginTop: 8 },
  planetStacked: { position: 'relative', alignItems: 'flex-start', paddingHorizontal: 22, paddingRight: 52 },
  planetStackedSize: { width: '100%', minHeight: 124, borderRadius: 24 },
  planetTextStacked: { textAlign: 'left' },
  planetDark: { backgroundColor: NAVY_PLANET, borderWidth: 1, borderColor: 'rgba(125,155,199,0.45)' },
  planetCream: { backgroundColor: CREAM, borderWidth: 1, borderColor: CREAM },
  planetDarkActive: { borderColor: ORANGE, backgroundColor: '#152c4d' },
  planetCreamActive: { borderColor: ORANGE, shadowOpacity: 0.3 },
  planetSelected: { transform: [{ scale: 1.035 }], shadowOpacity: 0.3 },
  planetDisabled: { opacity: 0.45 },
  planetTitle: { fontFamily: serif, fontWeight: '600', textAlign: 'center' },
  planetDescription: { marginTop: 8, fontFamily: typography.fonts.bodyMedium, textAlign: 'center' },
  planetArrow: { position: 'absolute', right: 12, bottom: 14 },

  footer: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingBottom: 4, zIndex: 2 },
  footerText: { color: '#c5ceda', fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  footerLink: { color: RUST_LIGHT, fontFamily: typography.fonts.bodyBold, fontSize: 12 },

  pressedSoft: { opacity: 0.85 },
})
