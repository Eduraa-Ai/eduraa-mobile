import React from 'react'
import { Text, type TextProps } from 'react-native'
import { normalizeMathContent } from '../../utils/mathContent'

export interface MathTextProps extends TextProps {
  value?: string | null
}

export function MathText({ value, accessibilityLabel, ...props }: MathTextProps) {
  const normalized = normalizeMathContent(value)
  return (
    <Text
      {...props}
      accessibilityLabel={accessibilityLabel ?? normalized.text}
    >
      {normalized.text}
    </Text>
  )
}
