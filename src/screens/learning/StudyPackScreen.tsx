import React, { useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { AppScreen, PremiumHeader } from '../../components/ui'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import type { CompetitiveStandard, StudyPackKey } from '../../api/competitiveExam'
import { buildFallbackStudyPack, studyPackKeys, studyTabIcon, studyTabLabel } from './competitiveExamUtils'

type Params = {
  subject?: string
  chapter?: string
  standard?: CompetitiveStandard
}

const TAB_ACCENTS: Record<StudyPackKey, { tint: string; surface: string }> = {
  formula_sheet: { tint: colors.accentStrong, surface: colors.accentSurface },
  hacks: { tint: colors.warning, surface: colors.warningSurface },
  real_life: { tint: colors.info, surface: colors.infoSurface },
  revision_notes: { tint: colors.success, surface: colors.successSurface },
}

export default function StudyPackScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute()
  const params = (route.params || {}) as Params
  const subject = (params.subject || 'Physics').trim() || 'Physics'
  const chapter = (params.chapter || 'Electrostatics').trim() || 'Electrostatics'
  const standard: CompetitiveStandard = params.standard === '11th' ? '11th' : '12th'

  const [activeTab, setActiveTab] = useState<StudyPackKey>('formula_sheet')

  const payload = useMemo(
    () => buildFallbackStudyPack({ subject, chapter, standard }),
    [subject, chapter, standard],
  )

  const activeItems = payload[activeTab]
  const accent = TAB_ACCENTS[activeTab]

  return (
    <AppScreen contentStyle={styles.screen}>
      <PremiumHeader
        eyebrow={`Chapter workspace · ${subject}`}
        title={chapter}
        subtitle="Formulas, shortcuts, real-life links and a quick revision structure."
        onBack={() => navigation.goBack()}
        right={
          <View style={styles.pill}>
            <Text style={styles.pillText}>{standard}</Text>
          </View>
        }
      />

      <View style={styles.tabs}>
        {studyPackKeys.map((key) => {
          const selected = key === activeTab
          const tone = TAB_ACCENTS[key]
          return (
            <Pressable
              key={key}
              onPress={() => setActiveTab(key)}
              style={({ pressed }) => [
                styles.tab,
                selected && [styles.tabActive, { backgroundColor: tone.surface, borderColor: tone.tint + '33' }],
                pressed && styles.tabPressed,
              ]}
            >
              <Ionicons
                name={studyTabIcon(key)}
                size={14}
                color={selected ? tone.tint : colors.textSoft}
              />
              <Text
                style={[
                  styles.tabLabel,
                  selected && { color: tone.tint },
                ]}
              >
                {studyTabLabel(key)}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <View style={styles.countRow}>
        <Text style={styles.countTitle}>{studyTabLabel(activeTab)}</Text>
        <Text style={styles.countMeta}>
          {activeItems.length} {activeItems.length === 1 ? 'entry' : 'entries'}
        </Text>
      </View>

      <View style={styles.entriesCard}>
        {activeItems.map((item, index) => (
          <View
            key={`${item.title}-${index}`}
            style={[styles.entryRow, index === 0 && styles.entryRowFirst]}
          >
            <View style={[styles.entryIndex, { backgroundColor: accent.surface }]}>
              <Text style={[styles.entryIndexText, { color: accent.tint }]}>{index + 1}</Text>
            </View>
            <View style={styles.entryCopy}>
              <Text style={styles.entryTitle}>{item.title}</Text>
              <Text style={styles.entryDetail}>{item.detail}</Text>
            </View>
          </View>
        ))}
      </View>

      {activeTab === 'formula_sheet' && payload.memory_tips.length > 0 ? (
        <View style={styles.tipsCard}>
          <View style={styles.tipsHead}>
            <Ionicons name="bulb-outline" size={16} color={colors.warning} />
            <Text style={styles.tipsTitle}>How to apply</Text>
          </View>
          {payload.memory_tips.slice(0, 4).map((tip, index) => (
            <View key={`${tip}-${index}`} style={styles.tipRow}>
              <View style={styles.tipBullet}>
                <Text style={styles.tipBulletText}>{index + 1}</Text>
              </View>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.warnCard}>
        <View style={styles.warnIcon}>
          <Ionicons name="warning-outline" size={16} color={colors.warning} />
        </View>
        <View style={styles.warnCopy}>
          <Text style={styles.warnTitle}>Common traps</Text>
          <Text style={styles.warnBody}>
            Sign errors, unit errors, and picking the wrong relation under time pressure. Slow down for
            the first 10 seconds — pattern before pen.
          </Text>
        </View>
      </View>

      <Text style={styles.footNote}>{payload.summary}</Text>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[20],
    gap: spacing[4],
  },
  pill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  pillText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  tabs: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  tabActive: {
    borderWidth: 1,
  },
  tabPressed: {
    transform: [{ scale: 0.97 }],
  },
  tabLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 11.5,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[1],
  },
  countTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  countMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  entriesCard: {
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[4],
    gap: spacing[4],
    ...shadows.xs,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  entryRowFirst: {
    paddingTop: 0,
    borderTopWidth: 0,
  },
  entryIndex: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  entryIndexText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  entryCopy: {
    flex: 1,
    gap: 3,
  },
  entryTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13.5,
    lineHeight: 18,
  },
  entryDetail: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  tipsCard: {
    borderRadius: radius.card,
    backgroundColor: colors.warm.canvasAlt,
    borderWidth: 1,
    borderColor: colors.warm.muted,
    padding: spacing[4],
    gap: spacing[3],
  },
  tipsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  tipsTitle: {
    color: colors.warm.ink,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  tipBullet: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: colors.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  tipBulletText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  tipText: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12.5,
    lineHeight: 17,
  },
  warnCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    borderRadius: radius.card,
    backgroundColor: colors.warningSurface,
    borderWidth: 1,
    borderColor: '#f6dcae',
    padding: spacing[4],
  },
  warnIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#fff2cc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnCopy: {
    flex: 1,
    gap: 3,
  },
  warnTitle: {
    color: colors.warning,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  warnBody: {
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  footNote: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: spacing[3],
  },
})
