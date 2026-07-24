import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AnimatedButton, AnimatedCard, AppScreen, ErrorState, GradientHeroCard, SelectableChip } from '../../components/ui'
import { previousPapersApi, PreviousPaper, PreviousQuestion, resolvePreviousPaperAssetUrl } from '../../api/previousPapers'
import { colors, radius, shadows, spacing, typography } from '../../theme'

function errorMessage(error: unknown) {
  const anyError = error as { response?: { data?: { detail?: string } } }
  return anyError.response?.data?.detail || 'Unable to load previous-year papers.'
}

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
  const [subject, setSubject] = useState<string | null>(null)
  const [chapterId, setChapterId] = useState<string | null>(null)
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
  const selectedPaper = useMemo(
    () => papers.find((paper) => paper.id === selectedPaperId) ?? papers[0],
    [papers, selectedPaperId],
  )

  useEffect(() => {
    if (!selectedPaperId && papers[0]) setSelectedPaperId(papers[0].id)
  }, [papers, selectedPaperId])

  useEffect(() => {
    setSubject(null)
  }, [selectedPaper?.id])

  useEffect(() => {
    setChapterId(null)
  }, [selectedPaper?.id, subject])

  const chaptersQuery = useQuery({
    queryKey: ['previous-paper-chapters', selectedPaper?.id, subject],
    queryFn: () => previousPapersApi.getChapters({ paper_id: selectedPaper!.id, subject: subject || undefined }),
    enabled: Boolean(selectedPaper?.id),
  })

  const chapters = chaptersQuery.data ?? []
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
      navigation.navigate('Papers', { screen: 'AttemptPaper', params: { paperId: result.paper_id } })
    },
  })

  const publishedCount = papers.length
  const solutionCount = papers.filter((paper) => paper.has_solutions).length
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
          message={errorMessage(papersQuery.error)}
          onAction={() => void papersQuery.refetch()}
        />
      </AppScreen>
    )
  }

  return (
    <>
    <AppScreen contentStyle={styles.screen}>
      <GradientHeroCard
        eyebrow="JEE PREVIOUS PAPERS"
        title="Practice from PYQs"
        subtitle="Browse the structured paper database, inspect questions, then continue an unfinished set or start a timed practice paper."
      >
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{publishedCount}</Text>
            <Text style={styles.heroStatLabel}>Published</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{solutionCount}</Text>
            <Text style={styles.heroStatLabel}>With solutions</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{selectedPaper?.question_count ?? 0}</Text>
            <Text style={styles.heroStatLabel}>Selected pool</Text>
          </View>
        </View>
      </GradientHeroCard>

      {papers.length === 0 ? (
        <AnimatedCard style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No published papers yet</Text>
          <Text style={styles.emptyBody}>Once JEE PYQs are published in the backend, they will appear here automatically.</Text>
        </AnimatedCard>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Published papers</Text>
        <Text style={styles.sectionSubtitle}>{publishedCount} papers available for practice</Text>
      </View>

      <View style={styles.paperList}>
        {papers.map((paper) => (
          <PaperCard key={paper.id} paper={paper} active={paper.id === selectedPaper?.id} onPress={() => setSelectedPaperId(paper.id)} />
        ))}
      </View>

      {selectedPaper ? (
        <AnimatedCard style={styles.focusCard}>
          <View style={styles.focusHeader}>
            <View style={styles.focusCopy}>
              <Text style={styles.sectionKicker}>Build practice set</Text>
              <Text style={styles.focusTitle}>{selectedPaper.title}</Text>
              <Text style={styles.focusMeta}>{metaForPaper(selectedPaper)}</Text>
            </View>
            <View style={styles.focusBadge}>
              <Ionicons name="library-outline" size={16} color={colors.paperStudio.jee} />
              <Text style={styles.focusBadgeText}>{selectedPaper.question_count} Q</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoTile}>
              <Text style={styles.infoTileLabel}>Subject</Text>
              <Text style={styles.infoTileValue}>{subject || 'All subjects'}</Text>
            </View>
            <View style={styles.infoTile}>
              <Text style={styles.infoTileLabel}>Chapter</Text>
              <Text style={styles.infoTileValue}>{selectedChapter?.chapter_title || 'Any chapter'}</Text>
            </View>
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
              message="You can still start the full paper, or retry to narrow the practice set."
              onAction={() => void chaptersQuery.refetch()}
              style={styles.inlineError}
            />
          ) : null}

          {chapters.length ? (
            <View style={styles.chipSection}>
              <Text style={styles.chipSectionTitle}>Chapter drill</Text>
              <View style={styles.chipRow}>
                <SelectableChip label="Any chapter" selected={!chapterId} onPress={() => setChapterId(null)} />
                {chapters.slice(0, 18).map((chapter) => (
                  <SelectableChip
                    key={`${chapter.chapter_id || chapter.chapter_title}-${chapter.subject || 'all'}`}
                    label={`${chapter.chapter_title} (${chapter.question_count})`}
                    selected={chapterId === chapter.chapter_id}
                    onPress={() => setChapterId(chapter.chapter_id || null)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <AnimatedCard style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Practice set ready</Text>
            <Text style={styles.summaryBody}>{previewSummary}</Text>
          </AnimatedCard>

          {startMutation.isError ? (
            <ErrorState
              title="Could not start practice"
              message={errorMessage(startMutation.error)}
              onAction={() => startMutation.mutate(startMutation.variables || 'auto')}
              style={styles.inlineError}
            />
          ) : null}

          <AnimatedButton
            label={
              startMutation.isPending
                ? 'Starting...'
                : selectedChapter
                  ? `Start ${selectedChapter.chapter_title}`
                  : subject
                    ? `Start ${subject} practice`
                    : 'Start full paper'
            }
            loading={startMutation.isPending}
            onPress={() => startMutation.mutate('auto')}
            disabled={!canStart}
          />
        </AnimatedCard>
      ) : null}

      {selectedPaper ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Question preview</Text>
            <Text style={styles.sectionSubtitle}>{[subject || 'All subjects', selectedChapter?.chapter_title].filter(Boolean).join(' / ')} from the selected paper.</Text>
          </View>

          {questionsQuery.isLoading ? <ActivityIndicator color={colors.paperStudio.jee} /> : null}

          {questionsQuery.isError ? (
            <ErrorState
              title="Could not load this practice set"
              message={errorMessage(questionsQuery.error)}
              onAction={() => void questionsQuery.refetch()}
            />
          ) : null}

          {!questionsQuery.isLoading && !questionsQuery.isError && (questionsQuery.data ?? []).length === 0 ? (
            <AnimatedCard style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No questions match this selection yet</Text>
              <Text style={styles.emptyBody}>Try switching to another subject or chapter to inspect a different portion of the paper.</Text>
            </AnimatedCard>
          ) : null}

          {(questionsQuery.data ?? []).slice(0, 8).map((question) => (
            <QuestionCard key={question.id} question={question} />
          ))}
        </>
      ) : null}
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
                  navigation.navigate('Papers', { screen: 'AttemptPaper', params: { paperId: pendingResume.paperId } })
                  setPendingResume(null)
                }}
                disabled={startMutation.isPending}
              />
              <AnimatedButton
                label="Start new attempt"
                variant="secondary"
                loading={startMutation.isPending && startMutation.variables === 'new'}
                onPress={() => startMutation.mutate('new')}
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
    paddingBottom: spacing[20],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  heroStats: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
    flexWrap: 'wrap',
  },
  heroStat: {
    flex: 1,
    minWidth: 88,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  heroStatValue: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 16,
  },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.78)',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    marginTop: 2,
  },
  paperList: {
    gap: spacing[3],
  },
  paperCard: {
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[4],
    gap: spacing[3],
    ...shadows.sm,
  },
  paperCardActive: {
    backgroundColor: colors.paperStudio.jee,
    borderColor: colors.paperStudio.jee,
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
    color: colors.white,
  },
  countPill: {
    borderRadius: radius.full,
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  countPillActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
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
    color: 'rgba(255,255,255,0.76)',
  },
  solutionBadge: {
    borderRadius: radius.full,
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  solutionBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  solutionBadgeText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  solutionBadgeTextActive: {
    color: colors.white,
  },
  focusCard: {
    gap: spacing[3],
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
  infoRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  infoTile: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
    gap: 2,
  },
  infoTileLabel: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  infoTileValue: {
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
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
  summaryCard: {
    gap: spacing[2],
    backgroundColor: colors.accentSurface,
    borderColor: colors.borderBrand,
  },
  summaryTitle: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  summaryBody: {
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionHeader: {
    gap: spacing[1],
  },
  sectionTitle: {
    ...typography.roles.title,
    color: colors.text,
  },
  sectionSubtitle: {
    ...typography.roles.body,
    color: colors.textMuted,
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
