import React from 'react'
import { Image, StyleSheet, View, ViewStyle } from 'react-native'
import { colors, radius, shadows } from '../../theme'

type AuthLogoMarkProps = {
  size?: number
  style?: ViewStyle
}

export function AuthLogoMark({ size = 44, style }: AuthLogoMarkProps) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: Math.max(radius.md, Math.round(size * 0.38)) }, style]}>
      <Image source={require('../../../assets/eduraa-book-brain.png')} style={{ width: size, height: size }} resizeMode="cover" />
    </View>
  )
}

const styles = StyleSheet.create({
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadows.sm,
  },
})

export default AuthLogoMark
