import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Circle } from 'react-native-svg'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { ResultsStackParamList } from '../../navigation'
import { checkedPapersApi } from '../../api/checkedPapers'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import type { GradingResultItem } from '../../types'

type Route = RouteProp<ResultsStackParamList, 'ResultDetail'>
type Nav = NativeStackNavigationProp<ResultsStackParamList, 'ResultDetail'>

const QUESTION_TYPE_LABELS: Record<string, string> = {
  mcq: 'MCQ',
  short_answer: 'Short Answer',
  long_answer: 'Long Answer',
  fill_blank: 'Fill Blank',
  match_columns: 'Match Columns',
  true_false: 'True / False',
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
}

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

function toRaised(value: string) {
  const converted = value.split('').map((char) => superscriptMap[char] ?? '').join('')
  return converted || `^${value}`
}

function toLowered(value: string) {
  const converted = value.split('').map((char) => subscriptMap[char] ?? '').join('')
  return converted || `_${value}`
}

function readableMathText(value?: string | null) {
  if (!value) return ''
  let next = String(value)
    .replace(/\$\$([\s\S]*?)\$\$/g, (_match, expr: string) => ` ${expr} `)
    .replace(/\$([^$]*?)\$/g, (_match, expr: string) => ` ${expr} `)
    .replace(/\\(?:dfrac|tfrac|frac)\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\(?:mathrm|text|operatorname)\{([^{}]+)\}/g, '$1')
    .replace(/\\left|\\right/g, '')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\+\/-/g, '±')
    .replace(/\\leq?/g, '<=')
    .replace(/\\geq?/g, '>=')
    .replace(/\\neq/g, '!=')
    .replace(/\\approx/g, '≈')
    .replace(/\\infty/g, '∞')
    .replace(/\\%/g, '%')
    .replace(/\\circ/g, '°')
    .replace(/\\,/g, ' ')

  Object.entries(greekMap).forEach(([latex, label]) => {
    next = next.replace(new RegExp(`\\\\${latex}\\b`, 'g'), label)
  })

  return next
    .replace(/\^\s*\\?circ\b/g, '°')
    .replace(/\^\s*deg\b/g, '°')
    .replace(/\^\{([^{}]+)\}/g, (_match, exponent: string) => toRaised(exponent))
    .replace(/_\{([^{}]+)\}/g, (_match, subscript: string) => toLowered(subscript))
    .replace(/\^([0-9+\-=()n])/g, (_match, exponent: string) => toRaised(exponent))
    .replace(/_([0-9+\-=()])/g, (_match, subscript: string) => toLowered(subscript))
    .replace(/\s*=\s*/g, ' = ')
    .replace(/[{}]/g, '')
    .replace(/\\([A-Za-z]+)/g, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recent'
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function scoreTone(percent: number | null) {
  if (percent == null) return { label: 'Checking', tone: colors.warning, surface: colors.warningSurface, icon: 'time-outline' as const }
  if (percent >= 85) return { label: 'Excellent', tone: colors.success, surface: colors.successSurface, icon: 'trophy-outline' as const }
  if (percent >= 65) return { label: 'Strong', tone: colors.info, surface: colors.infoSurface, icon: 'trending-up-outline' as const }
  if (percent >= 40) return { label: 'Needs Practice', tone: colors.warning, surface: colors.warningSurface, icon: 'construct-outline' as const }
  return { label: 'Repair Plan', tone: colors.accent, surface: colors.accentSurface, icon: 'refresh-outline' as const }
}

function questionStatus(item: GradingResultItem) {
  const score = item.score ?? null
  const max = item.max_score ?? null
  if (score == null || max == null || max <= 0) {
    return { label: 'Pending', tone: colors.textMuted, surface: colors.backgroundMuted, icon: 'time-outline' as const }
  }
  if (score >= max) return { label: 'Correct', tone: colors.success, surface: colors.successSurface, icon: 'checkmark-circle' as const }
  if (score > 0) return { label: 'Partial', tone: colors.warning, surface: colors.warningSurface, icon: 'remove-circle' as const }
  return { label: 'Missed', tone: colors.danger, surface: colors.dangerSurface, icon: 'close-circle' as const }
}

function ScoreRing({ percent, score, max }: { percent: number | null; score?: number | null; max?: number | null }) {
  const size = 144
  const stroke = 12
  const radiusValue = (size - stroke) / 2
  const circumference = 2 * Math.PI * radiusValue
  const progress = percent == null ? 0 : Math.max(0, Math.min(100, percent))
  const tone = scoreTone(percent)

  return (
    <View style={scoreStyles.wrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={radiusValue} stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radiusValue}
          stroke={tone.tone}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference - (progress / 100) * circumference}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={scoreStyles.center}>
        <Text style={[scoreStyles.percent, { color: tone.tone }]}>{percent == null ? '--' : `${percent}%`}</Text>
        <Text style={scoreStyles.fraction}>{score ?? '-'} / {max ?? '-'}</Text>
      </View>
    </View>
  )
}

