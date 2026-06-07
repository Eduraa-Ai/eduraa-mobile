import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { papersApi } from '../../api/papers'
import { PrimaryButton } from '../../components/ui/PrimaryButton'
import { Screen } from '../../components/ui/Screen'
import type { PapersStackParamList } from '../../navigation'
import { colors } from '../../theme/colors'
import { fonts } from '../../theme/fonts'
import { radius, shadows, spacing } from '../../theme/spacing'
import type { Chapter, Difficulty, PaperGenerateRequest } from '../../types'

type Nav = NativeStackNavigationProp<PapersStackParamList, 'GeneratePaper'>
const papersHeaderImage = require('../../../assets/papers-header-bg.png')
type ComposeMode = 'form' | 'ai'
type Stage = 0 | 1 | 2
type ChapterSource = 'books' | 'ai'
type QuestionKey = 'mcq' | 'short_answer' | 'long_answer' | 'fill_blank' | 'match_columns' | 'true_false'
type CountKey = 'mcq_count' | 'short_answer_count' | 'long_answer_count' | 'fill_blank_count' | 'match_columns_count' | 'true_false_count'
type MarkKey = 'marks_per_mcq' | 'marks_per_short' | 'marks_per_long' | 'marks_per_fill_blank' | 'marks_per_match_columns' | 'marks_per_true_false'

type ChapterWithSubtopics = Chapter & {
  subtopics?: Array<string | { title?: string | null }> | null
}

type CustomType = {
  id: string
  name: string
  count: number
  marks: number
}

type BlueprintSectionPayload = {
  id?: string
  title: string
  question_type: string
  custom_type_name?: string
  marks: number
  count: number
  order?: number
}

type QuestionRow = {
  key: QuestionKey
  label: string
  countKey: CountKey
  markKey: MarkKey
  max: number
}

type GenerateInput = {
  payload: PaperGenerateRequest
  ai?: {
    examType: string
    subject: string
    chapterKeys: string[]
    count: number
    marks: number
    subtopic?: string
    title: string
  }
}

const QUESTION_ROWS: QuestionRow[] = [
  { key: 'mcq', label: 'MCQ', countKey: 'mcq_count', markKey: 'marks_per_mcq', max: 50 },
  { key: 'short_answer', label: 'Short answer', countKey: 'short_answer_count', markKey: 'marks_per_short', max: 30 },
  { key: 'long_answer', label: 'Long answer', countKey: 'long_answer_count', markKey: 'marks_per_long', max: 20 },
  { key: 'fill_blank', label: 'Fill in blanks', countKey: 'fill_blank_count', markKey: 'marks_per_fill_blank', max: 50 },
  { key: 'match_columns', label: 'Match columns', countKey: 'match_columns_count', markKey: 'marks_per_match_columns', max: 30 },
  { key: 'true_false', label: 'True / False', countKey: 'true_false_count', markKey: 'marks_per_true_false', max: 50 },
]

const PRESETS = [
  {
    id: 'class_test',
    label: 'Class test',
    sub: 'Short mixed paper',
    counts: { mcq_count: 5, short_answer_count: 3, long_answer_count: 2, fill_blank_count: 0, match_columns_count: 0, true_false_count: 0 },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    sub: 'Web default mix',
    counts: { mcq_count: 5, short_answer_count: 3, long_answer_count: 2, fill_blank_count: 2, match_columns_count: 1, true_false_count: 2 },
  },
  {
    id: 'mcq',
    label: 'MCQ drill',
    sub: 'Objective only',
    counts: { mcq_count: 20, short_answer_count: 0, long_answer_count: 0, fill_blank_count: 0, match_columns_count: 0, true_false_count: 0 },
  },
]

const DEFAULT_COUNTS: Record<CountKey, number> = PRESETS[1].counts
const DEFAULT_MARKS: Record<MarkKey, number> = {
  marks_per_mcq: 1,
  marks_per_short: 2,
  marks_per_long: 5,
  marks_per_fill_blank: 1,
  marks_per_match_columns: 2,
  marks_per_true_false: 1,
}
const DURATION_PRESETS = [0, 30, 45, 60, 90, 120]
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeStandard(value?: string | null) {
  if (!value) return ''
  return String(value).replace(/^std\.?\s*/i, '').replace(/^standard\s*/i, '').trim()
}

function isCompetitiveCourse(value?: string | null) {
  return /\b(jee|mht|mh[-\s]?cet|cet|neet)\b/i.test(value ?? '')
}

function boardToExamType(value?: string | null) {
  const normalized = (value ?? '').toLowerCase()
  if (normalized.includes('advanced')) return 'jee_advanced'
  if (normalized.includes('mh') || normalized.includes('mht') || normalized.includes('cet')) return 'mhcet'
  if (normalized.includes('jee')) return 'jee_mains'
  return null
}

function subjectToCatalog(value?: string | null) {
  const normalized = (value ?? '').toLowerCase()
  if (normalized.includes('physics')) return 'physics'
  if (normalized.includes('chemistry')) return 'chemistry'
  if (normalized.includes('math')) return 'mathematics'
  return null
}

function getSubtopicTitle(item: string | { title?: string | null }) {
  return typeof item === 'string' ? item : item.title?.trim() ?? ''
}

function getQuestionTotals(counts: Record<CountKey, number>, marks: Record<MarkKey, number>, customTypes: CustomType[]) {
  const baseQuestions = QUESTION_ROWS.reduce((sum, row) => sum + counts[row.countKey], 0)
  const baseMarks = QUESTION_ROWS.reduce((sum, row) => sum + counts[row.countKey] * marks[row.markKey], 0)
  const customQuestions = customTypes.reduce((sum, item) => sum + item.count, 0)
  const customMarks = customTypes.reduce((sum, item) => sum + item.count * item.marks, 0)
  return {
    questions: baseQuestions + customQuestions,
    marks: baseMarks + customMarks,
  }
}

