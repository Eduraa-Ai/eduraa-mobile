import React, { useCallback, useMemo, useState } from 'react'
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../../api/analytics'
import { attendanceApi } from '../../api/attendance'
import { AnimatedButton, AnimatedCard, AppScreen, DateField, EmptyState, ErrorState, SelectField, SkeletonCard } from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import type { DashboardSubmission, DashboardTopicMastery, StudentDashboardInsightAction } from '../../types'
import {
  aiUsagePeak,
  buildDashboardStudyPlan,
  dashboardEvidenceIsStale,
  dashboardFilterOptions,
  defaultLearnerDashboardFilters,
  filterLearnerDashboard,
  groupDashboardSubmissions,
  hasValidLearnerDashboardDateRange,
  masteryFocusLabel,
  type LearnerDashboardFilters,
} from './learnerDashboardModel'

type DashboardTab = 'Overview' | 'Performance' | 'Scores' | 'Insights'
type InsightMode = 'Patterns' | 'Actions' | 'Recovery' | 'Study plan'

const dashboardTabs: DashboardTab[] = ['Overview', 'Performance', 'Scores', 'Insights']
const insightModes: Array<{ label: InsightMode; icon: keyof typeof Ionicons.glyphMap }> = [
  { label: 'Patterns', icon: 'pulse-outline' },
  { label: 'Actions', icon: 'flash-outline' },
  { label: 'Recovery', icon: 'refresh-outline' },
  { label: 'Study plan', icon: 'calendar-outline' },
]

const pct = (value?: number | null) => `${Math.round(value ?? 0)}%`
const submissionPercent = (item: DashboardSubmission) => (
  item.score == null || item.max_score == null || item.max_score <= 0
    ? null
    : Math.round((item.score / item.max_score) * 100)
)
const scoreTone = (value?: number | null) => {
  if (value == null) return colors.textMuted
  if (value >= 75) return colors.success
  if (value >= 50) return colors.warning
  return colors.danger
}
const formatDate = (value?: string | null) => {
  if (!value) return 'Date pending'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date pending'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function Heading({ eyebrow, title, body }: { eyebrow?: string; title: string; body?: string }) {
  return <View style={styles.heading}>
    {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
    <Text style={styles.headingTitle}>{title}</Text>
    {body ? <Text style={styles.body}>{body}</Text> : null}
  </View>
}

function Metric({ label, value, note, tone }: { label: string; value: string; note: string; tone?: string }) {
  return <View style={styles.metric}>
    <Text style={styles.label}>{label}</Text>
    <Text style={[styles.metricValue, tone ? { color: tone } : null]}>{value}</Text>
    <Text style={styles.mutedLabel}>{note}</Text>
  </View>
}

function Bar({ value }: { value: number }) {
  const safe = Math.max(0, Math.min(100, value))
  return <View style={styles.barTrack} accessibilityLabel={`${Math.round(safe)} percent`}>
    <View style={[styles.barFill, { width: `${safe}%`, backgroundColor: scoreTone(safe) }]} />
  </View>
}

function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.action, disabled && styles.disabled, pressed && styles.pressed]}
  >
    <Text style={styles.actionText}>{label}</Text>
    <Ionicons name="arrow-forward" size={15} color={colors.accentStrong} />
  </Pressable>
}

