import React, { ReactNode, forwardRef, useContext } from 'react'
import { ScrollView, ScrollViewProps, StyleSheet, View, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { HeaderShownContext } from '@react-navigation/elements'
import { useAppHeaderScroll } from '../../navigation/headerScroll'
import { colors, gradients, layout, spacing } from '../../theme'

interface AppScreenProps extends ScrollViewProps {
  children: ReactNode
  scroll?: boolean
  contentStyle?: ViewStyle
  padded?: boolean
  tone?: 'default' | 'auth'
  ambient?: boolean
  protectedChrome?: boolean
  scrollRef?: React.RefObject<ScrollView | null>
}

export const AppScreen = forwardRef<ScrollView, AppScreenProps>(function AppScreen(
  { children, scroll = true, contentStyle, padded = true, tone = 'default', ambient = true, protectedChrome = false, scrollRef, style, onScroll, ...props },
  ref,
) {
  const insets = useSafeAreaInsets()
  // The app header already clears the status bar, so the screen only needs breathing room.
  const headerShown = useContext(HeaderShownContext)
  const topInset = headerShown || protectedChrome ? 0 : insets.top
  const handleScroll = useAppHeaderScroll(onScroll)
  // Only real sign-in screens (tone auth with the ambient glow) get the auth wash;
  // in-app screens that borrowed tone="auth" share the app canvas.
  const authCanvas = tone === 'auth' && ambient

  const content = (
    <LinearGradient
      colors={authCanvas ? ['#fffaf2', '#fbf6ec', '#fff7ed'] : [...gradients.appShell]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      {tone === 'auth' && ambient ? (
        <View pointerEvents="none" style={styles.ambientLayer}>
          <View style={styles.orangeOrb} />
          <View style={styles.navyOrb} />
          <View style={styles.sunDot} />
        </View>
      ) : null}
      <View
        style={[
          styles.inner,
          padded && styles.padded,
          {
            paddingTop: topInset + spacing[headerShown ? 2 : 4],
            paddingBottom: protectedChrome ? spacing[6] : insets.bottom + spacing[6],
          },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </LinearGradient>
  )

  if (!scroll) {
    return <View style={[styles.root, style]}>{content}</View>
  }

  return (
    <ScrollView
      ref={ref ?? scrollRef}
      style={[
        styles.root,
        authCanvas && styles.authRoot,
        protectedChrome && { marginTop: headerShown ? 0 : insets.top, marginBottom: layout.bottomTabHeight + insets.bottom },
        style,
      ]}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      scrollEventThrottle={16}
      {...props}
      onScroll={handleScroll}
    >
      {content}
    </ScrollView>
  )
})

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  authRoot: {
    backgroundColor: '#fbf6ec',
  },
  scrollContent: {
    flexGrow: 1,
  },
  gradient: {
    flex: 1,
    overflow: 'hidden',
  },
  ambientLayer: {
    ...StyleSheet.absoluteFill,
  },
  orangeOrb: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    top: -118,
    right: -132,
    backgroundColor: 'rgba(243,108,33,0.10)',
  },
  navyOrb: {
    position: 'absolute',
    width: 310,
    height: 310,
    borderRadius: 155,
    top: 520,
    left: -238,
    backgroundColor: 'rgba(7,21,45,0.055)',
  },
  sunDot: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    top: 390,
    right: -38,
    backgroundColor: 'rgba(255,191,51,0.12)',
  },
  inner: {
    flexGrow: 1,
    gap: spacing[4],
  },
  padded: {
    paddingHorizontal: spacing[5],
  },
})

export default AppScreen
