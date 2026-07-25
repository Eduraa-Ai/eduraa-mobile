import React from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { AnimatedButton, AppScreen } from '../../components/ui'
import { colors, layout, spacing, typography } from '../../theme'

export type AssemblyStage = 'preparing' | 'requesting' | 'opening' | 'error'

type PreviousPaperAssemblyStateProps = {
  stage: AssemblyStage
  paperTitle: string
  selectionLabel: string
  errorMessage?: string
  onRetry: () => void
  onBack: () => void
}

const STEPS = [
  { key: 'preparing', label: 'Locking your selection', detail: 'Paper, subject, and chapter stay exactly as chosen.' },
  { key: 'requesting', label: 'Assembling questions', detail: 'Eduraa is creating or recovering the timed attempt.' },
  { key: 'opening', label: 'Opening the exam player', detail: 'Your timer begins from the server-backed start time.' },
] as const

function stageIndex(stage: AssemblyStage) {
  if (stage === 'opening') return 2
  if (stage === 'requesting' || stage === 'error') return 1
  return 0
}

export default function PreviousPaperAssemblyState({
  stage,
  paperTitle,
  selectionLabel,
  errorMessage,
  onRetry,
  onBack,
}: PreviousPaperAssemblyStateProps) {
  const activeIndex = stageIndex(stage)
  const failed = stage === 'error'

  return (
    <AppScreen
      scroll={false}
      contentStyle={styles.screen}
    >
      <View style={styles.mark}>
        <View style={styles.markPage}>
          <Ionicons name="document-text-outline" size={30} color={colors.white} />
        </View>
        <View style={styles.markSpark}>
          {failed
            ? <Ionicons name="refresh" size={16} color={colors.white} />
            : <Ionicons name="sparkles" size={16} color={colors.white} />}
        </View>
      </View>

      <View accessibilityLiveRegion="polite" style={styles.copy}>
        <Text style={styles.eyebrow}>{failed ? 'YOUR SELECTION IS SAFE' : 'BUILDING YOUR PRACTICE'}</Text>
        <Text style={styles.title}>{failed ? 'Assembly paused—not your progress.' : 'Assembling your paper…'}</Text>
        <Text style={styles.body}>
          {failed
            ? errorMessage || 'The paper could not be assembled. Retry without choosing everything again.'
            : 'Eduraa is turning your exact PYQ selection into a focused, timed attempt.'}
        </Text>
      </View>

      <View style={styles.selection}>
        <Text style={styles.selectionLabel}>Selected paper</Text>
        <Text style={styles.selectionTitle} numberOfLines={2}>{paperTitle}</Text>
        <View style={styles.selectionMeta}>
          <Ionicons name="options-outline" size={14} color={colors.paperStudio.jee} />
          <Text style={styles.selectionMetaText}>{selectionLabel}</Text>
        </View>
      </View>

      <View style={styles.timeline}>
        {STEPS.map((step, index) => {
          const complete = index < activeIndex || (stage === 'opening' && index === activeIndex)
          const current = index === activeIndex && !complete
          const errored = failed && index === activeIndex
          return (
            <View key={step.key} style={styles.step}>
              <View style={[styles.stepIcon, complete && styles.stepIconComplete, errored && styles.stepIconError]}>
                {complete ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
                {current && !errored ? <ActivityIndicator size="small" color={colors.paperStudio.jee} /> : null}
                {errored ? <Ionicons name="alert" size={16} color={colors.white} /> : null}
                {!complete && !current ? <Text style={styles.stepNumber}>{index + 1}</Text> : null}
              </View>
              <View style={styles.stepCopy}>
                <Text style={[styles.stepTitle, (current || complete) && styles.stepTitleActive]}>{step.label}</Text>
                <Text style={styles.stepDetail}>{step.detail}</Text>
              </View>
            </View>
          )
        })}
      </View>

      {failed ? (
        <View style={styles.actions}>
          <AnimatedButton label="Try assembly again" onPress={onRetry} />
          <AnimatedButton label="Back to my selection" variant="ghost" onPress={onBack} />
        </View>
      ) : (
        <Text style={styles.footnote}>Keep Eduraa open. Duplicate attempts are blocked while this finishes.</Text>
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[5],
    paddingHorizontal: spacing[5],
    paddingBottom: layout.bottomTabHeight + spacing[8],
  },
  mark: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markPage: {
    width: 76,
    height: 76,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#07152d',
  },
  markSpark: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.background,
    backgroundColor: colors.accent,
  },
  copy: {
    maxWidth: 360,
    alignItems: 'center',
    gap: spacing[2],
  },
  eyebrow: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.2,
  },
  title: {
    color: colors.nav,
    fontFamily: typography.fonts.heading,
    fontSize: 26,
    lineHeight: 31,
    textAlign: 'center',
  },
  body: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  selection: {
    width: '100%',
    maxWidth: 380,
    padding: spacing[4],
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  selectionLabel: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  selectionTitle: {
    marginTop: spacing[1],
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
    lineHeight: 21,
  },
  selectionMeta: {
    marginTop: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  selectionMetaText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 15,
  },
  timeline: {
    width: '100%',
    maxWidth: 380,
    gap: spacing[3],
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  stepIconComplete: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  stepIconError: {
    borderColor: colors.danger,
    backgroundColor: colors.danger,
  },
  stepNumber: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  stepCopy: {
    flex: 1,
  },
  stepTitle: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  stepTitleActive: {
    color: colors.text,
  },
  stepDetail: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 14,
  },
  actions: {
    width: '100%',
    maxWidth: 380,
    gap: spacing[2],
  },
  footnote: {
    maxWidth: 320,
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
  },
})
