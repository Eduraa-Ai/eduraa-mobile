/**
 * Dashboard Lab — Full analytics screen for students
 */

import React, { useRef, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  useWindowDimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '../../api/analytics'
import { colors } from '../../theme/colors'
import { spacing, radius, shadows } from '../../theme/spacing'
import { fonts } from '../../theme/fonts'

// ─── Animated bar ─────────────────────────────────────────────────────────────

function Bar({ pct, color }: { pct: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(anim, { toValue: Math.min(pct / 100, 1), duration: 700, delay: 150, useNativeDriver: false }).start()
  }, [anim, pct])
  return (
    <View style={bar.track}>
      <Animated.View style={[bar.fill, { width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), backgroundColor: color }]} />
    </View>
  )
}
const bar = StyleSheet.create({
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surface2, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
})

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, icon }: { title: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={sh.wrap}>
      <View style={sh.iconWrap}>
        <Ionicons name={icon} size={14} color={colors.accent} />
      </View>
      <Text style={sh.title}>{title}</Text>
    </View>
  )
}
const sh = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: spacing[3], marginTop: spacing[5] },
  iconWrap: { width: 26, height: 26, borderRadius: 8, backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 13, fontFamily: fonts.bold, fontWeight: '700', color: colors.ink, letterSpacing: -0.1 },
})

// ─── Score color helper ───────────────────────────────────────────────────────

