import React, { ReactNode } from 'react'
import { ScrollView, ScrollViewProps, StyleSheet, View, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '../../theme/colors'
import { gradients } from '../../theme/gradients'
import { spacing } from '../../theme/spacing'

interface ScreenProps extends ScrollViewProps {
  children: ReactNode
  scroll?: boolean
  contentStyle?: ViewStyle
}

export function Screen({ children, scroll = true, contentStyle, ...props }: ScreenProps) {
  const insets = useSafeAreaInsets()
  const shell = (
    <LinearGradient colors={[...gradients.appShell]} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.gradient}>
      <View
        style={[
          styles.inner,
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
    return <View style={styles.root}>{shell}</View>
  }

  return (
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} {...props}>
      {shell}
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
    paddingHorizontal: spacing[5],
    gap: spacing[5],
  },
})
