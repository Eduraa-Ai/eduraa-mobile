import React, { useRef, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Animated,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/authStore'
import { analyticsApi } from '../../api/analytics'
import { colors } from '../../theme/colors'
import { spacing, radius, shadows } from '../../theme/spacing'
import { fonts } from '../../theme/fonts'

// ─── Animated progress bar ────────────────────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct / 100,
      duration: 800,
      delay: 200,
      useNativeDriver: false,
    }).start()
  }, [anim, pct])

  return (
    <View style={bar.track}>
      <Animated.View
        style={[
          bar.fill,
          {
            width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            backgroundColor: color,
          },
        ]}
      />
    </View>
  )
}

const bar = StyleSheet.create({
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface3,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3 },
})

// ─── Quick action item type ───────────────────────────────────────────────────

const B2C_QUICK_ACTIONS = [
  {
    label: 'Generate',
    sub: 'New paper',
    icon: 'add-circle-outline' as const,
    screen: 'Papers',
    params: { screen: 'GeneratePaper' },
    color: colors.accent,
    bg: colors.accentLight,
  },
  {
    label: 'My Papers',
    sub: 'View all',
    icon: 'document-text-outline' as const,
    screen: 'Papers',
    params: { screen: 'PapersList' },
    color: '#0284C7',
    bg: '#F0F9FF',
  },
  {
    label: 'Results',
    sub: 'Grades & feedback',
    icon: 'checkmark-circle-outline' as const,
    screen: 'Results',
    params: { screen: 'ResultsList' },
    color: '#059669',
    bg: '#ECFDF5',
  },
  {
    label: 'AI Studio',
    sub: 'Chat with AI',
    icon: 'sparkles-outline' as const,
    screen: 'AIStudio',
    params: undefined,
    color: '#7C3AED',
    bg: '#F5F3FF',
  },
]