function MetricTile({ label, value, tone, icon }: { label: string; value: string | number; tone: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.metricTile}>
      <View style={[styles.metricIcon, { backgroundColor: `${tone}16` }]}>
        <Ionicons name={icon} size={15} color={tone} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

function QuestionCard({ item, index }: { item: GradingResultItem; index: number }) {
  const [expanded, setExpanded] = useState(index === 0)
  const rotateAnim = useRef(new Animated.Value(index === 0 ? 1 : 0)).current
  const status = questionStatus(item)
  const qNum = item.question_number ?? index + 1
  const typeLabel = QUESTION_TYPE_LABELS[item.question_type || ''] || (item.question_type || 'Question').replace(/_/g, ' ')
  const hasScore = item.score != null && item.max_score != null

  const toggle = () => {
    const next = !expanded
    setExpanded(next)
    Animated.spring(rotateAnim, {
      toValue: next ? 1 : 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 2,
    }).start()
  }

  const arrowRotation = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] })

  return (
    <View style={questionStyles.card}>
      <Pressable onPress={toggle} style={({ pressed }) => [questionStyles.header, pressed && styles.pressed]}>
        <View style={[questionStyles.numberBadge, { backgroundColor: status.surface, borderColor: `${status.tone}40` }]}>
          <Text style={[questionStyles.numberText, { color: status.tone }]}>Q{String(qNum).padStart(2, '0')}</Text>
        </View>
        <View style={questionStyles.headerCopy}>
          <View style={questionStyles.typeRow}>
            <Text style={questionStyles.typeText}>{typeLabel}</Text>
            <View style={[questionStyles.statusPill, { backgroundColor: status.surface }]}>
              <Ionicons name={status.icon} size={12} color={status.tone} />
              <Text style={[questionStyles.statusText, { color: status.tone }]}>{status.label}</Text>
            </View>
          </View>
          {item.question_text ? <Text style={questionStyles.previewText} numberOfLines={1}>{readableMathText(item.question_text)}</Text> : null}
        </View>
        <View style={questionStyles.scoreArea}>
          {hasScore ? <Text style={[questionStyles.scoreText, { color: status.tone }]}>{item.score}/{item.max_score}</Text> : null}
          <Animated.View style={{ transform: [{ rotate: arrowRotation }] }}>
            <Ionicons name="chevron-down" size={17} color={colors.textSoft} />
          </Animated.View>
        </View>
      </Pressable>

      {expanded ? (
        <View style={questionStyles.detail}>
          {item.question_text ? (
            <View style={questionStyles.block}>
              <Text style={questionStyles.blockLabel}>Question</Text>
              <Text style={questionStyles.bodyText}>{readableMathText(item.question_text)}</Text>
            </View>
          ) : null}

          <View style={questionStyles.answerGrid}>
            <View style={questionStyles.answerBlock}>
              <Text style={questionStyles.blockLabel}>Your Answer</Text>
              {item.response ? (
                <Text style={questionStyles.bodyText}>{readableMathText(item.response)}</Text>
              ) : (
                <Text style={questionStyles.emptyAnswer}>Not answered</Text>
              )}
            </View>

            {item.expected_answer ? (
              <View style={[questionStyles.answerBlock, questionStyles.expectedBlock]}>
                <Text style={[questionStyles.blockLabel, { color: colors.success }]}>Expected Answer</Text>
                <Text style={[questionStyles.bodyText, { color: colors.success }]}>{readableMathText(String(item.expected_answer))}</Text>
              </View>
            ) : null}
          </View>

          {item.feedback ? (
            <View style={questionStyles.feedbackBlock}>
              <View style={questionStyles.feedbackIcon}>
                <Ionicons name="sparkles" size={14} color={colors.info} />
              </View>
              <Text style={questionStyles.feedbackText}>{readableMathText(item.feedback)}</Text>
            </View>
          ) : null}

          {item.recommendation ? (
            <View style={questionStyles.tipBlock}>
              <View style={questionStyles.tipIcon}>
                <Ionicons name="bulb-outline" size={14} color={colors.warning} />
              </View>
              <Text style={questionStyles.tipText}>{readableMathText(item.recommendation)}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

export default function ResultDetailScreen() {
  const { params } = useRoute<Route>()
  const navigation = useNavigation<Nav>()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const id = params.checkedPaperId || params.submissionId || ''

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['checked-paper', id],
    queryFn: () => checkedPapersApi.getById(id),
    enabled: Boolean(id),
  })

  const reviewMutation = useMutation({
    mutationFn: () => checkedPapersApi.requestManualReview(id, { note: null, question_id: null }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['checked-paper', id] }),
        queryClient.invalidateQueries({ queryKey: ['checked-papers'] }),
      ])
    },
  })

  const fadeAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 360, useNativeDriver: true }).start()
  }, [fadeAnim])

  const model = useMemo(() => {
    const questions = data?.grading_results ?? []
    const maxScore = data?.max_score ?? null
    const totalScore = data?.total_score ?? null
    const percent = totalScore != null && maxScore != null && maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : null
    const correct = questions.filter((item) => item.score != null && item.max_score != null && item.max_score > 0 && item.score >= item.max_score).length
    const partial = questions.filter((item) => item.score != null && item.max_score != null && item.score > 0 && item.score < item.max_score).length
    const missed = questions.filter((item) => item.score === 0).length
    const unanswered = questions.filter((item) => !String(item.response ?? '').trim()).length
    const firstRepair = questions.find((item) => (item.score ?? 0) < (item.max_score ?? 0) && (item.recommendation || item.feedback))

    return { questions, percent, totalScore, maxScore, correct, partial, missed, unanswered, firstRepair }
  }, [data])

  const hPad = width < 380 ? spacing[4] : spacing[5]
  const tone = scoreTone(model.percent)
  const compactHero = width < 390

  if (!id) {
    return (
      <View style={styles.center}>
        <Ionicons name="document-outline" size={38} color={colors.textSoft} />
        <Text style={styles.emptyTitle}>No result selected</Text>
        <TouchableOpacity activeOpacity={0.86} style={styles.centerButton} onPress={() => navigation.navigate('ResultsList')}>
          <Text style={styles.centerButtonText}>Back to results</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.centerMeta}>Loading result detail</Text>
      </View>
    )
  }

  if (isError || !data) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={38} color={colors.danger} />
        <Text style={styles.emptyTitle}>Result unavailable</Text>
        <Text style={styles.centerMeta}>Refresh the result and try again.</Text>
        <TouchableOpacity activeOpacity={0.86} style={styles.centerButton} onPress={() => void refetch()}>
          <Text style={styles.centerButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const title = data.exam_name || data.subject_name || 'Checked paper'
  const subtitle = [data.subject_name, formatDate(data.created_at)].filter(Boolean).join(' / ')
  const statusLabel = (data.status || 'graded').replace(/_/g, ' ')
  const canPractice = model.missed > 0 || model.partial > 0 || model.unanswered > 0
  const canRequestReview = !data.manual_review_requested && data.status !== 'processing' && data.status !== 'uploaded'

  return (
    <Animated.View style={[styles.screen, { opacity: fadeAnim }]}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingHorizontal: hPad, paddingBottom: insets.bottom + 168 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('ResultsList')} style={styles.backButton}>
            <Ionicons name="arrow-back" size={16} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.topCopy}>
            <Text style={styles.topKicker}>Result detail</Text>
            <Text style={styles.topTitle} numberOfLines={1}>{title}</Text>
          </View>
        </View>

        <LinearGradient colors={[colors.slate[950], colors.slate[900], '#24140f']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroHeader}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroKicker}>Performance report</Text>
              <Text style={styles.heroTitle}>{title}</Text>
              <Text style={styles.heroMeta}>{subtitle}</Text>
            </View>
            <View style={[styles.gradePill, { backgroundColor: `${tone.tone}18`, borderColor: `${tone.tone}40` }]}>
              <Ionicons name={tone.icon} size={14} color={tone.tone} />
              <Text style={[styles.gradePillText, { color: tone.tone }]}>{tone.label}</Text>
            </View>
          </View>

          <View style={[styles.heroScoreRow, compactHero && styles.heroScoreRowCompact]}>
            <ScoreRing percent={model.percent} score={model.totalScore} max={model.maxScore} />
            <View style={[styles.heroMetrics, compactHero && styles.heroMetricsCompact]}>
              <MetricTile label="Correct" value={model.correct} tone={colors.success} icon="checkmark-circle" />
              <MetricTile label="Missed" value={model.missed} tone={colors.danger} icon="close-circle" />
            </View>
          </View>

          <View style={styles.statusRail}>
            <View style={styles.statusItem}>
              <Ionicons name="shield-checkmark-outline" size={15} color={colors.success} />
              <Text style={styles.statusText}>{statusLabel}</Text>
            </View>
            <View style={styles.statusItem}>
              <Ionicons name="list-outline" size={15} color={colors.info} />
              <Text style={styles.statusText}>{model.questions.length} questions</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.actionCard}>
          <View style={styles.actionIcon}>
            <Ionicons name={canPractice ? 'rocket-outline' : 'sparkles'} size={20} color={colors.accent} />
          </View>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>{canPractice ? 'Repair the missed concepts' : 'Keep the momentum'}</Text>
            <Text style={styles.actionText} numberOfLines={3}>
              {model.firstRepair?.recommendation || model.firstRepair?.feedback || data.grading_feedback || 'Review the breakdown below, then continue with another focused practice session.'}
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => navigation.getParent()?.navigate('Papers', { screen: 'GeneratePaper' })}
            style={styles.actionButton}
          >
            <Ionicons name="flash-outline" size={16} color={colors.white} />
          </TouchableOpacity>
        </View>

        <View style={[styles.reviewCard, data.manual_review_requested && styles.reviewCardDone]}>
          <View style={styles.reviewIcon}>
            <Ionicons
              name={data.manual_review_requested ? 'chatbubble-ellipses' : 'shield-checkmark-outline'}
              size={18}
              color={data.manual_review_requested ? colors.info : colors.accent}
            />
          </View>
          <View style={styles.reviewCopy}>
            <Text style={styles.reviewTitle}>
              {data.manual_review_requested ? 'Manual review requested' : 'Need a teacher review?'}
            </Text>
            <Text style={styles.reviewText}>
              {data.manual_review_requested
                ? 'Your request is in the teacher review queue.'
                : 'Send this graded paper for a manual check if the score or feedback needs another look.'}
            </Text>
            {reviewMutation.isError ? <Text style={styles.reviewError}>Could not send the request. Try again.</Text> : null}
          </View>
          {!data.manual_review_requested ? (
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={!canRequestReview || reviewMutation.isPending}
              onPress={() => reviewMutation.mutate()}
              style={[styles.reviewButton, (!canRequestReview || reviewMutation.isPending) && styles.reviewButtonDisabled]}
            >
              {reviewMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Text style={styles.reviewButtonText}>Request</Text>
                  <Ionicons name="send" size={14} color={colors.white} />
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.metricsGrid}>
          <MetricTile label="Partial" value={model.partial} tone={colors.warning} icon="remove-circle" />
          <MetricTile label="Unanswered" value={model.unanswered} tone={colors.info} icon="ellipse-outline" />
          <MetricTile label="Score" value={model.percent == null ? '--' : `${model.percent}%`} tone={tone.tone} icon="analytics-outline" />
        </View>

        {data.grading_feedback ? (
          <View style={styles.feedbackCard}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIcon}>
                <Ionicons name="sparkles" size={15} color={colors.info} />
              </View>
              <Text style={styles.sectionTitle}>AI feedback</Text>
            </View>
            <Text style={styles.feedbackText}>{readableMathText(data.grading_feedback)}</Text>
          </View>
        ) : null}

        <View style={styles.breakdownHeader}>
          <View>
            <Text style={styles.breakdownKicker}>Question breakdown</Text>
            <Text style={styles.breakdownHint}>Tap a row to inspect answer, feedback, and repair advice.</Text>
          </View>
          <Text style={styles.breakdownCount}>{model.questions.length}</Text>
        </View>

        {model.questions.length > 0 ? (
          <View style={styles.questionList}>
            {model.questions.map((item, index) => (
              <QuestionCard key={item.question_id || String(index)} item={item} index={index} />
            ))}
          </View>
        ) : (
          <View style={styles.emptyBreakdown}>
            <Ionicons name="hourglass-outline" size={20} color={colors.warning} />
            <Text style={styles.emptyBreakdownText}>Question-level grading will appear once checking completes.</Text>
          </View>
        )}
      </ScrollView>
    </Animated.View>
  )
}

