import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native'
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
    <Pressable onPress={onPress} style={({ pressed }) => [styles.paperCard, active && styles.paperCardActive, pressed && styles.pressed]}>
      <View style={styles.paperTop}>
        <View style={styles.paperCopy}>
          <Text style={styles.paperMeta}>{metaForPaper(paper)}</Text>
          <Text style={[styles.paperTitle, active && styles.paperTitleActive]}>{paper.title}</Text>
        </View>
        <View style={[styles.countPill, active && styles.countPillActive]}>
          <Text style={[styles.countText, active && styles.countTextActive]}>{paper.question_count}</Text>
        </View>
      </View>
      <Text style={[styles.paperSubjects, active && styles.paperSubjectsActive]}>{paper.subjects.join(', ')}</Text>
    </Pressable>
  )
}

function QuestionCard({ question }: { question: PreviousQuestion }) {
  const imageUrl = resolvePreviousPaperAssetUrl(question.question_figure_urls[0])

  return (
    <AnimatedCard style={styles.questionCard}>
      <View style={styles.questionHeader}>
        <Text style={styles.questionMeta}>
          Q{question.question_number} / {[question.subject, question.chapter_title].filter(Boolean).join(' / ')}
        </Text>
        <Text style={styles.questionType}>{question.question_type}</Text>
      </View>
      {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.questionImage} resizeMode="contain" /> : null}
      <Text style={styles.questionText}>{question.question_text}</Text>
      {question.options?.map((option, index) => (
        <View key={`${question.id}-${index}`} style={styles.optionRow}>
          <Text style={styles.optionLabel}>{option.label || option.id || String.fromCharCode(65 + index)}</Text>
          <Text style={styles.optionText}>{option.text || option.value}</Text>
        </View>
      ))}
      {question.answer_key ? <Text style={styles.answerText}>Answer: {question.answer_key}</Text> : null}
      {question.solution_text ? <Text style={styles.solutionText}>{question.solution_text}</Text> : null}
    </AnimatedCard>
  )
}

export default function PreviousPapersScreen() {
  const navigation = useNavigation<any>()
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null)
  const [subject, setSubject] = useState<string | null>(null)
  const [chapterId, setChapterId] = useState<string | null>(null)

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
    mutationFn: async () => {
      if (!selectedPaper) throw new Error('No paper selected')
      return previousPapersApi.startExam(selectedPaper.id, {
        mode: chapterId ? 'chapter' : subject ? 'subject' : 'paper',
        subject,
        chapter_id: chapterId,
      })
    },
    onSuccess: (result) => {
      navigation.navigate('Papers', { screen: 'Quiz', params: { paperId: result.paper_id } })
    },
    onError: () => {
      Alert.alert('Could not start practice', 'This previous paper selection could not be converted into a quiz right now.')
    },
  })

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
    <AppScreen contentStyle={styles.screen}>
      <GradientHeroCard
        eyebrow="JEE PREVIOUS PAPERS"
        title="Practice from PYQs"
        subtitle="Browse the structured paper database, inspect questions, then start a generated practice paper."
      />

      {papers.length === 0 ? (
        <AnimatedCard style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No published papers yet</Text>
          <Text style={styles.emptyBody}>Once JEE PYQs are published in the backend, they will appear here automatically.</Text>
        </AnimatedCard>
      ) : null}

      <View style={styles.paperList}>
        {papers.map((paper) => (
          <PaperCard key={paper.id} paper={paper} active={paper.id === selectedPaper?.id} onPress={() => setSelectedPaperId(paper.id)} />
        ))}
      </View>

      {selectedPaper ? (
        <AnimatedCard style={styles.focusCard}>
          <Text style={styles.sectionKicker}>Selected paper</Text>
          <Text style={styles.focusTitle}>{selectedPaper.title}</Text>
          <Text style={styles.focusMeta}>{metaForPaper(selectedPaper)}</Text>
          <View style={styles.chipRow}>
            <SelectableChip label="All subjects" selected={!subject} onPress={() => setSubject(null)} />
            {selectedPaper.subjects.map((item) => (
              <SelectableChip key={item} label={item} selected={subject === item} onPress={() => setSubject(item)} />
            ))}
          </View>
          {chaptersQuery.isLoading ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator color={colors.paperStudio.jee} />
              <Text style={styles.inlineLoadingText}>Loading chapters</Text>
            </View>
          ) : null}
          {chapters.length ? (
            <View style={styles.chapterPicker}>
              <Text style={styles.chapterPickerTitle}>Chapter drill</Text>
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
            onPress={() => startMutation.mutate()}
          />
        </AnimatedCard>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Question preview</Text>
        <Text style={styles.sectionSubtitle}>{[subject || 'All subjects', selectedChapter?.chapter_title].filter(Boolean).join(' / ')} from selected paper.</Text>
      </View>

      {questionsQuery.isLoading ? <ActivityIndicator color={colors.paperStudio.jee} /> : null}

      {(questionsQuery.data ?? []).slice(0, 12).map((question) => (
        <QuestionCard key={question.id} question={question} />
      ))}
    </AppScreen>
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
  paperSubjects: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
  },
  paperSubjectsActive: {
    color: 'rgba(255,255,255,0.76)',
  },
  focusCard: {
    gap: spacing[3],
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
  chapterPicker: {
    gap: spacing[2],
  },
  chapterPickerTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
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
  answerText: {
    color: colors.success,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  solutionText: {
    ...typography.roles.body,
    color: colors.textMuted,
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
})
