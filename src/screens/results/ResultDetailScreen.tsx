import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Circle } from 'react-native-svg'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { checkedPapersApi } from '../../api/checkedPapers'
import { prefetchAgenticLearning } from '../../api/agenticLearning'
import { papersApi } from '../../api/papers'
import { isLearnerRole } from '../../auth/roles'
import { AuthLogoMark, MathText } from '../../components/ui'
import type { ResultsStackParamList } from '../../navigation'
import { returnToCheckedPapers } from '../../navigation/paperResultsNavigation'
import { useAuthStore } from '../../stores/authStore'
import { colors, layout, radius, spacing, typography } from '../../theme'
import type { GradingResultItem } from '../../types'
import { downloadCheckedPaperPdf } from '../../utils/openProtectedDocument'
import {
  answerDisplay,
  buildCheckedPaperStageTimeline,
  buildCheckedPaperReport,
  CHECKED_PAPER_POLL_INTERVAL_MS,
  checkedPaperElapsedSeconds,
  checkedPaperTitle,
  formatCheckedPaperStopwatch,
  formatReportDate,
  hasUnreadTeacherReviewResponse,
  isCheckedPaperCheckFailed,
  isCheckedPaperChecking,
  pendingQuestionReviewItems,
  questionStatus,
  questionReviewLabel,
  questionTypeLabel,
  unreadQuestionReviewResponseItems,
} from './checkedPaperDetailModel'
import { loadSeenReviewResponseKeys } from './reviewNotificationState'
import { CHECKED_PAPER_EXPERIENCE_LABELS, buildTeacherPaperDecision, checkedPaperExperienceStatus, checkedPaperReviewExperienceStatus, checkingStageLabel } from '../workspace/checkedPaperPipelineModel'

type Route = RouteProp<ResultsStackParamList, 'ResultDetail'>
type Nav = NativeStackNavigationProp<ResultsStackParamList, 'ResultDetail'>

const STATUS_META = {
  correct: { label: 'Correct', tone: colors.success, surface: colors.successSurface },
  wrong: { label: 'Incorrect', tone: colors.danger, surface: colors.dangerSurface },
  missed: { label: 'Missed', tone: colors.warning, surface: colors.warningSurface },
  pending: { label: 'Pending', tone: colors.textMuted, surface: colors.backgroundMuted },
} as const

