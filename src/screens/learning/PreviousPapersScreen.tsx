import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AnimatedButton, AnimatedCard, AppScreen, ErrorState, SelectableChip } from '../../components/ui'
import { previousPapersApi, PreviousPaper, PreviousQuestion, resolvePreviousPaperAssetUrl } from '../../api/previousPapers'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import PreviousPaperAssemblyState, { AssemblyStage } from './PreviousPaperAssemblyState'
import {
  filterPreviousPapers,
  getApiErrorMessage,
  getPreviousPaperFilters,
  getVisibleChapters,
  reconcileSelectedPaperId,
} from './previousPapersModel'

function metaForPaper(paper: PreviousPaper) {
  return [paper.exam, paper.year, paper.session_label, paper.shift_label, paper.paper_label].filter(Boolean).join(' / ')
}

function PaperCard({ paper, active, onPress }: { paper: PreviousPaper; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.paperCard, active && styles.paperCardActive, pressed && styles.pressed]}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${paper.title}, ${paper.question_count} questions`}
    >
      <View style={styles.paperTop}>
        <View style={styles.paperCopy}>
          <Text style={styles.paperMeta}>{metaForPaper(paper)}</Text>
          <Text style={[styles.paperTitle, active && styles.paperTitleActive]}>{paper.title}</Text>
        </View>
        <View style={[styles.countPill, active && styles.countPillActive]}>
          <Text style={[styles.countText, active && styles.countTextActive]}>{paper.question_count}</Text>
        </View>
      </View>
      <View style={styles.paperFooter}>
        <Text style={[styles.paperSubjects, active && styles.paperSubjectsActive]}>{paper.subjects.join(', ')}</Text>
        {paper.has_solutions ? <View style={[styles.solutionBadge, active && styles.solutionBadgeActive]}><Text style={[styles.solutionBadgeText, active && styles.solutionBadgeTextActive]}>Solutions</Text></View> : null}
      </View>
    </Pressable>
  )
}

function QuestionCard({ question }: { question: PreviousQuestion }) {
  const imageUrl = resolvePreviousPaperAssetUrl(question.question_figure_urls[0])
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <AnimatedCard style={styles.questionCard}>
      <View style={styles.questionHeader}>
        <Text style={styles.questionMeta}>
          Q{question.question_number} / {[question.subject, question.chapter_title].filter(Boolean).join(' / ')}
        </Text>
        <Text style={styles.questionType}>{question.question_type}</Text>
      </View>
      {imageUrl && !imageFailed ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.questionImage}
          resizeMode="contain"
          accessibilityLabel={`Figure for question ${question.question_number}`}
          onError={() => setImageFailed(true)}
        />
      ) : null}
      {imageUrl && imageFailed ? <Text style={styles.imageFallbackText}>Question figure could not be loaded.</Text> : null}
      <Text style={styles.questionText}>{question.question_text}</Text>
      {question.options?.map((option, index) => (
        <View key={`${question.id}-${index}`} style={styles.optionRow}>
          <Text style={styles.optionLabel}>{option.label || option.id || String.fromCharCode(65 + index)}</Text>
          <Text style={styles.optionText}>{option.text || option.value}</Text>
        </View>
      ))}
    </AnimatedCard>
  )
}

export default function PreviousPapersScreen() {
  const navigation = useNavigation<any>()
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null)
  const [examFilter, setExamFilter] = useState<string | null>(null)
  const [yearFilter, setYearFilter] = useState<string | null>(null)
  const [subject, setSubject] = useState<string | null>(null)
  const [chapterId, setChapterId] = useState<string | null>(null)
  const [chaptersExpanded, setChaptersExpanded] = useState(false)
  const [viewMode, setViewMode] = useState<'browse' | 'preview'>('browse')
  const [assemblyStage, setAssemblyStage] = useState<AssemblyStage | null>(null)
  const [assemblyError, setAssemblyError] = useState<string | null>(null)
  const [assemblyAction, setAssemblyAction] = useState<'auto' | 'new'>('auto')
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pendingResume, setPendingResume] = useState<{
    paperId: string
    title: string
    mode: 'paper' | 'subject' | 'chapter'
    subject?: string | null
    chapterId?: string | null
  } | null>(null)

  const papersQuery = useQuery({
    queryKey: ['previous-papers'],
    queryFn: previousPapersApi.getPublished,
  })

  const papers = papersQuery.data ?? []
  const filterOptions = useMemo(() => getPreviousPaperFilters(papers), [papers])
  const visiblePapers = useMemo(
    () => filterPreviousPapers(papers, examFilter, yearFilter),
    [examFilter, papers, yearFilter],
  )
  const selectedPaper = useMemo(
    () => visiblePapers.find((paper) => paper.id === selectedPaperId),
    [selectedPaperId, visiblePapers],
  )

  useEffect(() => {
    const nextPaperId = reconcileSelectedPaperId(visiblePapers, selectedPaperId)
    if (nextPaperId !== selectedPaperId) setSelectedPaperId(nextPaperId)
  }, [selectedPaperId, visiblePapers])

  useEffect(() => {
    setSubject(null)
    setViewMode('browse')
  }, [selectedPaper?.id])

  useEffect(() => {
    setChapterId(null)
    setChaptersExpanded(false)
  }, [selectedPaper?.id, subject])

  useEffect(() => () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current)
  }, [])

  const chaptersQuery = useQuery({
    queryKey: ['previous-paper-chapters', selectedPaper?.id, subject],
    queryFn: () => previousPapersApi.getChapters({ paper_id: selectedPaper!.id, subject: subject || undefined }),
    enabled: Boolean(selectedPaper?.id),
  })

  const chapters = chaptersQuery.data ?? []
  const visibleChapters = getVisibleChapters(chapters, chaptersExpanded, 6)
  const selectedChapter = chapters.find((chapter) => chapter.chapter_id === chapterId)

  const questionsQuery = useQuery({
    queryKey: ['previous-paper-questions', selectedPaper?.id, subject, chapterId],
    queryFn: () => previousPapersApi.getQuestions({ paper_id: selectedPaper!.id, subject: subject || undefined, chapter_id: chapterId || undefined }),
    enabled: Boolean(selectedPaper?.id),
  })

  const startMutation = useMutation({
    mutationFn: async (attemptAction: 'auto' | 'new') => {
      if (!selectedPaper) throw new Error('No paper selected')
      return previousPapersApi.startExam(selectedPaper.id, {
        mode: chapterId ? 'chapter' : subject ? 'subject' : 'paper',
        subject,
        chapter_id: chapterId,
        attempt_action: attemptAction,
      })
    },
    onSuccess: (result, attemptAction) => {
      if (attemptAction === 'auto' && result.reused_existing) {
        setAssemblyStage(null)
        setPendingResume({
          paperId: result.paper_id,
          title: result.title,
          mode: chapterId ? 'chapter' : subject ? 'subject' : 'paper',
          subject,
          chapterId,
        })
        return
      }
      setPendingResume(null)
      setAssemblyStage('opening')
      transitionTimer.current = setTimeout(() => {
        setAssemblyStage(null)
        navigation.navigate('Papers', { screen: 'AttemptPaper', params: { paperId: result.paper_id } })
      }, 180)
    },
    onError: (error) => {
      setAssemblyError(getApiErrorMessage(error, 'The paper could not be assembled. Check your connection and try again.'))
      setAssemblyStage('error')
    },
  })

  const publishedCount = papers.length
  const canStart = !questionsQuery.isLoading && !questionsQuery.isError && (questionsQuery.data?.length ?? 0) > 0
  const previewSummary = questionsQuery.isLoading
    ? 'Checking the selected practice set…'
    : selectedChapter
    ? `${selectedChapter.question_count} questions ready from ${selectedChapter.chapter_title}`
    : subject
      ? `${questionsQuery.data?.length ?? 0} ${subject} questions ready for practice`
      : selectedPaper
        ? `${selectedPaper.question_count} questions available in ${selectedPaper.title}`
        : 'Choose a paper to build a timed practice set.'
  const selectionLabel = [subject || 'All subjects', selectedChapter?.chapter_title || 'Any chapter'].join(' · ')

  const beginStart = (attemptAction: 'auto' | 'new') => {
    if (startMutation.isPending || assemblyStage === 'preparing' || assemblyStage === 'requesting' || assemblyStage === 'opening') return
    if (transitionTimer.current) clearTimeout(transitionTimer.current)
    setAssemblyAction(attemptAction)
    setAssemblyError(null)
    setPendingResume(null)
    setAssemblyStage('preparing')
    transitionTimer.current = setTimeout(() => {
      setAssemblyStage('requesting')
      startMutation.mutate(attemptAction)
    }, 180)
  }

  const openRecoveredPaper = (paperId: string) => {
    setPendingResume(null)
    setAssemblyStage('opening')
    transitionTimer.current = setTimeout(() => {
      setAssemblyStage(null)
      navigation.navigate('Papers', { screen: 'AttemptPaper', params: { paperId } })
    }, 180)
  }

  if (assemblyStage && selectedPaper) {
    return (
      <PreviousPaperAssemblyState
        stage={assemblyStage}
        paperTitle={selectedPaper.title}
        selectionLabel={selectionLabel}
        errorMessage={assemblyError || undefined}
        onRetry={() => beginStart(assemblyAction)}
        onBack={() => {
          setAssemblyError(null)
          setAssemblyStage(null)
        }}
      />
    )
  }

  if (papersQuery.isLoading) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.paperStudio.jee} />
        <Text style={styles.loadingText}>Loading JEE previous papers</Text>
      </AppScreen>
    )
  }

  if (papersQuery.isError) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ErrorState
          title="Previous papers are for JEE learners"
          message={getApiErrorMessage(papersQuery.error, 'Unable to load previous-year papers.')}
          onAction={() => void papersQuery.refetch()}
        />
      </AppScreen>
    )
  }

  return (
    <>
      <AppScreen protectedChrome contentStyle={styles.screen}>
        {viewMode === 'preview' && selectedPaper ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to practice builder"
              onPress={() => setViewMode('browse')}
              style={({ pressed }) => [styles.previewBack, pressed && styles.pressed]}
            >
              <Ionicons name="arrow-back" size={18} color={colors.paperStudio.jee} />
              <Text style={styles.previewBackText}>Back to builder</Text>
            </Pressable>

            <View style={styles.previewIntro}>
              <Text style={styles.previewEyebrow}>QUESTION PREVIEW · ANSWERS STAY LOCKED</Text>
              <Text style={styles.previewTitle}>Know the shape of your set.</Text>
              <Text style={styles.previewBody}>{selectionLabel} from {selectedPaper.title}. Solutions unlock only after submission.</Text>
            </View>

            {questionsQuery.isLoading ? (
              <View style={styles.previewLoading}>
                <ActivityIndicator color={colors.paperStudio.jee} />
                <Text style={styles.inlineLoadingText}>Preparing a safe question preview</Text>
              </View>
            ) : null}

            {questionsQuery.isError ? (
              <ErrorState
                title="Could not load this preview"
                message={getApiErrorMessage(questionsQuery.error, 'The question preview could not load. Your filters are unchanged.')}
                onAction={() => void questionsQuery.refetch()}
              />
            ) : null}

            {!questionsQuery.isLoading && !questionsQuery.isError && (questionsQuery.data ?? []).length === 0 ? (
              <AnimatedCard style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No questions match this selection yet</Text>
                <Text style={styles.emptyBody}>Return to the builder and choose another subject or chapter.</Text>
              </AnimatedCard>
            ) : null}

            {(questionsQuery.data ?? []).slice(0, 8).map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))}

            <View style={styles.previewActions}>
              <AnimatedButton
                label="Start this practice set"
                onPress={() => beginStart('auto')}
                disabled={!canStart}
              />
              <AnimatedButton label="Adjust selection" variant="ghost" onPress={() => setViewMode('browse')} />
            </View>
          </>
        ) : (
          <>
            <View style={styles.libraryIntro}>
              <View style={styles.libraryTopline}>
                <View style={styles.libraryMark}><Ionicons name="library-outline" size={18} color={colors.white} /></View>
                <Text style={styles.libraryKicker}>JEE PYQ LIBRARY</Text>
                <View style={styles.libraryCount}><Text style={styles.libraryCountText}>{publishedCount} papers</Text></View>
              </View>
              <Text style={styles.libraryTitle}>Choose the paper. Shape the practice.</Text>
              <Text style={styles.libraryBody}>Real previous-year questions, one focused attempt, and solutions kept safely behind submission.</Text>
              <View style={styles.libraryPromise}>
                <Ionicons name="shield-checkmark-outline" size={15} color="#93e2b7" />
                <Text style={styles.libraryPromiseText}>Your filters and unfinished attempts are preserved.</Text>
              </View>
            </View>

            {papers.length ? (
              <View style={styles.filterSection}>
                <View style={styles.filterHeader}>
                  <Text style={styles.filterTitle}>Find a paper</Text>
                  {(examFilter || yearFilter) ? (
                    <Pressable accessibilityRole="button" onPress={() => { setExamFilter(null); setYearFilter(null) }}>
                      <Text style={styles.clearFilterText}>Clear filters</Text>
                    </Pressable>
                  ) : <Text style={styles.filterHint}>Exam · year</Text>}
                </View>
                <Text style={styles.filterLabel}>Exam</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRail} accessibilityLabel="Filter papers by exam">
                  <SelectableChip label="All exams" selected={!examFilter} onPress={() => setExamFilter(null)} />
                  {filterOptions.exams.map((exam) => (
                    <SelectableChip key={exam} label={exam} selected={examFilter === exam} onPress={() => setExamFilter(exam)} />
                  ))}
                </ScrollView>
                <Text style={styles.filterLabel}>Year</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRail} accessibilityLabel="Filter papers by year">
                  <SelectableChip label="All years" selected={!yearFilter} onPress={() => setYearFilter(null)} />
                  {filterOptions.years.map((year) => (
                    <SelectableChip key={year} label={year} selected={yearFilter === year} onPress={() => setYearFilter(year)} />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {papers.length === 0 ? (
              <AnimatedCard style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>The PYQ shelf is waiting</Text>
                <Text style={styles.emptyBody}>Published JEE papers will appear here automatically. Pull to refresh when your school or Eduraa adds them.</Text>
              </AnimatedCard>
            ) : null}

            {papers.length > 0 && visiblePapers.length === 0 ? (
              <View style={styles.noMatch}>
                <View style={styles.noMatchIcon}><Ionicons name="search-outline" size={22} color={colors.paperStudio.jee} /></View>
                <Text style={styles.emptyTitle}>No papers match both filters</Text>
                <Text style={styles.emptyBody}>Clear the exam and year filters to return to the complete library.</Text>
                <AnimatedButton label="Show all papers" variant="secondary" onPress={() => { setExamFilter(null); setYearFilter(null) }} />
              </View>
            ) : null}

            {visiblePapers.length ? (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Published papers</Text>
                  <Text style={styles.sectionSubtitle}>{visiblePapers.length} of {publishedCount} available</Text>
                </View>
                <View style={styles.paperList}>
                  {visiblePapers.map((paper) => (
                    <PaperCard key={paper.id} paper={paper} active={paper.id === selectedPaper?.id} onPress={() => setSelectedPaperId(paper.id)} />
                  ))}
                </View>
              </>
            ) : null}

            {selectedPaper ? (
              <View style={styles.focusCard}>
                <View style={styles.focusHeader}>
                  <View style={styles.focusCopy}>
                    <Text style={styles.sectionKicker}>BUILD PRACTICE</Text>
                    <Text style={styles.focusTitle}>{selectedPaper.title}</Text>
                    <Text style={styles.focusMeta}>{metaForPaper(selectedPaper)}</Text>
                  </View>
                  <View style={styles.focusBadge}>
                    <Ionicons name="library-outline" size={16} color={colors.paperStudio.jee} />
                    <Text style={styles.focusBadgeText}>{selectedPaper.question_count} Q</Text>
                  </View>
                </View>

                <View style={styles.selectionLine}>
                  <Ionicons name="options-outline" size={16} color={colors.paperStudio.jee} />
                  <Text style={styles.selectionLineText}>{selectionLabel}</Text>
                </View>

                <View style={styles.chipSection}>
                  <Text style={styles.chipSectionTitle}>Subject</Text>
                  <View style={styles.chipRow}>
                    <SelectableChip label="All subjects" selected={!subject} onPress={() => setSubject(null)} />
                    {selectedPaper.subjects.map((item) => (
                      <SelectableChip key={item} label={item} selected={subject === item} onPress={() => setSubject(item)} />
                    ))}
                  </View>
                </View>

                {chaptersQuery.isLoading ? (
                  <View style={styles.inlineLoading}>
                    <ActivityIndicator color={colors.paperStudio.jee} />
                    <Text style={styles.inlineLoadingText}>Loading chapters</Text>
                  </View>
                ) : null}

                {chaptersQuery.isError ? (
                  <ErrorState
                    title="Could not load chapters"
                    message={getApiErrorMessage(chaptersQuery.error, 'You can still start the full paper, or retry to narrow this set.')}
                    onAction={() => void chaptersQuery.refetch()}
                    style={styles.inlineError}
                  />
                ) : null}

                {chapters.length ? (
                  <View style={styles.chipSection}>
                    <View style={styles.chapterHeader}>
                      <Text style={styles.chipSectionTitle}>Chapter drill</Text>
                      <Text style={styles.chapterHint}>Optional</Text>
                    </View>
                    <View style={styles.chipRow}>
                      <SelectableChip label="Any chapter" selected={!chapterId} onPress={() => setChapterId(null)} />
                      {visibleChapters.map((chapter) => (
                        <SelectableChip
                          key={`${chapter.chapter_id || chapter.chapter_title}-${chapter.subject || 'all'}`}
                          label={`${chapter.chapter_title} (${chapter.question_count})`}
                          selected={chapterId === chapter.chapter_id}
                          onPress={() => setChapterId(chapter.chapter_id || null)}
                        />
                      ))}
                    </View>
                    {chapters.length > 6 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={chaptersExpanded ? 'Show fewer chapters' : `Show all ${chapters.length} chapters`}
                        onPress={() => setChaptersExpanded((expanded) => !expanded)}
                        style={({ pressed }) => [styles.chapterToggle, pressed && styles.pressed]}
                      >
                        <Text style={styles.chapterToggleText}>{chaptersExpanded ? 'Show fewer chapters' : `Show all ${chapters.length} chapters`}</Text>
                        <Ionicons name={chaptersExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.paperStudio.jee} />
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}

                <View style={styles.readinessBand}>
                  <View style={styles.readinessIcon}><Ionicons name="checkmark" size={17} color={colors.white} /></View>
                  <View style={styles.readinessCopy}>
                    <Text style={styles.summaryTitle}>Practice set ready</Text>
                    <Text style={styles.summaryBody}>{previewSummary}</Text>
                  </View>
                </View>

                <View style={styles.builderActions}>
                  <AnimatedButton
                    label="Preview questions"
                    variant="secondary"
                    onPress={() => setViewMode('preview')}
                    disabled={!canStart}
                  />
                  <AnimatedButton
                    label={
                      selectedChapter
                        ? `Start ${selectedChapter.chapter_title}`
                        : subject
                          ? `Start ${subject} practice`
                          : 'Start full paper'
                    }
                    onPress={() => beginStart('auto')}
                    disabled={!canStart}
                  />
                </View>
              </View>
            ) : null}
          </>
        )}
      </AppScreen>
      <Modal
        visible={Boolean(pendingResume)}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPendingResume(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={styles.resumeSheet}
            accessibilityViewIsModal
            accessibilityLabel="Existing previous paper attempt"
          >
            <View style={styles.resumeIcon}>
              <Ionicons name="time-outline" size={26} color={colors.paperStudio.jee} />
            </View>
            <Text style={styles.resumeKicker}>Existing attempt found</Text>
            <Text style={styles.resumeTitle}>Resume where you left off?</Text>
            <Text style={styles.resumeBody}>
              This selection already has an unfinished paper. Continue it to keep your place, or start again with a fresh copy.
            </Text>
            <View style={styles.resumePaper}>
              <Text style={styles.resumePaperLabel}>Your unfinished paper</Text>
              <Text style={styles.resumePaperTitle} numberOfLines={2}>{pendingResume?.title}</Text>
            </View>
            <View style={styles.resumeActions}>
              <AnimatedButton
                label="Resume paper"
                onPress={() => {
                  if (!pendingResume) return
                  openRecoveredPaper(pendingResume.paperId)
                }}
                disabled={startMutation.isPending}
              />
              <AnimatedButton
                label="Start new attempt"
                variant="secondary"
                loading={startMutation.isPending && startMutation.variables === 'new'}
                onPress={() => beginStart('new')}
              />
              <AnimatedButton
                label="Not now"
                variant="ghost"
                onPress={() => setPendingResume(null)}
                disabled={startMutation.isPending}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing[4],
    paddingBottom: spacing[8],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
  },
  loadingText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  libraryIntro: {
    overflow: 'hidden',
    borderRadius: 24,
    padding: spacing[5],
    gap: spacing[3],
    backgroundColor: '#07152d',
    ...shadows.md,
  },
  libraryTopline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  libraryMark: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  libraryKicker: {
    flex: 1,
    color: 'rgba(255,255,255,0.72)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 1.25,
  },
  libraryCount: {
    minHeight: 28,
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  libraryCountText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
  },
  libraryTitle: {
    maxWidth: 320,
    color: colors.white,
    fontFamily: typography.fonts.heading,
    fontSize: 25,
    lineHeight: 29,
  },
  libraryBody: {
    maxWidth: 340,
    color: 'rgba(255,255,255,0.68)',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  libraryPromise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingTop: spacing[2],
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.09)',
  },
  libraryPromiseText: {
    flex: 1,
    color: '#b7e8cb',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 14,
  },
  filterSection: {
    gap: spacing[2],
    paddingVertical: spacing[2],
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  filterTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
  },
  filterHint: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
  },
  clearFilterText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  filterLabel: {
    marginTop: spacing[1],
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  filterRail: {
    gap: spacing[2],
    paddingRight: spacing[5],
  },
  noMatch: {
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[6],
    paddingHorizontal: spacing[4],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  noMatchIcon: {
    width: 52,
    height: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef3ff',
  },
  paperList: {
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  paperCard: {
    minHeight: 112,
    padding: spacing[4],
    gap: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.backgroundElevated,
  },
  paperCardActive: {
    borderLeftWidth: 4,
    borderLeftColor: colors.paperStudio.jee,
    backgroundColor: '#eef3ff',
  },
  paperTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  paperCopy: {
    flex: 1,
  },
  paperMeta: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  paperTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
    lineHeight: 22,
    marginTop: spacing[1],
  },
  paperTitleActive: {
    color: colors.paperStudio.jee,
  },
  countPill: {
    borderRadius: radius.full,
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  countPillActive: {
    backgroundColor: colors.paperStudio.jee,
  },
  countText: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  countTextActive: {
    color: colors.white,
  },
  paperFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  paperSubjects: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
  },
  paperSubjectsActive: {
    color: colors.textSecondary,
  },
  solutionBadge: {
    borderRadius: radius.full,
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  solutionBadgeActive: {
    backgroundColor: '#dfe8ff',
  },
  solutionBadgeText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  solutionBadgeTextActive: {
    color: colors.paperStudio.jee,
  },
  focusCard: {
    borderRadius: 24,
    padding: spacing[5],
    gap: spacing[3],
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    ...shadows.sm,
  },
  focusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  focusCopy: {
    flex: 1,
  },
  sectionKicker: {
    ...typography.roles.eyebrow,
    color: colors.paperStudio.jee,
  },
  focusTitle: {
    ...typography.roles.title,
    color: colors.text,
    fontSize: 19,
    lineHeight: 24,
  },
  focusMeta: {
    ...typography.roles.body,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  focusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radius.full,
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  focusBadgeText: {
    color: colors.paperStudio.jee,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  selectionLine: {
    minHeight: 44,
    paddingHorizontal: spacing[3],
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: '#eef3ff',
  },
  selectionLineText: {
    flex: 1,
    color: colors.paperStudio.jee,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 15,
  },
  chipSection: {
    gap: spacing[2],
  },
  chipSectionTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  chapterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chapterHint: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
  },
  chapterToggle: {
    minHeight: 44,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  chapterToggleText: {
    color: colors.paperStudio.jee,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
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
  inlineError: {
    alignSelf: 'stretch',
  },
  readinessBand: {
    minHeight: 76,
    padding: spacing[3],
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    backgroundColor: '#eef8f2',
    borderWidth: 1,
    borderColor: '#cfe7d7',
  },
  readinessIcon: {
    width: 34,
    height: 34,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
  },
  readinessCopy: {
    flex: 1,
  },
  summaryTitle: {
    color: '#17623c',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  summaryBody: {
    marginTop: 2,
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
  },
  builderActions: {
    gap: spacing[2],
    paddingTop: spacing[1],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  sectionTitle: {
    ...typography.roles.title,
    color: colors.text,
  },
  sectionSubtitle: {
    ...typography.roles.body,
    color: colors.textMuted,
    fontSize: 11,
  },
  previewBack: {
    minHeight: 44,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  previewBackText: {
    color: colors.paperStudio.jee,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  previewIntro: {
    borderRadius: 24,
    padding: spacing[5],
    gap: spacing[2],
    backgroundColor: '#07152d',
  },
  previewEyebrow: {
    color: '#ff9b62',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 1,
  },
  previewTitle: {
    color: colors.white,
    fontFamily: typography.fonts.heading,
    fontSize: 24,
    lineHeight: 29,
  },
  previewBody: {
    color: 'rgba(255,255,255,0.68)',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  previewLoading: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
  },
  previewActions: {
    gap: spacing[2],
    paddingTop: spacing[2],
  },
  questionCard: {
    gap: spacing[3],
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  questionMeta: {
    flex: 1,
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  questionType: {
    color: colors.paperStudio.jee,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  questionImage: {
    width: '100%',
    minHeight: 180,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
  },
  imageFallbackText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
  },
  questionText: {
    ...typography.roles.body,
    color: colors.text,
  },
  optionRow: {
    flexDirection: 'row',
    gap: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
  },
  optionLabel: {
    color: colors.paperStudio.jee,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
    minWidth: 18,
  },
  optionText: {
    flex: 1,
    color: colors.textSecondary,
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
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(7,21,45,0.58)',
    padding: spacing[4],
  },
  resumeSheet: {
    borderRadius: radius.xl,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[5],
    gap: spacing[3],
    ...shadows.lg,
  },
  resumeIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warningSurface,
  },
  resumeKicker: {
    ...typography.roles.eyebrow,
    color: colors.paperStudio.jee,
  },
  resumeTitle: {
    ...typography.roles.title,
    color: colors.text,
    fontSize: 22,
    lineHeight: 28,
  },
  resumeBody: {
    ...typography.roles.body,
    color: colors.textMuted,
    lineHeight: 21,
  },
  resumePaper: {
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[3],
    gap: spacing[1],
  },
  resumePaperLabel: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  resumePaperTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
    lineHeight: 20,
  },
  resumeActions: {
    gap: spacing[2],
    marginTop: spacing[1],
  },
})