const scoreStyles = StyleSheet.create({
  wrap: {
    width: 144,
    height: 144,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  percent: {
    fontFamily: typography.fonts.heading,
    fontSize: 31,
    lineHeight: 35,
  },
  fraction: {
    color: 'rgba(255,255,255,0.64)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
    marginTop: 2,
  },
})

const questionStyles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    overflow: 'hidden',
    ...shadows.xs,
  },
  header: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
  },
  numberBadge: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  numberText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing[1],
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    flexWrap: 'wrap',
  },
  typeText: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 14,
  },
  statusPill: {
    minHeight: 24,
    borderRadius: radius.full,
    paddingHorizontal: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
  },
  previewText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  scoreArea: {
    alignItems: 'flex-end',
    gap: spacing[1],
    minWidth: 44,
  },
  scoreText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  detail: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
    gap: spacing[3],
  },
  block: {
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[3],
    gap: spacing[2],
  },
  blockLabel: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  bodyText: {
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 21,
  },
  answerGrid: {
    gap: spacing[2],
  },
  answerBlock: {
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[3],
    gap: spacing[2],
  },
  expectedBlock: {
    backgroundColor: colors.successSurface,
    borderColor: colors.successBorder,
  },
  emptyAnswer: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    fontStyle: 'italic',
  },
  feedbackBlock: {
    borderRadius: radius.lg,
    backgroundColor: colors.infoSurface,
    borderWidth: 1,
    borderColor: colors.infoBorder,
    padding: spacing[3],
    flexDirection: 'row',
    gap: spacing[2],
  },
  feedbackIcon: {
    width: 28,
    height: 28,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  feedbackText: {
    flex: 1,
    color: colors.infoText,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 21,
  },
  tipBlock: {
    borderRadius: radius.lg,
    backgroundColor: colors.warningSurface,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    padding: spacing[3],
    flexDirection: 'row',
    gap: spacing[2],
  },
  tipIcon: {
    width: 28,
    height: 28,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  tipText: {
    flex: 1,
    color: colors.warningText,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 21,
  },
})

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: spacing[4],
    gap: spacing[4],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
    backgroundColor: colors.background,
    padding: spacing[6],
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
  },
  centerMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    textAlign: 'center',
  },
  centerButton: {
    minHeight: 44,
    borderRadius: radius.full,
    backgroundColor: colors.slate[950],
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
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.xs,
  },
  topCopy: {
    flex: 1,
    minWidth: 0,
  },
  topKicker: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  topTitle: {
    color: colors.text,
    fontFamily: typography.fonts.heading,
    fontSize: 20,
    lineHeight: 24,
  },
  hero: {
    borderRadius: radius['2xl'],
    padding: spacing[4],
    gap: spacing[4],
    overflow: 'hidden',
    ...shadows.lg,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
  },
  heroKicker: {
    color: 'rgba(255,255,255,0.50)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: colors.white,
    fontFamily: typography.fonts.heading,
    fontSize: 23,
    lineHeight: 28,
    marginTop: 2,
  },
  heroMeta: {
    color: 'rgba(255,255,255,0.64)',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    marginTop: spacing[1],
  },
  gradePill: {
    minHeight: 32,
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  gradePillText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  heroScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
  },
  heroScoreRowCompact: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing[3],
  },
  heroMetrics: {
    flex: 1,
    gap: spacing[2],
    alignSelf: 'stretch',
  },
  heroMetricsCompact: {
    flexDirection: 'row',
  },
  metricTile: {
    flex: 1,
    minWidth: 0,
    minHeight: 74,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[3],
    justifyContent: 'center',
    ...shadows.xs,
  },
  metricIcon: {
    width: 28,
    height: 28,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  metricValue: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 20,
    lineHeight: 23,
  },
  metricLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginTop: 2,
    flexShrink: 1,
  },
  statusRail: {
    minHeight: 44,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    paddingHorizontal: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  statusText: {
    color: 'rgba(255,255,255,0.76)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  actionCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    ...shadows.sm,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  actionCopy: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
  },
  actionText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing[1],
  },
  actionButton: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.slate[950],
  },
  reviewCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    ...shadows.sm,
  },
  reviewCardDone: {
    backgroundColor: colors.infoSurface,
    borderColor: colors.infoBorder,
  },
  reviewIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  reviewCopy: {
    flex: 1,
    minWidth: 0,
  },
  reviewTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
  },
  reviewText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing[1],
  },
  reviewError: {
    color: colors.danger,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    marginTop: spacing[2],
  },
  reviewButton: {
    minHeight: 40,
    minWidth: 94,
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    backgroundColor: colors.slate[950],
  },
  reviewButtonDisabled: {
    opacity: 0.52,
  },
  reviewButtonText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  feedbackCard: {
    borderRadius: radius.xl,
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[4],
    gap: spacing[3],
    ...shadows.sm,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.infoSurface,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
  },
  feedbackText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 21,
  },
  breakdownHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  breakdownKicker: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  breakdownHint: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    marginTop: 2,
  },
  breakdownCount: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 20,
  },
  questionList: {
    gap: spacing[3],
  },
  emptyBreakdown: {
    minHeight: 96,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    padding: spacing[5],
  },
  emptyBreakdownText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.82,
  },
})
