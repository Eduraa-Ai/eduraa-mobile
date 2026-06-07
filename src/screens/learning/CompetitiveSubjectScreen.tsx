import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import type { LearningStackParamList } from '../../navigation'
import { AnimatedCard, AppScreen, SelectableChip } from '../../components/ui'
import { competitiveExamApi, CompetitiveChapterOption, CompetitiveStandard } from '../../api/competitiveExam'
import { getCompetitiveSyllabus } from '../../data/competitiveSyllabus'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import {
  chapterIdentity,
  decodeRouteParam,
  dedupeChapters,
  isCompetitiveLearner,
  normalizeSubjectName,
  profileSubjects,
  splitDistinctValues,
  standardVariants,
  subjectSupportCopy,
  subjectSymbol,
  subjectTone,
} from './competitiveExamUtils'

type Route = RouteProp<LearningStackParamList, 'CompetitiveSubject'>

interface ChapterLoadResult {
  chapters: CompetitiveChapterOption[]
  isFallback: boolean
  sourceSummary?: string
}

export default function CompetitiveSubjectScreen() {
  const navigation = useNavigation<any>()
  const { params } = useRoute<Route>()
  const user = useAuthStore((state) => state.user)
  const [selectedStandard, setSelectedStandard] = useState<CompetitiveStandard>(
    user?.b2c_standard?.toLowerCase().includes('12') ? '12th' : '11th',
  )

  const availableSubjects = useMemo(() => profileSubjects(user?.b2c_subjects), [user?.b2c_subjects])
  const decodedSubjectName = decodeRouteParam(params.subjectName)
  const activeSubjectName = availableSubjects.find((subject) => normalizeSubjectName(subject) === normalizeSubjectName(decodedSubjectName)) ?? ''
  const trackLabel = user?.b2c_board || 'JEE Mains / JEE Advanced / MH-CET'
  const tone = subjectTone(activeSubjectName)
  const allowed = isCompetitiveLearner(user)

  const optionsQuery = useQuery({
    queryKey: ['competitive-options'],
    queryFn: competitiveExamApi.getOptions,
    enabled: allowed,
  })

  const activeSubject = useMemo(
    () =>
      (optionsQuery.data?.subjects ?? []).find(
        (subject) => normalizeSubjectName(subject.name) === normalizeSubjectName(activeSubjectName),
      ) ?? null,
    [activeSubjectName, optionsQuery.data?.subjects],
  )

  const boardCandidates = useMemo(() => {
    const fromOptions = (optionsQuery.data?.courses ?? []).map((item) => item.trim()).filter(Boolean)
    if (fromOptions.length > 0) return fromOptions
    return splitDistinctValues(user?.b2c_board)
  }, [optionsQuery.data?.courses, user?.b2c_board])

  const syllabusFallback = useMemo(
    () => getCompetitiveSyllabus(user?.b2c_board, activeSubjectName, selectedStandard),
    [activeSubjectName, selectedStandard, user?.b2c_board],
  )

  const fallbackChapters = useMemo<CompetitiveChapterOption[]>(
    () =>
      syllabusFallback.chapters.map((title, index) => ({
        id: `syllabus-${syllabusFallback.trackKey}-${selectedStandard}-${index + 1}`,
        title,
        index: index + 1,
      })),
    [selectedStandard, syllabusFallback.chapters, syllabusFallback.trackKey],
  )

  const chaptersQuery = useQuery<ChapterLoadResult>({
    queryKey: ['competitive-chapters', activeSubject?.id, boardCandidates.join(','), selectedStandard, activeSubjectName],
    enabled: Boolean(allowed && activeSubjectName),
    queryFn: async () => {
      if (!activeSubject) {
        return { chapters: fallbackChapters, isFallback: true, sourceSummary: syllabusFallback.sourceSummary }
      }

      const standards = standardVariants(selectedStandard)
      const boards = boardCandidates.length > 0 ? boardCandidates : [undefined]
      const requests = standards.flatMap((standard) =>
        boards.map((board) =>
          competitiveExamApi.getChapters({
            subject_id: activeSubject.id,
            board,
            standard,
            indexed_only: true,
          }),
        ),
      )

      let merged = dedupeChapters((await Promise.all(requests)).flat())

      if (merged.length === 0) {
        merged = dedupeChapters(
          (
            await Promise.all(
              standards.map((standard) =>
                competitiveExamApi.getChapters({
                  subject_id: activeSubject.id,
                  standard,
                  indexed_only: true,
                }),
              ),
            )
          ).flat(),
        )
      }

      if (merged.length > 0) return { chapters: merged, isFallback: false }
      return { chapters: fallbackChapters, isFallback: true, sourceSummary: syllabusFallback.sourceSummary }
    },
  })

  if (!allowed) {
    return (
      <AppScreen contentStyle={styles.center}>
        <Ionicons name="lock-closed-outline" size={34} color={colors.accentStrong} />
        <Text style={styles.centerTitle}>Competitive Exam is for JEE learners</Text>
        <TouchableOpacity activeOpacity={0.86} onPress={() => navigation.navigate('LearningHome')} style={styles.centerButton}>
          <Text style={styles.centerButtonText}>Back to Learning</Text>
        </TouchableOpacity>
      </AppScreen>
    )
  }

  if (!activeSubjectName) {
    return (
      <AppScreen contentStyle={styles.center}>
        <Ionicons name="alert-circle-outline" size={34} color={colors.warning} />
        <Text style={styles.centerTitle}>Subject unavailable</Text>
        <TouchableOpacity activeOpacity={0.86} onPress={() => navigation.navigate('CompetitiveExam')} style={styles.centerButton}>
          <Text style={styles.centerButtonText}>Back to Competitive Exam</Text>
        </TouchableOpacity>
      </AppScreen>
    )
  }

  const chapters = chaptersQuery.data?.chapters ?? []
  const isFallback = chaptersQuery.data?.isFallback

  return (
    <AppScreen contentStyle={styles.screen}>
      <View style={styles.topRow}>
        <TouchableOpacity activeOpacity={0.82} onPress={() => navigation.navigate('CompetitiveExam')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={17} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.topCopy}>
          <Text style={styles.topKicker}>Competitive exam subject</Text>
          <Text style={styles.topTitle}>{activeSubjectName}</Text>
        </View>
      </View>

      <LinearGradient colors={[colors.slate[950], colors.slate[900], `${tone}55`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroHead}>
          <View style={[styles.subjectMark, { backgroundColor: tone }]}>
            <Text style={styles.subjectMarkText}>{subjectSymbol(activeSubjectName)}</Text>
          </View>
          <View style={styles.trackPill}>
            <Text style={styles.trackPillText}>{trackLabel}</Text>
          </View>
        </View>
        <Text style={styles.heroTitle}>{activeSubjectName}</Text>
        <Text style={styles.heroBody}>{subjectSupportCopy(activeSubjectName)}. Select a chapter to open formulas, hacks, revision notes, tutor chat, and MCQ drill.</Text>
        <View style={styles.heroStats}>
          <Metric label="Standard" value={selectedStandard} />
          <Metric label="Chapters" value={chapters.length || '--'} />
          <Metric label="Source" value={isFallback ? 'Syllabus' : 'Indexed'} />
        </View>
      </LinearGradient>

      <View style={styles.standardRow}>
        <SelectableChip label="11th" selected={selectedStandard === '11th'} onPress={() => setSelectedStandard('11th')} />
        <SelectableChip label="12th" selected={selectedStandard === '12th'} onPress={() => setSelectedStandard('12th')} />
      </View>

      {isFallback ? (
        <View style={styles.noticeCard}>
          <Ionicons name="information-circle-outline" size={18} color={colors.info} />
          <Text style={styles.noticeText}>{chaptersQuery.data?.sourceSummary || 'Showing syllabus fallback because indexed chapter data is not available yet.'}</Text>
        </View>
      ) : null}

      {optionsQuery.isError ? (
        <View style={styles.noticeCard}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
          <Text style={styles.noticeText}>Unable to load indexed subjects. Showing syllabus fallback when available.</Text>
        </View>
      ) : null}

      {chaptersQuery.isLoading ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.inlineLoadingText}>Loading chapters</Text>
        </View>
      ) : null}

      <View style={styles.chapterList}>
        {chapters.map((chapter, index) => {
          const key = chapterIdentity(chapter, index)
          return (
            <Pressable
              key={key}
              onPress={() => navigation.navigate('CompetitiveChapter', { subjectName: activeSubjectName, chapterKey: key })}
              style={({ pressed }) => [styles.chapterCard, pressed && styles.pressed]}
            >
              <View style={styles.chapterTop}>
                <View style={[styles.chapterIndex, { backgroundColor: `${tone}16`, borderColor: `${tone}40` }]}>
                  <Text style={[styles.chapterIndexText, { color: tone }]}>
                    {String(chapter.index ?? index + 1).padStart(2, '0')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textSoft} />
              </View>
              <Text style={styles.chapterTitle}>{chapter.title}</Text>
              <Text style={styles.chapterBody} numberOfLines={2}>
                {chapter.document_title || 'Open dedicated study workspace for this chapter.'}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {!chaptersQuery.isLoading && chapters.length === 0 ? (
        <AnimatedCard style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No chapters found</Text>
          <Text style={styles.emptyBody}>Try the other standard toggle or check whether this subject has indexed books for your exam track.</Text>
        </AnimatedCard>
      ) : null}
    </AppScreen>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[20],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing[20],
  },
  centerTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
  },
  centerButton: {
    minHeight: 44,
    borderRadius: radius.full,
    backgroundColor: colors.nav,
    paddingHorizontal: spacing[5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButtonText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.xs,
  },
  topCopy: {
    flex: 1,
    minWidth: 0,
  },
  topKicker: {
    ...typography.roles.eyebrow,
    color: colors.accentStrong,
  },
  topTitle: {
    color: colors.text,
    fontFamily: typography.fonts.heading,
    fontSize: 22,
    lineHeight: 27,
  },
  hero: {
    borderRadius: radius['2xl'],
    padding: spacing[5],
    gap: spacing[3],
    overflow: 'hidden',
    ...shadows.lg,
  },
  heroHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  subjectMark: {
    width: 54,
    height: 54,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectMarkText: {
    color: colors.white,
    fontFamily: typography.fonts.heading,
    fontSize: 22,
  },
  trackPill: {
    flexShrink: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  trackPillText: {
    color: colors.textOnDark,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  heroTitle: {
    color: colors.white,
    fontFamily: typography.fonts.heading,
    fontSize: 30,
    lineHeight: 35,
  },
  heroBody: {
    color: 'rgba(255,255,255,0.74)',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 21,
  },
  heroStats: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[2],
  },
  metric: {
    flex: 1,
    minHeight: 66,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: spacing[3],
    justifyContent: 'center',
  },
  metricLabel: {
    color: 'rgba(255,255,255,0.58)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: colors.white,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
    marginTop: spacing[1],
  },
  standardRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  noticeCard: {
    flexDirection: 'row',
    gap: spacing[2],
    borderRadius: radius.lg,
    padding: spacing[3],
    backgroundColor: colors.infoSurface,
    borderWidth: 1,
    borderColor: colors.infoBorder,
  },
  noticeText: {
    flex: 1,
    color: colors.infoText,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  inlineLoadingText: {
    ...typography.roles.label,
    color: colors.textMuted,
  },
  chapterList: {
    gap: spacing[3],
  },
  chapterCard: {
    minHeight: 124,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[4],
    gap: spacing[3],
    ...shadows.sm,
  },
  chapterTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chapterIndex: {
    minWidth: 44,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  chapterIndexText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  chapterTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
    lineHeight: 22,
  },
  chapterBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyCard: {
    gap: spacing[2],
  },
  emptyTitle: {
    ...typography.roles.title,
    color: colors.text,
  },
  emptyBody: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
})
