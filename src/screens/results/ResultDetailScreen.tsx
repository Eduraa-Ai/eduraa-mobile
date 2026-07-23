import React, { useCallback, useMemo, useRef } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Circle } from 'react-native-svg'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { checkedPapersApi } from '../../api/checkedPapers'
import { isLearnerRole } from '../../auth/roles'
import { AuthLogoMark } from '../../components/ui'
import type { ResultsStackParamList } from '../../navigation'
import { useAuthStore } from '../../stores/authStore'
import { colors, layout, radius, spacing, typography } from '../../theme'
import type { GradingResultItem } from '../../types'
import {
  buildCheckedPaperReport,
  checkedPaperTitle,
  formatReportDate,
  questionStatus,
  questionTypeLabel,
  readableMathText,
} from './checkedPaperDetailModel'

type Route = RouteProp<ResultsStackParamList, 'ResultDetail'>
type Nav = NativeStackNavigationProp<ResultsStackParamList, 'ResultDetail'>

const STATUS_META = {
  correct: { label: 'Correct', tone: colors.success, surface: colors.successSurface },
  partial: { label: 'Partial', tone: colors.warning, surface: colors.warningSurface },
  missed: { label: 'Missed', tone: colors.danger, surface: colors.dangerSurface },
  pending: { label: 'Pending', tone: colors.textMuted, surface: colors.backgroundMuted },
} as const

function ReportScoreRing({ percent, score, max }: { percent: number | null; score: number | null; max: number | null }) {
  const size = 88
  const stroke = 7
  const ringRadius = (size - stroke) / 2
  const circumference = Math.PI * 2 * ringRadius
  const progress = percent ?? 0
  return (
    <View style={styles.scoreRing} accessibilityLabel={percent == null ? 'Score pending' : `${percent} percent, ${score} out of ${max} marks`}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={ringRadius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={ringRadius}
          fill="none"
          stroke={colors.accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference - (Math.max(0, Math.min(100, progress)) / 100) * circumference}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.scoreRingCenter}>
        <Text style={styles.scoreRingPercent}>{percent == null ? '--' : `${percent}%`}</Text>
        <Text style={styles.scoreRingMarks}>{score ?? '-'} / {max ?? '-'}</Text>
      </View>
    </View>
  )
}

function DistributionMetric({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={styles.distributionMetric} accessibilityLabel={`${value} ${label}`}>
      <View style={[styles.metricRail, { backgroundColor: tone }]} />
      <Text style={styles.distributionValue}>{String(value).padStart(2, '0')}</Text>
      <Text style={styles.distributionLabel}>{label}</Text>
    </View>
  )
}

