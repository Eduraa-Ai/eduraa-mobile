import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  AnimatedButton,
  AnimatedCard,
  AppScreen,
  AuthenticatedImage,
  ErrorState,
  PremiumHeader,
  SelectableChip,
} from '../../components/ui'
import {
  previousPapersApi,
  type PreviousChapter,
  type PreviousPaper,
  type PreviousQuestion,
} from '../../api/previousPapers'
import { isPreviousPapersEligible } from '../../auth/landing'
import { useAuthStore } from '../../stores/authStore'
import { colors, layout, radius, shadows, spacing, typography } from '../../theme'
import PreviousPaperAssemblyState, { type AssemblyStage } from './PreviousPaperAssemblyState'
import {
  buildPreviousPaperStartRequest,
  filterPreviousPapers,
  filterPreviousQuestions,
  getApiErrorMessage,
  getPreviousPaperFilters,
  isPreviousPaperSelectionComplete,
  readablePreviousPaperText,
  type PreviousPaperSelectionMode,
} from './previousPapersModel'

const PAPER_BATCH_SIZE = 24

function metaForPaper(paper: PreviousPaper) {
  return [paper.exam, paper.year, paper.session_label, paper.shift_label, paper.paper_label]
    .filter(Boolean)
    .join(' / ')
}

function selectionModeLabel(mode: PreviousPaperSelectionMode) {
  if (mode === 'subject') return 'Subjects'
  if (mode === 'chapter') return 'Chapters'
  return 'Full paper'
}

function uniqueById<T extends { id: string }>(items: readonly T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()]
}

function uniqueChapters(items: readonly PreviousChapter[]) {
  return [...new Map(
    items
      .filter((item) => Boolean(item.chapter_id))
      .map((item) => [item.chapter_id!, item]),
  ).values()]
}

function compactSelectionLabel(items: readonly string[], emptyLabel: string) {
  if (!items.length) return emptyLabel
  if (items.length <= 2) return items.join(' + ')
  return `${items.slice(0, 2).join(' + ')} +${items.length - 2}`
}

function SearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
}: {
  value: string
  onChangeText: (value: string) => void
  placeholder: string
  accessibilityLabel: string
}) {
  return (
    <View style={styles.searchField}>
      <Ionicons name="search" size={18} color={colors.textSoft} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSoft}
        accessibilityLabel={accessibilityLabel}
        autoCorrect={false}
        returnKeyType="search"
        style={styles.searchInput}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Clear ${accessibilityLabel.toLowerCase()}`}
          hitSlop={8}
          onPress={() => onChangeText('')}
          style={({ pressed }) => [styles.searchClear, pressed && styles.pressed]}
        >
          <Ionicons name="close-circle" size={18} color={colors.textSoft} />
        </Pressable>
      ) : null}
    </View>
  )
}

function MultiSelectChip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.multiSelectChip,
        selected && styles.multiSelectChipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={16}
        color={selected ? colors.white : colors.textSoft}
      />
      <Text style={[styles.multiSelectChipText, selected && styles.multiSelectChipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  )
}

function PaperCard({ paper, onPress }: { paper: PreviousPaper; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${paper.title}, ${paper.question_count} questions`}
      style={({ pressed }) => [styles.paperCard, pressed && styles.paperCardPressed]}
    >
      <View style={styles.paperCardAccent} />
      <View style={styles.paperTop}>
        <View style={styles.paperCopy}>
          <Text style={styles.paperMeta}>{metaForPaper(paper)}</Text>
          <Text style={styles.paperTitle}>{paper.title}</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{paper.question_count}</Text>
        </View>
      </View>
      <View style={styles.paperFooter}>
        <Text style={styles.paperSubjects} numberOfLines={2}>
          {paper.subjects.join(', ')}
        </Text>
        <Ionicons name="chevron-forward" size={17} color={colors.paperStudio.jee} />
      </View>
    </Pressable>
  )
}