function buildBlueprintSections(counts: Record<CountKey, number>, marks: Record<MarkKey, number>, customTypes: CustomType[]): BlueprintSectionPayload[] {
  const sections: BlueprintSectionPayload[] = QUESTION_ROWS
    .filter((row) => counts[row.countKey] > 0)
    .map((row, index) => ({
      id: `section-${row.key}`,
      title: row.label,
      question_type: row.key,
      marks: marks[row.markKey],
      count: counts[row.countKey],
      order: index,
    }))

  customTypes
    .filter((item) => item.name.trim() && item.count > 0)
    .forEach((item, index) => {
      sections.push({
        id: `section-custom-${item.id}`,
        title: item.name.trim(),
        question_type: 'short_answer',
        custom_type_name: item.name.trim(),
        marks: item.marks,
        count: item.count,
        order: sections.length + index,
      })
    })

  return sections
}

function defaultPaperName(subjectName?: string, standard?: string) {
  return [subjectName, standard ? `Std ${standard}` : '', 'Paper'].filter(Boolean).join(' ')
}

function CompactSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: string
  placeholder: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selectedLabel = options.find((option) => option.value === value)?.label

  return (
    <View style={[styles.field, disabled && styles.disabledBlock]}>
      <TouchableOpacity
        activeOpacity={0.88}
        disabled={disabled}
        style={styles.selectTrigger}
        onPress={() => setOpen((current) => !current)}
      >
        <View style={styles.selectTextBlock}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <Text style={[styles.selectValue, !selectedLabel && styles.placeholder]} numberOfLines={1}>
            {selectedLabel || placeholder}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color={colors.textMuted} />
      </TouchableOpacity>
      {open ? (
        <View style={styles.menu}>
          {options.length === 0 ? (
            <Text style={styles.emptyText}>No options available</Text>
          ) : (
            options.map((option) => {
              const active = option.value === value
              return (
                <TouchableOpacity
                  key={option.value}
                  activeOpacity={0.86}
                  style={[styles.menuItem, active && styles.menuItemActive]}
                  onPress={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <Text style={[styles.menuItemText, active && styles.menuItemTextActive]}>{option.label}</Text>
                  {active ? <Ionicons name="checkmark" size={16} color={colors.accentStrong} /> : null}
                </TouchableOpacity>
              )
            })
          )}
        </View>
      ) : null}
    </View>
  )
}

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <TouchableOpacity activeOpacity={0.82} style={styles.stepperButton} onPress={() => onChange(clamp(Number((value - step).toFixed(2)), min, max))}>
          <Ionicons name="remove" size={15} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{value}</Text>
        <TouchableOpacity activeOpacity={0.82} style={styles.stepperButton} onPress={() => onChange(clamp(Number((value + step).toFixed(2)), min, max))}>
          <Ionicons name="add" size={15} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

function StageCard({
  index,
  title,
  summary,
  active,
  done,
  locked,
  onPress,
  children,
}: {
  index: number
  title: string
  summary?: string
  active: boolean
  done?: boolean
  locked?: boolean
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <View style={[styles.stageCard, active && styles.stageCardActive, locked && styles.disabledBlock]}>
      <TouchableOpacity activeOpacity={0.88} disabled={locked} style={styles.stageHeader} onPress={onPress}>
        <View style={[styles.stageNumber, done && styles.stageNumberDone, active && styles.stageNumberActive]}>
          <Text style={[styles.stageNumberText, (done || active) && styles.stageNumberTextActive]}>{String(index).padStart(2, '0')}</Text>
        </View>
        <View style={styles.stageTitleBlock}>
          <Text style={styles.stageTitle}>{title}</Text>
          {summary ? <Text style={styles.stageSummary} numberOfLines={1}>{summary}</Text> : null}
        </View>
        {locked ? <Ionicons name="lock-closed-outline" size={16} color={colors.textSubtle} /> : <Ionicons name={active ? 'chevron-up' : 'chevron-down'} size={17} color={colors.textMuted} />}
      </TouchableOpacity>
      {active && !locked ? <View style={styles.stageBody}>{children}</View> : null}
    </View>
  )
}

