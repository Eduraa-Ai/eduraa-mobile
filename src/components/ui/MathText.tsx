import React from 'react'
import { type TextProps } from 'react-native'
import { LatexText } from './LatexText'

export interface MathTextProps extends TextProps {
  value?: string | null
}

export function MathText({ value, style, selectable }: MathTextProps) {
  return (
    <LatexText
      value={value}
      style={style}
      selectable={selectable}
      displayMathScrollable
      promoteComplexInlineMath
    />
  )
}
