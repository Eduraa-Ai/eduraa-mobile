import React, { useCallback, useMemo, useState } from 'react'
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { AppScreen, ErrorState, PremiumHeader, SkeletonCard } from '../../components/ui'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import type {
  CompetitiveStandard,
  CompetitiveWorkspacePayload,
  StudyPackKey,
} from '../../api/competitiveExam'
import { competitiveExamApi } from '../../api/competitiveExam'
import { useAuthStore } from '../../stores/authStore'
import {
  buildFallbackStudyPack,
  studyPackKeys,
  studyTabIcon,
  studyTabLabel,
} from './competitiveExamUtils'

type Params = {
  subject?: string
  chapter?: string
  standard?: CompetitiveStandard
  subjectId?: string | null
  chapterId?: string | null
  trackLabel?: string
}

const READING_MAX_WIDTH = 720
const WIDE_SCREEN_BREAKPOINT = 720

const TAB_ACCENTS: Record<StudyPackKey, { tint: string; surface: string }> = {
  formula_sheet: { tint: colors.accentStrong, surface: colors.accentSurface },
  hacks: { tint: colors.warning, surface: colors.warningSurface },
  real_life: { tint: colors.info, surface: colors.infoSurface },
  revision_notes: { tint: colors.success, surface: colors.successSurface },
}

function slugifyKey(subject: string, chapter: string, standard: CompetitiveStandard) {
  return `${subject}::${chapter}::${standard}`.toLowerCase().replace(/\s+/g, '-')
}