function scoreColor(pct: number) {
  return pct >= 75 ? colors.success : pct >= 50 ? colors.warning : colors.accent
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DashboardLabScreen() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const hPad = width < 380 ? spacing[4] : spacing[5]

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['student-dashboard-lab'],
    queryFn: analyticsApi.getStudentDashboard,
    retry: 0,
  })

  const fadeAnim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start()
  }, [fadeAnim])

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={styles.loadingText}>Loading your analytics…</Text>
      </View>
    )
  }

  if (isError || !data) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={44} color={colors.subtle} />
        <Text style={styles.errorTitle}>Could not load analytics</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const { summary, submissions, subject_question_types, question_type_performance, topic_mastery, chapter_mastery, upcoming_exams, subjects } = data

  // Compute avg score from graded submissions
  const graded = submissions.filter(s => s.score != null && s.max_score)
  const avgPct = graded.length > 0
    ? Math.round(graded.reduce((acc, s) => acc + ((s.score ?? 0) / (s.max_score ?? 1)) * 100, 0) / graded.length)
    : null

  // Subject accuracy from subject_question_types
  const subjectAccuracy = Object.entries(subject_question_types).map(([subj, types]) => {
    const avg = types.length > 0
      ? Math.round(types.reduce((a, t) => a + t.accuracy, 0) / types.length)
      : 0
    return { subject: subj, accuracy: avg }
  }).sort((a, b) => b.accuracy - a.accuracy)

  // Recent submissions (last 5)
  const recentSubs = [...submissions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)

  // Top topics by mastery
  const topTopics = [...topic_mastery].sort((a, b) => b.mastery - a.mastery).slice(0, 5)
  const weakTopics = [...topic_mastery].sort((a, b) => a.mastery - b.mastery).filter(t => t.mastery < 70).slice(0, 5)

  // Question type performance
  const qtypePerf = question_type_performance.filter(q => q.attempts > 0)

  return (
    <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingHorizontal: hPad, paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Summary Stats ───────────────────────────────────────────────── */}
        <SectionHeader title="Summary" icon="bar-chart-outline" />
        <View style={styles.statsGrid}>
          {[
            { label: 'Papers Done', value: String(summary.distinct_papers), icon: 'document-text-outline' as const, color: '#0284C7', bg: '#F0F9FF' },
            { label: 'Submissions', value: String(summary.total_submissions), icon: 'layers-outline' as const, color: '#059669', bg: '#ECFDF5' },
            { label: 'Avg Score', value: avgPct != null ? `${avgPct}%` : '—', icon: 'trending-up-outline' as const, color: avgPct != null ? scoreColor(avgPct) : colors.muted, bg: colors.surface2 },
            { label: 'Checked', value: String(summary.total_checked), icon: 'checkmark-circle-outline' as const, color: colors.accent, bg: colors.accentLight },
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

        {/* ── Upcoming Exams ──────────────────────────────────────────────── */}
        {upcoming_exams.length > 0 && (
          <>
            <SectionHeader title="Upcoming Exams" icon="calendar-outline" />
            <View style={[styles.card, shadows.xs]}>
              {upcoming_exams.map((ex, i) => {
                const dateStr = ex.date
                  ? new Date(ex.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                  : 'TBD'
                return (
                  <View key={ex.id} style={[styles.listRow, i < upcoming_exams.length - 1 && styles.listRowBorder]}>
                    <View style={[styles.dot, { backgroundColor: colors.warning }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{ex.name}</Text>
                      {ex.subject ? <Text style={styles.rowSub}>{ex.subject}</Text> : null}
                    </View>
                    <View style={[styles.datePill, { backgroundColor: colors.warningBg }]}>
                      <Text style={[styles.datePillText, { color: colors.warning }]}>{dateStr}</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </>
        )}

        {/* ── Subject Performance ─────────────────────────────────────────── */}
        {subjectAccuracy.length > 0 && (
          <>
            <SectionHeader title="Subject Performance" icon="book-outline" />
            <View style={[styles.card, shadows.xs]}>
              {subjectAccuracy.map((s, i) => {
                const c = scoreColor(s.accuracy)
                return (
                  <View key={s.subject} style={[styles.listRow, i < subjectAccuracy.length - 1 && styles.listRowBorder]}>
                    <Text style={styles.subjectName} numberOfLines={1}>{s.subject}</Text>
                    <View style={styles.barWrap}>
                      <Bar pct={s.accuracy} color={c} />
                      <Text style={[styles.pctText, { color: c }]}>{s.accuracy}%</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </>
        )}

        {/* ── Question Type Performance ───────────────────────────────────── */}
        {qtypePerf.length > 0 && (
          <>
            <SectionHeader title="Question Type Accuracy" icon="help-circle-outline" />
            <View style={[styles.card, shadows.xs]}>
              {qtypePerf.map((q, i) => {
                const c = scoreColor(q.accuracy)
                const label = q.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                return (
                  <View key={q.type} style={[styles.listRow, i < qtypePerf.length - 1 && styles.listRowBorder]}>
                    <Text style={styles.subjectName} numberOfLines={1}>{label}</Text>
                    <View style={styles.barWrap}>
                      <Bar pct={q.accuracy} color={c} />
                      <Text style={[styles.pctText, { color: c }]}>{Math.round(q.accuracy)}%</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </>
        )}

        {/* ── Topic Mastery ───────────────────────────────────────────────── */}
        {topTopics.length > 0 && (
          <>
            <SectionHeader title="Strongest Topics" icon="trophy-outline" />
            <View style={[styles.card, shadows.xs]}>
              {topTopics.map((t, i) => {
                const c = scoreColor(t.mastery)
                return (
                  <View key={t.topic} style={[styles.listRow, i < topTopics.length - 1 && styles.listRowBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{t.topic}</Text>
                      {t.subject ? <Text style={styles.rowSub}>{t.subject}</Text> : null}
                    </View>
                    <View style={[styles.masteryPill, { backgroundColor: c + '18' }]}>
                      <Text style={[styles.masteryText, { color: c }]}>{Math.round(t.mastery)}%</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </>
        )}

        {weakTopics.length > 0 && (
          <>
            <SectionHeader title="Needs Improvement" icon="alert-circle-outline" />
            <View style={[styles.card, shadows.xs]}>
              {weakTopics.map((t, i) => {
                const c = scoreColor(t.mastery)
                return (
                  <View key={t.topic} style={[styles.listRow, i < weakTopics.length - 1 && styles.listRowBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{t.topic}</Text>
                      {t.subject ? <Text style={styles.rowSub}>{t.subject}</Text> : null}
                    </View>
                    <View style={[styles.masteryPill, { backgroundColor: c + '18' }]}>
                      <Text style={[styles.masteryText, { color: c }]}>{Math.round(t.mastery)}%</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </>
        )}

        {/* ── Chapter Mastery ─────────────────────────────────────────────── */}
        {chapter_mastery.length > 0 && (
          <>
            <SectionHeader title="Chapter Mastery" icon="layers-outline" />
            <View style={[styles.card, shadows.xs]}>
              {[...chapter_mastery].sort((a, b) => b.mastery - a.mastery).slice(0, 8).map((ch, i, arr) => {
                const c = scoreColor(ch.mastery)
                return (
                  <View key={ch.chapter} style={[styles.listRow, i < arr.length - 1 && styles.listRowBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{ch.chapter}</Text>
                      {ch.subject ? <Text style={styles.rowSub}>{ch.subject} · {ch.topics_count} topics</Text> : null}
                    </View>
                    <View style={styles.barWrap}>
                      <Bar pct={ch.mastery} color={c} />
                      <Text style={[styles.pctText, { color: c }]}>{Math.round(ch.mastery)}%</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          </>
        )}

        {/* ── Recent Submissions ──────────────────────────────────────────── */}
        {recentSubs.length > 0 && (
          <>
            <SectionHeader title="Recent Submissions" icon="time-outline" />
            <View style={[styles.card, shadows.xs]}>
              {recentSubs.map((s, i) => {
                const hasPct = s.score != null && s.max_score
                const pct = hasPct ? Math.round(((s.score ?? 0) / (s.max_score ?? 1)) * 100) : null
                const c = pct != null ? scoreColor(pct) : colors.muted
                const dateStr = new Date(s.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                return (
                  <View key={s.id} style={[styles.listRow, i < recentSubs.length - 1 && styles.listRowBorder]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{s.paper}</Text>
                      <Text style={styles.rowSub}>{s.subject ?? s.cat ?? '—'} · {dateStr}</Text>
                    </View>
                    {pct != null ? (
                      <View style={[styles.masteryPill, { backgroundColor: c + '18' }]}>
                        <Text style={[styles.masteryText, { color: c }]}>{pct}%</Text>
                      </View>
                    ) : (
                      <Text style={styles.pendingText}>{s.status.replace(/_/g, ' ')}</Text>
                    )}
                  </View>
                )
              })}
            </View>
          </>
        )}

        {/* Empty state */}
        {submissions.length === 0 && topic_mastery.length === 0 && (
          <View style={styles.emptyWrap}>
            <Ionicons name="analytics-outline" size={48} color={colors.subtle} />
            <Text style={styles.emptyTitle}>No data yet</Text>
            <Text style={styles.emptyBody}>Submit some papers to see your analytics here.</Text>
          </View>
        )}

      </ScrollView>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface1 },
  content: { paddingTop: spacing[2], paddingBottom: 32 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[3], padding: spacing[6] },
  loadingText: { fontSize: 14, fontFamily: fonts.regular, color: colors.muted },
  errorTitle: { fontSize: 16, fontFamily: fonts.displaySemibold, color: colors.ink },
  retryBtn: { paddingHorizontal: spacing[5], paddingVertical: spacing[2], backgroundColor: colors.accent, borderRadius: radius.full },
  retryText: { color: colors.white, fontFamily: fonts.bold, fontWeight: '700' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
  statCard: {
    width: '47%',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 4,
  },
  statIconWrap: { width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', fontFamily: fonts.displayBold },
  statLabel: { fontSize: 11, fontFamily: fonts.regular, color: colors.muted },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  listRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  rowTitle: { fontSize: 13, fontFamily: fonts.semibold, fontWeight: '600', color: colors.ink },
  rowSub: { fontSize: 11, fontFamily: fonts.regular, color: colors.muted, marginTop: 2 },
  subjectName: { fontSize: 13, fontFamily: fonts.medium, color: colors.ink, width: 110 },
  barWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  pctText: { fontSize: 12, fontFamily: fonts.bold, fontWeight: '700', width: 36, textAlign: 'right' },
  masteryPill: { paddingHorizontal: spacing[3], paddingVertical: 3, borderRadius: radius.full },
  masteryText: { fontSize: 12, fontFamily: fonts.bold, fontWeight: '700' },
  datePill: { paddingHorizontal: spacing[2], paddingVertical: 3, borderRadius: radius.md },
  datePillText: { fontSize: 11, fontFamily: fonts.semibold, fontWeight: '600' },
  pendingText: { fontSize: 11, fontFamily: fonts.regular, color: colors.subtle, textTransform: 'capitalize' },

  emptyWrap: { alignItems: 'center', paddingTop: spacing[10], gap: spacing[3] },
  emptyTitle: { fontSize: 17, fontFamily: fonts.displaySemibold, color: colors.ink },
  emptyBody: { fontSize: 14, fontFamily: fonts.regular, color: colors.muted, textAlign: 'center', maxWidth: 260, lineHeight: 20 },
})
