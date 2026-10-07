import React from 'react'
import { ViewStyle } from 'react-native'
import { AnimatedButton } from './AnimatedButton'

interface PrimaryButtonProps {
  label: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  variant?: 'solid' | 'secondary' | 'ghost'
  style?: ViewStyle
}

/** Kept for existing call sites; renders the shared AnimatedButton. */
export function PrimaryButton({ variant = 'solid', ...props }: PrimaryButtonProps) {
  return <AnimatedButton {...props} variant={variant === 'solid' ? 'primary' : variant} />
}
