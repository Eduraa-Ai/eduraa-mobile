import React, { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AnimatedButton, AppScreen, EmptyState, ErrorState, SkeletonCard } from '../../components/ui'
import { dashboardApi, type DashboardPerformanceRow } from '../../api/dashboard'
import type { StaffWorkspaceStackParamList } from '../../navigation'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, spacing, typography } from '../../theme'
import { presentPdf } from '../../utils/pdfDownload'

type DetailTab = 'overview' | 'papers' | 'topics' | 'types'

const clampPercent = (value: unknown) => Math.max(0, Math.min(100, Number(value) || 0))
const percent = (value: unknown) => `${clampPercent(value).toFixed(1)}%`
const count = (value: unknown) => Math.max(0, Math.round(Number(value) || 0)).toLocaleString()
const date = (value?: string | null) => {
  if (!value) return 'Date unavailable'
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'Date unavailable' : parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
const errorMessage = (error: unknown, fallback: string) => {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' && detail.trim() ? detail : fallback
}
const isEmptyScopeError = (error: unknown) => {
  const response = (error as { response?: { status?: unknown; data?: { detail?: unknown } } })?.response
  return response?.status === 404 && response.data?.detail === 'No papers found for this scope.'
}

function DetailHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  )
}

function Metric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} adjustsFontSizeToFit numberOfLines={1}>{value}</Text>
      {helper ? <Text style={styles.metricHelper} numberOfLines={2}>{helper}</Text> : null}
    </View>
  )
}

function Section({ title, subtitle, children, last = false }: { title: string; subtitle?: string; children: React.ReactNode; last?: boolean }) {
  return (
    <View style={[styles.section, !last && styles.sectionDivider]}>
      <View><Text style={styles.sectionTitle}>{title}</Text>{subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}</View>
      {children}
    </View>
  )
}

function PerformanceRows({ rows, empty }: { rows: DashboardPerformanceRow[]; empty: string }) {
  if (!rows.length) return <EmptyState icon="analytics-outline" title={empty} body="More graded answers are needed before this analysis is available." />
  return <View>{rows.map((row, index) => (
    <View key={`${row.key}-${index}`} style={[styles.dataRow, index === rows.length - 1 && styles.dataRowLast]}>
      <View style={styles.dataCopy}><Text style={styles.dataTitle}>{row.key}</Text><Text style={styles.dataMeta}>{count(row.scored)}/{count(row.total)} marks</Text><View style={styles.track}><View style={[styles.fill, { width: `${clampPercent(row.accuracy)}%` }]} /></View></View>
      <Text style={styles.dataValue}>{percent(row.accuracy)}</Text>
    </View>
  ))}</View>
}

function TabBar({ value, onChange }: { value: DetailTab; onChange: (value: DetailTab) => void }) {
  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: 'overview', label: 'Overview' }, { id: 'papers', label: 'Papers' }, { id: 'topics', label: 'Topics' }, { id: 'types', label: 'Question types' },
  ]
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
      {tabs.map((tab) => <Pressable key={tab.id} accessibilityRole="tab" accessibilityState={{ selected: value === tab.id }} onPress={() => onChange(tab.id)} style={[styles.tab, value === tab.id && styles.tabSelected]}><Text style={[styles.tabText, value === tab.id && styles.tabTextSelected]}>{tab.label}</Text></Pressable>)}
    </ScrollView>
  )
}

