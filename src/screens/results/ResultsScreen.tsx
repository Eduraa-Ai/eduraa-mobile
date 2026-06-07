import React, { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQuery } from '@tanstack/react-query'
import type { ResultsStackParamList } from '../../navigation'
import { checkedPapersApi } from '../../api/checkedPapers'
import type { CheckedPaper } from '../../types'
import { AppScreen, EmptyState } from '../../components/ui'
import { colors, radius, shadows, spacing, typography } from '../../theme'

type ResultsNavigation = NativeStackNavigationProp<ResultsStackParamList, 'ResultsList'>
type FilterKey = 'all' | 'graded' | 'review' | 'manual'

const filters: Array<{ key: FilterKey; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'all', label: 'All', icon: 'layers-outline' },
  { key: 'graded', label: 'Graded', icon: 'checkmark-circle-outline' },
  { key: 'review', label: 'Review', icon: 'alert-circle-outline' },
  { key: 'manual', label: 'Manual', icon: 'chatbubble-ellipses-outline' },
]

function scorePercent(paper: CheckedPaper) {
  if (!paper.max_score || paper.max_score <= 0 || paper.total_score == null) return null
  return Math.max(0, Math.min(100, Math.round((paper.total_score / paper.max_score) * 100)))
}

function formatDate(value?: string | null) {
  if (!value) return 'Date pending'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date pending'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function paperTitle(paper: CheckedPaper) {
  return paper.exam_name || paper.subject_name || 'Checked paper'
}

function normalizeStatus(status?: string | null) {
  return (status || 'processing').replace(/_/g, ' ')
}

function statusModel(paper: CheckedPaper) {
  if (paper.manual_review_requested) {
    return {
      label: 'Manual review',
      icon: 'chatbubble-ellipses-outline' as const,
      color: colors.info,
      bg: colors.infoSurface,
      border: colors.sky[100],
    }
  }

  if (paper.needs_review || paper.status === 'needs_review' || paper.status === 'pending_manual_review') {
    return {
      label: 'Needs review',
      icon: 'alert-circle-outline' as const,
      color: colors.warning,
      bg: colors.warningSurface,
      border: colors.warningBorder,
    }
  }

  if (paper.status === 'graded' || paper.status === 'completed') {
    return {
      label: 'Graded',
      icon: 'checkmark-circle-outline' as const,
      color: colors.success,
      bg: colors.successSurface,
      border: colors.successBorder,
    }
  }

  return {
    label: normalizeStatus(paper.status),
    icon: 'time-outline' as const,
    color: colors.textSecondary,
    bg: colors.cardMuted,
    border: colors.border,
  }
}

function matchesFilter(paper: CheckedPaper, filter: FilterKey) {
  if (filter === 'all') return true
  if (filter === 'graded') return paper.status === 'graded' || paper.status === 'completed'
  if (filter === 'review') return paper.needs_review || paper.status === 'needs_review' || paper.status === 'pending_manual_review'
  return paper.manual_review_requested
}

function resultStats(papers: CheckedPaper[]) {
  const scored = papers.filter((paper) => scorePercent(paper) != null)
  const totalPercent = scored.reduce((sum, paper) => sum + (scorePercent(paper) ?? 0), 0)

  return {
    total: papers.length,
    graded: papers.filter((paper) => paper.status === 'graded' || paper.status === 'completed').length,
    review: papers.filter(
      (paper) => paper.needs_review || paper.status === 'needs_review' || paper.status === 'pending_manual_review',
    ).length,
    manual: papers.filter((paper) => paper.manual_review_requested).length,
    average: scored.length ? Math.round(totalPercent / scored.length) : 0,
  }
}