function GeneratePhotoHeader({
  isCompetitive,
  selectedSubjectName,
  board,
  chapterSource,
  totals,
  onBack,
}: {
  isCompetitive: boolean
  selectedSubjectName?: string
  board: string
  chapterSource: ChapterSource
  totals: { questions: number; marks: number }
  onBack: () => void
}) {
  const insets = useSafeAreaInsets()
  const subtitle = selectedSubjectName
    ? `${selectedSubjectName} - ${board || 'Select exam'} - ${chapterSource === 'ai' ? 'AI syllabus' : 'Book chapters'}`
    : 'Choose scope, structure questions, generate a draft.'

  return (
    <View style={[styles.photoHeaderWrap, { paddingTop: insets.top }]}>
      <View style={styles.headerImage}>
        <Image source={papersHeaderImage} resizeMode="cover" style={styles.headerPhoto} />
        <LinearGradient
          colors={['rgba(2,6,23,0.92)', 'rgba(15,23,42,0.42)', 'rgba(194,65,12,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.headerWarmVeil} />
        <View style={styles.photoHeaderContent}>
          <View style={styles.photoHeaderTop}>
            <TouchableOpacity activeOpacity={0.86} style={styles.photoBackButton} onPress={onBack}>
              <Ionicons name="arrow-back" size={18} color={colors.white} />
            </TouchableOpacity>
            <View style={styles.photoHeaderBadge}>
              <Ionicons name="sparkles-outline" size={13} color={colors.orangeScale[100]} />
              <Text style={styles.photoHeaderBadgeText}>Blueprint studio</Text>
            </View>
          </View>
          <View style={styles.photoHeaderBottom}>
            <View style={styles.photoHeaderCopy}>
              <Text style={styles.photoHeaderKicker}>{isCompetitive ? 'Competitive paper' : 'School paper'}</Text>
              <Text style={styles.photoHeaderTitle}>Generate draft</Text>
              <Text style={styles.photoHeaderSubtitle} numberOfLines={1}>{subtitle}</Text>
            </View>
            <View style={styles.photoTotalPill}>
              <Text style={styles.photoTotalText}>{totals.questions}Q</Text>
              <Text style={styles.photoTotalSub}>{totals.marks} marks</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}

export default function GeneratePaperScreen() {
  const navigation = useNavigation<Nav>()
  const [mode, setMode] = useState<ComposeMode>('form')
  const [stage, setStage] = useState<Stage>(0)
  const [chapterSource, setChapterSource] = useState<ChapterSource>('books')
  const [board, setBoard] = useState('')
  const [standard, setStandard] = useState('')
  const [division, setDivision] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [chapterIds, setChapterIds] = useState<string[]>([])
  const [subtopicNames, setSubtopicNames] = useState<string[]>([])
  const [chapters, setChapters] = useState<ChapterWithSubtopics[]>([])
  const [chaptersLoading, setChaptersLoading] = useState(false)
  const [paperName, setPaperName] = useState('')
  const [counts, setCounts] = useState<Record<CountKey, number>>(DEFAULT_COUNTS)
  const [marks, setMarks] = useState<Record<MarkKey, number>>(DEFAULT_MARKS)
  const [customTypes, setCustomTypes] = useState<CustomType[]>([])
  const [durationMin, setDurationMin] = useState(0)
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [prompt, setPrompt] = useState('')

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false })
  }, [navigation])

  const { data: options, isLoading, isError, refetch } = useQuery({
    queryKey: ['paper-options'],
    queryFn: papersApi.getOptions,
  })

  const subjects = options?.subjects ?? []
  const selectedSubject = subjects.find((subject) => subject.id === subjectId)
  const isCompetitive = isCompetitiveCourse(board)
  const aiExamType = boardToExamType(board)
  const aiCatalogSubject = subjectToCatalog(selectedSubject?.name)
  const aiSourceAvailable = Boolean(isCompetitive && aiExamType && aiCatalogSubject)
  const { data: aiSyllabus, isLoading: aiSyllabusLoading } = useQuery({
    queryKey: ['jee-syllabus', aiExamType, aiCatalogSubject],
    enabled: aiSourceAvailable,
    queryFn: () => papersApi.getJeeSyllabus({ exam_type: aiExamType!, subject: aiCatalogSubject! }),
  })
  const aiChapters = useMemo<ChapterWithSubtopics[]>(
    () => (aiSyllabus?.chapters ?? []).map((chapter) => ({
      id: chapter.key,
      title: chapter.title,
      subject_id: subjectId,
      order: 0,
      subtopics: chapter.subtopics ?? [],
    })),
    [aiSyllabus, subjectId]
  )
  const activeChapters = chapterSource === 'ai' ? aiChapters : chapters
  const selectedChapters = activeChapters.filter((chapter) => chapterIds.includes(chapter.id))
  const isCompetitiveAi = isCompetitive && chapterSource === 'ai'
  const visibleQuestionRows = isCompetitiveAi ? QUESTION_ROWS.filter((row) => row.key === 'mcq') : QUESTION_ROWS
  const derivedSubtopics = useMemo(() => {
    const names = selectedChapters.flatMap((chapter) => (chapter.subtopics ?? []).map(getSubtopicTitle))
    return Array.from(new Set(names.filter(Boolean)))
  }, [selectedChapters])
  const totals = getQuestionTotals(counts, marks, customTypes)
  const topicDone = !!subjectId && chapterIds.length > 0
  const questionsDone = totals.questions > 0
  const effectiveStandard = isCompetitive ? board : standard
  const effectiveDivision = isCompetitive ? 'Individual' : division
  const effectivePaperName = paperName.trim() || defaultPaperName(selectedSubject?.name, isCompetitive ? '' : standard)
  const topicSummary = topicDone ? `${selectedSubject?.name ?? 'Subject'} - ${chapterIds.length} chapter${chapterIds.length === 1 ? '' : 's'}` : undefined
  const questionSummary = questionsDone ? `${totals.questions} questions - ${totals.marks} marks` : undefined

  useEffect(() => {
    if (!board && options?.courses?.[0]) setBoard(options.courses[0])
    if (!standard && options?.standards?.[0]) setStandard(normalizeStandard(options.standards[0]))
    if (!division && options?.divisions?.[0]) setDivision(options.divisions[0])
  }, [board, division, options, standard])

  useEffect(() => {
    if (aiSourceAvailable) {
      setChapterSource('ai')
    } else {
      setChapterSource('books')
    }
    setChapterIds([])
    setSubtopicNames([])
  }, [aiSourceAvailable, board, subjectId])

  useEffect(() => {
    if (!subjectId) {
      setChapters([])
      setChapterIds([])
      setSubtopicNames([])
      return
    }

    let cancelled = false
    setChaptersLoading(true)
    setChapters([])
    setChapterIds([])
    setSubtopicNames([])
    papersApi
      .getChapters(subjectId)
      .then((items) => {
        if (cancelled) return
        setChapters(items as ChapterWithSubtopics[])
      })
      .catch(() => {
        if (!cancelled) setChapters([])
      })
      .finally(() => {
        if (!cancelled) setChaptersLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [subjectId])

  useEffect(() => {
    setSubtopicNames((current) => current.filter((name) => derivedSubtopics.includes(name)))
  }, [derivedSubtopics])

  useEffect(() => {
    if (!isCompetitiveAi) return
    setCustomTypes([])
    setCounts((current) => {
      const total = QUESTION_ROWS.reduce((sum, row) => sum + current[row.countKey], 0)
      return {
        mcq_count: Math.max(1, total || current.mcq_count),
        short_answer_count: 0,
        long_answer_count: 0,
        fill_blank_count: 0,
        match_columns_count: 0,
        true_false_count: 0,
      }
    })
  }, [isCompetitiveAi])

  const generateMutation = useMutation({
    mutationFn: async (input: GenerateInput) => {
      if (input.ai) {
        const response = await papersApi.generateJeeFormPaper({
          exam_type: input.ai.examType,
          subject: input.ai.subject,
          chapter_keys: input.ai.chapterKeys,
          count: input.ai.count,
          question_marks: input.ai.marks,
          subtopic: input.ai.subtopic,
          title: input.ai.title,
        })
        if (response.status === 'failed') {
          throw new Error(response.error || 'AI question generator failed. Try different chapters.')
        }
        if (!response.paper_id) {
          throw new Error(`AI generation finished but no paper was produced. Status: ${response.status}`)
        }
        return papersApi.getById(response.paper_id)
      }
      return papersApi.generate(input.payload)
    },
    onSuccess: (paper) => navigation.replace('PaperDetail', { paperId: paper.id }),
    onError: (err: any) => {
      const detail = err?.response?.data?.detail
      const message =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((item: any) => item.msg || JSON.stringify(item)).join('\n')
            : err?.message || 'Unable to generate the draft.'
      Alert.alert('Generation failed', message)
    },
  })

  const selectAllChapters = () => setChapterIds(activeChapters.map((chapter) => chapter.id))
  const clearChapters = () => {
    setChapterIds([])
    setSubtopicNames([])
  }
  const toggleChapter = (id: string) => {
    setChapterIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }
  const toggleSubtopic = (name: string) => {
    setSubtopicNames((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]))
  }
  const setCount = (key: CountKey, value: number) => {
    const max = QUESTION_ROWS.find((row) => row.countKey === key)?.max ?? 50
    setCounts((current) => ({ ...current, [key]: clamp(Math.round(value), 0, max) }))
  }
  const setMark = (key: MarkKey, value: number) => {
    setMarks((current) => ({ ...current, [key]: clamp(Number(value.toFixed(2)), 0.25, 50) }))
  }
  const applyPreset = (presetId: string) => {
    const preset = PRESETS.find((item) => item.id === presetId)
    if (preset) setCounts(preset.counts)
  }
  const updateCustomType = (id: string, patch: Partial<CustomType>) => {
    setCustomTypes((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }
  const removeCustomType = (id: string) => {
    setCustomTypes((current) => current.filter((item) => item.id !== id))
  }

  const handleGenerate = () => {
    if (!topicDone) {
      setStage(0)
      Alert.alert('Select topic', 'Choose subject and at least one chapter first.')
      return
    }
    if (!questionsDone) {
      setStage(1)
      Alert.alert('Add questions', 'Add at least one question before generating.')
      return
    }

    const blueprintSections = buildBlueprintSections(counts, marks, customTypes)
    const payload: PaperGenerateRequest = {
      subject_id: subjectId,
      chapter_ids: chapterIds,
      chapter_titles: selectedChapters.map((chapter) => chapter.title),
      difficulty,
      title_line_1: effectivePaperName,
      course: board || undefined,
      standard: normalizeStandard(effectiveStandard) || undefined,
      division: effectiveDivision || undefined,
      subtopic_names: subtopicNames.length ? subtopicNames : undefined,
      custom_question_types: customTypes
        .filter((item) => item.name.trim() && item.count > 0)
        .map((item) => ({ name: item.name.trim(), count: item.count, marks: item.marks })),
      timer_value: durationMin > 0 ? durationMin : null,
      timer_unit: 'minutes',
      duration_minutes: durationMin > 0 ? durationMin : null,
      additional_instructions: prompt.trim() || undefined,
      instructions: prompt.trim() || undefined,
      only_fill_blanks: true,
      blueprint_header: {
        title: effectivePaperName,
        subject_name: selectedSubject?.name ?? 'Subject',
        board,
        standard: normalizeStandard(effectiveStandard),
        division: effectiveDivision,
        duration_minutes: durationMin > 0 ? durationMin : null,
        target_marks: totals.marks,
      },
      blueprint_sections: blueprintSections,
      ...counts,
      ...marks,
    }

    generateMutation.mutate({
      payload,
      ai: chapterSource === 'ai' && aiSourceAvailable
        ? {
          examType: aiExamType!,
          subject: aiCatalogSubject!,
          chapterKeys: chapterIds,
          count: totals.questions,
          marks: marks.marks_per_mcq,
          subtopic: subtopicNames[0],
          title: effectivePaperName,
        }
        : undefined,
    })
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accentStrong} />
        <Text style={styles.loadingText}>Loading generator</Text>
      </View>
    )
  }

  if (isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Could not load paper options</Text>
        <Text style={styles.errorBody}>Refresh and try again.</Text>
        <PrimaryButton label="Retry" variant="secondary" onPress={() => refetch()} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <GeneratePhotoHeader
        isCompetitive={isCompetitive}
        selectedSubjectName={selectedSubject?.name}
        board={board}
        chapterSource={chapterSource}
        totals={totals}
        onBack={() => navigation.goBack()}
      />
      <Screen contentStyle={styles.screenContentAfterHeader}>

        <View style={styles.modeTabs}>
          {(['form', 'ai'] as ComposeMode[]).map((item) => {
            const active = mode === item
            return (
              <TouchableOpacity key={item} activeOpacity={0.88} style={[styles.modeTab, active && styles.modeTabActive, item === 'ai' && active && styles.modeTabAi]} onPress={() => setMode(item)}>
                <Text style={[styles.modeTabText, active && styles.modeTabTextActive, item === 'ai' && active && styles.modeTabAiTextActive]}>{item === 'form' ? 'Form' : 'AI'}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {mode === 'ai' ? (
          <View style={styles.aiCard}>
            <View style={styles.aiIcon}>
              <Ionicons name="sparkles-outline" size={20} color={colors.accentStrong} />
            </View>
            <Text style={styles.aiTitle}>AI Compose</Text>
            <Text style={styles.aiBody}>Use this prompt as generation instructions. Select scope in Form so the backend receives the same real fields as the website.</Text>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              placeholder="Example: CBSE Chemistry, Std 11, 30 marks, focus on thermodynamics numericals"
              placeholderTextColor={colors.textSubtle}
              multiline
              style={[styles.input, styles.promptInput]}
            />
            <PrimaryButton label="Use prompt in form" variant="secondary" onPress={() => setMode('form')} />
          </View>
        ) : (
          <>
            <View style={styles.progress}>
              {[0, 1, 2].map((item) => (
                <View key={item} style={[styles.progressDot, stage === item && styles.progressDotActive, ((item === 0 && topicDone) || (item === 1 && questionsDone)) && styles.progressDotDone]} />
              ))}
            </View>

            <StageCard index={1} title="Topic" summary={topicSummary} active={stage === 0} done={topicDone && stage !== 0} onPress={() => setStage(0)}>
              {(options?.courses ?? []).length > 1 ? (
                <CompactSelect
                  label={isCompetitive ? 'Competitive exam' : 'Board'}
                  value={board}
                  placeholder={isCompetitive ? 'Select exam' : 'Select board'}
                  options={(options?.courses ?? []).map((item) => ({ value: item, label: item }))}
                  onChange={(value) => {
                    setBoard(value)
                    clearChapters()
                  }}
                />
              ) : null}
              {!isCompetitive && (options?.standards ?? []).length > 0 ? (
                <CompactSelect
                  label="Standard"
                  value={standard}
                  placeholder="Select standard"
                  options={(options?.standards ?? []).map((item) => ({ value: normalizeStandard(item), label: normalizeStandard(item) ? `Std ${normalizeStandard(item)}` : item }))}
                  onChange={(value) => {
                    setStandard(normalizeStandard(value))
                    setSubjectId('')
                    clearChapters()
                  }}
                />
              ) : null}
              {!isCompetitive && (options?.divisions ?? []).length > 0 ? (
                <CompactSelect
                  label="Division"
                  value={division}
                  placeholder="Select division"
                  options={(options?.divisions ?? []).map((item) => ({ value: item, label: `Div ${item}` }))}
                  onChange={(value) => {
                    setDivision(value)
                    setSubjectId('')
                    clearChapters()
                  }}
                />
              ) : null}
              {isCompetitive ? (
                <View style={styles.examModeCard}>
                  <View style={styles.examModeIcon}>
                    <Ionicons name="trophy-outline" size={17} color={colors.accentStrong} />
                  </View>
                  <View style={styles.examModeCopy}>
                    <Text style={styles.examModeTitle}>{board || 'Competitive exam'} mode</Text>
                    <Text style={styles.examModeBody}>Standard and division are handled as Individual, matching the website flow.</Text>
                  </View>
                </View>
              ) : null}
              <CompactSelect
                label="Subject"
                value={subjectId}
                placeholder="Select subject"
                options={subjects.map((subject) => ({ value: subject.id, label: subject.name }))}
                onChange={setSubjectId}
              />
              {subjectId && isCompetitive ? (
                <View style={styles.sourcePanel}>
                  <View style={styles.sourceHeader}>
                    <Text style={styles.fieldLabel}>Question source</Text>
                    {aiSourceAvailable ? <Text style={styles.sourceReady}>AI ready</Text> : <Text style={styles.sourceMuted}>AI unavailable</Text>}
                  </View>
                  <View style={styles.sourceTabs}>
                    {(['ai', 'books'] as ChapterSource[]).map((source) => {
                      const active = chapterSource === source
                      const disabled = source === 'ai' && !aiSourceAvailable
                      return (
                        <TouchableOpacity
                          key={source}
                          activeOpacity={0.88}
                          disabled={disabled}
                          style={[styles.sourceTab, active && styles.sourceTabActive, disabled && styles.disabledBlock]}
                          onPress={() => {
                            setChapterSource(source)
                            clearChapters()
                          }}
                        >
                          <Ionicons name={source === 'ai' ? 'sparkles-outline' : 'library-outline'} size={15} color={active ? colors.white : colors.textMuted} />
                          <Text style={[styles.sourceTabText, active && styles.sourceTabTextActive]}>{source === 'ai' ? 'AI syllabus' : 'Books'}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>
              ) : null}
              <View style={styles.boxField}>
                <View style={styles.boxHeader}>
                  <Text style={styles.fieldLabel}>{chapterSource === 'ai' ? 'AI syllabus chapters' : 'Chapters'}</Text>
                  <View style={styles.rowActions}>
                    <TouchableOpacity activeOpacity={0.86} onPress={selectAllChapters}>
                      <Text style={styles.linkText}>All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.86} onPress={clearChapters}>
                      <Text style={styles.linkText}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {(chapterSource === 'ai' ? aiSyllabusLoading : chaptersLoading) ? (
                  <View style={styles.inlineLoading}>
                    <ActivityIndicator color={colors.accentStrong} />
                    <Text style={styles.emptyText}>Loading chapters</Text>
                  </View>
                ) : !subjectId ? (
                  <Text style={styles.emptyText}>Select subject first</Text>
                ) : chapterSource === 'ai' && !aiSourceAvailable ? (
                  <Text style={styles.emptyText}>AI source needs MH-CET/JEE and Physics, Chemistry, or Mathematics.</Text>
                ) : activeChapters.length === 0 ? (
                  <Text style={styles.emptyText}>{chapterSource === 'ai' ? 'No AI syllabus available for this exam and subject.' : 'No indexed books for this subject yet.'}</Text>
                ) : (
                  <ScrollView
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                    style={styles.optionList}
                    contentContainerStyle={styles.optionListContent}
                  >
                    {activeChapters.map((chapter) => {
                      const active = chapterIds.includes(chapter.id)
                      return (
                        <TouchableOpacity key={chapter.id} activeOpacity={0.86} style={[styles.checkRow, active && styles.checkRowActive]} onPress={() => toggleChapter(chapter.id)}>
                          <View style={[styles.checkbox, active && styles.checkboxActive]}>
                            {active ? <Ionicons name="checkmark" size={12} color={colors.white} /> : null}
                          </View>
                          <Text style={[styles.checkText, active && styles.checkTextActive]} numberOfLines={2}>{chapter.title}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                )}
              </View>
              <View style={styles.boxField}>
                <View style={styles.boxHeader}>
                  <Text style={styles.fieldLabel}>Subtopics</Text>
                  {derivedSubtopics.length > 0 ? (
                    <View style={styles.rowActions}>
                      <TouchableOpacity activeOpacity={0.86} onPress={() => setSubtopicNames(derivedSubtopics)}>
                        <Text style={styles.linkText}>All</Text>
                      </TouchableOpacity>
                      <TouchableOpacity activeOpacity={0.86} onPress={() => setSubtopicNames([])}>
                        <Text style={styles.linkText}>Clear</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
                {chapterIds.length === 0 ? (
                  <Text style={styles.emptyText}>Select chapters first</Text>
                ) : derivedSubtopics.length === 0 ? (
                  <Text style={styles.emptyText}>No subtopics detected for selected chapters</Text>
                ) : (
                  <View style={styles.chipWrap}>
                    {derivedSubtopics.map((topic) => {
                      const active = subtopicNames.includes(topic)
                      return (
                        <TouchableOpacity key={topic} activeOpacity={0.86} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleSubtopic(topic)}>
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{topic}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                )}
              </View>
              <PrimaryButton label="Next: Questions" disabled={!topicDone} onPress={() => setStage(1)} />
            </StageCard>

            <StageCard index={2} title="Questions" summary={questionSummary} active={stage === 1} done={questionsDone && stage !== 1} locked={!topicDone} onPress={() => setStage(1)}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Paper name (optional)</Text>
                <TextInput
                  value={paperName}
                  onChangeText={setPaperName}
                  placeholder={defaultPaperName(selectedSubject?.name, isCompetitive ? '' : standard)}
                  placeholderTextColor={colors.textSubtle}
                  style={styles.input}
                />
              </View>
              <View style={styles.presetRow}>
                {PRESETS.map((preset) => (
                  <TouchableOpacity key={preset.id} activeOpacity={0.88} style={styles.presetButton} onPress={() => applyPreset(preset.id)}>
                    <Text style={styles.presetTitle}>{preset.label}</Text>
                    <Text style={styles.presetSub}>{preset.sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.questionList}>
                {visibleQuestionRows.map((row) => (
                  <View key={row.key} style={styles.questionRow}>
                    <View style={styles.questionHeader}>
                      <Text style={styles.questionTitle}>{row.label}</Text>
                      <Text style={styles.questionMeta}>{counts[row.countKey]} x {marks[row.markKey]} = {counts[row.countKey] * marks[row.markKey]}</Text>
                    </View>
                    <View style={styles.questionControls}>
                      <Stepper label="Count" value={counts[row.countKey]} min={0} max={row.max} onChange={(value) => setCount(row.countKey, value)} />
                      <Stepper label="Marks" value={marks[row.markKey]} min={0.25} max={50} step={0.25} onChange={(value) => setMark(row.markKey, value)} />
                    </View>
                  </View>
                ))}
                {customTypes.map((item) => (
                  <View key={item.id} style={styles.customRow}>
                    <View style={styles.customHeader}>
                      <TextInput
                        value={item.name}
                        onChangeText={(value) => updateCustomType(item.id, { name: value })}
                        placeholder="Custom type"
                        placeholderTextColor={colors.textSubtle}
                        style={[styles.input, styles.customInput]}
                      />
                      <TouchableOpacity activeOpacity={0.86} style={styles.removeButton} onPress={() => removeCustomType(item.id)}>
                        <Ionicons name="trash-outline" size={17} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.questionControls}>
                      <Stepper label="Count" value={item.count} min={0} max={30} onChange={(value) => updateCustomType(item.id, { count: Math.round(value) })} />
                      <Stepper label="Marks" value={item.marks} min={0.25} max={50} step={0.25} onChange={(value) => updateCustomType(item.id, { marks: value })} />
                    </View>
                  </View>
                ))}
              </View>
              <TouchableOpacity activeOpacity={0.86} style={styles.addTypeButton} onPress={() => setCustomTypes((current) => [...current, { id: String(Date.now()), name: '', count: 2, marks: 2 }])}>
                <Ionicons name="add" size={16} color={colors.accentStrong} />
                <Text style={styles.addTypeText}>Add custom type</Text>
              </TouchableOpacity>
              <View style={styles.totalBox}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{totals.questions} questions - {totals.marks} marks</Text>
              </View>
              <PrimaryButton label="Next: Settings" disabled={!questionsDone} onPress={() => setStage(2)} />
            </StageCard>

            <StageCard index={3} title="Settings & generate" active={stage === 2} locked={!topicDone || !questionsDone} onPress={() => setStage(2)}>
              <View style={styles.twoCol}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Duration</Text>
                  <View style={styles.chipWrap}>
                    {DURATION_PRESETS.map((minutes) => {
                      const active = durationMin === minutes
                      return (
                        <TouchableOpacity key={minutes} activeOpacity={0.86} style={[styles.chip, active && styles.chipActive]} onPress={() => setDurationMin(minutes)}>
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{minutes === 0 ? 'No timer' : `${minutes} min`}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>
                <CompactSelect
                  label="Difficulty"
                  value={difficulty}
                  placeholder="Select difficulty"
                  options={DIFFICULTIES.map((item) => ({ value: item, label: item[0].toUpperCase() + item.slice(1) }))}
                  onChange={(value) => setDifficulty(value as Difficulty)}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>AI / teacher instruction</Text>
                <TextInput
                  value={prompt}
                  onChangeText={setPrompt}
                  placeholder="Optional: include diagrams, keep language simple, use textbook examples"
                  placeholderTextColor={colors.textSubtle}
                  multiline
                  style={[styles.input, styles.promptInput]}
                />
              </View>
              <View style={styles.generateSummary}>
                <Text style={styles.generateTitle}>{effectivePaperName}</Text>
                <Text style={styles.generateBody}>
                  {selectedSubject?.name ?? 'Subject'} - {chapterIds.length} chapters - {totals.questions} questions - {totals.marks} marks
                </Text>
              </View>
              <PrimaryButton
                label={generateMutation.isPending ? 'Generating draft...' : 'Generate draft'}
                loading={generateMutation.isPending}
                disabled={!topicDone || !questionsDone}
                onPress={handleGenerate}
              />
            </StageCard>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  screenContent: {
    paddingTop: spacing[2],
    paddingBottom: spacing[8],
    gap: spacing[3],
  },
  screenContentAfterHeader: {
    paddingTop: spacing[4],
    paddingBottom: spacing[8],
    gap: spacing[3],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    padding: spacing[6],
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  errorTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 18,
  },
  errorBody: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  photoHeaderWrap: {
    height: 124,
    overflow: 'hidden',
    backgroundColor: colors.slate[950],
  },
  headerImage: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  headerPhoto: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.98,
  },
  headerWarmVeil: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(249,115,22,0.72)',
  },
  photoHeaderContent: {
    flex: 1,
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[3],
    justifyContent: 'space-between',
  },
  photoHeaderTop: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  photoBackButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  photoHeaderBadge: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    backgroundColor: 'rgba(17, 24, 39, 0.62)',
    borderWidth: 1,
    borderColor: 'rgba(254, 215, 170, 0.22)',
  },
  photoHeaderBadgeText: {
    color: colors.orangeScale[100],
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  photoHeaderBottom: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  photoHeaderCopy: {
    flex: 1,
  },
  photoHeaderKicker: {
    color: colors.orangeScale[100],
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.1,
    lineHeight: 12,
    textTransform: 'uppercase',
  },
  photoHeaderTitle: {
    color: colors.white,
    fontFamily: fonts.displayBold,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: 0,
  },
  photoHeaderSubtitle: {
    color: 'rgba(255,255,255,0.80)',
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  photoTotalPill: {
    minWidth: 58,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: spacing[2],
  },
  photoTotalText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  photoTotalSub: {
    color: 'rgba(255,255,255,0.76)',
    fontFamily: fonts.medium,
    fontSize: 9,
  },
  hero: {
    borderRadius: 24,
    minHeight: 164,
    borderWidth: 1,
    borderColor: 'rgba(194, 65, 12, 0.20)',
    overflow: 'hidden',
    ...shadows.md,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroWarmVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(194,65,12,0.07)',
  },
  heroContent: {
    flex: 1,
    padding: spacing[4],
    justifyContent: 'space-between',
    gap: spacing[4],
  },
  heroTop: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroBackButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  heroBadge: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    backgroundColor: 'rgba(17, 24, 39, 0.62)',
    borderWidth: 1,
    borderColor: 'rgba(254, 215, 170, 0.22)',
  },
  heroBadgeText: {
    color: colors.orangeScale[100],
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  heroBody: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[3],
  },
  heroCopy: {
    flex: 1,
  },
  heroSubtitle: {
    color: colors.slate[300],
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing[1],
  },
  topBar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topCopy: {
    flex: 1,
  },
  kicker: {
    color: colors.orangeScale[200],
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.white,
    fontFamily: fonts.displayBold,
    fontSize: 25,
    letterSpacing: 0,
  },
  totalPill: {
    minWidth: 74,
    minHeight: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: spacing[2],
  },
  totalPillText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  totalPillSub: {
    color: colors.slate[300],
    fontFamily: fonts.medium,
    fontSize: 10,
  },
  modeTabs: {
    flexDirection: 'row',
    gap: spacing[1],
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    backgroundColor: colors.backgroundElevated,
    padding: 4,
    ...shadows.xs,
  },
  modeTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabActive: {
    backgroundColor: colors.accentStrong,
    ...shadows.xs,
  },
  modeTabAi: {
    backgroundColor: colors.backgroundElevated,
  },
  modeTabText: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  modeTabTextActive: {
    color: colors.white,
  },
  modeTabAiTextActive: {
    color: colors.text,
  },
  progress: {
    flexDirection: 'row',
    gap: spacing[1],
    paddingHorizontal: spacing[1],
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 4,
    backgroundColor: colors.borderStrong,
  },
  progressDotActive: {
    backgroundColor: colors.accentStrong,
  },
  progressDotDone: {
    backgroundColor: colors.accent,
  },
  stageCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    overflow: 'hidden',
    ...shadows.xs,
  },
  stageCardActive: {
    borderColor: colors.borderBrand,
    shadowColor: colors.orangeScale[700],
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  stageHeader: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
  },
  stageNumber: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundMuted,
  },
  stageNumberActive: {
    backgroundColor: colors.accentStrong,
  },
  stageNumberDone: {
    backgroundColor: colors.slate[950],
  },
  stageNumberText: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  stageNumberTextActive: {
    color: colors.white,
  },
  stageTitleBlock: {
    flex: 1,
  },
  stageTitle: {
    color: colors.text,
    fontFamily: fonts.displaySemibold,
    fontSize: 17,
    letterSpacing: 0,
  },
  stageSummary: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
    marginTop: 2,
  },
  stageBody: {
    gap: spacing[4],
    padding: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  field: {
    gap: spacing[2],
  },
  fieldLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  selectTrigger: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.slate[50],
    paddingHorizontal: spacing[3],
  },
  selectTextBlock: {
    flex: 1,
    gap: 2,
  },
  selectValue: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  examModeCard: {
    minHeight: 70,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
  },
  examModeIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  examModeCopy: {
    flex: 1,
    gap: 2,
  },
  examModeTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  examModeBody: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  sourcePanel: {
    gap: spacing[2],
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.slate[50],
    padding: spacing[3],
  },
  sourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sourceReady: {
    color: colors.success,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  sourceMuted: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  sourceTabs: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  sourceTab: {
    flex: 1,
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  sourceTabActive: {
    backgroundColor: colors.slate[950],
    borderColor: colors.slate[950],
  },
  sourceTabText: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  sourceTabTextActive: {
    color: colors.white,
  },
  placeholder: {
    color: colors.textSubtle,
  },
  menu: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  menuItem: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  menuItemActive: {
    backgroundColor: colors.accentSurfaceStrong,
  },
  menuItemText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  menuItemTextActive: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
  },
  boxField: {
    gap: spacing[2],
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.slate[50],
    padding: spacing[3],
    overflow: 'hidden',
  },
  boxHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  linkText: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  inlineLoading: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 20,
    paddingVertical: spacing[1],
  },
  optionList: {
    maxHeight: 228,
    borderRadius: 14,
    overflow: 'hidden',
  },
  optionListContent: {
    gap: spacing[1],
    paddingBottom: spacing[1],
  },
  checkRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: 14,
    paddingHorizontal: spacing[2],
  },
  checkRowActive: {
    backgroundColor: colors.accentSurface,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  checkboxActive: {
    borderColor: colors.accentStrong,
    backgroundColor: colors.accentStrong,
  },
  checkText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  checkTextActive: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  chip: {
    minHeight: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  chipActive: {
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurfaceStrong,
  },
  chipText: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  chipTextActive: {
    color: colors.accentStrong,
  },
  input: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.slate[50],
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 14,
    paddingHorizontal: spacing[3],
  },
  promptInput: {
    minHeight: 108,
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    textAlignVertical: 'top',
  },
  presetRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  presetButton: {
    flex: 1,
    minHeight: 66,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.slate[50],
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
  },
  presetTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  presetSub: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 10,
    marginTop: 2,
  },
  questionList: {
    gap: spacing[2],
  },
  questionRow: {
    gap: spacing[3],
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.slate[50],
    padding: spacing[3],
  },
  questionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  questionTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  questionMeta: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  questionControls: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  stepper: {
    flex: 1,
    gap: spacing[1],
  },
  stepperLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  stepperControls: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  stepperButton: {
    width: 38,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  customRow: {
    gap: spacing[2],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
    padding: spacing[3],
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  customInput: {
    flex: 1,
    backgroundColor: colors.white,
  },
  removeButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addTypeButton: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  addTypeText: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  totalBox: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
  },
  totalLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  totalValue: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  twoCol: {
    gap: spacing[4],
  },
  generateSummary: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.slate[50],
    padding: spacing[4],
    gap: spacing[1],
  },
  generateTitle: {
    color: colors.text,
    fontFamily: fonts.displaySemibold,
    fontSize: 17,
    letterSpacing: 0,
  },
  generateBody: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 19,
  },
  aiCard: {
    gap: spacing[4],
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    backgroundColor: colors.backgroundElevated,
    padding: spacing[4],
    ...shadows.sm,
  },
  aiIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurfaceStrong,
  },
  aiTitle: {
    color: colors.text,
    fontFamily: fonts.displaySemibold,
    fontSize: 19,
    letterSpacing: 0,
  },
  aiBody: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
  },
  disabledBlock: {
    opacity: 0.55,
  },
})