export default function StudyPackScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute()
  const params = (route.params || {}) as Params
  const user = useAuthStore((state) => state.user)

  const subject = (params.subject || '').trim()
  const chapter = (params.chapter || '').trim()
  const standard: CompetitiveStandard = params.standard === '11th' ? '11th' : '12th'
  const trackLabel = params.trackLabel || user?.b2c_target_exam || 'Competitive exam'
  const canFetchRemote = Boolean(subject && chapter)

  const [activeTab, setActiveTab] = useState<StudyPackKey>('formula_sheet')
  const { width } = useWindowDimensions()
  const isWide = width >= WIDE_SCREEN_BREAKPOINT

  const workspaceQuery = useQuery({
    queryKey: ['study-pack-workspace', user?.id ?? null, slugifyKey(subject, chapter, standard)],
    queryFn: () =>
      competitiveExamApi.getWorkspace({
        subject_name: subject,
        chapter_key: chapter,
        chapter_title: chapter,
        standard,
        track_label: trackLabel,
        subject_id: params.subjectId || undefined,
        chapter_id: params.chapterId || undefined,
      }),
    enabled: canFetchRemote,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  // Coalesce every array field the UI reads. A real backend can legitimately
  // omit a section or return null for memory_tips; without this guard,
  // .length on undefined crashes the screen.
  const remotePayload: CompetitiveWorkspacePayload | undefined = useMemo(() => {
    const raw = workspaceQuery.data
    if (!raw) return undefined
    return {
      ...raw,
      formula_sheet: Array.isArray(raw.formula_sheet) ? raw.formula_sheet : [],
      hacks: Array.isArray(raw.hacks) ? raw.hacks : [],
      real_life: Array.isArray(raw.real_life) ? raw.real_life : [],
      revision_notes: Array.isArray(raw.revision_notes) ? raw.revision_notes : [],
      memory_tips: Array.isArray(raw.memory_tips) ? raw.memory_tips : [],
      summary: typeof raw.summary === 'string' ? raw.summary : '',
    }
  }, [workspaceQuery.data])
  const fallbackPayload = useMemo<CompetitiveWorkspacePayload>(
    () =>
      buildFallbackStudyPack({
        subject: subject || 'Chapter workspace',
        chapter: chapter || 'This chapter',
        standard,
      }),
    [subject, chapter, standard],
  )
  const payload = remotePayload ?? fallbackPayload
  const usingFallback = !remotePayload

  const activeItems = payload[activeTab]
  const accent = TAB_ACCENTS[activeTab]

  const handleRefresh = useCallback(async () => {
    if (!canFetchRemote) return
    await workspaceQuery.refetch()
  }, [workspaceQuery, canFetchRemote])

  const refreshControl = (
    <RefreshControl
      refreshing={workspaceQuery.isRefetching}
      onRefresh={handleRefresh}
      tintColor={colors.accent}
    />
  )

  const responsiveContentStyle = useMemo(
    () => (isWide ? StyleSheet.flatten([styles.screen, styles.screenWide]) : styles.screen),
    [isWide],
  )

  if (!canFetchRemote && !subject && !chapter) {
    return (
      <AppScreen contentStyle={responsiveContentStyle}>
        <PremiumHeader
          eyebrow="Study pack"
          title="Study pack not found"
          onBack={() => navigation.goBack()}
        />
        <ErrorState
          title="Missing study pack context"
          message="Open a chapter from your library, cheat sheet, or JEE launchpad to see its study pack."
          actionLabel="Back"
          onAction={() => navigation.goBack()}
        />
      </AppScreen>
    )
  }

  const showSkeleton = workspaceQuery.isLoading && canFetchRemote
  const showError = workspaceQuery.isError && !remotePayload && canFetchRemote

  return (
    <AppScreen contentStyle={responsiveContentStyle} refreshControl={refreshControl}>
      <PremiumHeader
        eyebrow={`Chapter workspace${subject ? ` · ${subject}` : ''}`}
        title={chapter || 'Chapter'}
        subtitle="Formulas, shortcuts, real-life links and a quick revision structure."
        onBack={() => navigation.goBack()}
        right={
          <View style={styles.pill}>
            <Text style={styles.pillText}>{standard}</Text>
          </View>
        }
      />

      {showSkeleton ? (
        <View style={styles.skeletons}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={5} />
        </View>
      ) : null}

      {showError ? (
        <ErrorState
          title="Could not build the study pack"
          message="We could not reach the workspace service. Pull to refresh, or continue with the offline outline below."
          actionLabel="Try again"
          onAction={() => void workspaceQuery.refetch()}
        />
      ) : null}

      {!showSkeleton ? (
        <>
          <View style={styles.tabsWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsScroll}
            >
              {studyPackKeys.map((key) => {
                const selected = key === activeTab
                const tone = TAB_ACCENTS[key]
                return (
                  <Pressable
                    key={key}
                    onPress={() => setActiveTab(key)}
                    style={({ pressed }) => [
                      styles.tab,
                      selected && [
                        styles.tabActive,
                        { backgroundColor: tone.surface, borderColor: tone.tint + '33' },
                      ],
                      pressed && styles.tabPressed,
                    ]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                  >
                    <Ionicons
                      name={studyTabIcon(key)}
                      size={14}
                      color={selected ? tone.tint : colors.textSoft}
                    />
                    <Text style={[styles.tabLabel, selected && { color: tone.tint }]}>
                      {studyTabLabel(key)}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>

          {usingFallback && !showError ? (
            <View style={styles.fallbackBanner}>
              <Ionicons name="cloud-offline-outline" size={14} color={colors.warning} />
              <Text style={styles.fallbackText} numberOfLines={2}>
                {canFetchRemote
                  ? 'Showing an offline outline while we reach the workspace service.'
                  : 'Showing a generic outline — open this pack from a specific chapter for a personalized breakdown.'}
              </Text>
            </View>
          ) : null}

          <View style={styles.countRow}>
            <Text style={styles.countTitle}>{studyTabLabel(activeTab)}</Text>
            <Text style={styles.countMeta}>
              {activeItems.length} {activeItems.length === 1 ? 'entry' : 'entries'}
            </Text>
          </View>

          {activeItems.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="hourglass-outline" size={18} color={colors.accentStrong} />
              </View>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyBody}>
                This section is still being generated for {chapter || 'this chapter'}. Pull to refresh.
              </Text>
            </View>
          ) : (
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
                    {item.detail ? <Text style={styles.entryDetail}>{item.detail}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          )}

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
                Sign errors, unit errors, and picking the wrong relation under time pressure. Slow
                down for the first 10 seconds — pattern before pen.
              </Text>
            </View>
          </View>

          {payload.summary ? (
            <Text style={styles.footNote} numberOfLines={4}>
              {payload.summary}
            </Text>
          ) : null}

          {remotePayload && workspaceQuery.isFetching ? (
            <View style={styles.refreshingRow}>
              <Ionicons name="sync-outline" size={14} color={colors.textSoft} />
              <Text style={styles.refreshingText}>Refreshing…</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[20],
    gap: spacing[4],
    width: '100%',
  },
  screenWide: {
    maxWidth: READING_MAX_WIDTH,
    alignSelf: 'center',
  },
  skeletons: {
    gap: spacing[3],
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
  tabsWrapper: {
    marginHorizontal: -spacing[1],
  },
  tabsScroll: {
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: spacing[1],
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing[4],
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    minWidth: 96,
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
  fallbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radius.md,
    backgroundColor: colors.warningSurface,
    borderWidth: 1,
    borderColor: '#f6dcae',
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
  fallbackText: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11.5,
    lineHeight: 15,
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
    flexShrink: 0,
  },
  entryIndexText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  entryCopy: {
    flex: 1,
    minWidth: 0,
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
  emptyCard: {
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[5],
    gap: spacing[2],
    alignItems: 'flex-start',
    ...shadows.xs,
  },
  emptyIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    marginBottom: spacing[1],
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 14,
  },
  emptyBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
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
    flexShrink: 0,
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
    flexShrink: 0,
  },
  warnCopy: {
    flex: 1,
    minWidth: 0,
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
  refreshingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    paddingVertical: spacing[2],
  },
  refreshingText: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
})
