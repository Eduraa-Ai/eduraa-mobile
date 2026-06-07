import React, { useMemo } from 'react'
import { Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import Svg, { Path } from 'react-native-svg'
import { analyticsApi } from '../../api/analytics'
import {
  AnimatedButton,
  AnimatedCard,
  AppScreen,
  ErrorState,
  SkeletonCard,
} from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'
import { colors, motion, radius, shadows, spacing, typography } from '../../theme'
import type { DashboardChapterMastery, DashboardSubmission, StudentDashboardLab } from '../../types'

type Shortcut = {
  label: string
  body: string
  meta: string
  icon: keyof typeof Ionicons.glyphMap
  tone: string
  onPress: () => void
}

const safePercent = (score?: number | null, max?: number | null) => {
  if (score == null || max == null || max <= 0) return null
  return Math.max(0, Math.min(100, Math.round((score / max) * 100)))
}

const formatDate = (value?: string | null) => {
  if (!value) return 'Date pending'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date pending'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const latestFirst = (items: DashboardSubmission[]) =>
  items.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

const masteryTone = (mastery?: number | null) => {
  if (mastery == null) return colors.textMuted
  if (mastery >= 80) return colors.success
  if (mastery >= 58) return colors.warning
  return colors.danger
}

const buildSubjectSnapshot = (analytics?: StudentDashboardLab) => {
  const names = new Set<string>()
  analytics?.subjects?.forEach((subject) => {
    if (subject.name) names.add(subject.name)
  })
  analytics?.exam_scores?.forEach((exam) => {
    Object.keys(exam.subject_scores ?? {}).forEach((subject) => names.add(subject))
  })

  return Array.from(names)
    .map((subject) => {
      const scores = (analytics?.exam_scores ?? [])
        .map((exam) => exam.subject_scores?.[subject])
        .filter((score): score is number => typeof score === 'number')
      const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0
      return { subject, average, count: scores.length }
    })
    .sort((a, b) => a.average - b.average)
}

const useHomeModel = (analytics?: StudentDashboardLab, displayName?: string) => {
  return useMemo(() => {
    const submissions = latestFirst(analytics?.submissions ?? [])
    const scored = submissions
      .map((item) => safePercent(item.score, item.max_score))
      .filter((value): value is number => value != null)
    const averageScore = scored.length ? Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length) : null
    const subjectSnapshot = buildSubjectSnapshot(analytics)
    const weakestSubject = subjectSnapshot.find((item) => item.count > 0)
    const focusChapter = (analytics?.chapter_mastery ?? [])
      .slice()
      .sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0))[0]
    const upcomingExams = (analytics?.upcoming_exams ?? [])
      .slice()
      .sort((a, b) => new Date(a.date ?? '').getTime() - new Date(b.date ?? '').getTime())
      .slice(0, 2)
    const recentSubmissions = submissions.slice(0, 3)
    const firstName = analytics?.student?.first_name || displayName?.split(' ')[0] || 'Student'
    const detail = [analytics?.student?.standard, analytics?.student?.division, analytics?.student?.school_name].filter(Boolean).join(' - ')
    const totalAiMessages = (analytics?.ai_usage ?? []).reduce((sum, row) => sum + row.messages, 0)
    const latestSubmission = recentSubmissions[0]

    return {
      firstName,
      detail,
      averageScore,
      weakestSubject,
      focusChapter,
      upcomingExams,
      recentSubmissions,
      latestSubmission,
      totalAiMessages,
      hasSignal: submissions.length > 0 || (analytics?.exam_scores?.length ?? 0) > 0 || (analytics?.chapter_mastery?.length ?? 0) > 0,
      generatedPapers: analytics?.summary?.generated_papers ?? 0,
      attempts: analytics?.summary?.total_submissions ?? 0,
      checked: analytics?.summary?.total_checked ?? 0,
      distinctPapers: analytics?.summary?.distinct_papers ?? 0,
    }
  }, [analytics, displayName])
}

