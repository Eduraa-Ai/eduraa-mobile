/**
 * 4pt/8pt-friendly spacing, radius, border and depth tokens.
 */

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
  18: 72,
  20: 80,
} as const

export const layout = {
  screenPaddingX: spacing[5],
  screenPaddingY: spacing[5],
  sectionGap: spacing[6],
  cardGap: spacing[4],
  bottomTabHeight: 74,
  touchTarget: 48,
  iconButton: 44,
} as const

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 28,
  '3xl': 36,
  authInput: 20,
  card: 24,
  dashboardCard: 24,
  sheet: 28,
  full: 999,
} as const

export const borderWidths = {
  hairline: 1,
  thin: 1.5,
  medium: 2,
} as const

export const shadows = {
  xs: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  sm: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 4,
  },
  md: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.1,
    shadowRadius: 28,
    elevation: 8,
  },
  lg: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.14,
    shadowRadius: 40,
    elevation: 12,
  },
  authInput: {
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 26,
    elevation: 5,
  },
  cardGlow: {
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.16,
    shadowRadius: 46,
    elevation: 9,
  },
  hero: {
    shadowColor: '#c2410c',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.18,
    shadowRadius: 48,
    elevation: 10,
  },
} as const
