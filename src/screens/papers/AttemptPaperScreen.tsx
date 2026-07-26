import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image,
  TextInput, Platform
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useRoute, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { PapersStackParamList } from '../../navigation'
import { papersApi } from '../../api/papers'
import apiClient, { API_BASE_URL, getAccessToken } from '../../api/client'
import { colors } from '../../theme/colors'
import { spacing, radius, shadows } from '../../theme/spacing'
import { typography } from '../../theme/typography'
import type { AnswerEntry, MatchColumnsOptions, MCQOption, QuestionInPaper } from '../../types'
import { MathText } from '../../components/ui'

type Nav = NativeStackNavigationProp<PapersStackParamList, 'AttemptPaper'>
type Route = RouteProp<PapersStackParamList, 'AttemptPaper'>
type SubmitOutcome = {
  kind: 'submitted' | 'existing' | 'saved' | 'error'
  title: string
  message: string
  submissionId?: string
  scoreText?: string
}

function resolveAssetUrl(url?: string | null) {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`
}

const DIFFERENTIAL_COMMA_RE = /(?<=[0-9A-Za-z)\]}])\s*,\s*d([A-Za-z])(?![A-Za-z])/g
const BRACKETED_MATH_RE = /(?<!\\)\[\s*([\s\S]{6,}?)\s*(?<!\\)\](?!\()/g
const MATH_SIGNAL_RE = /\\[A-Za-z]+|[_^{}]|(?:\d|[A-Za-z])\s*[=<>+\-*/]\s*(?:\d|[A-Za-z])/
const HOLD_DURATION_MS = 3000
const HOLD_TICK_MS = 50

const superscriptMap: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  n: 'ⁿ',
}

const subscriptMap: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
}

const greekMap: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  phi: 'φ',
  omega: 'ω',
  Delta: 'Δ',
  Omega: 'Ω',
}

function looksLikeMath(value: string) {
  const compact = value.trim()
  if (compact.length < 6) return false
  if (compact.startsWith('http://') || compact.startsWith('https://')) return false
  return MATH_SIGNAL_RE.test(compact)
}

function normalizeMathMarkdown(value: string) {
  const repaired = (value || '')
    .replace(DIFFERENTIAL_COMMA_RE, '\\,d$1')
    .replace(BRACKETED_MATH_RE, (match, expr: string) => {
      const trimmed = expr.trim()
      return looksLikeMath(trimmed) ? `\\[${trimmed}\\]` : match
    })
    .replace(/\\\[(.*?)\\\]/gs, (_match, expr: string) => `$$${expr}$$`)
    .replace(/\\\((.*?)\\\)/gs, (_match, expr: string) => `$${expr}$`)

  return repaired
    .split(/(\$\$[\s\S]*?\$\$|\$[^$]*\$)/g)
    .map((part) => {
      if (part.startsWith('$')) return part
      return part.replace(
        /((?:\\[A-Za-z]+|[A-Za-z0-9{}^_+\-*/=(),])+?)(\\?)(?=([\s.;:!?)]|$))/g,
        (match, expr: string) => (expr.includes('\\') ? `$${expr}$` : match)
      )
    })
    .join('')
}

function toRaised(value: string) {
  const converted = value.split('').map((char) => superscriptMap[char] ?? '').join('')
  return converted || `^${value}`
}

function toLowered(value: string) {
  const converted = value.split('').map((char) => subscriptMap[char] ?? '').join('')
  return converted || `_${value}`
}

function readableMathText(value: string) {
  let next = normalizeMathMarkdown(value)
    .replace(/\$\$([\s\S]*?)\$\$/g, (_match, expr: string) => ` ${expr} `)
    .replace(/\$([^$]*?)\$/g, (_match, expr: string) => ` ${expr} `)
    .replace(/\\(?:dfrac|tfrac|frac)\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\(?:mathrm|text|operatorname)\{([^{}]+)\}/g, '$1')
    .replace(/\\left|\\right/g, '')
    .replace(/\\,/g, ' ')
    .replace(/\\;/g, ' ')
    .replace(/\\:/g, ' ')
    .replace(/\\quad|\\qquad/g, ' ')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\leq?/g, '≤')
    .replace(/\\geq?/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\approx/g, '≈')
    .replace(/\\infty/g, '∞')
    .replace(/\\%/g, '%')
    .replace(/\\circ/g, '°')

  Object.entries(greekMap).forEach(([latex, symbol]) => {
    next = next.replace(new RegExp(`\\\\${latex}\\b`, 'g'), symbol)
  })

  return next
    .replace(/\^\s*\\?circ\b/g, '°')
    .replace(/\^\s*deg\b/g, '°')
    .replace(/\^\{([^{}]+)\}/g, (_match, exponent: string) => toRaised(exponent))
    .replace(/_\{([^{}]+)\}/g, (_match, subscript: string) => toLowered(subscript))
    .replace(/\^([0-9+\-=()n])/g, (_match, exponent: string) => toRaised(exponent))
    .replace(/_([0-9+\-=()])/g, (_match, subscript: string) => toLowered(subscript))
    .replace(/[{}]/g, '')
    .replace(/\\([A-Za-z]+)/g, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatQuestionType(value: QuestionInPaper['question_type']) {
  if (value === 'mcq') return 'MCQ'
  if (value === 'true_false') return 'True / False'
  if (value === 'fill_blank') return 'Fill blank'
  if (value === 'short_answer') return 'Short answer'
  if (value === 'long_answer') return 'Long answer'
  return 'Match columns'
}

function isMCQOptions(options: QuestionInPaper['options']): options is MCQOption[] {
  return Array.isArray(options)
}

function isMatchColumnsOptions(options: QuestionInPaper['options']): options is MatchColumnsOptions {
  return Boolean(options && !Array.isArray(options) && 'left' in options && 'right' in options)
}

function AuthenticatedQuestionImage({ uri, alt }: { uri: string; alt?: string | null }) {
  const normalizedUri = useMemo(() => resolveAssetUrl(uri), [uri])
  const [token, setToken] = useState<string | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    getAccessToken()
      .then((value) => {
        if (active) setToken(value)
      })
      .catch(() => {
        if (active) setToken(null)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'web' || !normalizedUri || !normalizedUri.startsWith(API_BASE_URL)) {
      setObjectUrl(null)
      setFailed(false)
      return
    }

    let nextObjectUrl: string | null = null
    let active = true
    setFailed(false)
    setObjectUrl(null)

    apiClient
      .get<Blob>(normalizedUri, { responseType: 'blob' })
      .then((response) => {
        if (!active) return
        nextObjectUrl = URL.createObjectURL(response.data)
        setObjectUrl(nextObjectUrl)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl)
    }
  }, [normalizedUri])

  if (!normalizedUri || failed) {
    return (
      <View style={styles.imageFallback}>
        <Ionicons name="image-outline" size={18} color={colors.textMuted} />
        <Text style={styles.imageFallbackText}>{alt || 'Question image unavailable'}</Text>
      </View>
    )
  }

  const imageSource =
    Platform.OS === 'web' && normalizedUri.startsWith(API_BASE_URL)
      ? objectUrl ? { uri: objectUrl } : null
      : { uri: normalizedUri, headers: token ? { Authorization: `Bearer ${token}` } : undefined }

  if (!imageSource) {
    return (
      <View style={styles.imageFallback}>
        <Ionicons name="image-outline" size={18} color={colors.textMuted} />
        <Text style={styles.imageFallbackText}>Loading question image</Text>
      </View>
    )
  }

  return <Image source={imageSource} accessibilityLabel={alt || undefined} style={styles.questionImage} resizeMode="contain" />
}

export default function AttemptPaperScreen() {
  const navigation = useNavigation<Nav>()
  const { params } = useRoute<Route>()
  const insets = useSafeAreaInsets()

  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [flagged, setFlagged] = useState<Record<string, boolean>>({})
  const [submitReviewOpen, setSubmitReviewOpen] = useState(false)
  const [submitHoldProgress, setSubmitHoldProgress] = useState(0)
  const [submitOutcome, setSubmitOutcome] = useState<SubmitOutcome | null>(null)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [startTime] = useState(Date.now())
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const submitHoldTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useLayoutEffect(() => {
    const parent = navigation.getParent()
    parent?.setOptions({ tabBarStyle: { display: 'none' } })
    return () => {
      parent?.setOptions({ tabBarStyle: undefined })
    }
  }, [navigation])

  const clearSubmitHoldTimer = useCallback(() => {
    if (submitHoldTimerRef.current) {
      clearInterval(submitHoldTimerRef.current)
      submitHoldTimerRef.current = null
    }
  }, [])

  const resetSubmitHold = useCallback(() => {
    clearSubmitHoldTimer()
    setSubmitHoldProgress(0)
  }, [clearSubmitHoldTimer])

  useEffect(() => {
    if (!submitReviewOpen) resetSubmitHold()
  }, [resetSubmitHold, submitReviewOpen])

  useEffect(() => resetSubmitHold, [resetSubmitHold])

  const { data: paper, isLoading } = useQuery({
    queryKey: ['paper', params.paperId],
    queryFn: () => papersApi.getById(params.paperId),
  })

  const submitMutation = useMutation({
    mutationFn: (answerList: AnswerEntry[]) =>
      papersApi.submit(params.paperId, {
        answers: answerList,
        exam_id: params.examId,
        time_taken_seconds: Math.floor((Date.now() - startTime) / 1000),
        mode: 'standard',
      }),
    onSuccess: (data) => {
      // Detect if backend silently returned an existing submission
      // (backend returns existing submission if already submitted for this paper)
      const submissionAge = Date.now() - new Date(data.created_at).getTime()
      const isExistingSubmission = submissionAge > 10_000 // older than 10s = already existed
      const gradingStatus = String((data as { grading_status?: string }).grading_status || '').toLowerCase()
      const isChecking = gradingStatus === 'submitted' || gradingStatus === 'checking'
      const scoreText = data.total_score != null && data.max_score ? `${data.total_score} / ${data.max_score}` : undefined

      if (isExistingSubmission) {
        setSubmitOutcome({
          kind: 'existing',
          title: 'Already submitted',
          message: 'This paper already has a recorded submission. Each paper can only be attempted once.',
          submissionId: data.id,
          scoreText,
        })
        return
      }

      setSubmitOutcome({
        kind: 'submitted',
        title: isChecking ? 'Paper submitted' : 'Paper submitted',
        message: isChecking
          ? "Your paper has been submitted. We'll notify you once checking is complete."
          : 'Your answers have been recorded and graded.',
        submissionId: data.id,
        scoreText,
      })
    },
    onError: async (err: any) => {
      const status = err?.response?.status
      const detail = err?.response?.data?.detail
      const errData = err?.response?.data

      // On 500, check if submission was actually saved (backend may fail during grading but save answers)
      if (status === 500) {
        try {
          const existing = await papersApi.getSubmission(params.paperId)
          if (existing?.id) {
            setSubmitOutcome({
              kind: 'saved',
              title: 'Paper submitted',
              message: 'Your answers were saved. Grading may take a moment, so check Results shortly.',
              submissionId: existing.id,
              scoreText: existing.total_score != null && existing.max_score ? `${existing.total_score} / ${existing.max_score}` : undefined,
            })
            return
          }
        } catch (_) {
          // submission not found, show generic error
        }
      }

      // Build a useful message
      let msg: string
      if (typeof detail === 'string') {
        msg = detail
      } else if (Array.isArray(detail)) {
        msg = detail.map((d: any) => d.msg || JSON.stringify(d)).join('\n')
      } else if (typeof errData === 'string') {
        msg = errData
      } else if (status === 500) {
        msg = 'The server encountered an error. Please try again.'
      } else if (status === 422) {
        msg = 'Invalid submission data. Please try again.'
      } else {
        msg = 'Submission failed. Please try again.'
      }

      setSubmitOutcome({
        kind: 'error',
        title: 'Submission failed',
        message: msg,
      })
    },
  })

  // Timer setup
  useEffect(() => {
    if (paper?.duration_minutes) {
      setTimeLeft(paper.duration_minutes * 60)
    }
  }, [paper])

  useEffect(() => {
    if (timeLeft === null) return
    if (timeLeft <= 0) {
      handleSubmit(true)
      return
    }
    timerRef.current = setInterval(() => setTimeLeft((t) => (t ?? 0) - 1), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [timeLeft])

  function doSubmit() {
    clearSubmitHoldTimer()
    setSubmitHoldProgress(0)
    setSubmitReviewOpen(false)
    const answerList: AnswerEntry[] = (paper?.questions || []).map((q) => ({
      question_id: q.id,
      response: answers[q.id] || '',
    }))
    submitMutation.mutate(answerList)
  }

  const handleSubmit = useCallback((autoSubmit = false) => {
    if (!autoSubmit) {
      setSubmitReviewOpen(true)
    } else {
      doSubmit()
    }
  }, [answers, paper])

  const startSubmitHold = () => {
    if (!submitReviewOpen || submitMutation.isPending || submitHoldTimerRef.current) return

    const startedAt = Date.now()
    submitHoldTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt
      const nextProgress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100)
      setSubmitHoldProgress(nextProgress)

      if (nextProgress >= 100) {
        doSubmit()
      }
    }, HOLD_TICK_MS)
  }

  const stopSubmitHold = () => {
    if (!submitHoldTimerRef.current) return
    resetSubmitHold()
  }

  const openSubmittedResult = () => {
    if (!submitOutcome?.submissionId) return
    navigation.getParent()?.navigate('Results', {
      screen: 'ResultDetail',
      params: { checkedPaperId: submitOutcome.submissionId },
    })
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0')
    const s = (secs % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  if (isLoading || !paper) {
    return (
      <View style={styles.center}>
        <View style={styles.loadingMark}>
          <Ionicons name="document-text-outline" size={22} color={colors.accent} />
        </View>
        <Text style={styles.loadingText}>Loading exam workspace</Text>
      </View>
    )
  }

  const answeredCount = paper.questions.filter((q) => (answers[q.id] || '').trim()).length
  const totalQuestions = paper.questions.length
  const progress = totalQuestions ? Math.round((answeredCount / totalQuestions) * 100) : 0
  const totalMarks = paper.questions.reduce((sum, question) => sum + (question.marks || 0), 0) || paper.total_marks
  const flaggedCount = Object.values(flagged).filter(Boolean).length
  const holdSecondsLeft = Math.max(0, Math.ceil(((100 - submitHoldProgress) / 100) * (HOLD_DURATION_MS / 1000)))

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[colors.slate[950], colors.slate[900], '#1d130f']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + spacing[3] }]}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.goBack()} style={styles.exitButton}>
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.78)" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>{paper.title}</Text>
            <Text style={styles.headerMeta} numberOfLines={1}>
              {[paper.subject_id ? 'Assessment' : 'Practice', `${totalMarks} marks`, `${totalQuestions} questions`].join(' / ')}
            </Text>
          </View>
          {timeLeft !== null ? (
            <View style={[styles.timer, timeLeft < 300 && styles.timerWarning]}>
              <Ionicons name="time-outline" size={14} color={timeLeft < 300 ? colors.white : colors.accent} />
              <Text style={styles.timerText}>{formatTime(timeLeft)}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.progressPanel}>
          <View style={styles.progressCopy}>
            <Text style={styles.progressEyebrow}>Exam progress</Text>
            <Text style={styles.progressTitle}>{answeredCount}/{totalQuestions} answered</Text>
          </View>
          <View style={styles.progressBadge}>
            <Text style={styles.progressBadgeText}>{progress}%</Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(4, progress)}%` }]} />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 112 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.examSummary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totalMarks}</Text>
            <Text style={styles.summaryLabel}>Marks</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{flaggedCount}</Text>
            <Text style={styles.summaryLabel}>Flagged</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{Math.max(0, totalQuestions - answeredCount)}</Text>
            <Text style={styles.summaryLabel}>Left</Text>
          </View>
        </View>

        {paper.questions.map((q, index) => (
          <View key={q.id} style={[styles.questionCard, answers[q.id] && styles.questionCardAnswered]}>
            <View style={styles.questionHeader}>
              <View style={styles.questionTitleRow}>
                <View style={[styles.questionNumBadge, answers[q.id] && styles.questionNumBadgeAnswered]}>
                  <Text style={[styles.questionNum, answers[q.id] && styles.questionNumAnswered]}>{String(index + 1).padStart(2, '0')}</Text>
                </View>
                <View style={styles.questionHeaderCopy}>
                  <Text style={styles.questionType}>{formatQuestionType(q.question_type)}</Text>
                  <Text style={styles.questionMarks}>{q.marks} {q.marks === 1 ? 'mark' : 'marks'}</Text>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setFlagged((current) => ({ ...current, [q.id]: !current[q.id] }))}
                style={[styles.flagButton, flagged[q.id] && styles.flagButtonActive]}
              >
                <Ionicons name={flagged[q.id] ? 'flag' : 'flag-outline'} size={15} color={flagged[q.id] ? colors.warning : colors.textMuted} />
              </TouchableOpacity>
            </View>
            {q.visual_payload?.asset_url ? (
              <AuthenticatedQuestionImage uri={q.visual_payload.asset_url} alt={q.visual_payload.alt_text || `Diagram for question ${index + 1}`} />
            ) : null}
            <MathText style={styles.questionText} value={q.question_text} />

            {q.question_type === 'mcq' && isMCQOptions(q.options) && (
              <View style={styles.mcqOptions}>
                {q.options.map((opt, i) => (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.mcqOption, answers[q.id] === opt.id && styles.mcqOptionSelected]}
                    onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                  >
                    <Text style={[styles.mcqLabel, answers[q.id] === opt.id && styles.mcqLabelSelected]}>
                      {String.fromCharCode(65 + i)}
                    </Text>
                    <MathText style={[styles.mcqText, answers[q.id] === opt.id && styles.mcqTextSelected]} value={opt.text} />
                    {answers[q.id] === opt.id ? <Ionicons name="checkmark-circle" size={18} color={colors.accent} /> : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {q.question_type === 'true_false' && (
              <View style={styles.tfRow}>
                {['True', 'False'].map((val) => (
                  <TouchableOpacity
                    key={val}
                    style={[styles.tfBtn, answers[q.id] === val && styles.tfBtnSelected]}
                    onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: val }))}
                  >
                    <Text style={[styles.tfText, answers[q.id] === val && styles.tfTextSelected]}>{val}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {['short_answer', 'long_answer', 'fill_blank'].includes(q.question_type) && (
              <TextInput
                style={[styles.textInput, q.question_type === 'long_answer' && styles.textInputLong]}
                placeholder={q.question_type === 'long_answer' ? 'Write your structured answer here...' : 'Type your answer here...'}
                placeholderTextColor={colors.subtle}
                multiline
                value={answers[q.id] || ''}
                onChangeText={(text) => setAnswers((prev) => ({ ...prev, [q.id]: text }))}
              />
            )}

            {q.question_type === 'match_columns' && isMatchColumnsOptions(q.options) ? (
              <View style={styles.matchBox}>
                <View style={styles.matchColumn}>
                  <Text style={styles.matchLabel}>Column A</Text>
                  {q.options.left.map((item, itemIndex) => <MathText key={`${item}-${itemIndex}`} style={styles.matchItem} value={`${itemIndex + 1}. ${item}`} />)}
                </View>
                <View style={styles.matchColumn}>
                  <Text style={styles.matchLabel}>Column B</Text>
                  {q.options.right.map((item, itemIndex) => <MathText key={`${item}-${itemIndex}`} style={styles.matchItem} value={`${String.fromCharCode(65 + itemIndex)}. ${item}`} />)}
                </View>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter matches, e.g. 1-A, 2-C"
                  placeholderTextColor={colors.subtle}
                  value={answers[q.id] || ''}
                  onChangeText={(text) => setAnswers((prev) => ({ ...prev, [q.id]: text }))}
                />
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>

      <View style={[styles.submitDock, { paddingBottom: insets.bottom + spacing[3] }]}>
        <View style={styles.dockCopy}>
          <Text style={styles.dockTitle}>{answeredCount}/{totalQuestions} complete</Text>
          <Text style={styles.dockMeta}>{flaggedCount ? `${flaggedCount} flagged for review` : 'Review once before submitting'}</Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.submitBtn, submitMutation.isPending && styles.submitBtnDisabled]}
          onPress={() => handleSubmit()}
          disabled={submitMutation.isPending}
        >
          <Text style={styles.submitBtnText}>{submitMutation.isPending ? 'Submitting' : 'Submit'}</Text>
          <Ionicons name="send" size={15} color={colors.white} />
        </TouchableOpacity>
      </View>

      {submitReviewOpen ? (
        <View style={styles.submitBackdrop}>
          <View style={[styles.submitSheet, { marginBottom: insets.bottom + spacing[4] }]}>
            <View style={styles.submitSheetIcon}>
              <Ionicons name="checkmark-done-outline" size={24} color={colors.accent} />
            </View>
            <Text style={styles.submitSheetTitle}>Ready to submit?</Text>
            <Text style={styles.submitSheetBody}>
              {answeredCount}/{totalQuestions} answered. {Math.max(0, totalQuestions - answeredCount)
                ? `${Math.max(0, totalQuestions - answeredCount)} unanswered question${Math.max(0, totalQuestions - answeredCount) === 1 ? '' : 's'} will be submitted blank.`
                : 'All questions are answered.'}
            </Text>
            <View style={styles.submitStatsRow}>
              <View style={styles.submitStat}>
                <Text style={styles.submitStatValue}>{answeredCount}</Text>
                <Text style={styles.submitStatLabel}>Answered</Text>
              </View>
              <View style={styles.submitStat}>
                <Text style={styles.submitStatValue}>{Math.max(0, totalQuestions - answeredCount)}</Text>
                <Text style={styles.submitStatLabel}>Left</Text>
              </View>
              <View style={styles.submitStat}>
                <Text style={styles.submitStatValue}>{flaggedCount}</Text>
                <Text style={styles.submitStatLabel}>Flagged</Text>
              </View>
            </View>
            <View style={styles.submitActions}>
              <TouchableOpacity activeOpacity={0.85} onPress={() => setSubmitReviewOpen(false)} style={styles.submitCancelButton}>
                <Text style={styles.submitCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.9}
                onPressIn={startSubmitHold}
                onPressOut={stopSubmitHold}
                onLongPress={startSubmitHold}
                delayLongPress={80}
                disabled={submitMutation.isPending}
                style={[styles.submitConfirmButton, submitMutation.isPending && styles.submitBtnDisabled]}
              >
                <View pointerEvents="none" style={[styles.submitHoldFill, { width: `${submitHoldProgress}%` }]} />
                <Text style={styles.submitConfirmText}>
                  {submitMutation.isPending ? 'Submitting' : submitHoldProgress > 0 ? `Hold... ${holdSecondsLeft}s` : 'Hold to submit'}
                </Text>
                <Ionicons name="send" size={15} color={colors.white} />
              </TouchableOpacity>
            </View>
            <Text style={styles.submitHoldHint}>Hold the submit button for 3 seconds to confirm.</Text>
          </View>
        </View>
      ) : null}

      {submitOutcome ? (
        <View style={styles.submitBackdrop}>
          <View style={[styles.submitSheet, { marginBottom: insets.bottom + spacing[4] }]}>
            <View style={[
              styles.submitSheetIcon,
              submitOutcome.kind === 'error' ? styles.submitSheetIconError : styles.submitSheetIconSuccess,
            ]}>
              <Ionicons
                name={submitOutcome.kind === 'error' ? 'alert-circle-outline' : submitOutcome.kind === 'existing' ? 'checkmark-done-outline' : 'checkmark-circle-outline'}
                size={25}
                color={submitOutcome.kind === 'error' ? colors.danger : colors.success}
              />
            </View>
            <Text style={styles.submitSheetTitle}>{submitOutcome.title}</Text>
            <Text style={styles.submitSheetBody}>{submitOutcome.message}</Text>
            {submitOutcome.scoreText ? (
              <View style={styles.submittedScoreBox}>
                <Text style={styles.submittedScoreLabel}>Score</Text>
                <Text style={styles.submittedScoreValue}>{submitOutcome.scoreText}</Text>
              </View>
            ) : submitOutcome.kind !== 'error' ? (
              <View style={styles.submittedStatusBox}>
                <Ionicons name="sync-outline" size={16} color={colors.success} />
                <Text style={styles.submittedStatusText}>Checking in progress</Text>
              </View>
            ) : null}
            <View style={styles.submitActions}>
              {submitOutcome.kind === 'error' ? (
                <>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => setSubmitOutcome(null)} style={styles.submitCancelButton}>
                    <Text style={styles.submitCancelText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      setSubmitOutcome(null)
                      setSubmitReviewOpen(true)
                    }}
                    style={styles.submitConfirmButton}
                  >
                    <Text style={styles.submitConfirmText}>Try again</Text>
                    <Ionicons name="refresh" size={15} color={colors.white} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('PapersList')} style={styles.submitCancelButton}>
                    <Text style={styles.submitCancelText}>Papers</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.9} onPress={openSubmittedResult} style={styles.submitConfirmButton}>
                    <Text style={styles.submitConfirmText}>View results</Text>
                    <Ionicons name="bar-chart" size={15} color={colors.white} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[3], backgroundColor: colors.background },
  loadingMark: {
    width: 52,
    height: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  loadingText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  header: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
    gap: spacing[3],
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  exitButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: colors.white,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
    lineHeight: 21,
  },
  headerMeta: {
    color: 'rgba(255,255,255,0.52)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  timer: {
    minHeight: 38,
    borderRadius: 14,
    paddingHorizontal: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  timerWarning: { backgroundColor: 'rgba(225,29,72,0.24)', borderColor: 'rgba(225,29,72,0.36)' },
  timerText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  progressPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[4],
    borderRadius: radius.xl,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  progressCopy: {
    gap: 2,
  },
  progressEyebrow: {
    color: 'rgba(255,255,255,0.46)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  progressTitle: {
    color: colors.white,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
    lineHeight: 22,
  },
  progressBadge: {
    minWidth: 58,
    height: 38,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  progressBadgeText: {
    color: colors.slate[950],
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  progressTrack: {
    height: 7,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  submitBtn: {
    minHeight: 48,
    borderRadius: 18,
    paddingHorizontal: spacing[5],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    backgroundColor: colors.slate[950],
  },
  submitBtnDisabled: {
    opacity: 0.62,
  },
  submitBtnText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  content: { padding: spacing[4], gap: spacing[4] },
  examSummary: {
    minHeight: 82,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[3],
    ...shadows.sm,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
  },
  summaryValue: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 21,
    lineHeight: 24,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  summaryDivider: {
    width: 1,
    height: 38,
    backgroundColor: colors.borderSubtle,
  },
  questionCard: {
    backgroundColor: colors.card,
    borderRadius: radius['2xl'],
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  questionCardAnswered: {
    borderColor: 'rgba(5,150,105,0.22)',
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  questionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flex: 1,
  },
  questionNumBadge: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  questionNumBadgeAnswered: {
    backgroundColor: colors.successSurface,
    borderColor: 'rgba(5,150,105,0.22)',
  },
  questionNum: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  questionNumAnswered: {
    color: colors.success,
  },
  questionHeaderCopy: {
    gap: 2,
  },
  questionType: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
  },
  questionMarks: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  flagButton: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  flagButtonActive: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
  },
  questionText: {
    color: colors.ink,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 24,
    marginBottom: spacing[4],
  },
  questionImage: {
    width: '100%',
    minHeight: 220,
    borderRadius: radius.lg,
    backgroundColor: colors.surface2,
    marginBottom: spacing[3],
  },
  imageFallback: {
    minHeight: 128,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    padding: spacing[4],
    marginBottom: spacing[3],
  },
  imageFallbackText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
    textAlign: 'center',
  },
  mcqOptions: { gap: spacing[2] },
  mcqOption: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  mcqOptionSelected: { borderColor: colors.accent, backgroundColor: colors.accentSurface },
  mcqLabel: {
    width: 28,
    height: 28,
    borderRadius: 14,
    textAlign: 'center',
    lineHeight: 28,
    fontFamily: typography.fonts.bodyBold,
    backgroundColor: colors.slate[200],
    color: colors.muted,
    fontSize: 12,
  },
  mcqLabelSelected: { backgroundColor: colors.accent, color: colors.white },
  mcqText: {
    flex: 1,
    color: colors.ink,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  mcqTextSelected: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
  },
  tfRow: { flexDirection: 'row', gap: spacing[3] },
  tfBtn: {
    flex: 1, height: 44, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  tfBtnSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  tfText: {
    color: colors.muted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  tfTextSelected: { color: colors.white },
  textInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg,
    padding: spacing[3],
    color: colors.ink,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
    minHeight: 60,
    backgroundColor: colors.surface2,
    textAlignVertical: 'top',
  },
  textInputLong: { minHeight: 120 },
  matchBox: {
    gap: spacing[3],
  },
  matchColumn: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
    gap: spacing[2],
  },
  matchLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  matchItem: {
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  submitDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    backgroundColor: 'rgba(248,250,252,0.96)',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  dockCopy: {
    flex: 1,
  },
  dockTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
  },
  dockMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    marginTop: 2,
  },
  submitBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 40,
    backgroundColor: 'rgba(2,6,23,0.48)',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing[4],
  },
  submitSheet: {
    borderRadius: radius['2xl'],
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[5],
    gap: spacing[3],
    ...shadows.lg,
  },
  submitSheetIcon: {
    width: 52,
    height: 52,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  submitSheetIconSuccess: {
    backgroundColor: colors.successSurface,
    borderColor: colors.successBorder,
  },
  submitSheetIconError: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
  },
  submitSheetTitle: {
    color: colors.text,
    fontFamily: typography.fonts.heading,
    fontSize: 23,
    lineHeight: 28,
  },
  submitSheetBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 20,
  },
  submitStatsRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  submittedScoreBox: {
    minHeight: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.successSurface,
    borderWidth: 1,
    borderColor: colors.successBorder,
    justifyContent: 'center',
    paddingHorizontal: spacing[4],
  },
  submittedScoreLabel: {
    color: colors.success,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  submittedScoreValue: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 23,
    lineHeight: 28,
    marginTop: spacing[1],
  },
  submittedStatusBox: {
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.successSurface,
    borderWidth: 1,
    borderColor: colors.successBorder,
    paddingHorizontal: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  submittedStatusText: {
    color: colors.success,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  submitStat: {
    flex: 1,
    minHeight: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  submitStatValue: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 19,
    lineHeight: 22,
  },
  submitStatLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: spacing[1],
  },
  submitActions: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[2],
  },
  submitCancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  submitCancelText: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  submitConfirmButton: {
    position: 'relative',
    flex: 1.25,
    minHeight: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing[2],
    backgroundColor: colors.slate[950],
    overflow: 'hidden',
  },
  submitHoldFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(249,115,22,0.42)',
  },
  submitConfirmText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
    zIndex: 1,
  },
  submitHoldHint: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
})
