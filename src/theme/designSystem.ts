import colors from './colors'
import gradients from './gradients'
import motion from './motion'
import { borderWidths, layout, radius, shadows, spacing } from './spacing'
import typography from './typography'

export const designSystem = {
  colors,
  gradients,
  typography,
  spacing,
  layout,
  radius,
  shadows,
  borderWidths,
  motion,
  components: {
    screen: {
      background: colors.background,
      gradient: gradients.appShell,
      paddingX: layout.screenPaddingX,
      gap: layout.sectionGap,
    },
    header: {
      avatarSize: 44,
      iconButtonSize: layout.iconButton,
      titleColor: colors.text,
      subtitleColor: colors.textMuted,
    },
    auth: {
      shellGradient: gradients.authShell,
      cardBackground: colors.backgroundElevated,
      cardBorder: colors.border,
      inputBackground: colors.backgroundElevated,
      inputBorder: colors.border,
      inputFocusBorder: colors.accentStrong,
      inputRadius: radius.authInput,
      inputShadow: shadows.authInput,
      buttonGradient: gradients.tealAction,
    },
    dashboard: {
      shellGradient: gradients.appShell,
      heroGradient: gradients.hero,
      cardBackground: colors.card,
      cardMutedBackground: colors.backgroundMuted,
      cardBorder: colors.border,
      cardRadius: radius.dashboardCard,
      cardShadow: shadows.cardGlow,
      primary: colors.accent,
      primaryStrong: colors.accentStrong,
    },
    aiChat: {
      launcherGradient: gradients.aiAurora,
      auroraGradient: gradients.aiAurora,
      panelBackground: colors.backgroundElevated,
      transcriptBackground: colors.backgroundMuted,
      assistantBubble: colors.backgroundElevated,
      userBubble: colors.slate[900],
      userText: colors.white,
      promptBorder: colors.border,
    },
    buttons: {
      primaryRadius: radius.full,
      primaryHeight: 56,
      secondaryHeight: 52,
      primaryGradient: gradients.tealAction,
      primaryText: colors.textOnBrand,
      secondaryText: colors.accentStrong,
      disabledOpacity: 0.56,
    },
    cards: {
      background: colors.card,
      border: colors.border,
      radius: radius.card,
      shadow: shadows.sm,
      tintGradient: gradients.heroSoft,
    },
  },
} as const

export type DesignSystem = typeof designSystem

export default designSystem