function ModeSelector({
  value,
  onChange,
}: {
  value: PreviousPaperSelectionMode
  onChange: (value: PreviousPaperSelectionMode) => void
}) {
  const options: Array<{ value: PreviousPaperSelectionMode; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
    { value: 'paper', label: 'Full paper', icon: 'documents-outline' },
    { value: 'subject', label: 'Subjects', icon: 'flask-outline' },
    { value: 'chapter', label: 'Chapters', icon: 'layers-outline' },
  ]

  return (
    <View accessibilityRole="radiogroup" style={styles.modeSelector}>
      {options.map((option) => {
        const selected = value === option.value
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.modeOption,
              selected && styles.modeOptionSelected,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={option.icon}
              size={17}
              color={selected ? colors.white : colors.textMuted}
            />
            <Text style={[styles.modeOptionText, selected && styles.modeOptionTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function FigureGallery({
  urls,
  title,
  questionNumber,
}: {
  urls: string[]
  title: string
  questionNumber: number
}) {
  if (!urls.length) return null

  return (
    <View style={styles.figureSection}>
      <Text style={styles.figureLabel}>{title}</Text>
      {urls.map((uri, index) => (
        <AuthenticatedImage
          key={`${uri}-${index}`}
          uri={uri}
          accessibilityLabel={`${title} ${index + 1} for question ${questionNumber}`}
          containerStyle={styles.figureFrame}
          imageStyle={styles.figureImage}
        />
      ))}
    </View>
  )
}

function QuestionCard({ question }: { question: PreviousQuestion }) {
  const [answerVisible, setAnswerVisible] = useState(false)
  const [solutionVisible, setSolutionVisible] = useState(false)
  const answerKey = readablePreviousPaperText(question.answer_key).trim().toLowerCase()
  const hasAnswer = Boolean(answerKey)
  const hasSolution = Boolean(question.solution_text?.trim() || question.solution_figure_urls.length)

  return (
    <AnimatedCard style={styles.questionCard}>
      <View style={styles.questionHeader}>
        <Text style={styles.questionMeta}>
          Q{question.question_number} · {[question.subject, question.chapter_title].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.questionTypePill}>
          <Text style={styles.questionType}>{question.question_type}</Text>
        </View>
      </View>

      <Text style={styles.questionText}>{readablePreviousPaperText(question.question_text)}</Text>

      <FigureGallery
        urls={question.question_figure_urls}
        title="Question figure"
        questionNumber={question.question_number}
      />

      {question.options?.length ? (
        <View style={styles.optionList}>
          {question.options.map((option, index) => {
            const label = option.label || option.id || String.fromCharCode(65 + index)
            const isAnswer = answerVisible && label.trim().toLowerCase() === answerKey
            return (
              <View key={`${question.id}-${label}-${index}`} style={[styles.optionRow, isAnswer && styles.optionRowAnswer]}>
                <View style={[styles.optionLabel, isAnswer && styles.optionLabelAnswer]}>
                  <Text style={[styles.optionLabelText, isAnswer && styles.optionLabelTextAnswer]}>{label}</Text>
                </View>
                <Text style={styles.optionText}>{readablePreviousPaperText(option.text || option.value)}</Text>
              </View>
            )
          })}
        </View>
      ) : (
        <View style={styles.numericPreview}>
          <Ionicons name="pencil-outline" size={15} color={colors.textSoft} />
          <Text style={styles.numericPreviewText}>Numeric response</Text>
        </View>
      )}

      <View style={styles.revealActions}>
        {hasAnswer ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: answerVisible }}
            onPress={() => setAnswerVisible((visible) => !visible)}
            style={({ pressed }) => [styles.revealButton, answerVisible && styles.revealButtonActive, pressed && styles.pressed]}
          >
            <Ionicons name={answerVisible ? 'eye-off-outline' : 'eye-outline'} size={16} color={colors.paperStudio.jee} />
            <Text style={styles.revealButtonText}>{answerVisible ? 'Hide answer' : 'Reveal answer'}</Text>
          </Pressable>
        ) : null}
        {hasSolution ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: solutionVisible }}
            onPress={() => setSolutionVisible((visible) => !visible)}
            style={({ pressed }) => [styles.revealButton, solutionVisible && styles.revealButtonActive, pressed && styles.pressed]}
          >
            <Ionicons name={solutionVisible ? 'book' : 'book-outline'} size={16} color={colors.paperStudio.jee} />
            <Text style={styles.revealButtonText}>{solutionVisible ? 'Hide solution' : 'View solution'}</Text>
          </Pressable>
        ) : null}
      </View>

      {answerVisible && hasAnswer ? (
        <View accessibilityLiveRegion="polite" style={styles.answerBand}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={styles.answerText}>Answer: {readablePreviousPaperText(question.answer_key)}</Text>
        </View>
      ) : null}

      {solutionVisible && hasSolution ? (
        <View accessibilityLiveRegion="polite" style={styles.solutionPanel}>
          <Text style={styles.solutionLabel}>Worked solution</Text>
          {question.solution_text ? (
            <Text style={styles.solutionText}>{readablePreviousPaperText(question.solution_text)}</Text>
          ) : null}
          <FigureGallery
            urls={question.solution_figure_urls}
            title="Solution figure"
            questionNumber={question.question_number}
          />
        </View>
      ) : null}
    </AnimatedCard>
  )
}

export default function PreviousPapersScreen() {
  const navigation = useNavigation<any>()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const allowed = isPreviousPapersEligible(user)

  const [view, setView] = useState<'library' | 'builder' | 'preview'>('library')
  const [paperSearch, setPaperSearch] = useState('')
  const [questionSearch, setQuestionSearch] = useState('')
  const [examFilter, setExamFilter] = useState<string | null>(null)
  const [yearFilter, setYearFilter] = useState<string | null>(null)
  const [visiblePaperCount, setVisiblePaperCount] = useState(PAPER_BATCH_SIZE)
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState<PreviousPaperSelectionMode>('paper')
  const [subjects, setSubjects] = useState<string[]>([])
  const [chapterIds, setChapterIds] = useState<string[]>([])
  const [timerEnabled, setTimerEnabled] = useState(true)
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [assemblyStage, setAssemblyStage] = useState<AssemblyStage | null>(null)
  const [assemblyError, setAssemblyError] = useState<string | null>(null)
  const [assemblyAction, setAssemblyAction] = useState<'auto' | 'new'>('auto')
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pendingResume, setPendingResume] = useState<{ paperId: string; title: string } | null>(null)

  const papersQuery = useQuery({
    queryKey: ['previous-papers'],
    queryFn: previousPapersApi.getPublished,
    enabled: allowed,
  })

  const papers = papersQuery.data ?? []
  const filterOptions = useMemo(() => getPreviousPaperFilters(papers), [papers])
  const filteredPapers = useMemo(
    () => filterPreviousPapers(papers, examFilter, yearFilter, paperSearch),
    [examFilter, paperSearch, papers, yearFilter],
  )
  const visiblePapers = filteredPapers.slice(0, visiblePaperCount)
  const selectedPaper = papers.find((paper) => paper.id === selectedPaperId) ?? null
  const selectionComplete = isPreviousPaperSelectionComplete(selectionMode, subjects, chapterIds)
  const sortedSubjects = useMemo(() => [...subjects].sort(), [subjects])
  const sortedChapterIds = useMemo(() => [...chapterIds].sort(), [chapterIds])

  useEffect(() => {
    setVisiblePaperCount(PAPER_BATCH_SIZE)
  }, [examFilter, paperSearch, yearFilter])

  useEffect(() => () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current)
  }, [])

  const chaptersQuery = useQuery({
    queryKey: ['previous-paper-chapters', selectedPaperId, sortedSubjects],
    queryFn: async ({ signal }) => {
      const groups = await Promise.all(
        sortedSubjects.map((selectedSubject) =>
          previousPapersApi.getChapters(
            { paper_id: selectedPaperId!, subject: selectedSubject },
            signal,
          ),
        ),
      )
      return uniqueChapters(groups.flat())
    },
    enabled: Boolean(allowed && selectedPaperId && sortedSubjects.length && selectionMode === 'chapter'),
  })

  const chapters = chaptersQuery.data ?? []
  const selectedChapters = chapters.filter((chapter) => chapterIds.includes(chapter.chapter_id!))

  const questionsQuery = useQuery({
    queryKey: ['previous-paper-questions', selectedPaperId, selectionMode, sortedSubjects, sortedChapterIds],
    queryFn: async ({ signal }) => {
      if (selectionMode === 'paper') {
        return previousPapersApi.getQuestions({ paper_id: selectedPaperId! }, signal)
      }

      if (selectionMode === 'subject') {
        const groups = await Promise.all(
          sortedSubjects.map((selectedSubject) =>
            previousPapersApi.getQuestions(
              { paper_id: selectedPaperId!, subject: selectedSubject },
              signal,
            ),
          ),
        )
        return uniqueById(groups.flat())
      }

      const groups = await Promise.all(
        sortedChapterIds.map((selectedChapterId) =>
          previousPapersApi.getQuestions(
            { paper_id: selectedPaperId!, chapter_id: selectedChapterId },
            signal,
          ),
        ),
      )
      return uniqueById(groups.flat())
    },
    enabled: Boolean(allowed && selectedPaperId && selectionComplete && view !== 'library'),
  })

  const questions = questionsQuery.data ?? []
  const availableQuestionCount =
    selectionComplete && !questionsQuery.isLoading && !questionsQuery.isError
      ? questions.length
      : null
  const filteredQuestions = useMemo(
    () => filterPreviousQuestions(questions, questionSearch),
    [questionSearch, questions],
  )
  const canStart = selectionComplete && !questionsQuery.isLoading && !questionsQuery.isError && questions.length > 0
  const timerLabel = timerEnabled ? `${durationMinutes} min timer` : 'Untimed'
  const subjectLabel = compactSelectionLabel(subjects, 'Choose subjects')
  const chapterLabel = compactSelectionLabel(
    selectedChapters.map((chapter) => chapter.chapter_title),
    chapterIds.length ? `${chapterIds.length} selected` : 'Choose chapters',
  )
  const selectionLabel =
    selectionMode === 'paper'
      ? `Full paper · ${timerLabel}${availableQuestionCount === null ? '' : ` · ${availableQuestionCount} available`}`
      : selectionMode === 'subject'
        ? `${subjectLabel} · ${timerLabel}${availableQuestionCount === null ? '' : ` · ${availableQuestionCount} available`}`
        : `${chapterLabel} · ${timerLabel}${availableQuestionCount === null ? '' : ` · ${availableQuestionCount} available`}`
  const previewSelectionLabel =
    selectionMode === 'paper'
      ? `Full paper · ${timerLabel}`
      : selectionMode === 'subject'
        ? `${subjects.length} ${subjects.length === 1 ? 'subject' : 'subjects'} · ${timerLabel}`
        : `${chapterIds.length} ${chapterIds.length === 1 ? 'chapter' : 'chapters'} · ${timerLabel}`

  const handleRootBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack()
      return
    }
    navigation.navigate('Home')
  }, [navigation])

  const handleBack = useCallback(() => {
    if (view === 'preview') {
      setQuestionSearch('')
      setView('builder')
      return
    }
    if (view === 'builder') {
      setView('library')
      return
    }
    handleRootBack()
  }, [handleRootBack, view])

  const selectPaper = (paper: PreviousPaper) => {
    setSelectedPaperId(paper.id)
    setSelectionMode('paper')
    setSubjects([])
    setChapterIds([])
    setTimerEnabled(true)
    setDurationMinutes(60)
    setQuestionSearch('')
    setView('builder')
  }

  const changeSelectionMode = (nextMode: PreviousPaperSelectionMode) => {
    setSelectionMode(nextMode)
    if (nextMode === 'paper') {
      setSubjects([])
      setChapterIds([])
    } else if (nextMode === 'subject') {
      setChapterIds([])
    }
  }

  const toggleSubject = (selectedSubject: string) => {
    const isSelected = subjects.includes(selectedSubject)
    setSubjects((current) =>
      isSelected
        ? current.filter((item) => item !== selectedSubject)
        : [...current, selectedSubject],
    )
    if (isSelected) {
      const removedChapterIds = new Set(
        chapters
          .filter((chapter) => chapter.subject === selectedSubject)
          .map((chapter) => chapter.chapter_id)
          .filter((id): id is string => Boolean(id)),
      )
      setChapterIds((current) => current.filter((id) => !removedChapterIds.has(id)))
    }
  }

  const toggleChapter = (selectedChapterId: string) => {
    setChapterIds((current) =>
      current.includes(selectedChapterId)
        ? current.filter((id) => id !== selectedChapterId)
        : [...current, selectedChapterId],
    )
  }

  const startMutation = useMutation({
    mutationFn: async (attemptAction: 'auto' | 'new') => {
      if (!selectedPaper) throw new Error('Choose a previous paper first.')
      return previousPapersApi.startExam(
        selectedPaper.id,
        buildPreviousPaperStartRequest(
          selectionMode,
          subjects,
          chapterIds,
          timerEnabled,
          durationMinutes,
          attemptAction,
        ),
      )
    },
    onSuccess: (result, attemptAction) => {
      if (attemptAction === 'auto' && result.reused_existing) {
        setAssemblyStage(null)
        setPendingResume({ paperId: result.paper_id, title: result.title })
        return
      }

      setPendingResume(null)
      setAssemblyStage('opening')
      queryClient.setQueriesData<{ duration_minutes?: number | null }>(
        { queryKey: ['paper', result.paper_id] },
        (current) => current
          ? { ...current, duration_minutes: timerEnabled ? durationMinutes : null }
          : current,
      )
      void queryClient.invalidateQueries({ queryKey: ['paper', result.paper_id] })
      void queryClient.invalidateQueries({ queryKey: ['paper-attempt', result.paper_id] })
      transitionTimer.current = setTimeout(() => {
        setAssemblyStage(null)
        navigation.navigate('Papers', {
          screen: 'AttemptPaper',
          params: {
            paperId: result.paper_id,
            launchKey: `pyq-${Date.now()}`,
            returnTo: 'PreviousPapers',
          },
        })
      }, 220)
    },
    onError: (error) => {
      setAssemblyError(
        getApiErrorMessage(
          error,
          'The paper could not be assembled. Check your connection and try again.',
        ),
      )
      setAssemblyStage('error')
    },
  })

  const beginStart = (attemptAction: 'auto' | 'new') => {
    if (!canStart || startMutation.isPending || assemblyStage === 'preparing' || assemblyStage === 'requesting' || assemblyStage === 'opening') {
      return
    }
    if (transitionTimer.current) clearTimeout(transitionTimer.current)
    setAssemblyAction(attemptAction)
    setAssemblyError(null)
    setPendingResume(null)
    setAssemblyStage('preparing')
    transitionTimer.current = setTimeout(() => {
      setAssemblyStage('requesting')
      startMutation.mutate(attemptAction)
    }, 220)
  }

  const openRecoveredPaper = (paperId: string) => {
    setPendingResume(null)
    setAssemblyStage('opening')
    queryClient.setQueriesData<{ duration_minutes?: number | null }>(
      { queryKey: ['paper', paperId] },
      (current) => current
        ? { ...current, duration_minutes: timerEnabled ? durationMinutes : null }
        : current,
    )
    void queryClient.invalidateQueries({ queryKey: ['paper', paperId] })
    void queryClient.invalidateQueries({ queryKey: ['paper-attempt', paperId] })
    transitionTimer.current = setTimeout(() => {
      setAssemblyStage(null)
      navigation.navigate('Papers', {
        screen: 'AttemptPaper',
        params: {
          paperId,
          launchKey: `pyq-${Date.now()}`,
          returnTo: 'PreviousPapers',
        },
      })
    }, 220)
  }

  if (!allowed) {
    return (
      <AppScreen scroll={false} protectedChrome contentStyle={styles.center}>
        <View style={styles.lockMark}>
          <Ionicons name="lock-closed-outline" size={25} color={colors.paperStudio.jee} />
        </View>
        <Text style={styles.emptyTitle}>Previous papers are for JEE learners</Text>
        <Text style={styles.emptyBody}>
          Choose a JEE competitive-exam track in your individual learner profile to unlock this library.
        </Text>
        <AnimatedButton label="Go to Home" onPress={() => navigation.navigate('Home')} />
      </AppScreen>
    )
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
      <AppScreen scroll={false} protectedChrome contentStyle={styles.center}>
        <View style={styles.loadingMark}>
          <Ionicons name="documents-outline" size={24} color={colors.paperStudio.jee} />
          <ActivityIndicator size="small" color={colors.accent} style={styles.loadingSpinner} />
        </View>
        <Text style={styles.loadingTitle}>Opening the JEE archive</Text>
        <Text style={styles.loadingBody}>Finding published papers and their structured question sets.</Text>
      </AppScreen>
    )
  }

  if (papersQuery.isError) {
    return (
      <AppScreen scroll={false} protectedChrome contentStyle={styles.center}>
        <ErrorState
          title="The paper archive paused"
          message={getApiErrorMessage(papersQuery.error, 'Unable to load previous-year papers right now.')}
          actionLabel="Try again"
          onAction={() => void papersQuery.refetch()}
        />
        <AnimatedButton label="Back" variant="ghost" onPress={handleRootBack} />
      </AppScreen>
    )
  }

  if (pendingResume) {
    return (
      <AppScreen scroll={false} protectedChrome contentStyle={styles.resumeStateScreen}>
        <PremiumHeader
          eyebrow="UNFINISHED SET FOUND"
          title="Keep your place or begin fresh."
          subtitle="This choice applies only to the same unfinished practice selection."
          onBack={() => setPendingResume(null)}
        />
        <View style={styles.resumeStateBody}>
          <View style={styles.resumeIcon}>
            <Ionicons name="time-outline" size={28} color={colors.paperStudio.jee} />
          </View>
          <Text style={styles.resumeBody}>
            Resume at the question where you stopped, or begin a fresh practice set with the same selection.
          </Text>
          <View style={styles.resumePaper}>
            <Text style={styles.resumePaperLabel}>Unfinished practice</Text>
            <Text style={styles.resumePaperTitle} numberOfLines={2}>{pendingResume.title}</Text>
          </View>
          <View style={styles.resumeActions}>
            <AnimatedButton
              label="Resume paper"
              onPress={() => openRecoveredPaper(pendingResume.paperId)}
              disabled={startMutation.isPending}
            />
            <AnimatedButton
              label="Start a fresh attempt"
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
      </AppScreen>
    )
  }

  if (view === 'preview' && selectedPaper) {
    const previewHeader = (
      <View style={styles.previewHeader}>
        <PremiumHeader
          eyebrow="QUESTION PREVIEW"
          title="What you will get"
          subtitle={previewSelectionLabel}
          onBack={handleBack}
          right={<View style={styles.headerCount}><Text style={styles.headerCountText}>{questions.length} Q</Text></View>}
        />
        <View style={styles.previewPromise}>
          <View style={styles.previewPromiseIcon}>
            <Ionicons name="eye-outline" size={19} color={colors.paperStudio.jee} />
          </View>
          <View style={styles.previewPromiseCopy}>
            <Text style={styles.previewPromiseTitle}>Inspect before you commit</Text>
            <Text style={styles.previewPromiseBody}>
              Answers and worked solutions reveal only when you ask for them.
            </Text>
          </View>
        </View>
        <SearchField
          value={questionSearch}
          onChangeText={setQuestionSearch}
          placeholder="Search this question set"
          accessibilityLabel="Search previous paper questions"
        />
        {!questionsQuery.isLoading && !questionsQuery.isError ? (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Questions</Text>
            <Text style={styles.sectionMeta}>{filteredQuestions.length} shown</Text>
          </View>
        ) : null}
      </View>
    )

    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[
          styles.previewRoot,
          { marginBottom: layout.bottomTabHeight + insets.bottom },
        ]}
      >
        <FlatList
          data={filteredQuestions}
          keyExtractor={(question) => question.id}
          renderItem={({ item }) => <QuestionCard question={item} />}
          ListHeaderComponent={previewHeader}
          ListEmptyComponent={
            questionsQuery.isLoading ? (
              <View style={styles.inlineState}>
                <ActivityIndicator color={colors.paperStudio.jee} />
                <Text style={styles.inlineStateTitle}>Preparing the preview</Text>
                <Text style={styles.inlineStateBody}>Your exact paper selection is being loaded.</Text>
              </View>
            ) : questionsQuery.isError ? (
              <ErrorState
                title="Could not load this preview"
                message={getApiErrorMessage(questionsQuery.error, 'The question preview could not load. Your selection is unchanged.')}
                onAction={() => void questionsQuery.refetch()}
              />
            ) : (
              <View style={styles.inlineState}>
                <Ionicons name="search-outline" size={26} color={colors.paperStudio.jee} />
                <Text style={styles.inlineStateTitle}>
                  {questionSearch ? 'No questions match that search' : 'No questions are available'}
                </Text>
                <Text style={styles.inlineStateBody}>
                  {questionSearch ? 'Try a subject, chapter, or phrase from the question.' : 'Return to the builder and choose another scope.'}
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            <View style={styles.previewFooter}>
              <AnimatedButton label="Start this practice set" onPress={() => beginStart('auto')} disabled={!canStart} />
              <AnimatedButton label="Adjust selection" variant="ghost" onPress={() => setView('builder')} />
            </View>
          }
          contentContainerStyle={[
            styles.previewContent,
            {
              paddingTop: insets.top + spacing[4],
              paddingBottom: insets.bottom + spacing[8],
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      </KeyboardAvoidingView>
    )
  }

  if (view === 'builder' && selectedPaper) {
    const readinessTitle = !selectionComplete
      ? selectionMode === 'subject'
        ? 'Choose at least one subject'
        : 'Choose subjects and chapters'
      : questionsQuery.isLoading
        ? 'Checking this practice set'
        : questionsQuery.isError
          ? 'Question count unavailable'
          : questions.length
            ? 'Practice set ready'
            : 'No questions in this scope'

    const readinessBody = !selectionComplete
      ? 'The preview and start actions will unlock when this selection is complete.'
      : questionsQuery.isLoading
        ? 'Eduraa is confirming the available structured questions.'
        : questionsQuery.isError
          ? 'Retry without losing the subjects, chapters, or timer you selected.'
          : questions.length
            ? `${questions.length} previous-year ${questions.length === 1 ? 'question' : 'questions'} will become a fresh ${timerEnabled ? `${durationMinutes}-minute` : 'untimed'} attempt.`
            : 'Try the full paper, other subjects, or different chapters.'
    const builderCountLabel =
      selectionMode === 'chapter' && chaptersQuery.isError
        ? 'Chapters paused'
        : questionsQuery.isError
          ? 'Count paused'
          : availableQuestionCount === null
            ? `${selectedPaper.question_count} Q`
            : `${availableQuestionCount} ready`

    return (
      <AppScreen protectedChrome contentStyle={styles.screen} keyboardShouldPersistTaps="handled">
          <PremiumHeader
            eyebrow="BUILD PRACTICE"
            title="Shape your set"
            subtitle="Choose a practice scope."
            onBack={handleBack}
            right={
              <View style={styles.headerCount}>
                <Text style={styles.headerCountText}>
                  {builderCountLabel}
                </Text>
              </View>
            }
          />

          <View style={styles.selectedPaperCard}>
            <View style={styles.selectedPaperMark}>
              <Ionicons name="documents-outline" size={22} color={colors.white} />
            </View>
            <View style={styles.selectedPaperCopy}>
              <Text style={styles.selectedPaperLabel}>Selected paper</Text>
              <Text style={styles.selectedPaperTitle}>{selectedPaper.title}</Text>
              <Text style={styles.selectedPaperMeta}>{metaForPaper(selectedPaper)}</Text>
            </View>
          </View>

          <View style={styles.builderSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Practice scope</Text>
              <Text style={styles.sectionMeta}>Choose one</Text>
            </View>
            <ModeSelector value={selectionMode} onChange={changeSelectionMode} />
          </View>

          {selectionMode !== 'paper' ? (
            <View style={styles.builderSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Subjects</Text>
                <Text style={styles.sectionMeta}>Select one or more</Text>
              </View>
              <View style={styles.chipRow}>
                {selectedPaper.subjects.map((item) => (
                  <MultiSelectChip
                    key={item}
                    label={item}
                    selected={subjects.includes(item)}
                    onPress={() => toggleSubject(item)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {selectionMode === 'chapter' && subjects.length ? (
            <View style={styles.builderSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Chapters</Text>
                <Text style={styles.sectionMeta}>Select one or more</Text>
              </View>
              {chaptersQuery.isLoading ? (
                <View style={styles.inlineLoading}>
                  <ActivityIndicator color={colors.paperStudio.jee} />
                  <Text style={styles.inlineLoadingText}>
                    Loading chapters for {subjects.length === 1 ? subjects[0] : `${subjects.length} subjects`}
                  </Text>
                </View>
              ) : null}
              {chaptersQuery.isError ? (
                <ErrorState
                  title="Could not load chapters"
                  message={getApiErrorMessage(chaptersQuery.error, 'Retry to keep building this chapter set.')}
                  onAction={() => void chaptersQuery.refetch()}
                />
              ) : null}
              {!chaptersQuery.isLoading && !chaptersQuery.isError && chapters.length === 0 ? (
                <View style={styles.chapterEmpty}>
                  <Ionicons name="layers-outline" size={20} color={colors.textSoft} />
                  <Text style={styles.chapterEmptyText}>No structured chapters are available for the selected subjects in this paper.</Text>
                </View>
              ) : null}
              {chapters.length ? (
                <View style={styles.chapterGrid}>
                  {chapters.map((chapter) => (
                    <MultiSelectChip
                      key={`${chapter.chapter_id}-${chapter.chapter_title}`}
                      label={`${chapter.subject ? `${chapter.subject} · ` : ''}${chapter.chapter_title} (${chapter.question_count})`}
                      selected={chapterIds.includes(chapter.chapter_id!)}
                      onPress={() => toggleChapter(chapter.chapter_id!)}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.builderSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Practice timer</Text>
              <Text style={styles.sectionMeta}>Optional</Text>
            </View>
            <View accessibilityRole="radiogroup" style={styles.timerChoiceRow}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: !timerEnabled }}
                onPress={() => setTimerEnabled(false)}
                style={({ pressed }) => [
                  styles.timerChoice,
                  !timerEnabled && styles.timerChoiceSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="infinite-outline" size={19} color={!timerEnabled ? colors.white : colors.textMuted} />
                <View style={styles.timerChoiceCopy}>
                  <Text style={[styles.timerChoiceTitle, !timerEnabled && styles.timerChoiceTitleSelected]}>No timer</Text>
                  <Text style={[styles.timerChoiceBody, !timerEnabled && styles.timerChoiceBodySelected]}>Practice at your pace</Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: timerEnabled }}
                onPress={() => setTimerEnabled(true)}
                style={({ pressed }) => [
                  styles.timerChoice,
                  timerEnabled && styles.timerChoiceSelected,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="timer-outline" size={19} color={timerEnabled ? colors.white : colors.textMuted} />
                <View style={styles.timerChoiceCopy}>
                  <Text style={[styles.timerChoiceTitle, timerEnabled && styles.timerChoiceTitleSelected]}>Use timer</Text>
                  <Text style={[styles.timerChoiceBody, timerEnabled && styles.timerChoiceBodySelected]}>Build exam rhythm</Text>
                </View>
              </Pressable>
            </View>
            {timerEnabled ? (
              <View style={styles.durationPanel}>
                <View style={styles.durationStepper}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Reduce timer by 5 minutes"
                    disabled={durationMinutes <= 5}
                    onPress={() => setDurationMinutes((minutes) => Math.max(5, minutes - 5))}
                    style={({ pressed }) => [styles.durationStepButton, durationMinutes <= 5 && styles.durationStepButtonDisabled, pressed && styles.pressed]}
                  >
                    <Ionicons name="remove" size={19} color={colors.paperStudio.jee} />
                  </Pressable>
                  <View style={styles.durationValue}>
                    <Text accessibilityLiveRegion="polite" style={styles.durationNumber}>{durationMinutes}</Text>
                    <Text style={styles.durationUnit}>minutes</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Increase timer by 5 minutes"
                    disabled={durationMinutes >= 300}
                    onPress={() => setDurationMinutes((minutes) => Math.min(300, minutes + 5))}
                    style={({ pressed }) => [styles.durationStepButton, durationMinutes >= 300 && styles.durationStepButtonDisabled, pressed && styles.pressed]}
                  >
                    <Ionicons name="add" size={19} color={colors.paperStudio.jee} />
                  </Pressable>
                </View>
                <View style={styles.durationPresetRow}>
                  {[30, 60, 90, 180].map((minutes) => (
                    <Pressable
                      key={minutes}
                      accessibilityRole="button"
                      accessibilityState={{ selected: durationMinutes === minutes }}
                      onPress={() => setDurationMinutes(minutes)}
                      style={({ pressed }) => [
                        styles.durationPreset,
                        durationMinutes === minutes && styles.durationPresetSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.durationPresetText, durationMinutes === minutes && styles.durationPresetTextSelected]}>
                        {minutes}m
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          <View style={[styles.readinessBand, canStart && styles.readinessBandReady]}>
            <View style={[styles.readinessIcon, canStart && styles.readinessIconReady]}>
              {questionsQuery.isLoading && selectionComplete ? (
                <ActivityIndicator size="small" color={colors.paperStudio.jee} />
              ) : (
                <Ionicons
                  name={canStart ? 'checkmark' : questionsQuery.isError ? 'refresh' : 'options-outline'}
                  size={18}
                  color={canStart ? colors.white : colors.paperStudio.jee}
                />
              )}
            </View>
            <View style={styles.readinessCopy}>
              <Text style={[styles.readinessTitle, canStart && styles.readinessTitleReady]}>{readinessTitle}</Text>
              <Text style={styles.readinessBody}>{readinessBody}</Text>
              {questionsQuery.isError ? (
                <Pressable accessibilityRole="button" onPress={() => void questionsQuery.refetch()} style={styles.inlineRetry}>
                  <Text style={styles.inlineRetryText}>Retry question count</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.builderActions}>
            <AnimatedButton
              label="Preview questions"
              variant="secondary"
              onPress={() => {
                setQuestionSearch('')
                setView('preview')
              }}
              disabled={!canStart}
            />
            <AnimatedButton
              label={`Start ${selectionModeLabel(selectionMode).toLowerCase()}`}
              onPress={() => beginStart('auto')}
              disabled={!canStart}
            />
          </View>

          <View style={styles.selectionPromise}>
            <Ionicons name="shield-checkmark-outline" size={17} color={colors.success} />
            <Text style={styles.selectionPromiseText}>
              Your paper, selections, and timer stay selected if loading pauses.
            </Text>
          </View>
      </AppScreen>
    )
  }

  return (
    <AppScreen protectedChrome contentStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <PremiumHeader
          eyebrow="JEE PREVIOUS PAPERS"
          title="Practice from PYQs"
          subtitle="Browse, inspect, and shape a fresh practice set."
          onBack={handleBack}
          right={<View style={styles.headerCount}><Text style={styles.headerCountText}>{papers.length}</Text></View>}
        />

        {papers.length === 0 ? (
          <View style={styles.archiveEmpty}>
            <View style={styles.archiveEmptyArtwork}>
              <Ionicons name="documents-outline" size={38} color={colors.white} />
              <View style={styles.archiveEmptyClock}>
                <Ionicons name="time" size={15} color={colors.white} />
              </View>
            </View>
            <Text style={styles.archiveEmptyEyebrow}>YOUR JEE ARCHIVE</Text>
            <Text style={styles.emptyTitle}>No published papers yet</Text>
            <Text style={styles.emptyBody}>
              New JEE Main and JEE Advanced papers will appear here as soon as they are ready.
            </Text>
            <AnimatedButton label="Check again" variant="secondary" onPress={() => void papersQuery.refetch()} />
          </View>
        ) : (
          <>
          <View style={styles.libraryHero}>
          <View style={styles.heroOrbit}>
            <Ionicons name="documents-outline" size={30} color={colors.white} />
            <View style={styles.heroClock}>
              <Ionicons name="time" size={12} color={colors.white} />
            </View>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroKicker}>YOUR JEE QUESTION ARCHIVE</Text>
            <Text style={styles.heroTitle}>The past becomes your next advantage.</Text>
            <Text style={styles.heroBody}>
              Every paper is structured by subject and chapter, with answers and solutions ready to inspect.
            </Text>
          </View>
        </View>

        <SearchField
          value={paperSearch}
          onChangeText={setPaperSearch}
          placeholder="Search paper, session, or shift"
          accessibilityLabel="Search previous papers"
        />

          <View style={styles.filterSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Narrow the archive</Text>
              {examFilter || yearFilter || paperSearch ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setExamFilter(null)
                    setYearFilter(null)
                    setPaperSearch('')
                  }}
                >
                  <Text style={styles.clearText}>Clear all</Text>
                </Pressable>
              ) : (
                <Text style={styles.sectionMeta}>Exam · year</Text>
              )}
            </View>
            <Text style={styles.filterLabel}>Exam</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRail}>
              <SelectableChip label="All exams" selected={!examFilter} onPress={() => setExamFilter(null)} />
              {filterOptions.exams.map((exam) => (
                <SelectableChip key={exam} label={exam} selected={examFilter === exam} onPress={() => setExamFilter(exam)} />
              ))}
            </ScrollView>
            <Text style={styles.filterLabel}>Year</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRail}>
              <SelectableChip label="All years" selected={!yearFilter} onPress={() => setYearFilter(null)} />
              {filterOptions.years.map((year) => (
                <SelectableChip key={year} label={year} selected={yearFilter === year} onPress={() => setYearFilter(year)} />
              ))}
            </ScrollView>
          </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Published papers</Text>
          <Text style={styles.sectionMeta}>{filteredPapers.length} available</Text>
        </View>

        {filteredPapers.length === 0 ? (
          <View style={styles.libraryEmpty}>
            <View style={styles.libraryEmptyIcon}><Ionicons name="search-outline" size={26} color={colors.paperStudio.jee} /></View>
            <Text style={styles.emptyTitle}>No papers match those filters</Text>
            <Text style={styles.emptyBody}>Clear a filter or search for a broader session, shift, or year.</Text>
            <AnimatedButton
              label="Show every paper"
              variant="secondary"
              onPress={() => {
                setExamFilter(null)
                setYearFilter(null)
                setPaperSearch('')
              }}
            />
          </View>
        ) : (
          <View style={styles.paperList}>
            {visiblePapers.map((paper) => <PaperCard key={paper.id} paper={paper} onPress={() => selectPaper(paper)} />)}
            {visiblePaperCount < filteredPapers.length ? (
              <AnimatedButton
                label={`Show ${Math.min(PAPER_BATCH_SIZE, filteredPapers.length - visiblePaperCount)} more`}
                variant="ghost"
                onPress={() => setVisiblePaperCount((count) => count + PAPER_BATCH_SIZE)}
              />
            ) : null}
          </View>
        )}
          </>
        )}
    </AppScreen>
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
    paddingHorizontal: spacing[6],
  },
  pressed: {
    opacity: 0.78,
  },
  headerCount: {
    minWidth: 42,
    height: 34,
    paddingHorizontal: spacing[3],
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  headerCountText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  searchField: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    ...shadows.xs,
  },
  searchInput: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 0,
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
  },
  searchClear: {
    width: 44,
    height: 44,
    marginRight: -spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  libraryHero: {
    minHeight: 192,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    padding: spacing[5],
    borderRadius: 28,
    backgroundColor: colors.nav,
    ...shadows.md,
  },
  heroOrbit: {
    width: 72,
    height: 88,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroClock: {
    position: 'absolute',
    right: 8,
    bottom: 16,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.nav,
  },
  heroCopy: {
    flex: 1,
  },
  heroKicker: {
    color: '#fdba74',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  heroTitle: {
    marginTop: spacing[2],
    color: colors.white,
    fontFamily: typography.fonts.heading,
    fontSize: 22,
    lineHeight: 27,
  },
  heroBody: {
    marginTop: spacing[2],
    color: 'rgba(255,255,255,0.68)',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 17,
  },
  filterSection: {
    gap: spacing[2],
    paddingVertical: spacing[1],
  },
  filterLabel: {
    marginTop: spacing[1],
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  filterRail: {
    gap: spacing[2],
    paddingRight: spacing[5],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
  },
  sectionMeta: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
  },
  clearText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  paperList: {
    gap: spacing[3],
  },
  paperCard: {
    minHeight: 116,
    overflow: 'hidden',
    padding: spacing[4],
    paddingLeft: spacing[5],
    gap: spacing[3],
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    ...shadows.xs,
  },
  paperCardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  paperCardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.paperStudio.jee,
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
    fontSize: 9,
    lineHeight: 13,
    textTransform: 'uppercase',
  },
  paperTitle: {
    marginTop: spacing[1],
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
    lineHeight: 22,
  },
  countPill: {
    minWidth: 38,
    height: 30,
    paddingHorizontal: spacing[2],
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  countText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  paperFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  paperSubjects: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
  },
  libraryEmpty: {
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[8],
    paddingHorizontal: spacing[5],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  archiveEmpty: {
    flex: 1,
    minHeight: 480,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[8],
  },
  archiveEmptyArtwork: {
    width: 92,
    height: 92,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.nav,
    ...shadows.sm,
  },
  archiveEmptyClock: {
    position: 'absolute',
    right: 7,
    bottom: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.background,
    backgroundColor: colors.accent,
  },
  archiveEmptyEyebrow: {
    marginTop: spacing[2],
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  libraryEmptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef3ff',
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 19,
    lineHeight: 24,
    textAlign: 'center',
  },
  emptyBody: {
    maxWidth: 320,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  lockMark: {
    width: 62,
    height: 62,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef3ff',
  },
  loadingMark: {
    width: 76,
    height: 76,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef3ff',
  },
  loadingSpinner: {
    position: 'absolute',
    right: 5,
    bottom: 5,
  },
  loadingTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 19,
  },
  loadingBody: {
    maxWidth: 290,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  selectedPaperCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: 22,
    backgroundColor: colors.nav,
    ...shadows.sm,
  },
  selectedPaperMark: {
    width: 48,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  selectedPaperCopy: {
    flex: 1,
  },
  selectedPaperLabel: {
    color: '#fdba74',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  selectedPaperTitle: {
    marginTop: spacing[1],
    color: colors.white,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
    lineHeight: 20,
  },
  selectedPaperMeta: {
    marginTop: spacing[1],
    color: 'rgba(255,255,255,0.62)',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 14,
  },
  builderSection: {
    gap: spacing[3],
  },
  modeSelector: {
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[1],
    borderRadius: 18,
    backgroundColor: colors.backgroundMuted,
  },
  modeOption: {
    minHeight: 62,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[1],
    borderRadius: 15,
  },
  modeOptionSelected: {
    backgroundColor: colors.paperStudio.jee,
    ...shadows.xs,
  },
  modeOptionText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    textAlign: 'center',
  },
  modeOptionTextSelected: {
    color: colors.white,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  multiSelectChip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  multiSelectChipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
    ...shadows.xs,
  },
  multiSelectChipText: {
    ...typography.roles.label,
    color: colors.textSecondary,
  },
  multiSelectChipTextSelected: {
    color: colors.white,
  },
  chapterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  timerChoiceRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  timerChoice: {
    minHeight: 68,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  timerChoiceSelected: {
    borderColor: colors.paperStudio.jee,
    backgroundColor: colors.paperStudio.jee,
    ...shadows.xs,
  },
  timerChoiceCopy: {
    flex: 1,
  },
  timerChoiceTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  timerChoiceTitleSelected: {
    color: colors.white,
  },
  timerChoiceBody: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 9,
    lineHeight: 12,
  },
  timerChoiceBodySelected: {
    color: 'rgba(255,255,255,0.72)',
  },
  durationPanel: {
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dbe5f4',
    backgroundColor: '#f5f8fd',
  },
  durationStepper: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  durationStepButton: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd8ec',
    backgroundColor: colors.white,
  },
  durationStepButtonDisabled: {
    opacity: 0.38,
  },
  durationValue: {
    alignItems: 'center',
  },
  durationNumber: {
    color: colors.paperStudio.jee,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 25,
    lineHeight: 28,
  },
  durationUnit: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  durationPresetRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  durationPreset: {
    minHeight: 40,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  durationPresetSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
  },
  durationPresetText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  durationPresetTextSelected: {
    color: colors.accentStrong,
  },
  inlineLoading: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  inlineLoadingText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  chapterEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[4],
    borderRadius: 16,
    backgroundColor: colors.backgroundMuted,
  },
  chapterEmptyText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
  },
  readinessBand: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dbe5f4',
    backgroundColor: '#f1f5fb',
  },
  readinessBandReady: {
    borderColor: '#c9e8d5',
    backgroundColor: '#eef9f2',
  },
  readinessIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#dfe8f7',
  },
  readinessIconReady: {
    backgroundColor: colors.success,
  },
  readinessCopy: {
    flex: 1,
  },
  readinessTitle: {
    color: colors.paperStudio.jee,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  readinessTitleReady: {
    color: '#17623c',
  },
  readinessBody: {
    marginTop: 3,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
  },
  inlineRetry: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  inlineRetryText: {
    color: colors.paperStudio.jee,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  builderActions: {
    gap: spacing[2],
  },
  selectionPromise: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
  },
  selectionPromiseText: {
    flexShrink: 1,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 14,
  },
  previewRoot: {
    flex: 1,
    backgroundColor: colors.background,
  },
  previewContent: {
    flexGrow: 1,
    gap: spacing[3],
    paddingHorizontal: spacing[5],
    backgroundColor: colors.background,
  },
  previewHeader: {
    gap: spacing[4],
    marginBottom: spacing[1],
  },
  previewPromise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: 20,
    backgroundColor: colors.nav,
  },
  previewPromiseIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  previewPromiseCopy: {
    flex: 1,
  },
  previewPromiseTitle: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  previewPromiseBody: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.66)',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 14,
  },
  questionCard: {
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  questionMeta: {
    flex: 1,
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    lineHeight: 13,
    textTransform: 'uppercase',
  },
  questionTypePill: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: radius.full,
    backgroundColor: colors.accentSurface,
  },
  questionType: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  questionText: {
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 21,
  },
  optionList: {
    gap: spacing[2],
  },
  optionRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 14,
    backgroundColor: colors.backgroundMuted,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optionRowAnswer: {
    borderColor: '#b7ddc5',
    backgroundColor: '#eaf7ef',
  },
  optionLabel: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionLabelAnswer: {
    borderColor: colors.success,
    backgroundColor: colors.success,
  },
  optionLabelText: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  optionLabelTextAnswer: {
    color: colors.white,
  },
  optionText: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  numericPreview: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: 14,
    backgroundColor: colors.backgroundMuted,
  },
  numericPreviewText: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  revealActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  revealButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  revealButtonActive: {
    borderColor: '#c7d8f3',
    backgroundColor: '#eef3ff',
  },
  revealButtonText: {
    color: colors.paperStudio.jee,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
  },
  answerBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: 14,
    backgroundColor: '#eaf7ef',
  },
  answerText: {
    flex: 1,
    color: '#17623c',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  solutionPanel: {
    gap: spacing[2],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  solutionLabel: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  solutionText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 19,
  },
  figureSection: {
    gap: spacing[2],
  },
  figureLabel: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  figureFrame: {
    minHeight: 120,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  figureImage: {
    width: '100%',
    height: 220,
  },
  inlineState: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[5],
  },
  inlineStateTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
    textAlign: 'center',
  },
  inlineStateBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
  previewFooter: {
    gap: spacing[2],
    paddingTop: spacing[3],
  },
  resumeStateScreen: {
    gap: spacing[5],
    paddingHorizontal: spacing[5],
    paddingBottom: layout.bottomTabHeight + spacing[6],
  },
  resumeStateBody: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing[4],
  },
  resumeIcon: {
    width: 54,
    height: 54,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef3ff',
  },
  resumeBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  resumePaper: {
    gap: spacing[1],
    padding: spacing[3],
    borderRadius: 16,
    backgroundColor: colors.backgroundMuted,
  },
  resumePaperLabel: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  resumePaperTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
    lineHeight: 17,
  },
  resumeActions: {
    gap: spacing[2],
  },
})