export default function LearnerDashboardScreen() {
  const navigation = useNavigation<any>()
  const user = useAuthStore((state) => state.user)
  const isLearner = user?.role === 'student' || user?.role === 'b2c_student'
  const [activeTab, setActiveTab] = useState<DashboardTab>('Overview')
  const [insightMode, setInsightMode] = useState<InsightMode>('Patterns')
  const [showAllTopics, setShowAllTopics] = useState(false)
  const [showAllScores, setShowAllScores] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState(defaultLearnerDashboardFilters)

  const dashboardQuery = useQuery({
    queryKey: ['student-dashboard-lab', user?.id],
    queryFn: analyticsApi.getStudentDashboard,
    enabled: isLearner,
  })
  const insightsQuery = useQuery({
    queryKey: ['student-dashboard-insights', user?.id],
    queryFn: analyticsApi.getStudentDashboardInsights,
    enabled: isLearner,
    staleTime: 5 * 60 * 1000,
  })
  const attendanceQuery = useQuery({
    queryKey: ['student-attendance-summary', user?.id],
    queryFn: attendanceApi.getStudentSummary,
    enabled: user?.role === 'student',
  })

  useFocusEffect(useCallback(() => {
    if (isLearner) void dashboardQuery.refetch()
  }, [isLearner, dashboardQuery.refetch]))

  const data = dashboardQuery.data
  const filterOptions = useMemo(() => data ? dashboardFilterOptions(data) : null, [data])
  const filtered = useMemo(
    () => data ? filterLearnerDashboard(data, filters) : null,
    [data, filters],
  )
  const rankedTopics = useMemo(
    () => [...(filtered?.topics ?? [])].sort((a, b) => a.mastery - b.mastery),
    [filtered?.topics],
  )
  const scoreGroups = useMemo(
    () => groupDashboardSubmissions(filtered?.submissions ?? []),
    [filtered?.submissions],
  )
  const studyPlan = useMemo(
    () => filtered ? buildDashboardStudyPlan(filtered) : [],
    [filtered],
  )
  const scored = useMemo(
    () => (filtered?.submissions ?? []).map(submissionPercent).filter((value): value is number => value != null),
    [filtered?.submissions],
  )

  const refresh = useCallback(async () => {
    await Promise.all([
      dashboardQuery.refetch(), insightsQuery.refetch(),
      user?.role === 'student' ? attendanceQuery.refetch() : Promise.resolve(),
    ])
  }, [attendanceQuery.refetch, dashboardQuery.refetch, insightsQuery.refetch, user?.role])

  const rootNavigation = () => navigation.getParent?.() ?? navigation
  const openPractice = (topic?: Partial<DashboardTopicMastery>) => rootNavigation().navigate('Papers', {
    screen: 'GeneratePaper',
    params: {
      dashboardSource: 'learner-dashboard',
      subjectName: topic?.subject ?? undefined,
      chapterName: topic?.chapter ?? undefined,
      topicName: topic ? masteryFocusLabel(topic) : undefined,
      difficulty: topic?.difficulty ?? undefined,
    },
  })
  const openSubmission = (submission: DashboardSubmission) => {
    if (!submission.id) return
    rootNavigation().navigate('Results', {
      screen: 'ResultDetail',
      params: submission.kind === 'checked'
        ? { checkedPaperId: submission.id }
        : { submissionId: submission.id },
    })
  }
  const openInsight = (action: StudentDashboardInsightAction) => openPractice({
    subject: action.subject,
    chapter: action.chapter,
    topic: action.topic ?? action.question_type ?? 'Focused practice',
  })

  if (!isLearner) return <AppScreen protectedChrome><ErrorState title="Learner dashboard only" message="This view is available to student accounts." /></AppScreen>
  if (dashboardQuery.isLoading) return <AppScreen protectedChrome><SkeletonCard style={{ minHeight: 176 }} /><SkeletonCard style={{ minHeight: 72 }} /><SkeletonCard style={{ minHeight: 260 }} /></AppScreen>
  if (dashboardQuery.isError || !data || !filtered || !filterOptions) return <AppScreen protectedChrome><ErrorState
    title="Your dashboard could not load"
    message="Your results are safe. Check your connection and try again."
    onAction={() => void dashboardQuery.refetch()}
    loading={dashboardQuery.isFetching}
  /></AppScreen>

  const average = scored.length ? Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length) : null
  const recentScores = [...filtered.submissions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(submissionPercent).filter((value): value is number => value != null)
  const trend = recentScores.length > 1 ? recentScores[0] - recentScores[1] : null
  const weakest = rankedTopics[0]
  const strongest = rankedTopics.at(-1)
  const weakType = [...filtered.questionTypes].sort((a, b) => a.accuracy - b.accuracy)[0]
  const firstName = data.student.first_name || user?.display_name?.split(' ')[0] || 'Student'
  const upcoming = [...data.upcoming_exams].sort((a, b) => new Date(a.date ?? '').getTime() - new Date(b.date ?? '').getTime())
  const aiMessages = data.ai_usage.reduce((sum, row) => sum + row.messages, 0)
  const aiPeak = aiUsagePeak(data.ai_usage)
  const visibleTopics = showAllTopics ? rankedTopics : rankedTopics.slice(0, 5)
  const visibleScores = showAllScores ? scoreGroups : scoreGroups.slice(0, 5)
  const evidenceIsStale = dashboardEvidenceIsStale(rankedTopics)
  const invalidDates = !hasValidLearnerDashboardDateRange(filters)
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => (
    key === 'dateFrom' || key === 'dateTo' ? Boolean(value) : value !== 'all'
  )).length
  const updateFilter = <K extends keyof LearnerDashboardFilters>(key: K, value: LearnerDashboardFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  return <AppScreen
    protectedChrome
    contentStyle={styles.screen}
    refreshControl={<RefreshControl refreshing={dashboardQuery.isFetching} onRefresh={() => void refresh()} tintColor={colors.accent} />}
  >
    <View style={styles.topBar}>
      <View style={styles.flex}>
        <Text style={styles.eyebrow}>LEARNER COMMAND CENTER</Text>
        <Text style={styles.title}>Your next win, {firstName}.</Text>
        <Text style={styles.body}>Evidence from your work, turned into one clear next move.</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Ask Eduraa AI" onPress={() => navigation.navigate('AIStudio')} style={styles.aiButton}>
        <Ionicons name="sparkles" size={20} color={colors.white} />
      </Pressable>
    </View>

    <AnimatedCard elevated style={styles.mission}>
      <View style={styles.glow} />
      <Text style={styles.missionEyebrow}>YOUR NEXT BEST MOVE</Text>
      <Text style={styles.missionTitle}>{weakest ? `Repair ${masteryFocusLabel(weakest)}` : 'Create your first learning signal'}</Text>
      <Text style={styles.missionBody}>{weakest
        ? `${pct(weakest.mastery)} mastery${weakest.subtopic ? ` in ${weakest.topic}` : weakest.chapter ? ` in ${weakest.chapter}` : ''}. A focused attempt will give you the fastest useful feedback.`
        : 'Complete a paper and Eduraa will turn the result into topic priorities, patterns, and a study plan.'}</Text>
      <AnimatedButton
        label={weakest ? `Practice ${masteryFocusLabel(weakest)}` : 'Start a practice paper'}
        onPress={() => openPractice(weakest)}
        icon={<Ionicons name="arrow-forward" size={18} color={colors.white} />}
        style={styles.missionCta}
      />
      <View style={styles.proof}><Ionicons name="shield-checkmark-outline" size={15} color="#baf2e4" /><Text style={styles.proofText}>Only released results and completed work shape this recommendation</Text></View>
    </AnimatedCard>

    {evidenceIsStale ? <View accessibilityRole="alert" style={styles.staleNotice}>
      <Ionicons name="time-outline" size={18} color={colors.warning} />
      <View style={styles.flex}><Text style={styles.staleTitle}>Your priorities need a fresh signal</Text><Text style={styles.staleBody}>These recommendations are based on work older than 90 days. Complete a focused paper to refresh them.</Text></View>
    </View> : null}

    <View style={styles.tabs} accessibilityRole="tablist">
      {dashboardTabs.map((tab) => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: activeTab === tab }} onPress={() => setActiveTab(tab)} style={[styles.tab, activeTab === tab && styles.tabActive]}>
        <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
      </Pressable>)}
    </View>

    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFilters }} onPress={() => setShowFilters((value) => !value)} style={styles.filterToggle}>
      <View style={styles.filterToggleCopy}><Ionicons name="options-outline" size={18} color={colors.accentStrong} /><Text style={styles.filterToggleText}>{activeFilterCount ? `${activeFilterCount} active ${activeFilterCount === 1 ? 'filter' : 'filters'}` : 'Filter your evidence'}</Text></View>
      <Ionicons name={showFilters ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
    </Pressable>
    {showFilters ? <AnimatedCard style={styles.filterCard}>
      <View style={styles.row}><View style={styles.flex}><Text style={styles.headingTitle}>Shape the evidence</Text><Text style={styles.body}>Every dashboard answer follows this scope.</Text></View><Pressable accessibilityRole="button" onPress={() => setFilters(defaultLearnerDashboardFilters)} style={styles.reset}><Text style={styles.moreText}>Reset</Text></Pressable></View>
      <View style={styles.filterGrid}>
        <View style={styles.filterHalf}><SelectField label="Semester" value={filters.semester} options={[{ label: 'All semesters', value: 'all' }, ...filterOptions.semesters]} onChange={(value) => updateFilter('semester', value)} /></View>
        <View style={styles.filterHalf}><SelectField label="Subject" value={filters.subject} options={[{ label: 'All subjects', value: 'all' }, ...filterOptions.subjects]} onChange={(value) => updateFilter('subject', value)} /></View>
        <View style={styles.filterHalf}><SelectField label="Paper type" value={filters.category} options={[{ label: 'All types', value: 'all' }, ...filterOptions.categories.map((value) => ({ label: value, value }))]} onChange={(value) => updateFilter('category', value)} /></View>
        <View style={styles.filterHalf}><SelectField label="Status" value={filters.status} options={[{ label: 'All statuses', value: 'all' }, ...filterOptions.statuses.map((value) => ({ label: value, value }))]} onChange={(value) => updateFilter('status', value)} /></View>
        <View style={styles.filterHalf}><SelectField label="Difficulty" value={filters.difficulty} options={[{ label: 'All levels', value: 'all' }, ...filterOptions.difficulties.map((value) => ({ label: value, value }))]} onChange={(value) => updateFilter('difficulty', value)} /></View>
        <View style={styles.filterHalf}><DateField label="From date" value={filters.dateFrom} onChange={(value) => updateFilter('dateFrom', value)} /></View>
        <View style={styles.filterHalf}><DateField label="To date" value={filters.dateTo} error={invalidDates ? 'Must be after From date' : undefined} onChange={(value) => updateFilter('dateTo', value)} /></View>
      </View>
    </AnimatedCard> : null}

    {activeTab === 'Overview' ? <View style={styles.stack}>
      <View style={styles.metrics}>
        <Metric label="Average" value={average == null ? '—' : pct(average)} note={`${scored.length} scored`} tone={scoreTone(average)} />
        <Metric label="Attempts" value={String(filtered.submissions.length)} note={`${scoreGroups.length} papers`} />
        <Metric label="AI learning" value={String(aiMessages)} note="messages" />
        <Metric label="Attendance" value={attendanceQuery.data ? pct(attendanceQuery.data.attendance_percent) : user?.role === 'student' ? '—' : 'N/A'} note={user?.role === 'student' ? 'this month' : 'independent'} />
      </View>
      <AnimatedCard>
        <Heading eyebrow="UPCOMING" title="Know what is next" body="Open the exact exam instead of searching for it again." />
        {upcoming.length ? upcoming.slice(0, 3).map((exam) => <Pressable key={exam.id} accessibilityRole="button" accessibilityLabel={`Open ${exam.name}`} onPress={() => navigation.navigate('Exams', { focusExamId: exam.id })} style={styles.listRow}>
          <View style={styles.iconTile}><Ionicons name="calendar-outline" size={18} color={colors.accentStrong} /></View>
          <View style={styles.flex}><Text style={styles.rowTitle}>{exam.name}</Text><Text style={styles.rowMeta}>{[formatDate(exam.date), exam.subject, exam.cat].filter(Boolean).join(' · ')}</Text></View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSoft} />
        </Pressable>) : <EmptyState icon="calendar-outline" title="No upcoming exams" body="When your school schedules an exam, it will appear here with one-tap access." />}
      </AnimatedCard>
      <AnimatedCard>
        <Heading eyebrow="SIGNAL" title="What changed" body="Your latest scored attempt compared with the one before it." />
        {trend == null ? <EmptyState icon="trending-up-outline" title="One more score unlocks your trend" body="Complete another paper to see whether your performance is moving up, down, or holding steady." /> : <View style={styles.trend}>
          <View style={[styles.trendIcon, { backgroundColor: trend >= 0 ? colors.successSurface : colors.dangerSurface }]}><Ionicons name={trend >= 0 ? 'trending-up' : 'trending-down'} size={25} color={trend >= 0 ? colors.success : colors.danger} /></View>
          <View style={styles.flex}><Text style={styles.headingTitle}>{trend > 0 ? '+' : ''}{trend} points</Text><Text style={styles.body}>{trend >= 0 ? 'Your latest result improved.' : 'Your latest result dipped. Open Recovery for the shortest response.'}</Text></View>
        </View>}
      </AnimatedCard>
    </View> : null}

    {activeTab === 'Performance' ? <View style={styles.stack}>
      <Heading eyebrow="MASTERY MAP" title="Turn weak areas into priorities" body="Lowest mastery appears first. Practice keeps its subject, chapter, topic, and difficulty context." />
      <AnimatedCard>
        {visibleTopics.length ? visibleTopics.map((topic, index) => <View key={topic.subtopic_id ?? topic.topic_id ?? `${topic.subject}-${topic.chapter}-${topic.topic}`} style={[styles.dataBlock, index > 0 && styles.divider]}>
          <View style={styles.row}><View style={styles.flex}><Text style={styles.rowTitle}>{masteryFocusLabel(topic)}</Text><Text style={styles.rowMeta}>{[topic.subject, topic.subtopic ? topic.topic : topic.chapter, topic.difficulty].filter(Boolean).join(' · ')}</Text></View><Text style={[styles.dataValue, { color: scoreTone(topic.mastery) }]}>{pct(topic.mastery)}</Text></View>
          <Bar value={topic.mastery} /><Text style={styles.rowMeta}>{topic.evidence_count ? `Based on ${topic.evidence_count} answers · ${topic.evidence_level ?? 'early'} evidence` : 'Evidence details will appear after your next scored answer.'}</Text><Action label={`Practice ${masteryFocusLabel(topic)}`} onPress={() => openPractice(topic)} />
        </View>) : <EmptyState icon="analytics-outline" title="No mastery evidence yet" body="Complete a scored paper to create topic-level priorities." />}
        {rankedTopics.length > 5 ? <Pressable accessibilityRole="button" onPress={() => setShowAllTopics((value) => !value)} style={styles.more}><Text style={styles.moreText}>{showAllTopics ? 'Show priorities only' : `Show all ${rankedTopics.length} topics`}</Text></Pressable> : null}
      </AnimatedCard>
      <AnimatedCard>
        <Heading eyebrow="ANSWER PATTERNS" title="Question types" body="See which answer formats cost you the most marks." />
        {filtered.questionTypes.length ? filtered.questionTypes.map((item, index) => <View key={item.type} style={[styles.dataBlock, index > 0 && styles.divider]}>
          <View style={styles.row}><Text style={styles.rowTitle}>{item.type}</Text><Text style={[styles.dataValue, { color: scoreTone(item.accuracy) }]}>{pct(item.accuracy)}</Text></View>
          <Bar value={item.accuracy} /><Text style={styles.rowMeta}>{'attempts' in item ? `${item.attempts} answers reviewed` : `${item.marks} marks observed`}</Text>
        </View>) : <EmptyState icon="reader-outline" title="No answer-pattern evidence yet" body="Question types will be compared after your answers are scored." />}
      </AnimatedCard>
    </View> : null}

    {activeTab === 'Scores' ? <View style={styles.stack}>
      <Heading eyebrow="RESULTS" title="One paper, one clean history" body="Duplicate-looking attempts stay together, while every real result remains available." />
      {visibleScores.length ? visibleScores.map((group) => <AnimatedCard key={group.key} style={styles.scoreCard}>
        <View style={styles.row}><View style={styles.flex}><Text style={styles.headingTitle}>{group.paper}</Text><Text style={styles.body}>{group.subject || 'General'} · {group.attempts.length} {group.attempts.length === 1 ? 'attempt' : 'attempts'}</Text></View>{group.attempts.length > 1 ? <View style={styles.badge}><Text style={styles.badgeText}>{group.attempts.length}</Text></View> : null}</View>
        {group.attempts.map((submission, index) => {
          const value = submissionPercent(submission)
          return <View key={`${submission.kind}-${submission.id ?? index}`} style={[styles.attempt, index > 0 && styles.divider]}>
            <View style={styles.row}><View style={styles.flex}><Text style={styles.label}>{index === 0 ? 'Latest attempt' : `Earlier attempt ${index}`}</Text><Text style={styles.rowMeta}>{formatDate(submission.date)} · {submission.status}</Text></View><Text style={[styles.score, { color: scoreTone(value) }]}>{value == null ? 'Pending' : pct(value)}</Text></View>
            <Action label={value == null || submission.status !== 'graded' ? 'View status' : 'View result and feedback'} disabled={!submission.id} onPress={() => openSubmission(submission)} />
            {!submission.id ? <Text style={styles.mutedLabel}>This legacy record has no result link. Its score is still preserved.</Text> : null}
          </View>
        })}
      </AnimatedCard>) : <AnimatedCard><EmptyState icon="ribbon-outline" title="No results yet" body="Complete a paper. Released physical checked papers will appear automatically." /></AnimatedCard>}
      {scoreGroups.length > 5 ? <Pressable accessibilityRole="button" onPress={() => setShowAllScores((value) => !value)} style={styles.moreStandalone}><Text style={styles.moreText}>{showAllScores ? 'Show recent papers' : `Show all ${scoreGroups.length} papers`}</Text></Pressable> : null}
    </View> : null}

    {activeTab === 'Insights' ? <View style={styles.stack}>
      <Heading eyebrow="DECISION SUPPORT" title="Understand, decide, act" body="Choose the kind of answer you need right now." />
      <View style={styles.modeGrid}>{insightModes.map((mode) => <Pressable key={mode.label} accessibilityRole="tab" accessibilityState={{ selected: insightMode === mode.label }} onPress={() => setInsightMode(mode.label)} style={[styles.mode, insightMode === mode.label && styles.modeActive]}>
        <Ionicons name={mode.icon} size={17} color={insightMode === mode.label ? colors.white : colors.textMuted} /><Text style={[styles.modeText, insightMode === mode.label && styles.modeTextActive]}>{mode.label}</Text>
      </Pressable>)}</View>

      {insightMode === 'Patterns' ? <AnimatedCard>
        <Heading title="Your learning pattern" body="A plain-language snapshot from your evidence." />
        <View style={styles.metrics}><Metric label="Current level" value={average == null ? '—' : pct(average)} note="scored work" tone={scoreTone(average)} /><Metric label="Recent change" value={trend == null ? '—' : `${trend > 0 ? '+' : ''}${trend}`} note="percentage points" tone={trend == null ? colors.textMuted : trend >= 0 ? colors.success : colors.danger} /></View>
        <View style={styles.callout}><Ionicons name="search-outline" size={20} color={colors.accentStrong} /><Text style={styles.calloutText}>{weakest ? `${masteryFocusLabel(weakest)} is your biggest current opportunity at ${pct(weakest.mastery)} mastery.` : 'Complete a scored paper to reveal your learning pattern.'}</Text></View>
        {strongest ? <Text style={styles.support}>Strongest signal: {masteryFocusLabel(strongest)} at {pct(strongest.mastery)}.</Text> : null}
        {weakType ? <Text style={styles.support}>Most costly answer format: {weakType.type} at {pct(weakType.accuracy)} accuracy.</Text> : null}
      </AnimatedCard> : null}

      {insightMode === 'Actions' ? <AnimatedCard>
        <Heading title="Recommended actions" body={insightsQuery.data?.summary || 'Actions are generated from your real performance evidence.'} />
        {insightsQuery.isLoading ? <SkeletonCard style={{ minHeight: 130 }} /> : null}
        {insightsQuery.isError ? <ErrorState title="Insights are taking longer" message="Your dashboard still works. Retry when ready." onAction={() => void insightsQuery.refetch()} /> : null}
        {insightsQuery.data?.actions.length ? insightsQuery.data.actions.map((item, index) => <View key={`${item.recommendation}-${index}`} style={[styles.dataBlock, index > 0 && styles.divider]}>
          <View style={styles.priority}><Text style={styles.priorityText}>{item.priority || `STEP ${index + 1}`}</Text></View><Text style={styles.rowTitle}>{item.recommendation}</Text>{item.evidence ? <Text style={styles.body}>{item.evidence}</Text> : null}<Action label={item.topic ? `Practice ${item.topic}` : 'Start focused practice'} onPress={() => openInsight(item)} />
        </View>) : !insightsQuery.isLoading && !insightsQuery.isError ? <EmptyState icon="bulb-outline" title="No actions yet" body="Complete more scored work and Eduraa will turn it into specific next steps." /> : null}
      </AnimatedCard> : null}

      {insightMode === 'Recovery' ? <AnimatedCard>
        <Heading title="Recovery route" body="Repair the weakest evidence first, then recheck it with a focused paper." />
        {rankedTopics.length ? rankedTopics.slice(0, 3).map((topic, index) => <View key={`${topic.subtopic_id ?? topic.topic_id ?? topic.topic}-${index}`} style={[styles.recovery, index > 0 && styles.divider]}>
          <View style={styles.step}><Text style={styles.stepText}>{index + 1}</Text></View><View style={styles.flex}><Text style={styles.rowTitle}>{index === 0 ? 'Repair' : index === 1 ? 'Reinforce' : 'Recheck'} {masteryFocusLabel(topic)}</Text><Text style={styles.body}>{pct(topic.mastery)} mastery · {topic.subject || 'General'}</Text><Action label={`Open ${masteryFocusLabel(topic)} practice`} onPress={() => openPractice(topic)} /></View>
        </View>) : <EmptyState icon="refresh-outline" title="Nothing to recover yet" body="Once a weak topic is detected, your shortest recovery route will appear here." />}
      </AnimatedCard> : null}

      {insightMode === 'Study plan' ? <AnimatedCard>
        <Heading title="Your evidence-led plan" body="A short sequence you can finish, not an overwhelming timetable." />
        {studyPlan.length ? studyPlan.map((item, index) => <View key={item.id} style={[styles.study, index > 0 && styles.divider]}>
          <View style={styles.timeline}><View style={styles.dot} />{index < studyPlan.length - 1 ? <View style={styles.line} /> : null}</View><View style={styles.flex}><Text style={styles.eyebrow}>{item.eyebrow}</Text><Text style={styles.rowTitle}>{item.title}</Text><Text style={styles.body}>{item.detail}</Text>{item.topic ? <Action label="Start this step" onPress={() => openPractice({ subject: item.subject, chapter: item.chapter, topic: item.topic ?? undefined, difficulty: item.difficulty })} /> : null}</View>
        </View>) : <EmptyState icon="calendar-outline" title="Your plan needs one result" body="Complete a scored paper and your first evidence-led plan will be ready." />}
      </AnimatedCard> : null}

      <AnimatedCard style={styles.aiCard}>
        <View style={styles.row}><View style={styles.flex}><Text style={styles.eyebrow}>AI LEARNING ACTIVITY</Text><Text style={styles.headingTitle}>{aiMessages} messages in your trail</Text><Text style={styles.body}>Use AI to explain mistakes and unblock understanding, not replace your thinking.</Text></View><View style={styles.aiSpark}><Ionicons name="sparkles" size={22} color={colors.white} /></View></View>
        {data.ai_usage.length ? <View style={styles.chart}>{data.ai_usage.map((item) => <View key={item.week} style={styles.chartColumn}><View style={styles.chartTrack}><View style={[styles.chartBar, { height: `${Math.max(8, (item.messages / aiPeak) * 100)}%` }]} /></View><Text style={styles.label}>{item.messages}</Text><Text style={styles.week} numberOfLines={1}>{item.week}</Text></View>)}</View> : <EmptyState icon="sparkles-outline" title="Your AI trail starts here" body="Ask a study question and weekly activity will appear here." />}
        <AnimatedButton label="Ask Eduraa AI" variant="secondary" onPress={() => navigation.navigate('AIStudio')} />
      </AnimatedCard>
    </View> : null}

    <Text style={styles.privacy}>Physical checked-paper results and analytics appear only after your school officially releases them.</Text>
  </AppScreen>
}