export function DashboardStudentDetailScreen() {
  const navigation = useNavigation<any>()
  const { params } = useRoute<RouteProp<StaffWorkspaceStackParamList, 'DashboardStudentDetail'>>()
  const user = useAuthStore((state) => state.user)
  const canAccess = params.source === 'teacher'
    ? user?.role === 'teacher'
    : user?.role === 'principal' || user?.role === 'school_super_admin'
  const [tab, setTab] = useState<DetailTab>('overview')
  const query = useQuery({
    queryKey: ['analytics', 'dashboard-student', user?.id, user?.role, params.source, params.studentId, params.filters],
    queryFn: () => dashboardApi.getStudentDetail(params.studentId, params.source, params.filters),
    enabled: canAccess,
    retry: 1,
  })
  const reportMutation = useMutation({
    mutationFn: async (studentName: string) => presentPdf(await dashboardApi.downloadStudentReport(params.studentId, params.source, params.filters, studentName)),
  })

  if (!canAccess) return <AppScreen contentStyle={styles.screen}><EmptyState icon="lock-closed-outline" title="Student analysis not available" body="Only the teacher or institution head authorized for this dashboard can open this analysis." /></AppScreen>
  if (query.isLoading) return <AppScreen contentStyle={styles.screen}><SkeletonCard lines={3} /><SkeletonCard lines={5} /></AppScreen>
  if (query.isError && isEmptyScopeError(query.error)) {
    return (
      <AppScreen tone="auth" ambient={false} contentStyle={styles.emptyScreen}>
        <View style={styles.emptyIcon}><Ionicons name="analytics-outline" size={28} color={colors.accentStrong} /></View>
        <Text style={styles.emptyTitle}>No graded work in this scope</Text>
        <Text style={styles.emptyBody}>This student has no graded papers for the filters currently applied. Adjust the scope or return to the student list.</Text>
        <View style={styles.emptyActions}>
          <AnimatedButton label="Adjust filters" onPress={() => navigation.navigate('Dashboard', { openFilters: true })} />
          <AnimatedButton label="Back to students" variant="secondary" onPress={() => navigation.goBack()} />
        </View>
      </AppScreen>
    )
  }
  if (query.isError || !query.data) return <AppScreen contentStyle={styles.screen}><ErrorState title="Student analysis unavailable" message={errorMessage(query.error, 'Unable to load this student’s dashboard analysis.')} actionLabel="Try again" loading={query.isRefetching} onAction={() => void query.refetch()} /></AppScreen>
  const student = query.data
  const context = [student.standard, student.division].filter(Boolean).join(' · ') || 'Class details unavailable'

  return (
    <AppScreen tone="auth" ambient={false} contentStyle={styles.screen} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.accent} />}>
      <DetailHeader eyebrow="STUDENT ANALYSIS" title={student.student_name} subtitle={context} />
      <AnimatedButton label="Download report card" variant="secondary" loading={reportMutation.isPending} onPress={() => reportMutation.mutate(student.student_name)} />
      {reportMutation.isError ? <Text accessibilityRole="alert" style={styles.inlineError}>{errorMessage(reportMutation.error, 'The report card could not be downloaded. Try again.')}</Text> : null}
      <TabBar value={tab} onChange={setTab} />
      {tab === 'overview' ? <>
        <View style={styles.metrics}><Metric label="Average" value={percent(student.average_percent)} /><Metric label="Class rank" value={student.class_rank ? `#${student.class_rank}` : '—'} helper={`${count(student.class_size)} students`} /><Metric label="Percentile" value={student.percentile == null ? '—' : `${student.percentile}th`} /><Metric label="Best score" value={student.best_score == null ? '—' : percent(student.best_score)} /><Metric label="Growth" value={student.growth_percent == null ? '—' : `${student.growth_percent > 0 ? '+' : ''}${student.growth_percent.toFixed(1)}%`} helper={student.growth_direction || 'No trend yet'} /><Metric label="Completion" value={`${count(student.submissions_count)}/${count(student.completion_total)}`} /></View>
        <View style={styles.surface}>
          <Section title="Learning consistency" subtitle="How steadily this student performs across attempts."><View style={styles.summaryLine}><Text style={styles.summaryValue}>{student.consistency_percent == null ? '—' : percent(student.consistency_percent)}</Text><Text style={styles.summaryMeta}>Consistency · deviation {student.consistency_std_dev == null ? '—' : student.consistency_std_dev.toFixed(1)}</Text></View></Section>
          <Section title="Recent submissions" subtitle="Latest graded activity." last>{student.recent_submissions.length ? student.recent_submissions.slice(0, 5).map((item, index) => <View key={item.submission_id} style={[styles.dataRow, index === Math.min(4, student.recent_submissions.length - 1) && styles.dataRowLast]}><View style={styles.dataCopy}><Text style={styles.dataTitle}>{item.paper_title}</Text><Text style={styles.dataMeta}>{date(item.submitted_at)} · {count(item.score)}/{count(item.max_score)} marks</Text></View><Text style={styles.dataValue}>{percent(item.percent)}</Text></View>) : <EmptyState icon="document-text-outline" title="No submissions yet" body="Recent results will appear after graded work is available." />}</Section>
        </View>
      </> : null}
      {tab === 'papers' ? <View style={styles.surface}><Section title="Paper history" subtitle="Score, class comparison, and rank by paper." last>{student.paper_history.length ? student.paper_history.map((item, index) => <View key={`${item.paper_id}-${index}`} style={[styles.dataRow, index === student.paper_history.length - 1 && styles.dataRowLast]}><View style={styles.dataCopy}><Text style={styles.dataTitle}>{item.paper_title}</Text><Text style={styles.dataMeta}>{item.subject_name || 'Paper'} · class avg {percent(item.class_average_percent)} · rank {item.rank ? `#${item.rank}` : '—'}</Text></View><Text style={styles.dataValue}>{percent(item.percent)}</Text></View>) : <EmptyState icon="documents-outline" title="No paper history" body="Completed papers will appear here." />}</Section></View> : null}
      {tab === 'topics' ? <View style={styles.surface}><Section title="Topic mastery" subtitle="Strongest to weakest topic performance."><PerformanceRows rows={[...student.topic_mastery].sort((a, b) => b.accuracy - a.accuracy)} empty="No topic analysis" /></Section><Section title="Priority topics" subtitle="Areas needing the most support." last><PerformanceRows rows={student.weak_topics} empty="No priority topics" /></Section></View> : null}
      {tab === 'types' ? <View style={styles.surface}><Section title="Question-type accuracy" subtitle="Performance across answer formats."><PerformanceRows rows={[...student.question_type_performance].sort((a, b) => b.accuracy - a.accuracy)} empty="No question-type analysis" /></Section><Section title="Weak question types" subtitle="Formats to target next." last><PerformanceRows rows={student.weak_question_types} empty="No weak question types" /></Section></View> : null}
    </AppScreen>
  )
}

