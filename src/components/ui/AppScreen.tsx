import React, { ReactNode } from 'react'
import { ScrollView, ScrollViewProps, StyleSheet, View, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, gradients, spacing } from '../../theme'

interface AppScreenProps extends ScrollViewProps {
  children: ReactNode
  scroll?: boolean
  contentStyle?: ViewStyle
  padded?: boolean
}

export function AppScreen({ children, scroll = true, contentStyle, padded = true, ...props }: AppScreenProps) {
  const insets = useSafeAreaInsets()

  const content = (
    <LinearGradient colors={[...gradients.appShell]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
      <View
        style={[
          styles.inner,
          padded && styles.padded,
          {
            paddingTop: insets.top + spacing[4],
            paddingBottom: insets.bottom + spacing[6],
          },
          contentStyle,
        ]}
      >
        {children}
      </View>
    </LinearGradient>
  )

  if (!scroll) {
    return <View style={styles.root}>{content}</View>
  }

  return (
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} {...props}>
      {content}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  gradient: {
    flex: 1,
  },
  inner: {
    flexGrow: 1,
    gap: spacing[5],
  },
  padded: {
    paddingHorizontal: spacing[5],
  },
})

export default AppScreen