function ReportQuestionRow({ item, index, onPress }: { item: GradingResultItem; index: number; onPress: () => void }) {
  const status = questionStatus(item)
  const meta = STATUS_META[status]
  const number = item.question_number ?? index + 1
  const title = item.question_text ? readableMathText(item.question_text) : questionTypeLabel(item)
  const detail = item.feedback || item.recommendation || `${meta.label} response`
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
        <Text style={styles.questionDetail} numberOfLines={2}>{readableMathText(detail)}</Text>
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
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const user = useAuthStore((state) => state.user)
  const isStaff = Boolean(user && !isLearnerRole(user.role))
  const id = params.checkedPaperId || params.submissionId || ''
  const focusedOnce = useRef(false)
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['checked-paper', id],
    queryFn: () => checkedPapersApi.getById(id),
    enabled: Boolean(id),
  })

  useFocusEffect(useCallback(() => {
    if (focusedOnce.current && id) void refetch()
    focusedOnce.current = true
  }, [id, refetch]))

  const report = useMemo(() => data ? buildCheckedPaperReport(data) : null, [data])
  const goBack = () => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('ResultsList')
  const openQuestion = (item: GradingResultItem, index: number) => navigation.navigate('QuestionEvidence', {
    checkedPaperId: id,
    questionId: item.question_id,
    questionIndex: index,
  })
  const openPaperWorkspace = () => {
    if (isStaff) navigation.getParent()?.navigate('StaffPapers')
    else navigation.getParent()?.navigate('Papers', { screen: 'GeneratePaper' })
  }

  const intro = (
    <View style={styles.pageIntro}>
      <Text style={styles.pageOverline}>CHECKED PAPERS · ASSESSMENT INTELLIGENCE</Text>
      <Text style={styles.pageTitle}>Performance report</Text>
      <Text style={styles.pageSubtitle}>A score becomes a diagnosis, then one clear recovery action.</Text>
    </View>
  )

  if (!id || isLoading || isError || !data || !report) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing[2] }]}>
        {intro}
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
  const statusLabel = (data.status || 'graded').replace(/_/g, ' ')

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing[2] }]}>
      {intro}
      <View style={styles.reportSurface}>
        <View style={styles.identityRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to checked papers" onPress={goBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={18} color={colors.white} />
          </Pressable>
          <AuthLogoMark size={38} />
          <View style={styles.identityCopy}>
            <Text style={styles.identityTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.identityMeta} numberOfLines={1}>{data.subject_name || 'Checked paper'} · {formatReportDate(data.updated_at || data.created_at)}</Text>
          </View>
          <View style={styles.finalPill}><View style={styles.pillDot} /><Text style={styles.finalPillText}>{statusLabel}</Text></View>
        </View>

        <ScrollView
          style={styles.reportScroll}
          contentContainerStyle={[styles.reportContent, { paddingBottom: layout.bottomTabHeight + insets.bottom + spacing[10] }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={() => void refetch()} colors={[colors.accent]} tintColor={colors.accent} />}
        >
          <LinearGradient colors={['#07152d', '#0b1830', '#0d1a33']} style={styles.hero}>
            <Text style={styles.heroKicker}>Performance report</Text>
            <Text style={styles.heroTitle}>{report.headline}</Text>
            <View style={[styles.scoreStage, width < 380 && styles.scoreStageCompact]}>
              <ReportScoreRing percent={report.percent} score={report.totalScore} max={report.maxScore} />
              <View style={styles.scoreContext}>
                <Text style={styles.scoreContextLabel}>Current signal</Text>
                <Text style={styles.scoreContextValue}>{report.percent == null ? 'Checking' : report.percent >= 65 ? 'Strong foundation' : 'Focused repair'}</Text>
                <View style={styles.signalPill}><Ionicons name="analytics-outline" size={13} color="#93e2b7" /><Text style={styles.signalPillText}>{report.questions.length ? `${report.questions.length} questions diagnosed` : 'Summary only'}</Text></View>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.reportSheet}>
            <View style={styles.grabber} />
            <View style={styles.diagnosis}>
              <View style={styles.diagnosisIcon}><Ionicons name="sparkles" size={20} color={colors.accentStrong} /></View>
              <View style={styles.diagnosisCopy}>
                <Text style={styles.diagnosisTitle}>{report.diagnosisTitle}</Text>
                <Text style={styles.diagnosisText} numberOfLines={4}>{report.diagnosisBody}</Text>
              </View>
            </View>

            <View style={styles.distribution}>
              <DistributionMetric label="Correct" value={report.correct} tone={colors.success} />
              <DistributionMetric label="Partial" value={report.partial} tone={colors.warning} />
              <DistributionMetric label="Missed" value={report.missed} tone={colors.danger} />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isStaff ? 'Open paper workspace' : 'Start a focused repair practice'}
              onPress={openPaperWorkspace}
              style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
            >
              <Ionicons name={isStaff ? 'documents-outline' : 'play-outline'} size={17} color={colors.white} />
              <Text style={styles.primaryActionText}>{isStaff ? 'Open paper workspace' : 'Start a focused repair'}</Text>
            </Pressable>

            <View style={styles.breakdownHeader}>
              <View><Text style={styles.breakdownTitle}>Question breakdown</Text><Text style={styles.breakdownHint}>{isStaff ? 'Open a row to connect feedback and source evidence.' : 'Open a row to connect feedback, evidence, and review.'}</Text></View>
              <Text style={styles.breakdownCount}>View all {report.questions.length}</Text>
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
  root: { flex: 1, gap: spacing[2], backgroundColor: '#dce3ea' },
  pageIntro: { paddingHorizontal: spacing[4], paddingBottom: 2, gap: 1, zIndex: 20, elevation: 20, backgroundColor: '#dce3ea' },
  pageOverline: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 8, lineHeight: 11, letterSpacing: 0.7 },
  pageTitle: { color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 19, lineHeight: 23 },
  pageSubtitle: { color: colors.textSecondary, fontFamily: typography.fonts.bodyMedium, fontSize: 10, lineHeight: 13 },
  reportSurface: { flex: 1, minHeight: 0, marginHorizontal: spacing[3], borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden', backgroundColor: '#07152d', borderWidth: 1, borderColor: 'rgba(7,21,45,0.16)' },
  stateSurface: { flex: 1, marginHorizontal: spacing[3], borderTopLeftRadius: 28, borderTopRightRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffaf2', padding: spacing[5] },
  identityRow: { minHeight: 58, paddingHorizontal: spacing[3], flexDirection: 'row', alignItems: 'center', gap: spacing[2], backgroundColor: '#07152d' },
  backButton: { width: 44, height: 44, borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  identityCopy: { flex: 1, minWidth: 0 },
  identityTitle: { color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 13, lineHeight: 17 },
  identityMeta: { color: 'rgba(255,255,255,0.62)', fontFamily: typography.fonts.bodyMedium, fontSize: 9, lineHeight: 13 },
  finalPill: { minHeight: 28, maxWidth: 92, borderRadius: radius.full, paddingHorizontal: spacing[2], flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(241,100,35,0.13)' },
  pillDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent },
  finalPillText: { color: '#ffd9c3', fontFamily: typography.fonts.bodyBold, fontSize: 8, textTransform: 'uppercase', flexShrink: 1 },
  reportScroll: { flex: 1 },
  reportContent: { flexGrow: 1 },
  hero: { paddingHorizontal: spacing[4], paddingTop: spacing[2], paddingBottom: spacing[4], alignItems: 'center', overflow: 'hidden' },
  heroKicker: { color: '#ff8543', fontFamily: typography.fonts.bodyBold, fontSize: 9, letterSpacing: 1.35, textTransform: 'uppercase' },
  heroTitle: { maxWidth: 330, marginTop: spacing[1], color: colors.white, fontFamily: typography.fonts.heading, fontSize: 22, lineHeight: 23, textAlign: 'center' },
  scoreStage: { marginTop: spacing[3], flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[4] },
  scoreStageCompact: { gap: spacing[3] },
  scoreRing: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  scoreRingCenter: { position: 'absolute', alignItems: 'center' },
  scoreRingPercent: { color: colors.white, fontFamily: typography.fonts.heading, fontSize: 22, lineHeight: 24 },
  scoreRingMarks: { color: 'rgba(255,255,255,0.66)', fontFamily: typography.fonts.bodyBold, fontSize: 9, marginTop: 2 },
  scoreContext: { width: 142, gap: spacing[1] },
  scoreContextLabel: { color: 'rgba(255,255,255,0.55)', fontFamily: typography.fonts.bodyMedium, fontSize: 9 },
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
  distributionMetric: { flex: 1, minWidth: 0, paddingHorizontal: spacing[2] },
  metricRail: { width: 20, height: 2, borderRadius: 1, marginBottom: spacing[2] },
  distributionValue: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 16, lineHeight: 18 },
  distributionLabel: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 8, letterSpacing: 0.7, textTransform: 'uppercase', marginTop: 2 },
  primaryAction: { minHeight: 44, borderRadius: 14, backgroundColor: '#07152d', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2] },
  primaryActionText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  breakdownHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing[3], marginTop: spacing[1] },
  breakdownTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 17 },
  breakdownHint: { maxWidth: 250, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 8, lineHeight: 11, marginTop: 1 },
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
