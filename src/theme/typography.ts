/**
 * Web source: Tailwind config Manrope body + Space Grotesk display.
 */

import { fonts } from './fonts'

export const typography = {
  fonts: {
    body: fonts.regular,
    bodyMedium: fonts.medium,
    bodySemibold: fonts.semibold,
    bodyBold: fonts.bold,
    heading: fonts.displayBold,
    headingSemibold: fonts.displaySemibold,
    headingMedium: fonts.displayMedium,
  },

  sizes: {
    xs: 11,
    sm: 12,
    base: 14,
    md: 15,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 34,
    hero: 38,
  },

  roles: {
    eyebrow: {
      fontFamily: fonts.bold,
      fontSize: 11,
      lineHeight: 14,
      letterSpacing: 1.6,
      textTransform: 'uppercase' as const,
    },
    label: {
      fontFamily: fonts.semibold,
      fontSize: 12,
      lineHeight: 16,
      letterSpacing: 0.2,
    },
    body: {
      fontFamily: fonts.medium,
      fontSize: 14,
      lineHeight: 21,
      letterSpacing: 0,
    },
    bodyLarge: {
      fontFamily: fonts.medium,
      fontSize: 15,
      lineHeight: 24,
      letterSpacing: 0,
    },
    title: {
      fontFamily: fonts.displaySemibold,
      fontSize: 20,
      lineHeight: 26,
      letterSpacing: 0,
    },
    screenTitle: {
      fontFamily: fonts.displayBold,
      fontSize: 28,
      lineHeight: 34,
      letterSpacing: 0,
    },
    hero: {
      fontFamily: fonts.displayBold,
      fontSize: 34,
      lineHeight: 40,
      letterSpacing: 0,
    },
  },

  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
  },

  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.7,
  },

  letterSpacing: {
    normal: 0,
    wide: 0.08,
    wider: 0.12,
    widest: 0.2,
  },
} as const

export default typography