const styles = StyleSheet.create({
  screen: { gap: spacing[5] }, flex: { flex: 1 }, stack: { gap: spacing[5] }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.45 },
  topBar: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[4] },
  eyebrow: { ...typography.roles.eyebrow, color: colors.accentStrong }, title: { ...typography.roles.screenTitle, color: colors.text, marginTop: spacing[1] },
  body: { ...typography.roles.body, color: colors.textMuted, marginTop: spacing[1] }, heading: { gap: spacing[1] }, headingTitle: { ...typography.roles.title, color: colors.text },
  aiButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.nav, ...shadows.sm },
  mission: { overflow: 'hidden', padding: spacing[6], backgroundColor: colors.nav, borderColor: 'rgba(255,255,255,0.08)' }, glow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, right: -74, top: -86, backgroundColor: 'rgba(20,184,166,0.24)' },
  missionEyebrow: { ...typography.roles.eyebrow, color: '#9ee7d7' }, missionTitle: { ...typography.roles.screenTitle, color: colors.white, marginTop: spacing[2] }, missionBody: { ...typography.roles.bodyLarge, color: '#cbd5e1', marginTop: spacing[3] }, missionCta: { marginTop: spacing[5] },
  proof: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[4] }, proofText: { ...typography.roles.label, color: '#baf2e4', flex: 1 },
  staleNotice: { minHeight: 64, flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], padding: spacing[4], borderRadius: radius.lg, borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.warningSurface }, staleTitle: { ...typography.roles.body, fontFamily: typography.fonts.bodyBold, color: colors.text }, staleBody: { ...typography.roles.label, color: colors.textMuted, marginTop: spacing[1] },
  tabs: { flexDirection: 'row', padding: spacing[1], borderRadius: radius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, ...shadows.xs }, tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full }, tabActive: { backgroundColor: colors.nav }, tabText: { ...typography.roles.label, fontSize: 11, color: colors.textMuted }, tabTextActive: { color: colors.white },
  filterToggle: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing[4], borderRadius: radius.lg, backgroundColor: colors.accentSurface, borderWidth: 1, borderColor: colors.borderBrand }, filterToggleCopy: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] }, filterToggleText: { ...typography.roles.body, color: colors.accentStrong }, filterCard: { gap: spacing[4] }, filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }, filterHalf: { width: '47%' }, reset: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing[3] },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] }, metric: { width: '47%', minHeight: 110, padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, ...shadows.xs }, label: { ...typography.roles.label, color: colors.text }, mutedLabel: { ...typography.roles.label, color: colors.textMuted }, metricValue: { fontFamily: typography.fonts.heading, fontSize: 27, color: colors.text, marginVertical: spacing[1] },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] }, listRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing[3], borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: spacing[3], marginTop: spacing[3] }, iconTile: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSurface }, rowTitle: { ...typography.roles.bodyLarge, fontFamily: typography.fonts.bodyBold, color: colors.text }, rowMeta: { ...typography.roles.label, color: colors.textMuted, marginTop: spacing[1] },
  trend: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], marginTop: spacing[4] }, trendIcon: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dataBlock: { gap: spacing[3], paddingVertical: spacing[3] }, divider: { borderTopWidth: 1, borderTopColor: colors.borderSubtle, marginTop: spacing[2], paddingTop: spacing[4] }, dataValue: { fontFamily: typography.fonts.heading, fontSize: 20 }, barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.backgroundMuted, overflow: 'hidden' }, barFill: { height: '100%', borderRadius: 4 },
  action: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[4], borderRadius: radius.full, backgroundColor: colors.accentSurface, borderWidth: 1, borderColor: colors.borderBrand }, actionText: { ...typography.roles.label, color: colors.accentStrong }, more: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.borderSubtle }, moreStandalone: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }, moreText: { ...typography.roles.body, color: colors.accentStrong },
  scoreCard: { gap: spacing[3] }, badge: { minWidth: 34, height: 34, paddingHorizontal: spacing[2], borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.nav }, badgeText: { ...typography.roles.label, color: colors.white }, attempt: { gap: spacing[3], paddingTop: spacing[3] }, score: { fontFamily: typography.fonts.heading, fontSize: 22 },
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }, mode: { width: '48%', minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], borderRadius: radius.full, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }, modeActive: { backgroundColor: colors.nav, borderColor: colors.nav }, modeText: { ...typography.roles.label, color: colors.textMuted }, modeTextActive: { color: colors.white },
  callout: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3], padding: spacing[4], marginTop: spacing[4], borderRadius: radius.lg, backgroundColor: colors.accentSurface }, calloutText: { ...typography.roles.bodyLarge, color: colors.text, flex: 1 }, support: { ...typography.roles.body, color: colors.textSecondary, marginTop: spacing[3] }, priority: { alignSelf: 'flex-start', paddingHorizontal: spacing[3], paddingVertical: spacing[1], borderRadius: radius.full, backgroundColor: colors.nav }, priorityText: { ...typography.roles.eyebrow, color: colors.white },
  recovery: { flexDirection: 'row', gap: spacing[3], paddingVertical: spacing[3] }, step: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }, stepText: { ...typography.roles.label, color: colors.white }, study: { flexDirection: 'row', gap: spacing[3], paddingVertical: spacing[3] }, timeline: { width: 20, alignItems: 'center' }, dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent, marginTop: spacing[1] }, line: { flex: 1, width: 2, backgroundColor: colors.accentSoft, marginTop: spacing[1] },
  aiCard: { gap: spacing[4], backgroundColor: '#f8fbff' }, aiSpark: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ai.violet }, chart: { height: 150, flexDirection: 'row', alignItems: 'flex-end', gap: spacing[2], paddingTop: spacing[4] }, chartColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: spacing[1] }, chartTrack: { width: '70%', flex: 1, justifyContent: 'flex-end', borderRadius: radius.full, overflow: 'hidden', backgroundColor: colors.backgroundMuted }, chartBar: { width: '100%', borderRadius: radius.full, backgroundColor: colors.ai.violet }, week: { ...typography.roles.label, fontSize: 9, color: colors.textMuted, width: '100%', textAlign: 'center' }, privacy: { ...typography.roles.label, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing[4], paddingBottom: spacing[4] },
})