const SCHOOL_QUICK_ACTIONS = [
  {
    label: 'My Exams',
    sub: 'Teacher assigned',
    icon: 'calendar-outline' as const,
    screen: 'Exams',
    params: undefined,
    color: '#CA8A04',
    bg: '#FEFCE8',
  },
  {
    label: 'My Papers',
    sub: 'Practice papers',
    icon: 'document-text-outline' as const,
    screen: 'Papers',
    params: { screen: 'PapersList' },
    color: '#0284C7',
    bg: '#F0F9FF',
  },
  {
    label: 'Scan Paper',
    sub: 'Upload answer sheet',
    icon: 'camera-outline' as const,
    screen: 'Scan',
    params: undefined,
    color: '#059669',
    bg: '#ECFDF5',
  },
  {
    label: 'Results',
    sub: 'Grades & feedback',
    icon: 'checkmark-circle-outline' as const,
    screen: 'Results',
    params: { screen: 'ResultsList' },
    color: '#7C3AED',
    bg: '#F5F3FF',
  },
  {
    label: 'My Teachers',
    sub: 'Roster & subjects',
    icon: 'people-outline' as const,
    screen: 'Profile',
    params: { screen: 'MyTeachers' },
    color: colors.accent,
    bg: colors.accentLight,
  },
  {
    label: 'AI Studio',
    sub: 'Chat with AI',
    icon: 'sparkles-outline' as const,
    screen: 'AIStudio',
    params: undefined,
    color: '#0284C7',
    bg: '#F0F9FF',
  },
]

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user } = useAuthStore()
  const navigation = useNavigation<any>()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const isSchoolStudent = user?.role === 'student'
  const QUICK_ACTIONS = isSchoolStudent ? SCHOOL_QUICK_ACTIONS : B2C_QUICK_ACTIONS

  const { data: analytics, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['analytics', 'student-dashboard'],
    queryFn: analyticsApi.getStudentDashboard,
    retry: 0,
  })

  // Entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(16)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start()
  }, [fadeAnim, slideAnim])

  const firstName = analytics?.student?.first_name || user?.display_name?.split(' ')[0] || 'there'
  const standard = analytics?.student?.standard ? `Grade ${analytics.student.standard}` : null

  const summary = analytics?.summary
  const gradedSubs = (analytics?.submissions ?? []).filter(s => s.status === 'graded')
  const avgPct = gradedSubs.length > 0
    ? Math.round(gradedSubs.reduce((acc, s) => acc + ((s.score ?? 0) / (s.max_score ?? 1)) * 100, 0) / gradedSubs.length)
    : null

  const recentSubs = (analytics?.submissions ?? [])
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3)

  const subjectAccuracy = Object.entries(analytics?.subject_question_types ?? {}).map(([subject, types]) => {
    const totalScored = types.reduce((s, t) => s + (t.accuracy ?? 0), 0)
    const totalMarks = types.reduce((s, t) => s + (t.marks ?? 1), 0)
    const accuracy = totalMarks > 0 ? Math.round((totalScored / totalMarks) * 100) : 0
    return { subject, accuracy }
  }).sort((a, b) => b.accuracy - a.accuracy)

  const isSmall = width < 380
  const hPad = isSmall ? spacing[4] : spacing[5]
  const cardGap = isSmall ? spacing[2] : spacing[3]

  const getScoreColor = (pct: number) =>
    pct >= 75 ? colors.success : pct >= 50 ? colors.warning : colors.accent

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingHorizontal: hPad, paddingTop: insets.top + spacing[4] },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Hello, {firstName} 👋</Text>
            {standard ? (
              <Text style={styles.greetingSub}>{standard}{isSchoolStudent ? ' · School Student' : ''}</Text>
            ) : (
              <Text style={styles.greetingSub}>{isSchoolStudent ? 'School Student' : 'Ready to practise today?'}</Text>
            )}
          </View>
          <View style={styles.brandMark}>
            <Ionicons name="sparkles" size={20} color={colors.white} />
          </View>
        </View>

        {/* ── Quick Actions ─────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Quick Actions</Text>
        <View style={[styles.actionGrid, { gap: cardGap }]}>
          {QUICK_ACTIONS.map((a, i) => (
            <TouchableOpacity
              key={a.label}
              style={[styles.actionCard, shadows.xs, { width: `${47.5}%` }]}
              activeOpacity={0.8}
              onPress={() => navigation.navigate(a.screen, a.params)}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: a.bg }]}>
                <Ionicons name={a.icon} size={20} color={a.color} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
              <Text style={styles.actionSub}>{a.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Stats ────────────────────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Your Progress</Text>
        {isLoading ? (
          <View style={styles.statsLoading}>
            <ActivityIndicator color={colors.accent} size="small" />
          </View>
        ) : isError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <Text style={styles.errorText}>Could not load stats</Text>
            <TouchableOpacity onPress={() => refetch()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.statsRow, { gap: cardGap }]}>
            {[
              {
                label: 'Papers',
                value: String(summary?.generated_papers ?? '—'),
                icon: 'document-text-outline' as const,
                color: '#0284C7',
                bg: '#F0F9FF',
              },
              {
                label: 'Submissions',
                value: String(summary?.total_submissions ?? '—'),
                icon: 'layers-outline' as const,
                color: '#059669',
                bg: '#ECFDF5',
              },
              {
                label: 'Avg Score',
                value: avgPct != null ? `${avgPct}%` : '—',
                icon: 'trending-up-outline' as const,
                color: avgPct != null ? getScoreColor(avgPct) : colors.muted,
                bg: avgPct != null && avgPct >= 75
                  ? '#ECFDF5'
                  : avgPct != null && avgPct >= 50
                    ? '#FFFBEB'
                    : colors.surface2,
              },
            ].map(s => (
              <View key={s.label} style={[styles.statCard, shadows.xs]}>
                <View style={[styles.statIconWrap, { backgroundColor: s.bg }]}>
                  <Ionicons name={s.icon} size={16} color={s.color} />
                </View>
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Analytics Button ─────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.analyticsBtn}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('DashboardLab')}
        >
          <Ionicons name="bar-chart-outline" size={16} color={colors.accent} />
          <Text style={styles.analyticsBtnText}>View Full Analytics</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.accent} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        {/* ── Subject Performance ───────────────────────────────────────── */}
        {!isLoading && subjectAccuracy.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Subject Performance</Text>
            <View style={[styles.subjectCard, shadows.xs]}>
              {subjectAccuracy.map((s, i) => {
                const barColor = s.accuracy >= 75 ? colors.success : s.accuracy >= 50 ? colors.warning : colors.accent
                return (
                  <View
                    key={s.subject}
                    style={[
                      styles.subjectRow,
                      i < subjectAccuracy.length - 1 && styles.subjectRowBorder,
                    ]}
                  >
                    <Text style={styles.subjectName} numberOfLines={1}>{s.subject}</Text>
                    <View style={styles.subjectBarWrap}>
                      <ProgressBar pct={s.accuracy} color={barColor} />
                      <Text style={[styles.subjectPct, { color: barColor }]}>{s.accuracy}%</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </>
        )}

        {/* ── Recent Activity ───────────────────────────────────────────── */}
        {!isLoading && recentSubs.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>Recent Activity</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Results', { screen: 'ResultsList' })}
              >
                <Text style={styles.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            <View style={{ gap: cardGap }}>
              {recentSubs.map((sub) => {
                const pct = Math.round(((sub.score ?? 0) / (sub.max_score ?? 1)) * 100)
                const scoreColor = getScoreColor(pct)
                const dateStr = new Date(sub.date).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                })
                return (
                  <TouchableOpacity
                    key={sub.id}
                    style={[styles.recentCard, shadows.xs]}
                    activeOpacity={0.8}
                    onPress={() =>
                      navigation.navigate('Results', {
                        screen: 'ResultDetail',
                        params: { checkedPaperId: sub.id },
                      })
                    }
                  >
                    <View style={styles.recentLeft}>
                      <Text style={styles.recentPaper} numberOfLines={1}>{sub.paper}</Text>
                      <Text style={styles.recentMeta}>{sub.subject}  ·  {dateStr}</Text>
                    </View>
                    <View style={[styles.recentScorePill, { backgroundColor: scoreColor + '18', borderColor: scoreColor + '40' }]}>
                      <Text style={[styles.recentScoreText, { color: scoreColor }]}>
                        {sub.score}/{sub.max_score}
                      </Text>
                      <Text style={[styles.recentPct, { color: scoreColor }]}>{pct}%</Text>
                    </View>
                  </TouchableOpacity>
                )
              })}
            </View>
          </>
        )}

        <View style={{ height: 24 }} />
      </Animated.View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface1 },
  content: { paddingBottom: 32 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[5],
  },
  greeting: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: fonts.displayBold,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  greetingSub: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.muted,
    marginTop: 3,
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Section label
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: colors.subtle,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing[3],
    marginTop: spacing[5],
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing[5],
    marginBottom: spacing[3],
  },
  seeAll: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
  },

  // Quick actions
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing[4],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'flex-start',
    gap: 4,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  actionSub: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.muted,
  },

  // Stats
  statsLoading: { height: 80, alignItems: 'center', justifyContent: 'center' },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerBg,
    borderRadius: radius.lg,
    padding: spacing[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.dangerBorder,
    gap: spacing[2],
  },
  errorText: { flex: 1, fontSize: 13, color: colors.danger },
  retryBtn: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    backgroundColor: colors.accent,
    borderRadius: radius.full,
  },
  retryText: { fontSize: 12, fontWeight: '700', color: colors.white },
  statsRow: { flexDirection: 'row' },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 4,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '800', fontFamily: fonts.displayBold },
  statLabel: { fontSize: 10, fontFamily: fonts.regular, color: colors.muted, textAlign: 'center' },

  // Subject
  subjectCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  subjectRow: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  subjectRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  subjectName: { fontSize: 13, fontWeight: '600', color: colors.ink, width: 90 },
  subjectBarWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  subjectPct: { fontSize: 12, fontWeight: '700', width: 34, textAlign: 'right' },

  // Recent
  recentCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentLeft: { flex: 1, gap: 3, marginRight: spacing[3] },
  recentPaper: { fontSize: 13, fontWeight: '700', fontFamily: fonts.bold, color: colors.ink },
  recentMeta: { fontSize: 11, fontFamily: fonts.regular, color: colors.subtle },
  recentScorePill: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    minWidth: 60,
  },
  recentScoreText: { fontSize: 13, fontWeight: '800' },
  recentPct: { fontSize: 10, fontWeight: '700' },

  // Analytics button
  analyticsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: colors.accentLight,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.accent + '40',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    marginTop: spacing[4],
  },
  analyticsBtnText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: colors.accent,
  },
})
