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
import { isLearnerRole } from '../../auth/roles'
import { AuthLogoMark } from '../../components/ui'
import type { ResultsStackParamList } from '../../navigation'
import { useAuthStore } from '../../stores/authStore'
import { colors, layout, radius, spacing, typography } from '../../theme'
import type { GradingResultItem } from '../../types'
import { downloadCheckedPaperPdf } from '../../utils/openProtectedDocument'
import {
  answerDisplay,
  buildCheckedPaperReport,
  buildCheckingEstimate,
  CHECKED_PAPER_POLL_INTERVAL_MS,
  checkedPaperTitle,
  formatReportDate,
  isCheckedPaperChecking,
  questionStatus,
  questionTypeLabel,
  readableMathText,
} from './checkedPaperDetailModel'

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
  checkingPercent,
  checkingTimeLabel,
  checkingOverdue,
  checkingPaused,
}: {
  percent: number | null
  score: number | null
  max: number | null
  checkingPercent: number
  checkingTimeLabel: string
  checkingOverdue: boolean
  checkingPaused: boolean
}) {
  const size = 88
  const stroke = 7
  const ringRadius = (size - stroke) / 2
  const circumference = Math.PI * 2 * ringRadius
  const isChecking = percent == null
  const checkingUncertain = isChecking && (checkingOverdue || checkingPaused)
  const progress = percent ?? (checkingUncertain ? 0 : checkingPercent)
  const estimateValue = checkingTimeLabel === 'Finishing up'
    ? 'Almost'
    : checkingTimeLabel.replace('≈ ', '').replace(' left', '')
  const checkingValue = checkingPaused ? 'Paused' : checkingOverdue ? 'Still' : estimateValue
  const checkingLabel = checkingPaused ? 'RETRYING' : checkingOverdue ? 'CHECKING' : 'EST. LEFT'
  return (
    <View
      style={styles.scoreRing}
      accessibilityLabel={isChecking
        ? checkingPaused
          ? 'Checking progress paused while Eduraa retries the connection'
          : checkingOverdue
            ? 'Still checking, taking longer than the original estimate'
            : `Checking progress, estimated ${checkingPercent} percent, ${checkingTimeLabel}`
        : `${percent} percent, ${score} out of ${max} marks`}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={ringRadius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <Circle
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
        />
      </Svg>
      <View style={styles.scoreRingCenter}>
        <Text style={[styles.scoreRingPercent, isChecking && styles.checkingTimeValue]}>
          {isChecking ? checkingValue : `${percent}%`}
        </Text>
        <Text style={styles.scoreRingMarks}>{isChecking ? checkingLabel : `${score ?? '-'} / ${max ?? '-'}`}</Text>
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

function ReportQuestionRow({ item, index, onPress }: { item: GradingResultItem; index: number; onPress: () => void }) {
  const status = questionStatus(item)
  const meta = STATUS_META[status]
  const number = item.question_number ?? index + 1
  const title = item.question_text ? readableMathText(item.question_text) : questionTypeLabel(item)
  const expected = answerDisplay(item.expected_answer)
  const detail = status === 'missed'
    ? `Not attempted${expected ? ` · Expected: ${readableMathText(expected)}` : ''}`
    : item.feedback || item.recommendation || `${meta.label} response`
  const preview = readableMathText(detail)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
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
        <Text style={styles.questionTitle} numberOfLines={2}>{title}</Text>
        <Text style={styles.questionDetail} numberOfLines={2}>{preview}</Text>
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
  const [progressClock, setProgressClock] = useState(() => Date.now())
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['checked-paper', id],
    queryFn: () => checkedPapersApi.getById(id),
    enabled: Boolean(id),
    refetchInterval: (activeQuery) => {
      const paper = activeQuery.state.data
      return paper && isCheckedPaperChecking(paper) ? CHECKED_PAPER_POLL_INTERVAL_MS : false
    },
    refetchIntervalInBackground: false,
    refetchOnMount: 'always',
  })

  useFocusEffect(useCallback(() => {
    if (focusedOnce.current && id) void refetch()
    focusedOnce.current = true
  }, [id, refetch]))

  const report = useMemo(() => data ? buildCheckedPaperReport(data) : null, [data])
  const isChecking = Boolean(data && isCheckedPaperChecking(data))
  const checkingEstimate = useMemo(
    () => buildCheckingEstimate(data?.created_at, progressClock),
    [data?.created_at, progressClock],
  )
  const pollingIssue = isChecking && isError
  const checkingContextLabel = pollingIssue
    ? 'Connection status'
    : checkingEstimate.isOverdue
      ? 'Grading status'
      : 'Estimated progress'
  const checkingContextValue = pollingIssue
    ? 'Retrying'
    : checkingEstimate.isOverdue
      ? 'Still checking'
      : 'Checking'

  useEffect(() => {
    if (!isChecking) return undefined
    setProgressClock(Date.now())
    const timer = setInterval(() => setProgressClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [isChecking])

  useEffect(() => {
    if (!data || isChecking || completionNotified.current || report?.percent == null) return
    completionNotified.current = true
    void queryClient.invalidateQueries({ queryKey: ['checked-papers'] })
    const topicIds = (data.grading_results ?? []).map((item) => item.topic_id || '').filter(Boolean)
    void prefetchAgenticLearning(queryClient, data.id, topicIds)
  }, [data, isChecking, queryClient, report?.percent])
  const goBack = () => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ResultsList')
  const openQuestion = (item: GradingResultItem, index: number) => navigation.navigate('QuestionEvidence', {
    checkedPaperId: id,
    questionId: item.question_id,
    questionIndex: index,
  })
  const openPaperWorkspace = () => {
    if (isStaff) navigation.getParent()?.navigate('StaffPapers')
    else navigation.getParent()?.navigate('Learning', {
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

  const title = checkedPaperTitle(data)
  const rawStatusLabel = (data.status || 'graded').replace(/_/g, ' ')
  const statusLabel = pollingIssue
    ? 'retrying'
    : isChecking && checkingEstimate.isOverdue
      ? 'still checking'
      : isChecking
        ? 'checking'
        : rawStatusLabel.includes('pending') && rawStatusLabel.includes('review')
          ? 'review pending'
          : rawStatusLabel

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
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={() => void refetch()} colors={[colors.accent]} tintColor={colors.accent} />}
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
            <Text style={styles.heroKicker}>Performance report</Text>
            <Text style={styles.heroTitle}>{report.headline}</Text>
            <View style={[styles.scoreStage, width < 380 && styles.scoreStageCompact]}>
              <ReportScoreRing
                percent={report.percent}
                score={report.totalScore}
                max={report.maxScore}
                checkingPercent={checkingEstimate.percent}
                checkingTimeLabel={checkingEstimate.timeLabel}
                checkingOverdue={checkingEstimate.isOverdue}
                checkingPaused={pollingIssue}
              />
              <View style={styles.scoreContext}>
                <Text style={styles.scoreContextLabel}>{isChecking ? checkingContextLabel : 'Score signal'}</Text>
                <Text style={styles.scoreContextValue}>{isChecking ? checkingContextValue : report.percent != null && report.percent >= 65 ? 'Strong foundation' : 'Focused repair'}</Text>
                {!isChecking ? (
                  <View style={styles.signalPill}>
                    <Ionicons name="analytics-outline" size={13} color="#93e2b7" />
                    <Text style={styles.signalPillText}>{report.questions.length ? `${report.questions.length} questions diagnosed` : 'Summary only'}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </LinearGradient>

          <View style={styles.reportSheet}>
            <View style={styles.grabber} />
            <View style={styles.diagnosis}>
              <View style={styles.diagnosisIcon}>
                <Ionicons name={pollingIssue ? 'cloud-offline-outline' : isChecking ? 'timer-outline' : 'bulb-outline'} size={20} color={pollingIssue ? colors.warning : colors.accentStrong} />
              </View>
              <View style={styles.diagnosisCopy}>
                <Text style={styles.diagnosisTitle}>
                  {pollingIssue ? 'Connection paused.' : isChecking && checkingEstimate.isOverdue ? 'Taking a little longer.' : report.diagnosisTitle}
                </Text>
                <Text style={styles.diagnosisText} numberOfLines={4}>
                  {pollingIssue
                    ? 'Your paper is safe. Eduraa will retry automatically when the connection returns.'
                    : isChecking && checkingEstimate.isOverdue
                      ? 'Your paper is still checking. This report will update automatically when it is ready.'
                      : report.diagnosisBody}
                </Text>
              </View>
            </View>

            <View style={styles.distribution}>
              <DistributionMetric label="Correct" value={isChecking ? null : report.correct} tone={colors.success} />
              <DistributionMetric label="Incorrect" value={isChecking ? null : report.wrong} tone={colors.danger} />
              <DistributionMetric label="Missed" value={isChecking ? null : report.missed} tone={colors.warning} />
            </View>

            {!isChecking ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isStaff ? 'Open paper workspace' : 'Start a focused repair practice'}
                onPress={openPaperWorkspace}
                style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
              >
                <Ionicons name={isStaff ? 'documents-outline' : 'play-outline'} size={17} color={colors.white} />
                <Text style={styles.primaryActionText}>{isStaff ? 'Open paper workspace' : 'Start a focused repair'}</Text>
              </Pressable>
            ) : null}

            <View style={styles.breakdownHeader}>
              <View>
                <Text style={styles.breakdownTitle}>Question breakdown</Text>
                <Text style={styles.breakdownHint}>
                  {isChecking
                    ? 'Answer-by-answer feedback will appear automatically.'
                    : isStaff
                      ? 'Open a row to connect feedback and source evidence.'
                      : 'Open a row to connect feedback, evidence, and review.'}
                </Text>
              </View>
              {!isChecking && report.questions.length ? <Text style={styles.breakdownCount}>View all {report.questions.length}</Text> : null}
            </View>

            {report.questions.length ? (
              <View style={styles.questionList}>
                {report.questions.map((item, index) => <ReportQuestionRow key={item.question_id || String(index)} item={item} index={index} onPress={() => openQuestion(item, index)} />)}
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
  checkingTimeValue: { color: '#d7ffea', fontSize: 19, lineHeight: 22 },
  scoreRingMarks: { maxWidth: 72, color: 'rgba(255,255,255,0.76)', fontFamily: typography.fonts.bodyBold, fontSize: 9, lineHeight: 11, marginTop: 2, textAlign: 'center' },
  scoreContext: { width: 142, gap: spacing[1] },
  scoreContextLabel: { color: 'rgba(255,255,255,0.62)', fontFamily: typography.fonts.bodyMedium, fontSize: 10, lineHeight: 13 },
  scoreContextValue: { color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 15, lineHeight: 18 },
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
  primaryAction: { minHeight: 44, borderRadius: 14, backgroundColor: '#07152d', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2] },
  primaryActionText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  breakdownHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing[3], marginTop: spacing[1] },
  breakdownTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 17 },
  breakdownHint: { maxWidth: 250, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 9, lineHeight: 12, marginTop: 1 },
  breakdownCount: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 9 },
  questionList: { borderTopWidth: 1, borderTopColor: '#eadfd1' },
  questionRow: { minHeight: 62, paddingVertical: spacing[2], flexDirection: 'row', alignItems: 'center', gap: spacing[3], borderBottomWidth: 1, borderBottomColor: '#eadfd1' },
  questionIndex: { width: 38, height: 38, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  questionIndexText: { fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  questionCopy: { flex: 1, minWidth: 0 },
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