function ReportScoreRing({
  percent,
  score,
  max,
  checking,
  checkingPercent,
  checkingPaused,
  checkingStage,
}: {
  percent: number | null
  score: number | null
  max: number | null
  checking: boolean
  checkingPercent: number | null
  checkingPaused: boolean
  checkingStage: string
}) {
  const size = 88
  const stroke = 7
  const ringRadius = (size - stroke) / 2
  const circumference = Math.PI * 2 * ringRadius
  const isChecking = checking
  const progress = isChecking ? checkingPercent ?? 0 : percent ?? 0
  const checkingValue = checkingPercent == null ? '…' : `${Math.round(checkingPercent)}%`
  const checkingLabel = checkingPaused
    ? 'RETRYING'
    : 'CHECKING'
  return (
    <View
      style={styles.scoreRing}
      accessibilityLabel={isChecking
        ? checkingPaused
          ? 'Checking progress paused while Eduraa retries the connection'
          : checkingPercent == null
            ? checkingStage
            : `${checkingStage}, ${Math.round(checkingPercent)} percent complete`
        : `${percent} percent, ${score} out of ${max} marks`}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={ringRadius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        {!isChecking || checkingPercent != null ? <Circle
          cx={size / 2}
          cy={size / 2}
          r={ringRadius}
          fill="none"
          stroke={checkingPaused ? colors.textSoft : isChecking ? '#5eead4' : colors.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference - (Math.max(0, Math.min(100, progress)) / 100) * circumference}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        /> : null}
      </Svg>
      <View style={styles.scoreRingCenter}>
        <Text style={styles.scoreRingPercent}>
          {isChecking ? checkingValue : percent == null ? '—' : `${percent}%`}
        </Text>
        <Text style={styles.scoreRingMarks}>{isChecking ? checkingLabel : percent == null ? 'NEEDS INPUT' : `${score ?? '-'} / ${max ?? '-'}`}</Text>
      </View>
    </View>
  )
}

function DistributionMetric({ label, value, tone }: { label: string; value: number | null; tone: string }) {
  return (
    <View style={styles.distributionMetric} accessibilityLabel={value == null ? `${label} count pending` : `${value} ${label}`}>
      <View style={[styles.metricRail, { backgroundColor: tone }]} />
      <Text style={styles.distributionValue}>{value == null ? '--' : String(value).padStart(2, '0')}</Text>
      <Text style={styles.distributionLabel}>{label}</Text>
    </View>
  )
}

function ProcessingTimeline({
  stages,
}: {
  stages: ReturnType<typeof buildCheckedPaperStageTimeline>
}) {
  if (!stages.length) return null
  return (
    <View style={styles.timelinePanel}>
      <View style={styles.timelineHeader}>
        <View>
          <Text style={styles.timelineTitle}>Checking timeline</Text>
          <Text style={styles.timelineHint}>Time spent at each processing stage</Text>
        </View>
        <Ionicons name="time-outline" size={18} color={colors.accentStrong} />
      </View>
      <View style={styles.timelineList}>
        {stages.map((stage, index) => {
          const isLast = index === stages.length - 1
          const active = stage.state === 'active'
          const blocked = stage.state === 'blocked'
          const complete = stage.state === 'complete'
          const tone = blocked ? colors.danger : active ? colors.accent : complete ? colors.success : colors.textSoft
          const duration = stage.elapsedSeconds == null
            ? blocked ? 'Needs attention' : active ? 'In progress' : 'Waiting'
            : formatCheckedPaperStopwatch(stage.elapsedSeconds)
          return (
            <View
              key={stage.key}
              style={styles.timelineRow}
              accessible
              accessibilityLabel={`${stage.label}, ${blocked ? 'needs attention' : active ? 'in progress' : complete ? 'complete' : 'waiting'}, ${duration}`}
            >
              <View style={styles.timelineRail}>
                <View style={[styles.timelineNode, { borderColor: tone, backgroundColor: complete ? tone : '#fffaf2' }]}>
                  {complete ? <Ionicons name="checkmark" size={10} color={colors.white} /> : active ? <View style={[styles.timelinePulse, { backgroundColor: tone }]} /> : blocked ? <Ionicons name="alert" size={10} color={tone} /> : null}
                </View>
                {!isLast ? <View style={[styles.timelineConnector, complete && { backgroundColor: colors.success }]} /> : null}
              </View>
              <Text numberOfLines={1} style={[styles.timelineStageLabel, active && styles.timelineStageLabelActive]}>{stage.label}</Text>
              <Text style={[styles.timelineDuration, { color: tone }]}>{duration}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

function ReportQuestionRow({ item, index, teacherReplied, onPress }: { item: GradingResultItem; index: number; teacherReplied: boolean; onPress: () => void }) {
  const status = questionStatus(item)
  const meta = STATUS_META[status]
  const number = item.question_number ?? index + 1
  const title = item.question_text || questionTypeLabel(item)
  const expected = answerDisplay(item.expected_answer)
  const detail = status === 'missed'
    ? `Not attempted${expected ? ` · Expected: ${expected}` : ''}`
    : item.feedback || item.recommendation || `${meta.label} response`
  const preview = String(detail)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
  const reviewPending = Boolean(item.manual_review_requested && !item.manual_review_completed)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Question ${number}, ${meta.label}, ${item.score ?? '-'} out of ${item.max_score ?? '-'} marks. Open question evidence.`}
      onPress={onPress}
      style={({ pressed }) => [styles.questionRow, pressed && styles.pressed]}
    >
      <View style={[styles.questionIndex, { backgroundColor: meta.surface }]}>
        <Text style={[styles.questionIndexText, { color: meta.tone }]}>{String(number).padStart(2, '0')}</Text>
      </View>
      <View style={styles.questionCopy}>
        {teacherReplied || reviewPending ? (
          <View style={styles.questionReviewChip}>
            <Ionicons name={teacherReplied ? 'notifications-outline' : 'chatbox-ellipses-outline'} size={12} color={colors.accentStrong} />
            <Text style={styles.questionReviewChipText}>
              {teacherReplied ? `Teacher replied${reviewPending ? ' · review open' : ''}` : 'Review pending'}
            </Text>
          </View>
        ) : null}
        <MathText style={styles.questionTitle} value={title} />
        <MathText style={styles.questionDetail} value={preview} />
      </View>
      <View style={styles.questionScore}>
        <Text style={styles.questionScoreText}>{item.score ?? '-'}/{item.max_score ?? '-'}</Text>
        <Ionicons name="chevron-forward" size={15} color={colors.textSoft} />
      </View>
    </Pressable>
  )
}

function ResultState({ title, message, action, onAction }: { title: string; message: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.stateCard}>
      <View style={styles.stateIcon}><Ionicons name="document-text-outline" size={24} color={colors.accentStrong} /></View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {action && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={styles.stateButton}><Text style={styles.stateButtonText}>{action}</Text></Pressable> : null}
    </View>
  )
}

export default function ResultDetailScreen() {
  const { params } = useRoute<Route>()
  const navigation = useNavigation<Nav>()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const user = useAuthStore((state) => state.user)
  const isStaff = Boolean(user && !isLearnerRole(user.role))
  const id = params.checkedPaperId || params.submissionId || ''
  const focusedOnce = useRef(false)
  const completionNotified = useRef(false)
  const [manualRefreshing, setManualRefreshing] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [stopwatchNow, setStopwatchNow] = useState(() => Date.now())
  const [seenReviewResponseKeys, setSeenReviewResponseKeys] = useState<Set<string>>(new Set())
  const [seenReviewResponseKeysLoaded, setSeenReviewResponseKeysLoaded] = useState(false)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['checked-paper', id],
    queryFn: () => checkedPapersApi.getById(id),
    enabled: Boolean(id),
    refetchInterval: (activeQuery) => {
      const paper = activeQuery.state.data
      return paper && isCheckedPaperChecking(paper) ? CHECKED_PAPER_POLL_INTERVAL_MS : false
    },
    refetchIntervalInBackground: false,
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
  })

  useFocusEffect(useCallback(() => {
    if (focusedOnce.current && id) void refetch()
    focusedOnce.current = true
    if (!isStaff && user?.id) {
      setSeenReviewResponseKeysLoaded(false)
      void loadSeenReviewResponseKeys(user.id).then((keys) => {
        setSeenReviewResponseKeys(keys)
        setSeenReviewResponseKeysLoaded(true)
      })
    } else {
      setSeenReviewResponseKeysLoaded(true)
    }
  }, [id, isStaff, refetch, user?.id]))

  const report = useMemo(() => data ? buildCheckedPaperReport(data) : null, [data])
  const teacherDecision = useMemo(() => data ? buildTeacherPaperDecision(data) : null, [data])
  const isChecking = Boolean(data && isCheckedPaperChecking(data))
  const pipelineExperienceStatus = data ? checkedPaperExperienceStatus(data) : 'checking'
  const experienceStatus = data ? checkedPaperReviewExperienceStatus(data) : 'checking'
  const needsInput = experienceStatus === 'needs_input'
  const checkFailed = Boolean(data && isCheckedPaperCheckFailed(data))
  const reportedCheckingPercent = typeof data?.checking_progress_percent === 'number'
    && Number.isFinite(data.checking_progress_percent)
    ? Math.max(0, Math.min(100, Math.round(data.checking_progress_percent)))
    : null
  // Older checked-paper responses can omit the progress field while the
  // matching paper submission already exposes it.  Use that same canonical
  // value as a temporary fallback, rather than inventing client-side progress.
  const submissionProgressQuery = useQuery({
    queryKey: ['checked-paper-submission-progress', data?.id, data?.paper_id, data?.exam_id],
    queryFn: () => papersApi.getSubmission(data?.paper_id || '', {
      exam_id: data?.exam_id || undefined,
      attempt_id: data?.id,
    }),
    enabled: Boolean(data?.paper_id && isChecking && reportedCheckingPercent == null),
    refetchInterval: (activeQuery) => {
      const status = String(activeQuery.state.data?.grading_status || '').toLowerCase()
      return ['submitted', 'checking'].includes(status) ? CHECKED_PAPER_POLL_INTERVAL_MS : false
    },
    refetchIntervalInBackground: false,
    refetchOnMount: 'always',
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
  })
  const fallbackSubmission = submissionProgressQuery.data?.id === data?.id
    ? submissionProgressQuery.data
    : null
  const fallbackCheckingPercent = typeof fallbackSubmission?.checking_progress_percent === 'number'
    && Number.isFinite(fallbackSubmission.checking_progress_percent)
    ? Math.max(0, Math.min(100, Math.round(fallbackSubmission.checking_progress_percent)))
    : null
  const checkingPercent = reportedCheckingPercent ?? fallbackCheckingPercent
  const checkingStage = isChecking && pipelineExperienceStatus === 'ready_for_review'
    ? 'Preparing review details'
    : checkingStageLabel(data?.status, data?.processing_stage)
  const pollingIssue = isChecking && isError
  const checkingContextLabel = pollingIssue
    ? 'Connection status'
    : checkingPercent == null
      ? 'Current stage'
      : 'Checking progress'
  const checkingContextValue = pollingIssue
    ? 'Retrying'
    : checkingPercent == null
      ? checkingStage
      : 'Checking'
  const elapsedSeconds = data ? checkedPaperElapsedSeconds(data, stopwatchNow) : null
  const stopwatchLabel = elapsedSeconds == null ? null : formatCheckedPaperStopwatch(elapsedSeconds)
  const processingTimeline = data ? buildCheckedPaperStageTimeline(data, stopwatchNow) : []

  useEffect(() => {
    if (!isChecking || elapsedSeconds == null) return undefined
    setStopwatchNow(Date.now())
    const interval = setInterval(() => setStopwatchNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [data?.processing_timing?.started_at, elapsedSeconds == null, isChecking])

  useEffect(() => {
    if (!data || isChecking || completionNotified.current || report?.percent == null) return
    completionNotified.current = true
    void queryClient.invalidateQueries({ queryKey: ['checked-papers'] })
    const topicIds = (data.grading_results ?? []).map((item) => item.topic_id || '').filter(Boolean)
    void prefetchAgenticLearning(queryClient, data.id, topicIds)
  }, [data, isChecking, queryClient, report?.percent])
  const goBack = () => returnToCheckedPapers(navigation)
  const refreshManually = async () => {
    if (manualRefreshing) return
    setManualRefreshing(true)
    try {
      await Promise.all([
        refetch(),
        submissionProgressQuery.refetch(),
      ])
    } finally {
      setManualRefreshing(false)
    }
  }
  const openQuestion = (item: GradingResultItem, index: number) => navigation.navigate('QuestionEvidence', {
    checkedPaperId: id,
    questionId: item.question_id,
    questionIndex: index,
  })
  const openPaperWorkspace = () => {
    if (isStaff) navigation.navigate('CheckedPaperWorkspace', { checkedPaperId: id })
    else navigation.getParent()?.navigate('Home', {
      screen: 'AgenticLearning',
      params: { origin: 'checked-paper', checkedPaperId: id },
    })
  }
  const downloadReport = async () => {
    if (!data || isDownloading || isChecking) return
    setDownloadError(null)
    setIsDownloading(true)
    try {
      await downloadCheckedPaperPdf(data.id, `${checkedPaperTitle(data)}-checked-report`)
    } catch {
      setDownloadError('The PDF could not be downloaded. Check your connection and try again.')
    } finally {
      setIsDownloading(false)
    }
  }

  if (!id || !data || !report) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing[2] }]}>
        <View style={styles.stateSurface}>
          {isLoading ? <><ActivityIndicator color={colors.accent} size="large" /><Text style={styles.stateMessage}>Loading the performance report…</Text></> : (
            <ResultState
              title={!id ? 'No result selected' : 'Result unavailable'}
              message={!id ? 'Choose a checked paper to open its report.' : 'The report could not load. Your routes and paper access are unchanged.'}
              action={!id ? 'Back to results' : 'Retry'}
              onAction={!id ? () => navigation.navigate('ResultsList') : () => void refetch()}
            />
          )}
        </View>
      </View>
    )
  }

  if (checkFailed && !isStaff) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing[2] }]}>
        <View style={styles.stateSurface}>
          <ResultState
            title="Needs your input"
            message="Your paper is safe. Open it from Checked papers to review the specific item that needs you."
            action="Back to checked papers"
            onAction={() => navigation.navigate('ResultsList')}
          />
        </View>
      </View>
    )
  }

  const title = checkedPaperTitle(data)
  const pendingReviews = pendingQuestionReviewItems(data)
  const pendingReviewPreview = pendingReviews.slice(0, 3).map(({ item, index }) => questionReviewLabel(item, index)).join(', ')
  const pendingReviewTitle = `${pendingReviews.length} question review${pendingReviews.length === 1 ? '' : 's'} pending`
  const unreadResponses = isStaff || !seenReviewResponseKeysLoaded ? [] : unreadQuestionReviewResponseItems(data, seenReviewResponseKeys)
  const unreadResponsePreview = unreadResponses.slice(0, 3).map(({ item, index }) => questionReviewLabel(item, index)).join(', ')
  const unreadResponseTitle = `${unreadResponses.length} teacher response${unreadResponses.length === 1 ? '' : 's'}`
  const reviewNotificationItems = unreadResponses.length ? unreadResponses : pendingReviews
  const reviewNotificationTitle = unreadResponses.length ? unreadResponseTitle : pendingReviewTitle
  const reviewNotificationPreview = unreadResponses.length
    ? `${unreadResponsePreview}${pendingReviews.length ? ` · ${pendingReviews.length} review${pendingReviews.length === 1 ? '' : 's'} still pending` : ''}`
    : pendingReviewPreview
  const openFirstReviewNotification = () => {
    const target = reviewNotificationItems[0]
    if (!target) return
    navigation.navigate('QuestionEvidence', {
      checkedPaperId: id,
      questionId: target.item.question_id || undefined,
      questionIndex: target.index,
    })
  }
  const resultPublished = Boolean(data.results_published || data.release_status === 'published')
  const marksApproved = data.approval_status === 'approved'
  const teacherReleaseStage = resultPublished
    ? 'Published'
    : 'Not published'
  const statusLabel = pollingIssue
    ? 'Checking'
    : isChecking
      ? 'Checking'
      : isStaff && !isChecking
        ? teacherReleaseStage
        : isStaff && needsInput && teacherDecision
          ? teacherDecision.statusLabel
          : CHECKED_PAPER_EXPERIENCE_LABELS[experienceStatus]
  const reportHeadline = isStaff && !isChecking
    ? resultPublished
      ? 'Published to student.'
      : marksApproved
        ? 'Marks confirmed.\nNot published yet.'
        : needsInput && teacherDecision
          ? `${teacherDecision.title}.\nNot published yet.`
          : 'Suggested marks ready.\nNot published yet.'
    : report.headline
  const diagnosisTitle = isStaff && !isChecking
    ? resultPublished
      ? 'The student can see this result.'
      : marksApproved
        ? 'Ready to publish.'
        : needsInput && teacherDecision
          ? teacherDecision.title
          : 'Students cannot see this result yet.'
    : report.diagnosisTitle
  const diagnosisBody = isStaff && !isChecking
    ? resultPublished
      ? 'The confirmed marks and feedback are now visible to the student.'
      : marksApproved
        ? 'The marks are confirmed and remain private until you publish them.'
        : needsInput && teacherDecision
          ? `${teacherDecision.body} The result remains private until it is published.`
          : 'Review the suggested marks, confirm the result, then publish it when ready.'
    : report.diagnosisBody
  const primaryActionLabel = isStaff
    ? resultPublished
      ? 'View checked answers'
      : marksApproved
        ? 'Continue to publish'
        : needsInput && teacherDecision
          ? teacherDecision.actionLabel
          : 'Review and confirm marks'
    : 'Start a focused repair'

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing[2] }]}>
      <View style={styles.reportSurface}>
        <View style={[styles.identityRow, width < 380 && styles.identityRowCompact]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to checked papers" onPress={goBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={18} color={colors.white} />
          </Pressable>
          <AuthLogoMark size={width < 380 ? 34 : 38} />
          <View style={styles.identityCopy}>
            <Text style={styles.identityTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.identityMeta} numberOfLines={1}>{data.subject_name || 'Checked paper'} · {formatReportDate(data.updated_at || data.created_at)}</Text>
          </View>
          {!isChecking ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Download checked paper PDF"
              accessibilityHint="Downloads this checked paper report as a PDF."
              accessibilityState={{ busy: isDownloading, disabled: isDownloading }}
              disabled={isDownloading}
              onPress={() => void downloadReport()}
              style={({ pressed }) => [
                styles.headerDownloadButton,
                pressed && styles.headerDownloadButtonPressed,
                isDownloading && styles.headerDownloadButtonDisabled,
              ]}
            >
              {isDownloading ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Ionicons name="download-outline" size={19} color={colors.white} />
              )}
            </Pressable>
          ) : null}
          <View style={styles.finalPill}><View style={styles.pillDot} /><Text style={styles.finalPillText}>{statusLabel}</Text></View>
        </View>

        <ScrollView
          style={styles.reportScroll}
          contentContainerStyle={[styles.reportContent, { paddingBottom: layout.bottomTabHeight + insets.bottom + spacing[10] }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={manualRefreshing} onRefresh={() => void refreshManually()} colors={[colors.accent]} tintColor={colors.accent} />}
        >
          {downloadError ? (
            <View style={styles.downloadErrorBanner} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={17} color="#ffd9c3" />
              <Text style={styles.downloadErrorText}>{downloadError}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Dismiss download error" hitSlop={8} onPress={() => setDownloadError(null)}>
                <Ionicons name="close" size={17} color={colors.white} />
              </Pressable>
            </View>
          ) : null}
          <LinearGradient colors={['#07152d', '#0b1830', '#0d1a33']} style={styles.hero}>
            <Text style={styles.heroKicker}>{isStaff ? 'Teacher result' : 'Performance report'}</Text>
            <Text style={styles.heroTitle}>{reportHeadline}</Text>
            <View style={[styles.scoreStage, width < 380 && styles.scoreStageCompact]}>
              <ReportScoreRing
                percent={report.percent}
                score={report.totalScore}
                max={report.maxScore}
                checking={isChecking}
                checkingPercent={checkingPercent}
                checkingPaused={pollingIssue}
                checkingStage={checkingStage}
              />
              <View style={styles.scoreContext}>
                <Text style={styles.scoreContextLabel}>{isChecking ? checkingContextLabel : isStaff ? (resultPublished ? 'Final score' : 'Suggested score') : needsInput ? 'Paper status' : report.provisional ? 'Provisional score' : 'Score signal'}</Text>
                <Text style={styles.scoreContextValue}>{isChecking ? checkingContextValue : isStaff ? (resultPublished ? 'Visible to student' : marksApproved ? 'Ready to publish' : 'Waiting for confirmation') : needsInput ? 'Action needed' : report.percent != null && report.percent >= 65 ? 'Strong foundation' : 'Focused repair'}</Text>
                {stopwatchLabel ? (
                  <View
                    style={[styles.stopwatchPill, !isChecking && styles.stopwatchPillComplete]}
                    accessible
                    accessibilityLabel={isChecking ? `Checking elapsed time ${stopwatchLabel}` : `Paper checked in ${stopwatchLabel}`}
                  >
                    <Ionicons name={isChecking ? 'stopwatch-outline' : 'checkmark-circle-outline'} size={13} color={isChecking ? '#5eead4' : '#93e2b7'} />
                    <Text style={[styles.stopwatchText, !isChecking && styles.stopwatchTextComplete]}>
                      {isChecking ? 'Elapsed' : 'Checked in'} {stopwatchLabel}
                    </Text>
                  </View>
                ) : null}
                {!isChecking ? (
                  <View style={styles.signalPill}>
                    <Ionicons name={isStaff ? 'checkmark-circle-outline' : 'analytics-outline'} size={13} color="#93e2b7" />
                    <Text style={styles.signalPillText}>{report.questions.length ? `${report.questions.length} questions ${isStaff ? 'checked' : 'diagnosed'}` : 'Summary only'}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </LinearGradient>

          <View style={styles.reportSheet}>
            <View style={styles.grabber} />
            <View style={styles.diagnosis}>
              <View style={styles.diagnosisIcon}>
                <Ionicons name={pollingIssue ? 'cloud-offline-outline' : isChecking ? 'timer-outline' : isStaff ? resultPublished ? 'people-outline' : 'lock-closed-outline' : 'bulb-outline'} size={20} color={pollingIssue ? colors.warning : colors.accentStrong} />
              </View>
              <View style={styles.diagnosisCopy}>
                <Text style={styles.diagnosisTitle}>
                  {pollingIssue ? 'Connection paused.' : isChecking ? checkingStage : diagnosisTitle}
                </Text>
                <Text style={styles.diagnosisText} numberOfLines={4}>
                  {pollingIssue
                    ? 'Your paper is safe. Eduraa will retry automatically when the connection returns.'
                    : isChecking
                      ? 'Your paper is safe. This report updates automatically as Eduraa reaches each real processing milestone.'
                      : diagnosisBody}
                </Text>
              </View>
            </View>

            <View style={styles.distribution}>
              <DistributionMetric label="Correct" value={isChecking ? null : report.correct} tone={colors.success} />
              <DistributionMetric label="Incorrect" value={isChecking ? null : report.wrong} tone={colors.danger} />
              <DistributionMetric label="Missed" value={isChecking ? null : report.missed} tone={colors.warning} />
            </View>

            <ProcessingTimeline stages={processingTimeline} />

            {!isChecking ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={primaryActionLabel}
                onPress={openPaperWorkspace}
                style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
              >
                <Ionicons name={isStaff ? 'documents-outline' : 'play-outline'} size={17} color={colors.white} />
                <Text style={styles.primaryActionText}>{primaryActionLabel}</Text>
              </Pressable>
            ) : null}

            {reviewNotificationItems.length ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${reviewNotificationTitle}. ${reviewNotificationPreview}`}
                accessibilityHint="Opens the related review question."
                onPress={openFirstReviewNotification}
                style={({ pressed }) => [styles.reviewBanner, pressed && styles.pressed]}
              >
                <View style={styles.reviewBannerIcon}>
                  <Ionicons name="notifications-outline" size={17} color={colors.accentStrong} />
                </View>
                <View style={styles.reviewBannerCopy}>
                  <Text style={styles.reviewBannerTitle}>
                    {reviewNotificationTitle}
                  </Text>
                  <Text style={styles.reviewBannerText} numberOfLines={2}>
                    {reviewNotificationPreview || 'Open the related question review.'}
                  </Text>
                </View>
              </Pressable>
            ) : null}

            <View style={styles.breakdownHeader}>
              <View>
                <Text style={styles.breakdownTitle}>Question breakdown</Text>
                <Text style={styles.breakdownHint}>
                  {isChecking
                    ? 'Answer-by-answer feedback will appear automatically.'
                    : isStaff
                      ? 'Optional: open an answer to view its scan and marking.'
                      : 'Open a row to connect feedback, evidence, and review.'}
                </Text>
              </View>
              {!isChecking && report.questions.length ? <Text style={styles.breakdownCount}>View all {report.questions.length}</Text> : null}
            </View>

            {report.questions.length ? (
              <View style={styles.questionList}>
                {report.questions.map((item, index) => (
                  <ReportQuestionRow
                    key={item.question_id || String(index)}
                    item={item}
                    index={index}
                    teacherReplied={!isStaff && seenReviewResponseKeysLoaded && hasUnreadTeacherReviewResponse(item, index, data.id, seenReviewResponseKeys)}
                    onPress={() => openQuestion(item, index)}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.emptyQuestions}><Text style={styles.stateMessage}>Question evidence will appear when detailed grading is available.</Text></View>
            )}
          </View>
        </ScrollView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07152d' },
  reportSurface: { flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: '#07152d' },
  stateSurface: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffaf2', padding: spacing[5] },
  identityRow: { minHeight: 58, paddingHorizontal: spacing[3], flexDirection: 'row', alignItems: 'center', gap: spacing[2], backgroundColor: '#07152d' },
  identityRowCompact: { gap: spacing[1] },
  backButton: { width: 44, height: 44, borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  identityCopy: { flex: 1, minWidth: 0 },
  identityTitle: { color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 13, lineHeight: 17 },
  identityMeta: { color: 'rgba(255,255,255,0.62)', fontFamily: typography.fonts.bodyMedium, fontSize: 9, lineHeight: 13 },
  headerDownloadButton: { width: 44, height: 44, flexShrink: 0, borderRadius: radius.full, borderWidth: 0, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  headerDownloadButtonPressed: { backgroundColor: 'rgba(243,108,33,0.18)' },
  headerDownloadButtonDisabled: { opacity: 0.65 },
  finalPill: { minHeight: 28, maxWidth: 82, borderRadius: radius.full, paddingHorizontal: spacing[2], flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(241,100,35,0.13)' },
  pillDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent },
  finalPillText: { color: '#ffd9c3', fontFamily: typography.fonts.bodyBold, fontSize: 8, textTransform: 'uppercase', flexShrink: 1 },
  reportScroll: { flex: 1 },
  reportContent: { flexGrow: 1 },
  downloadErrorBanner: { minHeight: 48, marginHorizontal: spacing[4], marginTop: spacing[1], paddingHorizontal: spacing[3], borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,217,195,0.28)', backgroundColor: 'rgba(193,55,45,0.2)', flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  downloadErrorText: { flex: 1, color: '#ffd9c3', fontFamily: typography.fonts.bodyMedium, fontSize: 10, lineHeight: 14 },
  hero: { paddingHorizontal: spacing[4], paddingTop: spacing[2], paddingBottom: spacing[4], alignItems: 'center', overflow: 'hidden' },
  heroKicker: { color: '#ff8543', fontFamily: typography.fonts.bodyBold, fontSize: 9, letterSpacing: 1.35, textTransform: 'uppercase' },
  heroTitle: { maxWidth: 330, marginTop: spacing[1], color: colors.white, fontFamily: typography.fonts.heading, fontSize: 22, lineHeight: 23, textAlign: 'center' },
  scoreStage: { marginTop: spacing[3], flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[4] },
  scoreStageCompact: { gap: spacing[3] },
  scoreRing: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  scoreRingCenter: { position: 'absolute', alignItems: 'center' },
  scoreRingPercent: { color: colors.white, fontFamily: typography.fonts.heading, fontSize: 22, lineHeight: 24 },
  scoreRingMarks: { maxWidth: 72, color: 'rgba(255,255,255,0.76)', fontFamily: typography.fonts.bodyBold, fontSize: 9, lineHeight: 11, marginTop: 2, textAlign: 'center' },
  scoreContext: { width: 142, gap: spacing[1] },
  scoreContextLabel: { color: 'rgba(255,255,255,0.62)', fontFamily: typography.fonts.bodyMedium, fontSize: 10, lineHeight: 13 },
  scoreContextValue: { color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 15, lineHeight: 18 },
  stopwatchPill: { alignSelf: 'flex-start', minHeight: 26, paddingHorizontal: spacing[2], borderRadius: radius.full, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(45,212,191,0.12)' },
  stopwatchPillComplete: { backgroundColor: 'rgba(44,188,116,0.12)' },
  stopwatchText: { color: '#99f6e4', fontFamily: typography.fonts.bodyBold, fontSize: 9, fontVariant: ['tabular-nums'] },
  stopwatchTextComplete: { color: '#93e2b7' },
  signalPill: { alignSelf: 'flex-start', minHeight: 28, paddingHorizontal: spacing[2], borderRadius: radius.full, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(44,188,116,0.12)' },
  signalPillText: { color: '#93e2b7', fontFamily: typography.fonts.bodyBold, fontSize: 8 },
  reportSheet: { marginTop: -10, minHeight: 500, paddingHorizontal: spacing[4], paddingBottom: spacing[8], borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#fffaf2', gap: spacing[2] },
  grabber: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: spacing[2], marginBottom: spacing[1], backgroundColor: '#cdbda9' },
  diagnosis: { flexDirection: 'row', gap: spacing[3], paddingBottom: spacing[2], borderBottomWidth: 1, borderBottomColor: '#eadfd1' },
  diagnosisIcon: { width: 40, height: 40, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff0e5' },
  diagnosisCopy: { flex: 1, minWidth: 0 },
  diagnosisTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 15, lineHeight: 19 },
  diagnosisText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 16, marginTop: 3 },
  distribution: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#eadfd1', paddingBottom: spacing[2] },
  distributionMetric: { flex: 1, minWidth: 0, paddingHorizontal: spacing[2], alignItems: 'center' },
  metricRail: { width: 20, height: 2, borderRadius: 1, marginBottom: spacing[2] },
  distributionValue: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 16, lineHeight: 18, textAlign: 'center' },
  distributionLabel: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 8, letterSpacing: 0.7, textTransform: 'uppercase', marginTop: 2, textAlign: 'center' },
  timelinePanel: { borderWidth: 1, borderColor: '#eadfd1', borderRadius: 16, backgroundColor: '#fffdf8', paddingHorizontal: spacing[3], paddingTop: spacing[3], paddingBottom: spacing[2] },
  timelineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[2] },
  timelineTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 13, lineHeight: 17 },
  timelineHint: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 9, lineHeight: 12, marginTop: 1 },
  timelineList: { gap: 0 },
  timelineRow: { minHeight: 34, flexDirection: 'row', alignItems: 'flex-start' },
  timelineRail: { width: 24, alignSelf: 'stretch', alignItems: 'center' },
  timelineNode: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  timelinePulse: { width: 6, height: 6, borderRadius: 3 },
  timelineConnector: { position: 'absolute', top: 18, bottom: 0, width: 2, backgroundColor: '#ded3c6' },
  timelineStageLabel: { flex: 1, minWidth: 0, paddingTop: 1, paddingHorizontal: spacing[2], color: colors.textSecondary, fontFamily: typography.fonts.bodyBold, fontSize: 10, lineHeight: 16 },
  timelineStageLabelActive: { color: colors.text },
  timelineDuration: { minWidth: 66, paddingTop: 1, fontFamily: typography.fonts.bodyBold, fontSize: 10, lineHeight: 16, fontVariant: ['tabular-nums'], textAlign: 'right' },
  primaryAction: { minHeight: 44, borderRadius: 14, backgroundColor: '#07152d', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2] },
  primaryActionText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  reviewBanner: { minHeight: 58, borderRadius: 16, borderWidth: 1, borderColor: '#f8c979', backgroundColor: '#fff8e7', paddingHorizontal: spacing[3], paddingVertical: spacing[2], flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  reviewBannerIcon: { width: 34, height: 34, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff0cf' },
  reviewBannerCopy: { flex: 1, minWidth: 0 },
  reviewBannerTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 12, lineHeight: 16 },
  reviewBannerText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 9, lineHeight: 13, marginTop: 2 },
  breakdownHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing[3], marginTop: spacing[1] },
  breakdownTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 17 },
  breakdownHint: { maxWidth: 250, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 9, lineHeight: 12, marginTop: 1 },
  breakdownCount: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 9 },
  questionList: { borderTopWidth: 1, borderTopColor: '#eadfd1' },
  questionRow: { minHeight: 62, paddingVertical: spacing[2], flexDirection: 'row', alignItems: 'center', gap: spacing[3], borderBottomWidth: 1, borderBottomColor: '#eadfd1' },
  questionIndex: { width: 38, height: 38, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  questionIndexText: { fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  questionCopy: { flex: 1, minWidth: 0 },
  questionReviewChip: { alignSelf: 'flex-start', minHeight: 22, borderRadius: radius.full, paddingHorizontal: spacing[2], flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff0cf', borderWidth: 1, borderColor: '#f8c979', marginBottom: spacing[1] },
  questionReviewChipText: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 8 },
  questionTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 12 },
  questionDetail: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 9, marginTop: 3 },
  questionScore: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  questionScoreText: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  emptyQuestions: { minHeight: 110, alignItems: 'center', justifyContent: 'center', padding: spacing[4] },
  pressed: { opacity: 0.76 },
  stateCard: { width: '100%', alignItems: 'center', gap: spacing[3], padding: spacing[5], borderRadius: 24, backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border },
  stateIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSurface },
  stateTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 20, textAlign: 'center' },
  stateMessage: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  stateButton: { minHeight: 44, borderRadius: radius.full, paddingHorizontal: spacing[5], backgroundColor: '#07152d', alignItems: 'center', justifyContent: 'center' },
  stateButtonText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
})
