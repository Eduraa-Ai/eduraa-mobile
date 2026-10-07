import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, typography } from '../../theme'

const { palette } = colors

// Same soft tints as the All tools sheet, so people and tools share one look.
const tints = [
  { surface: palette.orange[50], ink: palette.orange[700] },
  { surface: palette.sky[50], ink: palette.sky[800] },
  { surface: palette.teal[50], ink: palette.teal[700] },
  { surface: palette.violet[50], ink: palette.violet[700] },
  { surface: palette.amber[50], ink: palette.amber[700] },
  { surface: palette.rose[50], ink: palette.rose[700] },
]

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase()
}

function tintFor(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  return tints[hash % tints.length]
}

interface AvatarProps {
  name: string
  /** Stable id so a person keeps the same tint everywhere; defaults to name. */
  seed?: string
  size?: number
}

export function Avatar({ name, seed, size = 40 }: AvatarProps) {
  const tint = tintFor(seed ?? name)
  return (
    <View
      accessible={false}
      style={[styles.root, { width: size, height: size, borderRadius: size / 2, backgroundColor: tint.surface }]}
    >
      <Text style={[styles.text, { color: tint.ink, fontSize: Math.round(size * 0.36) }]}>{initialsOf(name)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: typography.fonts.bodyBold,
  },
})
