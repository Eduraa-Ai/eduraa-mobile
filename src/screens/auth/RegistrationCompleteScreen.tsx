import React, { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { AuthStackParamList } from '../../navigation'
import { useAuthStore } from '../../stores/authStore'
import { spacing, typography } from '../../theme'

type Route = RouteProp<AuthStackParamList, 'RegistrationComplete'>

export default function RegistrationCompleteScreen() {
  const route = useRoute<Route>()
  const insets = useSafeAreaInsets()
  const { setAuth } = useAuthStore()
  const [entering, setEntering] = useState(false)

  const handleEnter = async () => {
    if (entering) return
    setEntering(true)
    await setAuth(route.params.authToken)
  }

  return (
    <LinearGradient colors={['#fffdf8', '#fbf6ec', '#fff8ee']} locations={[0, 0.58, 1]} style={styles.root}>
      <View pointerEvents="none" style={styles.ambientLayer}>
        <View style={styles.orangeGlow} />
        <View style={styles.navyGlow} />
      </View>

      <View style={[styles.content, { paddingTop: insets.top + spacing[8], paddingBottom: insets.bottom + spacing[6] }]}>
        <View style={styles.successMark}>
          <Ionicons name="checkmark" size={52} color="#ffffff" />
        </View>
        <Text style={styles.eyebrow}>YOU’RE READY</Text>
        <Text style={styles.title}>Welcome to Eduraa.</Text>
        <Text style={styles.subtitle}>Your email is verified and your personal learning space is ready.</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Enter learning space"
          accessibilityState={{ disabled: entering, busy: entering }}
          disabled={entering}
          onPress={handleEnter}
          style={({ pressed }) => [styles.enterButton, pressed && !entering && styles.enterButtonPressed]}
        >
          {entering ? <ActivityIndicator color="#ffffff" /> : (
            <>
              <Text style={styles.enterText}>Enter learning space</Text>
              <Ionicons name="arrow-forward" size={17} color="#ffffff" />
            </>
          )}
        </Pressable>
      </View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  ambientLayer: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  orangeGlow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    top: -170,
    right: -130,
    backgroundColor: 'rgba(243,108,33,0.075)',
  },
  navyGlow: {
    position: 'absolute',
    width: 330,
    height: 330,
    borderRadius: 165,
    bottom: -230,
    left: -190,
    backgroundColor: 'rgba(7,21,45,0.045)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[6],
  },
  successMark: {
    width: 96,
    height: 96,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#07152d',
    shadowColor: '#07152d',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
  },
  eyebrow: {
    marginTop: spacing[7],
    color: '#c2410c',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1.9,
  },
  title: {
    marginTop: spacing[2],
    color: '#07152d',
    fontFamily: typography.fonts.heading,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -1.2,
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 330,
    marginTop: spacing[3],
    color: '#667085',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  enterButton: {
    width: '100%',
    minHeight: 66,
    marginTop: spacing[8],
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[5],
    backgroundColor: '#07152d',
    shadowColor: '#07152d',
    shadowOpacity: 0.2,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  enterButtonPressed: { transform: [{ scale: 0.985 }], opacity: 0.93 },
  enterText: { color: '#ffffff', fontFamily: typography.fonts.bodyBold, fontSize: 14 },
})
