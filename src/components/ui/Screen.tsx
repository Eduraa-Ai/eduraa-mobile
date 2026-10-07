import React, { ReactNode, useContext } from 'react'
import { ScrollView, ScrollViewProps, StyleSheet, View, ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { HeaderShownContext } from '@react-navigation/elements'
import { useAppHeaderScroll } from '../../navigation/headerScroll'
import { colors } from '../../theme/colors'
import { gradients } from '../../theme/gradients'
import { spacing } from '../../theme/spacing'

interface ScreenProps extends ScrollViewProps {
  children: ReactNode
  scroll?: boolean
  contentStyle?: ViewStyle
}

export function Screen({ children, scroll = true, contentStyle, onScroll, ...props }: ScreenProps) {
  const insets = useSafeAreaInsets()
  const headerShown = useContext(HeaderShownContext)
  const handleScroll = useAppHeaderScroll(onScroll)
  const shell = (
    <LinearGradient colors={[...gradients.appShell]} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.gradient}>
      <View
        style={[
          styles.inner,
          {
            paddingTop: headerShown ? spacing[2] : insets.top + spacing[4],
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
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} scrollEventThrottle={16} {...props} onScroll={handleScroll}>
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
