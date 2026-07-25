import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PapersStackParamList } from '../../navigation'
import { papersApi } from '../../api/papers'
import { API_BASE_URL } from '../../api/client'
import type { AnswerEntry, MCQOption, QuestionInPaper } from '../../types'
import { AnimatedButton, AnimatedCard, AppScreen, ErrorState } from '../../components/ui'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import { selectNewestInProgressAttempt } from './paperAttemptModel'

type Nav = NativeStackNavigationProp<PapersStackParamList, 'Quiz'>
type Route = RouteProp<PapersStackParamList, 'Quiz'>
type AssistMode = 'hint' | 'explain' | 'mistake'

function resolveAssetUrl(url?: string | null) {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`
}

function optionLabel(index: number, option?: MCQOption) {
  return option?.id || String.fromCharCode(65 + index)
}

function isMcqOptions(options: QuestionInPaper['options']): options is MCQOption[] {
  return Array.isArray(options)
}

function QuestionCard({
  question,
  index,
  answer,
  onAnswer,
  onAssist,
  assistText,
  assistLoading,
}: {
  question: QuestionInPaper
  index: number
  answer?: string
  onAnswer: (value: string) => void
  onAssist: (mode: AssistMode) => void
  assistText?: string
  assistLoading?: boolean
}) {
  const imageUrl = resolveAssetUrl(question.visual_payload?.asset_url)
  const answered = Boolean(answer?.trim())

  return (
    <AnimatedCard style={styles.questionCard}>
      <View style={styles.questionHeader}>
        <View style={styles.questionTitleBlock}>
          <Text style={styles.questionKicker}>
            Q{index + 1} / {[question.section, question.subject_name, question.chapter_title].filter(Boolean).join(' / ') || question.question_type}
          </Text>
          <Text style={styles.questionMarks}>{question.marks} marks</Text>
        </View>
        <View style={[styles.statusDot, answered && styles.statusDotDone]} />
      </View>

      {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.questionImage} resizeMode="contain" /> : null}

      <Text style={styles.questionText}>{question.question_text}</Text>

      {question.question_type === 'mcq' && isMcqOptions(question.options) ? (
        <View style={styles.optionList}>
          {question.options.map((option, optionIndex) => {
            const value = option.id || optionLabel(optionIndex)
            const selected = answer === value
            return (
              <Pressable key={`${question.id}-${value}`} onPress={() => onAnswer(value)} style={({ pressed }) => [styles.optionRow, selected && styles.optionSelected, pressed && styles.pressed]}>
                <Text style={[styles.optionBadge, selected && styles.optionBadgeSelected]}>{optionLabel(optionIndex, option)}</Text>
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.text}</Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {question.question_type === 'true_false' ? (
        <View style={styles.booleanRow}>
          {['True', 'False'].map((value) => {
            const selected = answer === value
            return (
              <Pressable key={value} onPress={() => onAnswer(value)} style={({ pressed }) => [styles.booleanButton, selected && styles.booleanButtonSelected, pressed && styles.pressed]}>
                <Text style={[styles.booleanText, selected && styles.booleanTextSelected]}>{value}</Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      {question.question_type !== 'mcq' && question.question_type !== 'true_false' ? (
        <TextInput
          value={answer || ''}
          onChangeText={onAnswer}
          multiline
          textAlignVertical="top"
          placeholder="Write your answer"
          placeholderTextColor={colors.textSubtle}
          style={[styles.textInput, question.question_type === 'long_answer' && styles.longInput]}
        />
      ) : null}

      <View style={styles.assistRow}>
        <Pressable onPress={() => onAssist('hint')} style={({ pressed }) => [styles.assistButton, pressed && styles.pressed]}>
          <Ionicons name="bulb" size={15} color={colors.paperStudio.jee} />
          <Text style={styles.assistLabel}>Hint</Text>
        </Pressable>
        <Pressable onPress={() => onAssist('explain')} style={({ pressed }) => [styles.assistButton, pressed && styles.pressed]}>
          <Ionicons name="school" size={15} color={colors.paperStudio.jee} />
          <Text style={styles.assistLabel}>Explain</Text>
        </Pressable>
        <Pressable onPress={() => onAssist('mistake')} style={({ pressed }) => [styles.assistButton, pressed && styles.pressed]}>
          <Ionicons name="analytics" size={15} color={colors.paperStudio.jee} />
          <Text style={styles.assistLabel}>Check</Text>
        </Pressable>
      </View>

      {assistLoading ? (
        <View style={styles.assistPanel}>
          <ActivityIndicator color={colors.paperStudio.jee} />
          <Text style={styles.assistText}>Loading AI support</Text>
        </View>
      ) : assistText ? (
        <View style={styles.assistPanel}>
          <Text style={styles.assistText}>{assistText}</Text>
        </View>
      ) : null}

    </AnimatedCard>
  )
}

export default function QuizScreen() {
  const navigation = useNavigation<Nav>()
  const { params } = useRoute<Route>()
  const queryClient = useQueryClient()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [assistByQuestion, setAssistByQuestion] = useState<Record<string, string>>({})
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const paperQuery = useQuery({
    queryKey: ['interactive-paper', params.paperId],
    queryFn: () => papersApi.getById(params.paperId),
  })

  const paper = paperQuery.data

  const attemptQuery = useQuery({
    queryKey: ['paper-attempt', params.paperId, params.examId, 'interactive-quiz'],
    queryFn: async () => {
      const attempts = await papersApi.listAttempts(params.paperId, { exam_id: params.examId })
      const inProgress = selectNewestInProgressAttempt(attempts.items)
      return inProgress ?? papersApi.createAttempt(params.paperId, {
        exam_id: params.examId,
        reason: 'interactive_quiz',
      })
    },
    enabled: Boolean(paper),
  })

  const activeAttempt = attemptQuery.data

  useEffect(() => {
    if (!paper?.duration_minutes || !activeAttempt) {
      setTimeLeft(null)
      return
    }
    const startedAt = Date.parse(activeAttempt.started_at || activeAttempt.created_at)
    const elapsedSeconds = Number.isFinite(startedAt) ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0
    setTimeLeft(Math.max(0, paper.duration_minutes * 60 - elapsedSeconds))
  }, [activeAttempt, paper?.duration_minutes])

  const elapsedSeconds = useCallback(() => {
    if (!activeAttempt) return 0
    const startedAt = Date.parse(activeAttempt.started_at || activeAttempt.created_at)
    if (!Number.isFinite(startedAt)) return 0
    return Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  }, [activeAttempt])

  const answeredCount = useMemo(() => {
    if (!paper) return 0
    return paper.questions.filter((question) => answers[question.id]?.trim()).length
  }, [answers, paper])

  const submitMutation = useMutation({
    mutationFn: (answerList: AnswerEntry[]) => {
      if (!activeAttempt) throw new Error('Quiz attempt is not ready')
      return (
      papersApi.submit(params.paperId, {
        answers: answerList,
        attempt_id: activeAttempt.id,
        exam_id: params.examId,
        time_taken_seconds: elapsedSeconds(),
        mode: 'interactive_quiz',
      })
      )
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['paper-attempt', params.paperId] })
      Alert.alert('Quiz submitted', 'Your JEE practice quiz has been graded.', [
        {
          text: 'View result',
          onPress: () => navigation.getParent()?.navigate('Results', {
            screen: 'ResultDetail',
            params: { checkedPaperId: data.id },
          }),
        },
        { text: 'Papers', onPress: () => navigation.navigate('PapersList') },
      ])
    },
    onError: async (error: any) => {
      const status = error?.response?.status
      const detail = error?.response?.data?.detail
      if (status === 500) {
        try {
          const existing = await papersApi.getSubmission(params.paperId, {
            exam_id: params.examId,
            attempt_id: activeAttempt?.id,
          })
          if (existing?.id && existing.id === activeAttempt?.id) {
            Alert.alert('Quiz saved', 'Your answers were saved. Open Results to review grading.', [
              {
                text: 'View result',
                onPress: () => navigation.getParent()?.navigate('Results', {
                  screen: 'ResultDetail',
                  params: { checkedPaperId: existing.id },
                }),
              },
              { text: 'OK' },
            ])
            return
          }
        } catch (_) {
          // fall through to the normal error message
        }
      }
      Alert.alert('Submission failed', typeof detail === 'string' ? detail : 'Please try again.')
    },
  })

  const assistMutation = useMutation({
    mutationFn: ({ questionId, mode }: { questionId: string; mode: AssistMode }) =>
      papersApi.getInteractiveAssist(params.paperId, {
        question_id: questionId,
        mode,
        student_answer: answers[questionId],
      }),
    onSuccess: (response, variables) => {
      setAssistByQuestion((current) => ({ ...current, [variables.questionId]: response.content }))
    },
    onError: () => {
      Alert.alert('AI support unavailable', 'Could not load help for this question.')
    },
  })

  const submit = useCallback((autoSubmit = false) => {
    if (!paper) return
    const answerList = paper.questions.map((question) => ({
      question_id: question.id,
      response: answers[question.id] || '',
    }))

    if (autoSubmit) {
      submitMutation.mutate(answerList)
      return
    }

    Alert.alert('Submit quiz', `You answered ${answeredCount} of ${paper.questions.length} questions.`, [
      { text: 'Keep working', style: 'cancel' },
      { text: 'Submit', onPress: () => submitMutation.mutate(answerList) },
    ])
  }, [answeredCount, answers, paper, submitMutation])

  useEffect(() => {
    if (timeLeft === null || submitMutation.isPending) return
    if (timeLeft <= 0) {
      submit(true)
      return
    }
    timerRef.current = setInterval(() => setTimeLeft((current) => (current ?? 0) - 1), 1000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [submit, submitMutation.isPending, timeLeft])

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
    const secs = (seconds % 60).toString().padStart(2, '0')
    return `${minutes}:${secs}`
  }

  if (paperQuery.isLoading || attemptQuery.isLoading) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.paperStudio.jee} />
        <Text style={styles.loadingText}>{paperQuery.isLoading ? 'Loading interactive quiz' : 'Preparing your quiz attempt'}</Text>
      </AppScreen>
    )
  }

  if (paperQuery.isError || !paper || attemptQuery.isError || !activeAttempt) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ErrorState
          title={paperQuery.isError || !paper ? 'Could not load quiz' : 'Could not prepare this attempt'}
          message="Your answers are safe. Refresh and try again."
          onAction={() => void (paperQuery.isError || !paper ? paperQuery.refetch() : attemptQuery.refetch())}
        />
      </AppScreen>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.headerIcon, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={22} color={colors.white} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerKicker}>JEE interactive quiz</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>{paper.title}</Text>
        </View>
        {timeLeft !== null ? (
          <View style={[styles.timerPill, timeLeft < 300 && styles.timerPillWarning]}>
            <Text style={styles.timerText}>{formatTime(timeLeft)}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AnimatedCard style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryKicker}>Progress</Text>
              <Text style={styles.summaryTitle}>{answeredCount}/{paper.questions.length} answered</Text>
            </View>
            <View style={styles.marksPill}>
              <Text style={styles.marksText}>{paper.total_marks} marks</Text>
            </View>
          </View>
          {paper.instructions ? <Text style={styles.instructions}>{paper.instructions}</Text> : null}
          <AnimatedButton label={submitMutation.isPending ? 'Submitting...' : 'Submit quiz'} loading={submitMutation.isPending} onPress={() => submit()} />
        </AnimatedCard>

        {paper.questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            question={question}
            index={index}
            answer={answers[question.id]}
            onAnswer={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
            onAssist={(mode) => assistMutation.mutate({ questionId: question.id, mode })}
            assistText={assistByQuestion[question.id]}
            assistLoading={assistMutation.isPending && assistMutation.variables?.questionId === question.id}
          />
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingTop: spacing[8],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
    backgroundColor: colors.paperStudio.jee,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  headerCopy: {
    flex: 1,
  },
  headerKicker: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: colors.white,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
  },
  timerPill: {
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  timerPillWarning: {
    backgroundColor: 'rgba(239,68,68,0.35)',
  },
  timerText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  content: {
    padding: spacing[4],
    paddingBottom: spacing[12],
    gap: spacing[4],
  },
  summaryCard: {
    gap: spacing[4],
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  summaryKicker: {
    ...typography.roles.eyebrow,
    color: colors.paperStudio.jee,
  },
  summaryTitle: {
    ...typography.roles.title,
    color: colors.text,
    marginTop: spacing[1],
  },
  marksPill: {
    borderRadius: radius.full,
    backgroundColor: colors.warningSurface,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  marksText: {
    color: colors.paperStudio.jee,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  instructions: {
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
  questionTitleBlock: {
    flex: 1,
  },
  questionKicker: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  questionMarks: {
    color: colors.paperStudio.jee,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
    marginTop: spacing[1],
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 12,
    backgroundColor: colors.surface3,
    marginTop: spacing[1],
  },
  statusDotDone: {
    backgroundColor: colors.success,
  },
  questionImage: {
    width: '100%',
    minHeight: 220,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
  },
  questionText: {
    ...typography.roles.body,
    color: colors.text,
  },
  optionList: {
    gap: spacing[2],
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
  },
  optionSelected: {
    borderColor: colors.paperStudio.jee,
    backgroundColor: colors.warningSurface,
  },
  optionBadge: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    textAlign: 'center',
    lineHeight: 26,
    color: colors.textMuted,
    backgroundColor: colors.surface3,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  optionBadgeSelected: {
    color: colors.white,
    backgroundColor: colors.paperStudio.jee,
  },
  optionText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  optionTextSelected: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
  },
  booleanRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  booleanButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  booleanButtonSelected: {
    backgroundColor: colors.paperStudio.jee,
    borderColor: colors.paperStudio.jee,
  },
  booleanText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  booleanTextSelected: {
    color: colors.white,
  },
  textInput: {
    minHeight: 96,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  longInput: {
    minHeight: 140,
  },
  assistRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  assistButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.full,
    backgroundColor: colors.warningSurface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing[1],
  },
  assistLabel: {
    color: colors.paperStudio.jee,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  assistPanel: {
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
    gap: spacing[2],
  },
  assistText: {
    ...typography.roles.body,
    color: colors.textSecondary,
  },
  answerKey: {
    color: colors.success,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  pressed: {
    opacity: 0.78,
  },
})