function ResultsHero({ papers }: { papers: CheckedPaper[] }) {
  const stats = resultStats(papers)
  const focusCopy =
    stats.review > 0
      ? `${stats.review} paper${stats.review === 1 ? '' : 's'} need a closer look.`
      : stats.total > 0
        ? 'Open any result for question-wise feedback.'
        : 'Submit a paper to see marks and AI feedback here.'

  return (
    <LinearGradient colors={['#101827', '#171827', '#3b1d16']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={styles.heroCopy}>
          <View style={styles.eyebrowRow}>
            <Ionicons name="stats-chart-outline" size={14} color={colors.accentLight} />
            <Text style={styles.heroEyebrow}>Results studio</Text>
          </View>
          <Text style={styles.heroTitle}>Marks, feedback, next repair.</Text>
          <Text style={styles.heroSubtitle}>{focusCopy}</Text>
        </View>
        <View style={styles.averageDial}>
          <Text style={styles.averageValue}>{stats.average}%</Text>
          <Text style={styles.averageLabel}>avg</Text>
        </View>
      </View>

      <View style={styles.heroMetrics}>
        <HeroMetric label="Submissions" value={String(stats.total)} icon="document-text-outline" tone="orange" />
        <HeroMetric label="Graded" value={String(stats.graded)} icon="checkmark-done-outline" tone="green" />
        <HeroMetric label="Review" value={String(stats.review + stats.manual)} icon="flag-outline" tone="blue" />
      </View>
    </LinearGradient>
  )
}

function HeroMetric({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: string
  icon: keyof typeof Ionicons.glyphMap
  tone: 'orange' | 'green' | 'blue'
}) {
  const toneStyles = {
    orange: { bg: 'rgba(249, 115, 22, 0.16)', color: colors.accentLight },
    green: { bg: 'rgba(16, 185, 129, 0.16)', color: '#34d399' },
    blue: { bg: 'rgba(56, 189, 248, 0.16)', color: '#38bdf8' },
  }[tone]

  return (
    <View style={styles.heroMetric}>
      <View style={[styles.heroMetricIcon, { backgroundColor: toneStyles.bg }]}>
        <Ionicons name={icon} size={15} color={toneStyles.color} />
      </View>
      <Text style={styles.heroMetricValue}>{value}</Text>
      <Text style={styles.heroMetricLabel}>{label}</Text>
    </View>
  )
}

function FilterChip({
  filter,
  count,
  active,
  onPress,
}: {
  filter: (typeof filters)[number]
  count: number
  active: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Ionicons name={filter.icon} size={14} color={active ? colors.textOnDark : colors.textSecondary} />
      <Text style={[styles.filterText, active && styles.filterTextActive]}>{filter.label}</Text>
      <View style={[styles.filterCount, active && styles.filterCountActive]}>
        <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{count}</Text>
      </View>
    </TouchableOpacity>
  )
}

function ResultCard({ paper, onPress }: { paper: CheckedPaper; onPress: () => void }) {
  const percent = scorePercent(paper)
  const status = statusModel(paper)
  const questionCount = paper.grading_results?.length ?? 0
  const feedback = paper.grading_feedback?.trim()
  const title = paperTitle(paper)
  const subject = paper.subject_name || 'General'
  const scoreText =
    paper.total_score != null && paper.max_score != null ? `${paper.total_score}/${paper.max_score}` : 'Score pending'

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={styles.resultCard}>
      <View style={styles.cardTop}>
        <View style={styles.scoreCluster}>
          <View style={styles.scoreBadge}>
            <Text style={styles.scorePercent}>{percent == null ? '--' : `${percent}%`}</Text>
            <Text style={styles.scoreMarks}>{scoreText}</Text>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {subject} / {formatDate(paper.created_at)}
            </Text>
          </View>
        </View>
        <View style={[styles.statusPill, { backgroundColor: status.bg, borderColor: status.border }]}>
          <Ionicons name={status.icon} size={13} color={status.color} />
          <Text style={[styles.statusText, { color: status.color }]} numberOfLines={1}>
            {status.label}
          </Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percent ?? 0}%` }]} />
      </View>

      <View style={styles.feedbackBox}>
        <Ionicons name={feedback ? 'sparkles-outline' : 'hourglass-outline'} size={16} color={feedback ? colors.info : colors.textSoft} />
        <Text style={styles.feedbackText} numberOfLines={2}>
          {feedback || 'AI grading feedback will appear when this paper is processed.'}
        </Text>
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.footerItem}>
          <Ionicons name="list-outline" size={15} color={colors.textSecondary} />
          <Text style={styles.footerText}>{questionCount} questions</Text>
        </View>
        {paper.is_teacher_override ? (
          <View style={styles.footerItem}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.success} />
            <Text style={[styles.footerText, { color: colors.success }]}>Teacher updated</Text>
          </View>
        ) : null}
        <View style={styles.openAction}>
          <Text style={styles.openActionText}>Open</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.textOnDark} />
        </View>
      </View>
    </TouchableOpacity>
  )
}

export default function ResultsScreen() {
  const navigation = useNavigation<ResultsNavigation>()
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')

  const { data = [], isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['checked-papers'],
    queryFn: checkedPapersApi.list,
  })

  const sortedPapers = useMemo(
    () =>
      [...data].sort((a, b) => {
        const bTime = new Date(b.created_at || b.updated_at).getTime()
        const aTime = new Date(a.created_at || a.updated_at).getTime()
        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime)
      }),
    [data],
  )

  const counts = useMemo(
    () => ({
      all: sortedPapers.length,
      graded: sortedPapers.filter((paper) => matchesFilter(paper, 'graded')).length,
      review: sortedPapers.filter((paper) => matchesFilter(paper, 'review')).length,
      manual: sortedPapers.filter((paper) => matchesFilter(paper, 'manual')).length,
    }),
    [sortedPapers],
  )

  const visiblePapers = useMemo(() => {
    const term = query.trim().toLowerCase()
    return sortedPapers.filter((paper) => {
      if (!matchesFilter(paper, activeFilter)) return false
      if (!term) return true

      return [paper.exam_name, paper.subject_name, paper.status, paper.grading_feedback]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [activeFilter, query, sortedPapers])

  if (isLoading) {
    return (
      <AppScreen contentStyle={styles.centerContent}>
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingTitle}>Loading results</Text>
          <Text style={styles.loadingCopy}>Preparing your checked papers and feedback.</Text>
        </View>
      </AppScreen>
    )
  }

  if (isError) {
    return (
      <AppScreen contentStyle={styles.centerContent}>
        <View style={styles.errorCard}>
          <View style={styles.errorIcon}>
            <Ionicons name="cloud-offline-outline" size={24} color={colors.danger} />
          </View>
          <Text style={styles.errorTitle}>Results could not load</Text>
          <Text style={styles.errorCopy}>Refresh once the connection is back, then open your checked paper again.</Text>
          <TouchableOpacity activeOpacity={0.85} onPress={() => refetch()} style={styles.retryButton}>
            <Ionicons name="refresh" size={16} color={colors.textOnDark} />
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </AppScreen>
    )
  }

  return (
    <AppScreen
      contentStyle={styles.screenContent}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.headerEyebrow}>Results</Text>
          <Text style={styles.headerTitle}>Marks and feedback</Text>
        </View>
        <TouchableOpacity activeOpacity={0.82} onPress={() => refetch()} style={styles.iconButton}>
          <Ionicons name="refresh" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ResultsHero papers={sortedPapers} />

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textSoft} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search exam, subject, feedback"
          placeholderTextColor={colors.textSoft}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {query ? (
          <TouchableOpacity activeOpacity={0.8} onPress={() => setQuery('')} style={styles.clearButton}>
            <Ionicons name="close" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.filtersRow}>
        {filters.map((filter) => (
          <FilterChip
            key={filter.key}
            filter={filter}
            count={counts[filter.key]}
            active={activeFilter === filter.key}
            onPress={() => setActiveFilter(filter.key)}
          />
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Recent submissions</Text>
          <Text style={styles.sectionSubtitle}>
            {visiblePapers.length} of {sortedPapers.length} shown
          </Text>
        </View>
        <View style={styles.sectionBadge}>
          <Ionicons name="flash-outline" size={13} color={colors.accentStrong} />
          <Text style={styles.sectionBadgeText}>AI checked</Text>
        </View>
      </View>

      {visiblePapers.length ? (
        <View style={styles.resultsList}>
          {visiblePapers.map((paper) => (
            <ResultCard
              key={paper.id}
              paper={paper}
              onPress={() => navigation.navigate('ResultDetail', { checkedPaperId: paper.id })}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          icon="stats-chart-outline"
          title={query || activeFilter !== 'all' ? 'No matching results' : 'No results yet'}
          body={
            query || activeFilter !== 'all'
              ? 'Try another search term or switch the filter.'
              : 'Submitted and checked papers will appear here with marks, feedback, and repair advice.'
          }
        />
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screenContent: {
    paddingBottom: spacing[20] + spacing[8],
  },
  centerContent: {
    justifyContent: 'center',
    paddingBottom: spacing[20],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[4],
  },
  headerEyebrow: {
    ...typography.roles.eyebrow,
    color: colors.accentStrong,
  },
  headerTitle: {
    ...typography.roles.screenTitle,
    color: colors.text,
    marginTop: spacing[1],
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.xs,
  },
  hero: {
    borderRadius: radius.lg,
    padding: spacing[5],
    gap: spacing[5],
    overflow: 'hidden',
    ...shadows.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[4],
  },
  heroCopy: {
    flex: 1,
    gap: spacing[2],
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  heroEyebrow: {
    ...typography.roles.eyebrow,
    color: colors.accentLight,
  },
  heroTitle: {
    color: colors.textOnDark,
    fontFamily: typography.fonts.heading,
    fontSize: 25,
    lineHeight: 31,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  averageDial: {
    width: 74,
    height: 74,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  averageValue: {
    color: colors.textOnDark,
    fontFamily: typography.fonts.heading,
    fontSize: 21,
    lineHeight: 25,
  },
  averageLabel: {
    color: 'rgba(255,255,255,0.58)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  heroMetrics: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  heroMetric: {
    flex: 1,
    minHeight: 92,
    borderRadius: radius.md,
    padding: spacing[3],
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    gap: spacing[1],
  },
  heroMetricIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[1],
  },
  heroMetricValue: {
    color: colors.textOnDark,
    fontFamily: typography.fonts.heading,
    fontSize: 20,
    lineHeight: 23,
  },
  heroMetricLabel: {
    color: 'rgba(255,255,255,0.64)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    lineHeight: 13,
    textTransform: 'uppercase',
  },
  searchWrap: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radius.md,
    paddingHorizontal: spacing[4],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.xs,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 14,
    paddingVertical: spacing[3],
  },
  clearButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  filterChip: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radius.full,
    paddingLeft: spacing[3],
    paddingRight: spacing[2],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.nav,
    borderColor: colors.nav,
  },
  filterText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  filterTextActive: {
    color: colors.textOnDark,
  },
  filterCount: {
    minWidth: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[2],
    backgroundColor: colors.cardMuted,
  },
  filterCountActive: {
    backgroundColor: colors.accent,
  },
  filterCountText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  filterCountTextActive: {
    color: colors.textOnDark,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
    lineHeight: 23,
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    marginTop: spacing[1],
  },
  sectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  sectionBadgeText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  resultsList: {
    gap: spacing[4],
  },
  resultCard: {
    borderRadius: radius.lg,
    padding: spacing[4],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing[4],
    ...shadows.sm,
  },
  cardTop: {
    gap: spacing[3],
  },
  scoreCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  scoreBadge: {
    width: 70,
    minHeight: 70,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.nav,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  scorePercent: {
    color: colors.accentLight,
    fontFamily: typography.fonts.heading,
    fontSize: 20,
    lineHeight: 24,
  },
  scoreMarks: {
    color: 'rgba(255,255,255,0.58)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    marginTop: spacing[1],
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
    lineHeight: 21,
  },
  cardMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing[1],
  },
  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.full,
    borderWidth: 1,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  statusText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  feedbackBox: {
    flexDirection: 'row',
    gap: spacing[2],
    borderRadius: radius.md,
    padding: spacing[3],
    backgroundColor: colors.backgroundMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  feedbackText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  cardFooter: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    flexWrap: 'wrap',
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
  },
  footerText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  openAction: {
    marginLeft: 'auto',
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    backgroundColor: colors.nav,
  },
  openActionText: {
    color: colors.textOnDark,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  loadingCard: {
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: spacing[6],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing[3],
    ...shadows.sm,
  },
  loadingTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
  },
  loadingCopy: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    textAlign: 'center',
  },
  errorCard: {
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: spacing[6],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing[3],
    ...shadows.sm,
  },
  errorIcon: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.dangerSurface,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  errorTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
  },
  errorCopy: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  retryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    borderRadius: radius.full,
    paddingHorizontal: spacing[5],
    backgroundColor: colors.nav,
  },
  retryText: {
    color: colors.textOnDark,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
})