export function DashboardPaperDetailScreen() {
  const navigation = useNavigation<any>()
  const { params } = useRoute<RouteProp<StaffWorkspaceStackParamList, 'DashboardPaperDetail'>>()
  const user = useAuthStore((state) => state.user)
  const canAccess = user?.role === 'teacher'
  const query = useQuery({ queryKey: ['analytics', 'dashboard-paper', user?.id, user?.role, params.paperId, params.filters], queryFn: () => dashboardApi.getTeacherPaperDetail(params.paperId, params.filters), enabled: canAccess, retry: 1 })
  if (!canAccess) return <AppScreen contentStyle={styles.screen}><EmptyState icon="lock-closed-outline" title="Paper analysis not available" body="Paper-level dashboard analysis is available to the teacher who owns this reporting scope." /></AppScreen>
  if (query.isLoading) return <AppScreen contentStyle={styles.screen}><SkeletonCard lines={3} /><SkeletonCard lines={5} /></AppScreen>
  if (query.isError || !query.data) return <AppScreen contentStyle={styles.screen}><ErrorState title="Paper analysis unavailable" message={errorMessage(query.error, 'Unable to load this paper’s dashboard analysis.')} actionLabel="Try again" loading={query.isRefetching} onAction={() => void query.refetch()} /></AppScreen>
  const detail = query.data
  return (
    <AppScreen tone="auth" ambient={false} contentStyle={styles.screen} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={colors.accent} />}>
      <DetailHeader eyebrow="PAPER ANALYSIS" title={detail.paper.paper_title} subtitle={[detail.paper.subject_name, detail.paper.standard, detail.paper.division, date(detail.paper.display_date)].filter(Boolean).join(' · ')} />
      <View style={styles.metrics}><Metric label="Average" value={percent(detail.paper.average_percent)} /><Metric label="Pass rate" value={percent(detail.pass_rate)} /><Metric label="Submissions" value={count(detail.paper.submissions_count)} /><Metric label="Questions" value={count(detail.question_count)} /><Metric label="Highest" value={detail.paper.highest_score == null ? '—' : count(detail.paper.highest_score)} /><Metric label="Median" value={detail.median_score == null ? '—' : count(detail.median_score)} /></View>
      <View style={styles.surface}>
        <Section title="Score distribution" subtitle="How the class performed across score bands.">{detail.distribution.length ? detail.distribution.map((item, index) => <View key={`${item.label}-${index}`} style={[styles.dataRow, index === detail.distribution.length - 1 && styles.dataRowLast]}><Text style={styles.dataTitle}>{item.label}</Text><Text style={styles.dataValue}>{count(item.count)}</Text></View>) : <EmptyState icon="bar-chart-outline" title="No distribution yet" body="Score bands appear after graded submissions." />}</Section>
        <Section title="Topic accuracy" subtitle="Content areas measured by this paper."><PerformanceRows rows={detail.topic_accuracy} empty="No topic analysis" /></Section>
        <Section title="Question types" subtitle="Accuracy by answer format."><PerformanceRows rows={detail.question_type_accuracy} empty="No question-type analysis" /></Section>
        <Section title="Student results" subtitle="Tap a student for their complete analysis.">{detail.student_results.length ? detail.student_results.map((item, index) => <Pressable key={item.submission_id} accessibilityRole="button" onPress={() => navigation.navigate('DashboardStudentDetail', { studentId: item.student_id, source: 'teacher', filters: params.filters })} style={({ pressed }) => [styles.dataRow, index === detail.student_results.length - 1 && styles.dataRowLast, pressed && styles.pressed]}><View style={styles.rank}><Text style={styles.rankText}>#{item.rank}</Text></View><View style={styles.dataCopy}><Text style={styles.dataTitle}>{item.student_name}</Text><Text style={styles.dataMeta}>{count(item.score)}/{count(item.max_score)} marks · {item.status}</Text></View><Text style={styles.dataValue}>{percent(item.percent)}</Text><Ionicons name="chevron-forward" size={16} color={colors.textSubtle} /></Pressable>) : <EmptyState icon="people-outline" title="No student results" body="Student results appear after submissions are graded." />}</Section>
        <Section title="Recommendations" subtitle="Actions derived from this paper’s evidence." last>{detail.recommendations.length ? detail.recommendations.map((item, index) => <View key={`${item.title}-${index}`} style={[styles.recommendation, index === detail.recommendations.length - 1 && styles.dataRowLast]}><View style={styles.recommendationIcon}><Ionicons name="bulb-outline" size={17} color={colors.accentStrong} /></View><View style={styles.dataCopy}><Text style={styles.dataTitle}>{item.title}</Text><Text style={styles.dataMeta}>{item.detail}</Text></View></View>) : <EmptyState icon="bulb-outline" title="No recommendations yet" body="Recommendations appear when enough paper evidence is available." />}</Section>
      </View>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: { gap: spacing[5], paddingBottom: spacing[20] },
  emptyScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[4], paddingBottom: spacing[12] },
  emptyIcon: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: radius['2xl'], borderWidth: 1, borderColor: colors.borderBrand, backgroundColor: colors.accentSurface },
  emptyTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 21, textAlign: 'center' },
  emptyBody: { maxWidth: 310, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  emptyActions: { width: '100%', gap: spacing[3], marginTop: spacing[2] },
  header: { gap: spacing[1], paddingHorizontal: spacing[1], paddingTop: spacing[1] },
  eyebrow: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 11, letterSpacing: 1.5 },
  title: { color: colors.text, fontFamily: typography.fonts.heading, fontSize: 27, lineHeight: 32 },
  subtitle: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 13, lineHeight: 19 },
  tabs: { gap: spacing[2], paddingRight: spacing[5] },
  tab: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing[4], borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated },
  tabSelected: { borderColor: colors.text, backgroundColor: colors.text },
  tabText: { color: colors.textMuted, fontFamily: typography.fonts.bodySemibold, fontSize: 12 }, tabTextSelected: { color: colors.textOnBrand },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  metric: { width: '48.5%', minHeight: 104, justifyContent: 'space-between', padding: spacing[4], borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.backgroundElevated },
  metricLabel: { color: colors.textMuted, fontFamily: typography.fonts.bodySemibold, fontSize: 11 }, metricValue: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 26 }, metricHelper: { color: colors.textSoft, fontFamily: typography.fonts.bodyMedium, fontSize: 10 },
  surface: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  section: { gap: spacing[4], paddingVertical: spacing[5] }, sectionDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 18 }, sectionSubtitle: { marginTop: spacing[1], color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  dataRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }, dataRowLast: { borderBottomWidth: 0 }, dataCopy: { flex: 1, minWidth: 0 }, dataTitle: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 13 }, dataMeta: { marginTop: spacing[1], color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 16 }, dataValue: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  track: { height: 4, marginTop: spacing[2], overflow: 'hidden', borderRadius: radius.full, backgroundColor: colors.borderSubtle }, fill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.accent },
  summaryLine: { minHeight: 70, justifyContent: 'center', padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.backgroundMuted }, summaryValue: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 28 }, summaryMeta: { marginTop: spacing[1], color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  rank: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: colors.backgroundMuted }, rankText: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  recommendation: { minHeight: 72, flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }, recommendationIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.accentSurface }, pressed: { opacity: 0.68 },
  inlineError: { color: colors.danger, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
})
