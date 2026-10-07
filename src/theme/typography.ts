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
    // Body headings use Manrope; the display face is reserved for the app header.
    title: {
      fontFamily: fonts.bold,
      fontSize: 18,
      lineHeight: 24,
      letterSpacing: -0.1,
    },
    screenTitle: {
      fontFamily: fonts.bold,
      fontSize: 22,
      lineHeight: 28,
      letterSpacing: -0.2,
    },
    hero: {
      fontFamily: fonts.bold,
      fontSize: 26,
      lineHeight: 32,
      letterSpacing: -0.3,
    },
    // Staff UI benchmark (All tools sheet + compact header). Page bodies use
    // only these four roles plus `body`, so every screen reads the same.
    section: {
      fontFamily: fonts.bold,
      fontSize: 16,
      lineHeight: 22,
      letterSpacing: -0.1,
    },
    rowTitle: {
      fontFamily: fonts.bold,
      fontSize: 15,
      lineHeight: 20,
      letterSpacing: 0,
    },
    caption: {
      fontFamily: fonts.medium,
      fontSize: 12,
      lineHeight: 17,
      letterSpacing: 0,
    },
    groupLabel: {
      fontFamily: fonts.extrabold,
      fontSize: 11,
      lineHeight: 14,
      letterSpacing: 1.2,
      textTransform: 'uppercase' as const,
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
