import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import type { HomeStackParamList } from '../../navigation'
import { AppScreen } from '../../components/ui'
import { competitiveExamApi, CompetitiveChapterOption, CompetitiveStandard } from '../../api/competitiveExam'
import { getCompetitiveSyllabus } from '../../data/competitiveSyllabus'
import { useAuthStore } from '../../stores/authStore'
import { radius, spacing, typography } from '../../theme'
import {
  chapterIdentity,
  decodeRouteParam,
  dedupeChapters,
  isCompetitiveLearner,
  normalizeSubjectName,
  profileSubjects,
  splitDistinctValues,
  standardVariants,
  subjectSymbol,
  subjectTone,
} from './competitiveExamUtils'

type Route = RouteProp<HomeStackParamList, 'CompetitiveSubject'>

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
      <AppScreen tone="auth" ambient={false} contentStyle={styles.center}>
        <Ionicons name="lock-closed-outline" size={34} color="#f36c21" />
        <Text style={styles.centerTitle}>Competitive Exam is for JEE learners</Text>
        <TouchableOpacity activeOpacity={0.86} onPress={() => navigation.navigate('LearningHome')} style={styles.centerButton}>
          <Text style={styles.centerButtonText}>Back to Learning</Text>
        </TouchableOpacity>
      </AppScreen>
    )
  }

  if (!activeSubjectName) {
    return (
      <AppScreen tone="auth" ambient={false} contentStyle={styles.center}>
        <Ionicons name="alert-circle-outline" size={34} color="#f59e0b" />
        <Text style={styles.centerTitle}>Subject unavailable</Text>
        <TouchableOpacity activeOpacity={0.86} onPress={() => navigation.navigate('CompetitiveExam')} style={styles.centerButton}>
          <Text style={styles.centerButtonText}>Back to Competitive Exam</Text>
        </TouchableOpacity>
      </AppScreen>
    )
  }

  const chapters = chaptersQuery.data?.chapters ?? []

  // Subject gradient colors
  const subjectGradients: Record<string, { start: string; end: string }> = {
    Physics: { start: '#3b82f6', end: '#1d4ed8' },
    Chemistry: { start: '#10b981', end: '#047857' },
    Mathematics: { start: '#8b5cf6', end: '#6d28d9' },
  }
  const gradient = subjectGradients[activeSubjectName] || { start: tone, end: tone }

  return (
    <AppScreen tone="auth" ambient={false} contentStyle={styles.screen}>
      {/* Compact header: back + icon + subject + toggle — all in one row */}
      <View style={styles.topRow}>
        <TouchableOpacity activeOpacity={0.82} onPress={() => navigation.navigate('CompetitiveExam')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={18} color="#101828" />
        </TouchableOpacity>
        <LinearGradient
          colors={[gradient.start, gradient.end]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.subjectMark}
        >
          <Text style={styles.subjectMarkText}>{subjectSymbol(activeSubjectName)}</Text>
        </LinearGradient>
        <View style={styles.topCopy}>
          <Text style={styles.topTitle}>{activeSubjectName}</Text>
          <Text style={styles.topSubtitle}>{trackLabel}</Text>
        </View>
      </View>

      {/* Standard toggle — compact, outside the hero bloat */}
      <View style={styles.standardRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setSelectedStandard('11th')}
          style={[styles.toggleChip, selectedStandard === '11th' && styles.toggleChipActive]}
        >
          <Text style={[styles.toggleChipText, selectedStandard === '11th' && styles.toggleChipTextActive]}>11th</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setSelectedStandard('12th')}
          style={[styles.toggleChip, selectedStandard === '12th' && styles.toggleChipActive]}
        >
          <Text style={[styles.toggleChipText, selectedStandard === '12th' && styles.toggleChipTextActive]}>12th</Text>
        </TouchableOpacity>
      </View>

      {chaptersQuery.isLoading ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color="#f36c21" />
          <Text style={styles.inlineLoadingText}>Loading chapters</Text>
        </View>
      ) : null}

      {optionsQuery.isError ? (
        <View style={styles.noticeCard}>
          <Ionicons name="alert-circle-outline" size={16} color="#b45309" />
          <Text style={styles.noticeText}>Could not load indexed subjects. Showing syllabus chapters.</Text>
        </View>
      ) : null}

      {/* Chapter list — no redundant section header, just the list */}
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
                <View style={[styles.chapterIndex, { borderColor: `${gradient.start}30`, backgroundColor: `${gradient.start}0a` }]}>
                  <Text style={[styles.chapterIndexText, { color: gradient.start }]}>
                    {String(chapter.index ?? index + 1).padStart(2, '0')}
                  </Text>
                </View>
                <View style={styles.chapterContent}>
                  <Text style={styles.chapterTitle}>{chapter.title}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </View>
            </Pressable>
          )
        })}
      </View>

      {!chaptersQuery.isLoading && chapters.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="book-outline" size={28} color="#94a3b8" />
          <Text style={styles.emptyTitle}>No chapters found</Text>
          <Text style={styles.emptyBody}>Try switching between 11th and 12th above.</Text>
        </View>
      ) : null}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[20],
    backgroundColor: '#fbf6ec',
    gap: spacing[3],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing[20],
    backgroundColor: '#fbf6ec',
  },
  centerTitle: {
    fontFamily: 'Georgia',
    fontWeight: '700',
    color: '#101828',
    fontSize: 18,
    marginTop: spacing[4],
    letterSpacing: -0.2,
  },
  centerButton: {
    minHeight: 48,
    borderRadius: radius.full,
    backgroundColor: '#f36c21',
    paddingHorizontal: spacing[6],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[5],
    shadowColor: '#f36c21',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  centerButtonText: {
    fontFamily: typography.fonts.bodyBold,
    color: '#ffffff',
    fontSize: 14,
  },

  // Compact header
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[1],
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0d6c8',
    shadowColor: 'rgba(0,0,0,0.04)',
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  subjectMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectMarkText: {
    fontFamily: 'Georgia',
    fontWeight: '700',
    color: '#ffffff',
    fontSize: 18,
  },
  topCopy: {
    flex: 1,
    minWidth: 0,
  },
  topTitle: {
    fontFamily: 'Georgia',
    fontWeight: '700',
    color: '#101828',
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  topSubtitle: {
    fontFamily: typography.fonts.bodyMedium,
    color: '#5c6a82',
    fontSize: 13,
    marginTop: 1,
  },

  // Standard toggle — compact segmented
  standardRow: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: 2,
    backgroundColor: '#ffffff',
    borderRadius: radius.full,
    padding: 3,
    borderWidth: 1,
    borderColor: '#e0d6c8',
    shadowColor: 'rgba(0,0,0,0.03)',
    shadowOpacity: 1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  toggleChip: {
    paddingHorizontal: spacing[4],
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  toggleChipActive: {
    backgroundColor: '#f36c21',
  },
  toggleChipText: {
    fontFamily: typography.fonts.bodyBold,
    color: '#94a3b8',
    fontSize: 13,
  },
  toggleChipTextActive: {
    color: '#ffffff',
  },

  // Notice
  noticeCard: {
    flexDirection: 'row',
    gap: spacing[2],
    borderRadius: 14,
    padding: spacing[3],
    backgroundColor: 'rgba(180,83,9,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(180,83,9,0.12)',
  },
  noticeText: {
    flex: 1,
    fontFamily: typography.fonts.bodyMedium,
    color: '#b45309',
    fontSize: 12,
    lineHeight: 17,
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  inlineLoadingText: {
    fontFamily: typography.fonts.bodyMedium,
    color: '#5c6a82',
    fontSize: 12,
  },

  // Chapter list
  chapterList: {
    gap: spacing[2],
  },
  chapterCard: {
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0d6c8',
    padding: spacing[4],
    shadowColor: 'rgba(0,0,0,0.03)',
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  chapterTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  chapterIndex: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  chapterIndexText: {
    fontFamily: 'Georgia',
    fontWeight: '700',
    fontSize: 14,
  },
  chapterContent: {
    flex: 1,
    minWidth: 0,
  },
  chapterTitle: {
    fontFamily: 'Georgia',
    fontWeight: '700',
    color: '#101828',
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.1,
  },

  // Empty state
  emptyCard: {
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: '#ffffff',
    borderColor: '#e0d6c8',
    borderRadius: 20,
    padding: spacing[6],
  },
  emptyTitle: {
    fontFamily: 'Georgia',
    fontWeight: '700',
    color: '#101828',
    fontSize: 16,
    letterSpacing: -0.2,
  },
  emptyBody: {
    fontFamily: typography.fonts.bodyMedium,
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
})