function Header({ name, detail }: { name: string; detail?: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.logoMark}>
        <Image source={require('../../../assets/eduraa-book-brain.png')} style={styles.logoImage} resizeMode="cover" />
      </View>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>Home</Text>
        {detail ? (
          <Text style={styles.headerDetail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View style={styles.headerIcon}>
        <Ionicons name="help" size={17} color={colors.text} />
      </View>
    </View>
  )
}

function Hero({
  averageScore,
  focusChapter,
  onPractice,
  onAskAi,
}: {
  averageScore: number | null
  focusChapter?: DashboardChapterMastery
  onPractice: () => void
  onAskAi: () => void
}) {
  const chapterLabel = focusChapter?.chapter ?? 'your next weak chapter'
  const mastery = focusChapter?.mastery ?? null

  return (
    <View style={styles.hero}>
      <View style={styles.heroCopy}>
        <Text style={styles.heroEyebrow}>Today's plan</Text>
        <Text style={styles.heroTitle}>{averageScore == null ? 'Build your learning path.' : 'Continue your learning path.'}</Text>
        <Text style={styles.heroBody}>Start with one weak concept, then practice from the same pattern.</Text>
      </View>
      <View style={styles.routeStage}>
        <Svg width="100%" height="68" viewBox="0 0 324 76" preserveAspectRatio="none" style={styles.routeSvg}>
          <Path d="M30 44 C82 7, 138 10, 170 35 C210 63, 256 59, 298 33" fill="none" stroke="#e5eaf0" strokeWidth={12} strokeLinecap="round" />
          <Path d="M30 44 C82 7, 138 10, 170 35" fill="none" stroke={colors.accent} strokeWidth={12} strokeLinecap="round" />
          <Path d="M30 44 C82 7, 138 10, 170 35 C210 63, 256 59, 298 33" fill="none" stroke="rgba(255,255,255,0.72)" strokeWidth={3} strokeLinecap="round" strokeDasharray="7 12" />
        </Svg>
        <Pressable onPress={onAskAi} style={[styles.routeNode, styles.routeNodeReview]}>
          <Text style={[styles.routeNodeText, styles.routeNodeTextDark]}>Review</Text>
        </Pressable>
        <View style={[styles.routeNode, styles.routeNodeLearn]}>
          <Text style={styles.routeNodeText}>Learn</Text>
        </View>
        <Pressable onPress={onPractice} style={[styles.routeNode, styles.routeNodePractice]}>
          <Text style={styles.routeNodeText}>Practice</Text>
        </Pressable>
        <View style={styles.routeLabel}>
          <Text style={styles.routeTitle} numberOfLines={2}>{chapterLabel}</Text>
          <Text style={styles.routeMeta}>{mastery == null ? '35 min route' : `${Math.round(mastery)}% mastery`} · 12 PYQs</Text>
        </View>
      </View>
    </View>
  )
}

function InsightCard({ chapter, subject, onPress }: { chapter?: DashboardChapterMastery; subject?: { subject: string; average: number }; onPress: () => void }) {
  const label = chapter?.chapter ?? subject?.subject ?? 'No weak chapter yet'
  const value = chapter?.mastery ?? subject?.average ?? null
  const tone = masteryTone(value)

  return (
    <AnimatedCard delay={motion.cardEntrance.stagger * 2} style={styles.insightCard}>
      <View style={styles.cardTitleRow}>
        <View style={styles.cardTitleCopy}>
          <Text style={styles.kicker}>Weak chapter insight</Text>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {label}
          </Text>
        </View>
        <View style={[styles.insightBadge, { backgroundColor: `${tone}18` }]}>
          <Text style={[styles.insightBadgeText, { color: tone }]}>{value == null ? '--' : `${Math.round(value)}%`}</Text>
        </View>
      </View>
      <Text style={styles.cardBody}>
        {value == null
          ? 'Once you complete papers, Eduraa will identify the exact chapter to repair next.'
          : 'This is the highest leverage area for your next practice set.'}
      </Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(6, value ?? 8)}%`, backgroundColor: tone }]} />
      </View>
      <AnimatedButton label="Generate focus paper" variant="secondary" onPress={onPress} style={styles.fullWidthButton} />
    </AnimatedCard>
  )
}

function ActivityList({
  submissions,
  exams,
  onResult,
  onPapers,
}: {
  submissions: DashboardSubmission[]
  exams: StudentDashboardLab['upcoming_exams']
  onResult: (submissionId: string) => void
  onPapers: () => void
}) {
  const rows = [
    ...exams.map((exam) => ({
      id: `exam-${exam.id}`,
      icon: 'calendar-clear-outline' as keyof typeof Ionicons.glyphMap,
      title: exam.name,
      meta: `${formatDate(exam.date)} - ${exam.subject || exam.cat || 'Exam'}`,
      color: colors.info,
      onPress: onPapers,
    })),
    ...submissions.map((submission) => {
      const pct = safePercent(submission.score, submission.max_score)
      return {
        id: `sub-${submission.id}`,
        icon: 'checkmark-done-outline' as keyof typeof Ionicons.glyphMap,
        title: submission.paper,
        meta: `${submission.subject || 'Subject'} - ${pct != null ? `${pct}%` : 'Pending review'}`,
        color: masteryTone(pct),
        onPress: () => onResult(submission.id),
      }
    }),
  ].slice(0, 4)

  if (rows.length === 0) {
    return (
      <AnimatedCard delay={motion.cardEntrance.stagger * 5} style={styles.emptyActivity}>
        <Ionicons name="planet-outline" size={24} color={colors.accent} />
        <Text style={styles.emptyTitle}>Your activity stream is waiting</Text>
        <Text style={styles.emptyBody}>Assigned exams, checked papers, and recent attempts will appear here as soon as you start working.</Text>
      </AnimatedCard>
    )
  }

  return (
    <AnimatedCard delay={motion.cardEntrance.stagger * 5} style={styles.activityCard}>
      {rows.map((row, index) => (
        <View key={row.id} style={[styles.activityRow, index === rows.length - 1 && styles.activityRowLast]}>
          <View style={[styles.activityIcon, { backgroundColor: `${row.color}16` }]}>
            <Ionicons name={row.icon} size={18} color={row.color} />
          </View>
          <View style={styles.activityCopy}>
            <Text style={styles.activityTitle} numberOfLines={1}>
              {row.title}
            </Text>
            <Text style={styles.activityMeta} numberOfLines={1}>
              {row.meta}
            </Text>
          </View>
          <AnimatedButton label="View" variant="ghost" onPress={row.onPress} style={styles.smallButton} />
        </View>
      ))}
    </AnimatedCard>
  )
}

function NextActionStack({ items }: { items: Shortcut[] }) {
  return (
    <View style={styles.nextActionStack}>
      {items.map((item) => (
        <Pressable key={item.label} onPress={item.onPress} style={({ pressed }) => [styles.nextActionBox, pressed && styles.nextActionPressed]}>
          <View style={styles.nextActionTop}>
            <View style={[styles.nextActionIcon, { backgroundColor: `${item.tone}12` }]}>
              <Ionicons name={item.icon} size={18} color={item.tone} />
            </View>
            <Ionicons name="chevron-forward" size={17} color={colors.textSoft} />
          </View>
          <View style={styles.nextActionCopy}>
            <Text style={[styles.nextActionMeta, { color: item.tone }]}>{item.meta}</Text>
            <Text style={styles.nextActionTitle} numberOfLines={2}>{item.label}</Text>
            <Text style={styles.nextActionBody} numberOfLines={2}>{item.body}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  )
}

function MetricSummary({
  generated,
  attempts,
  checked,
}: {
  generated: number
  attempts: number
  checked: number
}) {
  const items = [
    { label: 'Signal', value: generated + attempts > 0 ? '68' : '--', helper: 'learning health', tone: colors.accent },
    { label: 'Due', value: `${Math.max(0, generated - attempts)}`, helper: 'papers waiting', tone: colors.info },
    { label: 'Ready', value: `${checked}`, helper: 'checked result', tone: colors.success },
  ]

  return (
    <View style={styles.homeMetricGrid}>
      {items.map((item) => (
        <View key={item.label} style={styles.homeMetricCard}>
          <View style={styles.homeMetricTop}>
            <Text style={styles.homeMetricLabel}>{item.label}</Text>
            <View style={[styles.homeMetricDot, { backgroundColor: item.tone }]} />
          </View>
          <Text style={styles.homeMetricValue}>{item.value}</Text>
          <Text style={styles.homeMetricHelper} numberOfLines={1}>{item.helper}</Text>
        </View>
      ))}
    </View>
  )
}

function SectionRow({ title, meta }: { title: string; meta: string }) {
  return (
    <View style={styles.compactSectionRow}>
      <Text style={styles.compactSectionTitle}>{title}</Text>
      <Text style={styles.compactSectionMeta}>{meta}</Text>
    </View>
  )
}

function NextBestActionCard({
  focusChapter,
  onStart,
  onResult,
}: {
  focusChapter?: DashboardChapterMastery
  onStart: () => void
  onResult: () => void
}) {
  const chapterLabel = focusChapter?.chapter ?? 'your next weak chapter'

  return (
    <View style={styles.planCard}>
      <View style={styles.planIndex}>
        <Text style={styles.planIndexText}>01</Text>
      </View>
      <View style={styles.planCopy}>
        <Text style={styles.planTitle}>Repair weak concept</Text>
        <Text style={styles.planBody} numberOfLines={2}>{chapterLabel} is the most useful repair from your latest paper.</Text>
        <View style={styles.planPills}>
          <Text style={styles.planPill}>8 min recap</Text>
          <Text style={styles.planPill}>12 PYQs</Text>
        </View>
        <View style={styles.planActions}>
          <Pressable onPress={onStart} style={({ pressed }) => [styles.planPrimary, pressed && styles.nextActionPressed]}>
            <Text style={styles.planPrimaryText}>Start learning</Text>
          </Pressable>
          <Pressable onPress={onResult} style={({ pressed }) => [styles.planGhost, pressed && styles.nextActionPressed]}>
            <Text style={styles.planGhostText}>Result</Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

function LoadingHome() {
  return (
    <View style={styles.loadingStack}>
      <SkeletonCard lines={2} style={styles.loadingHero} />
      <View style={styles.homeMetricGrid}>
        <SkeletonCard lines={1} style={styles.loadingMetric} />
        <SkeletonCard lines={1} style={styles.loadingMetric} />
      </View>
      <SkeletonCard lines={3} />
    </View>
  )
}

export default function HomeScreen() {
  const navigation = useNavigation<any>()
  const { user } = useAuthStore()

  const { data: analytics, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['analytics', 'student-dashboard'],
    queryFn: analyticsApi.getStudentDashboard,
    retry: 0,
  })

  const model = useHomeModel(analytics, user?.display_name)

  const shortcuts: Shortcut[] = [
    {
      label: 'Create a focus paper',
      body: 'Generate practice from your weakest areas.',
      meta: 'AI action',
      icon: 'flash-outline',
      tone: colors.accent,
      onPress: () => navigation.navigate('Papers', { screen: 'GeneratePaper' }),
    },
    {
      label: 'Agentic Learning',
      body: 'Open weak concepts and study the next lesson.',
      meta: 'Learning',
      icon: 'sparkles',
      tone: colors.ai.violet,
      onPress: () => navigation.navigate('Learning', { screen: 'AgenticLearning' }),
    },
    {
      label: 'JEE previous papers',
      body: 'Browse PYQs and start paper practice.',
      meta: 'PYQ',
      icon: 'library-outline',
      tone: colors.paperStudio.jee,
      onPress: () => navigation.navigate('Learning', { screen: 'PreviousPapers' }),
    },
    {
      label: 'Review checked results',
      body: 'See marks, feedback, and manual review status.',
      meta: 'Results',
      icon: 'ribbon-outline',
      tone: colors.success,
      onPress: () => navigation.navigate('Results', { screen: 'ResultsList' }),
    },
    {
      label: 'Ask Eduraa AI',
      body: 'Explain mistakes and plan your next study block.',
      meta: 'Tutor',
      icon: 'sparkles-outline',
      tone: colors.ai.violet,
      onPress: () => navigation.navigate('AIStudio'),
    },
  ]

  return (
    <AppScreen
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} colors={[colors.accent]} />}
      contentStyle={styles.screenContent}
    >
      <Header name={model.firstName} detail={model.detail || user?.identifier} />

      {isLoading ? (
        <LoadingHome />
      ) : isError ? (
        <ErrorState
          title="Home could not load"
          message="Refresh and try again. Your token and routes are unchanged."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : (
        <>
          <Hero
            averageScore={model.averageScore}
            focusChapter={model.focusChapter}
            onPractice={() => navigation.navigate('Papers', { screen: 'GeneratePaper' })}
            onAskAi={() => navigation.navigate('AIStudio')}
          />

          <MetricSummary generated={model.generatedPapers} attempts={model.attempts} checked={model.checked} />

          <SectionRow title="Next best action" meta="35 min" />

          <NextBestActionCard
            focusChapter={model.focusChapter}
            onStart={() => navigation.navigate('Learning', { screen: 'AgenticLearning' })}
            onResult={() => navigation.navigate('Results', { screen: 'ResultsList' })}
          />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Next actions</Text>
            <Text style={styles.sectionSubtitle}>High-value routes for today.</Text>
          </View>

          <NextActionStack items={shortcuts} />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent movement</Text>
            <Text style={styles.sectionSubtitle}>Upcoming exams and checked work.</Text>
          </View>

          <ActivityList
            submissions={model.recentSubmissions}
            exams={model.upcomingExams}
            onResult={(submissionId) => navigation.navigate('Results', { screen: 'ResultDetail', params: { checkedPaperId: submissionId } })}
            onPapers={() => navigation.navigate('Papers', { screen: 'PapersList' })}
          />
        </>
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingBottom: spacing[20],
    gap: spacing[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  logoMark: {
    width: 44,
    height: 44,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  logoImage: {
    width: 44,
    height: 44,
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    ...typography.roles.title,
    color: colors.text,
    fontSize: 20,
    lineHeight: 22,
  },
  headerDetail: {
    ...typography.roles.label,
    color: colors.textMuted,
    marginTop: 1,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.xs,
  },
  hero: {
    minHeight: 228,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: '#fff7df',
    borderWidth: 1,
    borderColor: '#eadfce',
    ...shadows.hero,
  },
  heroCopy: {
    paddingTop: spacing[4],
    paddingHorizontal: spacing[4],
  },
  heroEyebrow: {
    ...typography.roles.eyebrow,
    color: colors.accentStrong,
    fontSize: 10,
    letterSpacing: 1.3,
  },
  heroTitle: {
    ...typography.roles.screenTitle,
    color: colors.text,
    maxWidth: 252,
    fontSize: 25,
    lineHeight: 27,
    marginTop: spacing[2],
  },
  heroBody: {
    ...typography.roles.body,
    maxWidth: 250,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing[2],
  },
  routeStage: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
    bottom: spacing[3],
    height: 94,
  },
  routeSvg: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  routeNode: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 21,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  routeNodeReview: {
    left: 0,
    top: 13,
    backgroundColor: colors.white,
  },
  routeNodeLearn: {
    left: 120,
    top: 0,
    backgroundColor: colors.accent,
  },
  routeNodePractice: {
    right: 0,
    top: 16,
    backgroundColor: colors.info,
  },
  routeNodeText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    color: colors.white,
  },
  routeNodeTextDark: {
    color: colors.text,
  },
  routeLabel: {
    position: 'absolute',
    left: 65,
    right: 65,
    bottom: 0,
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  routeTitle: {
    fontFamily: typography.fonts.bodyBold,
    color: colors.text,
    fontSize: 12,
    lineHeight: 14,
  },
  routeMeta: {
    ...typography.roles.label,
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  homeMetricGrid: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  homeMetricCard: {
    flex: 1,
    minHeight: 80,
    padding: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#eadfce',
    ...shadows.xs,
  },
  homeMetricTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  homeMetricLabel: {
    ...typography.roles.eyebrow,
    color: colors.textMuted,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  homeMetricDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  homeMetricValue: {
    ...typography.roles.title,
    color: colors.text,
    fontSize: 20,
    lineHeight: 22,
    marginTop: spacing[2],
  },
  homeMetricHelper: {
    ...typography.roles.label,
    color: colors.textMuted,
    fontSize: 10,
    marginTop: spacing[1],
  },
  compactSectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    paddingHorizontal: 2,
  },
  compactSectionTitle: {
    fontFamily: typography.fonts.bodyBold,
    color: colors.text,
    fontSize: 15,
  },
  compactSectionMeta: {
    ...typography.roles.label,
    color: colors.textMuted,
    fontSize: 11,
  },
  planCard: {
    minHeight: 152,
    flexDirection: 'row',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: 25,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#eadfce',
    ...shadows.xs,
  },
  planIndex: {
    width: 38,
    height: 38,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    flexShrink: 0,
  },
  planIndexText: {
    fontFamily: typography.fonts.bodyBold,
    color: colors.accentStrong,
    fontSize: 11,
  },
  planCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: spacing[2],
  },
  planTitle: {
    ...typography.roles.title,
    color: colors.text,
    fontSize: 17,
    lineHeight: 20,
  },
  planBody: {
    ...typography.roles.label,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  planPills: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  planPill: {
    overflow: 'hidden',
    borderRadius: radius.full,
    backgroundColor: colors.accentSurface,
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  planActions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[1],
  },
  planPrimary: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.slate[950],
  },
  planPrimaryText: {
    fontFamily: typography.fonts.bodyBold,
    color: colors.white,
    fontSize: 12,
  },
  planGhost: {
    width: 92,
    minHeight: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#eadfce',
  },
  planGhostText: {
    fontFamily: typography.fonts.bodyBold,
    color: colors.text,
    fontSize: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    marginTop: spacing[1],
  },
  sectionTitle: {
    fontFamily: typography.fonts.bodyBold,
    color: colors.text,
    fontSize: 15,
  },
  sectionSubtitle: {
    ...typography.roles.label,
    color: colors.textMuted,
    fontSize: 11,
  },
  nextActionStack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  nextActionBox: {
    width: '31%',
    height: 137,
    minHeight: 137,
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.xs,
  },
  nextActionPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  nextActionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nextActionIcon: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextActionCopy: {
    gap: 2,
  },
  nextActionMeta: {
    ...typography.roles.eyebrow,
    fontSize: 8,
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  nextActionTitle: {
    ...typography.roles.body,
    fontFamily: typography.fonts.bodyBold,
    color: colors.text,
    fontSize: 13,
    lineHeight: 16,
  },
  nextActionBody: {
    ...typography.roles.label,
    color: colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },
  insightCard: {
    gap: spacing[4],
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  cardTitleCopy: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    ...typography.roles.eyebrow,
    color: colors.accent,
  },
  cardTitle: {
    ...typography.roles.title,
    color: colors.text,
    marginTop: spacing[1],
  },
  cardBody: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  insightBadge: {
    minWidth: 66,
    minHeight: 40,
    flexShrink: 0,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[3],
  },
  insightBadgeText: {
    ...typography.roles.title,
    fontSize: 18,
  },
  progressTrack: {
    height: 9,
    borderRadius: radius.full,
    backgroundColor: colors.backgroundMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  fullWidthButton: {
    alignSelf: 'stretch',
  },
  aiCard: {
    gap: spacing[4],
    backgroundColor: colors.slate[950],
    borderColor: 'rgba(255,255,255,0.08)',
  },
  aiOrb: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ai.violet,
    ...shadows.sm,
  },
  aiCopy: {
    gap: spacing[2],
  },
  aiKicker: {
    ...typography.roles.eyebrow,
    color: colors.teal[300],
  },
  aiTitle: {
    ...typography.roles.title,
    color: colors.white,
  },
  aiBody: {
    ...typography.roles.body,
    color: colors.slate[300],
  },
  activityCard: {
    padding: 0,
    overflow: 'hidden',
  },
  activityRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  activityRowLast: {
    borderBottomWidth: 0,
  },
  activityIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityCopy: {
    flex: 1,
  },
  activityTitle: {
    ...typography.roles.body,
    fontFamily: typography.fonts.bodyBold,
    color: colors.text,
  },
  activityMeta: {
    ...typography.roles.label,
    color: colors.textMuted,
    marginTop: spacing[1],
  },
  smallButton: {
    width: 74,
  },
  emptyActivity: {
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  emptyTitle: {
    ...typography.roles.title,
    color: colors.text,
  },
  emptyBody: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  loadingStack: {
    gap: spacing[4],
  },
  loadingHero: {
    minHeight: 260,
  },
  loadingMetric: {
    flex: 1,
    minHeight: 120,
  },
})
