import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import {
  AnimatedCard,
  AppScreen,
  EmptyState,
  ErrorState,
  DateField,
  SelectField,
  SectionHeading,
  SkeletonCard,
} from '../../components/ui'
import { attendanceApi } from '../../api/attendance'
import { dashboardApi } from '../../api/dashboard'
import type { DashboardFilterParams } from '../../api/dashboard'
import type { StaffWorkspaceStackParamList } from '../../navigation'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, spacing, typography } from '../../theme'
import {
  buildStaffDashboardModel,
  resolveStaffDashboardKind,
  type DashboardMetricTone,
  type StaffDashboardPayload,
} from './dashboardModel'

const toneColors: Record<DashboardMetricTone, string> = {
  default: colors.accent,
  success: colors.success,
  warning: colors.warning,
  danger: colors.danger,
  info: colors.info,
}

type DashboardPage = {
  id: string
  label: string
  icon: React.ComponentProps<typeof Ionicons>['name']
  sectionIds: string[]
}

const pagesByKind: Record<Extract<ReturnType<typeof resolveStaffDashboardKind>, 'teacher' | 'institution'>, DashboardPage[]> = {
  teacher: [
    { id: 'overview', label: 'Overview', icon: 'grid-outline', sectionIds: ['trend', 'distribution'] },
    { id: 'students', label: 'Students', icon: 'people-outline', sectionIds: ['student-pulse'] },
    { id: 'performance', label: 'Performance', icon: 'stats-chart-outline', sectionIds: ['weak-areas', 'papers'] },
    { id: 'ranking', label: 'Ranking', icon: 'podium-outline', sectionIds: ['ranking'] },
    { id: 'insights', label: 'Insights', icon: 'bulb-outline', sectionIds: ['attention', 'focus'] },
    { id: 'integrity', label: 'Integrity', icon: 'shield-checkmark-outline', sectionIds: ['integrity'] },
    { id: 'assistant', label: 'Assistant', icon: 'sparkles-outline', sectionIds: [] },
  ],
  institution: [
    { id: 'overview', label: 'Overview', icon: 'grid-outline', sectionIds: ['trend', 'distribution'] },
    { id: 'classes', label: 'Classes', icon: 'school-outline', sectionIds: ['class-health'] },
    { id: 'students', label: 'Students', icon: 'person-outline', sectionIds: ['students'] },
    { id: 'teachers', label: 'Teachers', icon: 'people-outline', sectionIds: ['teachers'] },
    { id: 'subjects', label: 'Subjects', icon: 'book-outline', sectionIds: ['subjects'] },
  ],
}

function StatTile({ label, value, helper, tone, onPress, disabled = false }: {
  label: string
  value: string
  helper: string
  tone: DashboardMetricTone
  onPress?: () => void
  disabled?: boolean
}) {
  const actionable = Boolean(onPress) && !disabled
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityState={onPress ? { disabled: !actionable } : undefined} disabled={!actionable} onPress={onPress} style={({ pressed }) => [styles.statTile, disabled && onPress && styles.statTileDisabled, pressed && actionable && styles.rowPressed]}>
      <View style={styles.statLabelRow}>
        <View style={[styles.statDot, { backgroundColor: toneColors[tone] }]} />
        <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statHelper} numberOfLines={2}>{helper}</Text>
      {actionable ? <Ionicons name="arrow-forward" size={14} color={colors.textSubtle} style={styles.statArrow} /> : null}
    </Pressable>
  )
}

export default function DashboardScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute<RouteProp<StaffWorkspaceStackParamList, 'Dashboard'>>()
  const user = useAuthStore((state) => state.user)
  const role = user?.role
  const dashboardKind = resolveStaffDashboardKind(role)
  const pages = dashboardKind ? pagesByKind[dashboardKind] : []
  const [activePageId, setActivePageId] = useState('overview')
  const [filters, setFilters] = useState<DashboardFilterParams>({})
  const [filtersOpen, setFiltersOpen] = useState(false)
  const dateRangeInvalid = Boolean(filters.date_from && filters.date_to && filters.date_to < filters.date_from)

  useEffect(() => {
    setActivePageId('overview')
  }, [dashboardKind])

  useEffect(() => {
    if (!route.params?.openFilters) return
    setFiltersOpen(true)
    navigation.setParams({ openFilters: undefined })
  }, [navigation, route.params?.openFilters])

  const dashboardQuery = useQuery({
    queryKey: ['analytics', 'staff-dashboard', dashboardKind, role, user?.id, filters],
    queryFn: async (): Promise<StaffDashboardPayload> => {
      if (dashboardKind === 'teacher') {
        const [data, attendance] = await Promise.all([
          dashboardApi.getTeacherOverview(filters),
          role === 'teacher' ? attendanceApi.getTeacherSummary().catch(() => null) : Promise.resolve(null),
        ])
        return { kind: 'teacher', data, attendance }
      }
      if (dashboardKind === 'institution') return { kind: 'institution', data: await dashboardApi.getPrincipalOverview(filters) }
      throw new Error('Dashboard access is not available for this role.')
    },
    enabled: Boolean(dashboardKind) && !dateRangeInvalid,
    retry: 1,
    placeholderData: (previous) => previous,
  })

  const model = useMemo(
    () => dashboardQuery.data ? buildStaffDashboardModel(dashboardQuery.data) : null,
    [dashboardQuery.data],
  )
  const scopePending = dashboardQuery.isPlaceholderData || dateRangeInvalid
  const activePage = pages.find((page) => page.id === activePageId) ?? null
  const visibleSections = model?.sections.filter((section) => activePage?.sectionIds.includes(section.id)) ?? []
  const filterOptions = dashboardQuery.data?.data.filters
  const appliedFilterCount = Object.values(filters).filter(Boolean).length
  const appliedFilterLabels = [
    filters.standard && `Standard ${filters.standard}`,
    filters.division && `Division ${filters.division}`,
    filters.subject_id && `Subject ${filterOptions?.subjects.find((item) => item.id === filters.subject_id)?.name ?? filters.subject_id}`,
    filters.paper_id && `Paper ${filterOptions?.papers?.find((item) => item.id === filters.paper_id)?.title ?? filters.paper_id}`,
    filters.teacher_id && `Teacher ${filterOptions?.teachers?.find((item) => item.id === filters.teacher_id)?.name ?? filters.teacher_id}`,
    filters.date_from && `From ${filters.date_from}`,
    filters.date_to && `To ${filters.date_to}`,
  ].filter((label): label is string => Boolean(label))
  const filterSummary = appliedFilterLabels.length > 1
    ? `${appliedFilterLabels[0]} · ${appliedFilterLabels.length - 1} more`
    : appliedFilterLabels[0] ?? 'All available data'
  const averageMetric = model?.metrics.find((metric) => metric.label === 'Class average' || metric.label === 'School average')
  const riskMetric = model?.metrics.find((metric) => metric.label === 'At risk')
  const moreMetrics = model?.metrics.filter((metric) => metric !== averageMetric && metric !== riskMetric) ?? []
  const selectOptions = (items: Array<{ value: string; label: string }>) => [{ value: '', label: 'All' }, ...items]
  const updateFilter = (field: keyof DashboardFilterParams, value: string) => {
    setFilters((current) => ({ ...current, [field]: value || undefined }))
  }
  const handleRowAction = (action: NonNullable<import('./dashboardModel').DashboardRow['action']>) => {
    if (scopePending) return
    if (action.kind === 'student') {
      navigation.navigate('DashboardStudentDetail', { studentId: action.id, source: dashboardKind === 'institution' ? 'institution' : 'teacher', filters })
      return
    }
    if (action.kind === 'paper') {
      navigation.navigate('DashboardPaperDetail', { paperId: action.id, filters })
      return
    }
    setFilters((current) => ({ ...current, [action.field]: action.value, ...(action.extra ? { [action.extra.field]: action.extra.value } : {}) }))
    setActivePageId('overview')
  }
  const metricDestination = (label: string) => {
    const normalized = label.toLowerCase()
    if (normalized.includes('student') || normalized.includes('at risk') || normalized.includes('highest')) return 'students'
    if (normalized.includes('teacher')) return 'teachers'
    if (normalized.includes('paper')) return dashboardKind === 'teacher' ? 'performance' : null
    if (normalized.includes('integrity')) return dashboardKind === 'teacher' ? 'integrity' : null
    return null
  }
  const handleMetricAction = (label: string) => {
    if (scopePending) return
    const destination = metricDestination(label)
    if (destination) setActivePageId(destination)
  }
  const dashboardErrorMessage = (error: unknown) => {
    const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
    return typeof detail === 'string' && detail.trim()
      ? detail
      : 'Your workspace is still available. Check your connection and try loading the dashboard again.'
  }

  if (!role) {
    return (
      <AppScreen contentStyle={styles.screen}>
        <View style={styles.loadingHeader}>
          <SkeletonCard lines={2} />
        </View>
        <View style={styles.loadingTabs}><SkeletonCard lines={1} /></View>
        <View style={styles.metricsGrid}>
          <SkeletonCard lines={2} style={styles.metricSkeleton} />
          <SkeletonCard lines={2} style={styles.metricSkeleton} />
        </View>
        <SkeletonCard lines={4} />
      </AppScreen>
    )
  }

  if (!dashboardKind) {
    return <AppScreen contentStyle={styles.screen}><EmptyState icon="lock-closed-outline" title="Dashboard not available" body="This dashboard is available to students, teachers, and institution heads. Use the role-specific workspace tools available to you." /></AppScreen>
  }

  if (dashboardQuery.isLoading) {
    return (
      <AppScreen contentStyle={styles.screen}>
        <View style={styles.loadingHeader}><SkeletonCard lines={2} /></View>
        <View style={styles.loadingTabs}><SkeletonCard lines={1} /></View>
        <View style={styles.metricsGrid}><SkeletonCard lines={2} style={styles.metricSkeleton} /><SkeletonCard lines={2} style={styles.metricSkeleton} /></View>
        <SkeletonCard lines={4} />
      </AppScreen>
    )
  }

  if (dashboardQuery.isError || !model) {
    return (
      <AppScreen contentStyle={styles.screen}>
        <ErrorState
          title="Dashboard could not load"
          message={dashboardErrorMessage(dashboardQuery.error)}
          actionLabel="Try again"
          loading={dashboardQuery.isRefetching}
          onAction={() => void dashboardQuery.refetch()}
        />
      </AppScreen>
    )
  }

  return (
    <AppScreen
      contentStyle={styles.screen}
      refreshControl={(
        <RefreshControl
          refreshing={dashboardQuery.isRefetching}
          onRefresh={() => {
            if (!dateRangeInvalid) void dashboardQuery.refetch()
          }}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      )}
    >
      <Text style={styles.context} numberOfLines={2}>{model.subtitle}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pageTabs} accessibilityRole="tablist" accessibilityLabel="Dashboard pages; swipe to see more">
        {pages.map((page) => {
          const selected = page.id === activePage?.id
          return (
            <Pressable
              key={page.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`${page.label} dashboard page`}
              onPress={() => setActivePageId(page.id)}
              style={({ pressed }) => [styles.pageTab, selected && styles.pageTabSelected, pressed && styles.pressed]}
            >
              <Ionicons name={page.icon} size={14} color={selected ? colors.textOnBrand : colors.textMuted} />
              <Text numberOfLines={1} style={[styles.pageTabText, selected && styles.pageTabTextSelected]}>{page.label}</Text>
            </Pressable>
          )
        })}
      </ScrollView>

      {filterOptions ? (
        <View style={styles.filterArea}>
          <View style={styles.filterTriggerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: filtersOpen }}
              onPress={() => setFiltersOpen((open) => !open)}
              style={({ pressed }) => [styles.filterTrigger, pressed && styles.pressed]}
            >
              <View style={styles.filterTriggerIcon}><Ionicons name="options-outline" size={15} color={colors.textSecondary} /></View>
              <View style={styles.filterTriggerCopy}>
                <Text style={styles.filterTriggerTitle}>Filters</Text>
                <Text accessibilityLiveRegion="polite" numberOfLines={1} style={styles.filterTriggerMeta}>{scopePending && !dateRangeInvalid ? `Updating ${filterSummary}…` : filterSummary}</Text>
              </View>
              {scopePending && !dateRangeInvalid ? <ActivityIndicator size="small" color={colors.accentStrong} /> : null}
              <Ionicons name={filtersOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </Pressable>
            {appliedFilterCount ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear all dashboard filters" onPress={() => setFilters({})} style={({ pressed }) => [styles.filterQuickClear, pressed && styles.pressed]}>
                <Ionicons name="close" size={19} color={colors.accentStrong} />
              </Pressable>
            ) : null}
          </View>
          {filtersOpen ? (
            <View style={styles.filterComposer}>
              <SelectField label="Standard" value={filters.standard || ''} placeholder="All standards" options={selectOptions(filterOptions.standards.map((value) => ({ value, label: value })))} onChange={(value) => updateFilter('standard', value)} />
              <SelectField label="Division" value={filters.division || ''} placeholder="All divisions" options={selectOptions(filterOptions.divisions.map((value) => ({ value, label: value })))} onChange={(value) => updateFilter('division', value)} />
              <SelectField label="Subject" value={filters.subject_id || ''} placeholder="All subjects" options={selectOptions(filterOptions.subjects.map((item) => ({ value: item.id || '', label: item.name })))} onChange={(value) => updateFilter('subject_id', value)} />
              {dashboardKind === 'teacher' ? (
                <>
                  <SelectField label="Paper" value={filters.paper_id || ''} placeholder="All papers" options={selectOptions((filterOptions.papers ?? []).map((item) => ({ value: item.id, label: item.title })))} onChange={(value) => updateFilter('paper_id', value)} />
                </>
              ) : (
                <SelectField label="Teacher" value={filters.teacher_id || ''} placeholder="All teachers" options={selectOptions((filterOptions.teachers ?? []).map((item) => ({ value: item.id, label: item.name })))} onChange={(value) => updateFilter('teacher_id', value)} />
              )}
              <View style={styles.filterDates}>
                <View style={styles.filterDate}><DateField label="From" value={filters.date_from || ''} placeholder="Start date" onChange={(value) => updateFilter('date_from', value)} /></View>
                <View style={styles.filterDate}><DateField label="To" value={filters.date_to || ''} placeholder="End date" onChange={(value) => updateFilter('date_to', value)} /></View>
              </View>
              {appliedFilterCount ? (
                <Pressable accessibilityRole="button" onPress={() => setFilters({})} style={({ pressed }) => [styles.clearFilters, pressed && styles.pressed]}>
                  <Ionicons name="refresh-outline" size={16} color={colors.accentStrong} />
                  <Text style={styles.clearFiltersText}>Clear all filters</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {dateRangeInvalid ? <Text accessibilityRole="alert" style={styles.filterError}>The end date must be on or after the start date. Update the filters before opening an analysis.</Text> : null}
        </View>
      ) : null}

      {scopePending ? (
        <View style={styles.updatingScope} accessibilityLiveRegion="polite">
          <Text style={styles.updatingTitle}>{dateRangeInvalid ? 'Check the date range' : 'Updating dashboard'}</Text>
          <Text style={styles.updatingBody}>{dateRangeInvalid ? 'Choose an end date on or after the start date to see results.' : 'Your new scope is loading. Results will appear when they are ready.'}</Text>
          {!dateRangeInvalid ? <><SkeletonCard lines={2} /><SkeletonCard lines={4} /></> : null}
        </View>
      ) : null}

      {!scopePending && activePage?.id === 'overview' ? (
        <View style={styles.overviewBlock}>
          {averageMetric && riskMetric ? (
            <View style={styles.summaryCard}>
              <View style={styles.summaryMain}>
                <Text style={styles.summaryLabel}>{averageMetric.label}</Text>
                <Text style={styles.summaryValue}>{averageMetric.value}</Text>
                <Text style={styles.summaryHelper}>{averageMetric.helper}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`${riskMetric.value} at risk; view students`} onPress={() => handleMetricAction(riskMetric.label)} style={({ pressed }) => [styles.summaryRisk, pressed && styles.rowPressed]}>
                <Text style={styles.summaryRiskValue}>{riskMetric.value}</Text>
                <Text style={styles.summaryRiskLabel}>At risk</Text>
                <Ionicons name="arrow-forward" size={15} color={colors.accentStrong} style={styles.summaryRiskArrow} />
              </Pressable>
            </View>
          ) : null}
          <View style={styles.metricsGrid}>
            {moreMetrics.map((metric) => (
              <StatTile key={metric.label} {...metric} onPress={metricDestination(metric.label) ? () => handleMetricAction(metric.label) : undefined} />
            ))}
          </View>
        </View>
      ) : null}

      {!scopePending && activePage?.id === 'integrity' && visibleSections.length === 0 ? (
        <AnimatedCard style={styles.quietState}>
          <EmptyState icon="shield-checkmark-outline" title="No integrity alerts" body="There are no recent submissions that need review." />
        </AnimatedCard>
      ) : null}

      {!scopePending && activePage?.id === 'assistant' ? (
        <AnimatedCard style={styles.assistantCard}>
          <View style={styles.assistantIcon}><Ionicons name="sparkles-outline" size={22} color={colors.accentStrong} /></View>
          <View style={styles.assistantCopy}>
            <SectionHeading title="Ask Eduraa AI" subtitle="Use the AI workspace for lesson ideas, intervention plans, parent communication, or a clear explanation of a learning topic." />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Eduraa AI workspace"
              onPress={() => navigation.navigate('StaffAIStudio')}
              style={({ pressed }) => [styles.assistantAction, pressed && styles.pressed]}
            >
              <Text style={styles.assistantActionText}>Open AI workspace</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.textOnBrand} />
            </Pressable>
          </View>
        </AnimatedCard>
      ) : null}

      {!scopePending && visibleSections.map((section) => (
        <View key={section.id} style={styles.section}>
          <SectionHeading title={section.title} subtitle={section.subtitle} />
          {section.rows.length ? (
            <AnimatedCard style={styles.listCard}>
              {section.rows.map((row, index) => (
                <Pressable
                  key={row.id}
                  accessibilityRole={row.action ? 'button' : undefined}
                  accessibilityHint={row.action ? row.action.kind === 'filter' ? 'Filters the dashboard to this item' : 'Opens detailed analytics' : undefined}
                  accessibilityState={row.action ? { disabled: dateRangeInvalid } : undefined}
                  disabled={!row.action || dateRangeInvalid}
                  onPress={() => row.action && handleRowAction(row.action)}
                  style={({ pressed }) => [styles.row, index === section.rows.length - 1 && styles.lastRow, pressed && row.action && styles.rowPressed]}
                >
                  <View style={[styles.rowIcon, { backgroundColor: `${toneColors[row.tone]}14` }]}>
                    <Ionicons name={row.tone === 'danger' ? 'alert' : row.tone === 'warning' ? 'pulse' : 'analytics'} size={17} color={toneColors[row.tone]} />
                  </View>
                  <View style={styles.rowCopy}>
                    <View style={styles.rowHeader}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{row.title}</Text>
                      <Text style={[styles.rowValue, { color: toneColors[row.tone] }]}>{row.value}</Text>
                    </View>
                    <Text style={styles.rowMeta} numberOfLines={2}>{row.meta}</Text>
                    {row.progress != null ? (
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, row.progress))}%`, backgroundColor: toneColors[row.tone] }]} />
                      </View>
                    ) : null}
                  </View>
                  {row.action ? <Ionicons name="chevron-forward" size={17} color={colors.textSubtle} /> : null}
                </Pressable>
              ))}
            </AnimatedCard>
          ) : (
            <AnimatedCard>
              <EmptyState icon="analytics-outline" title={section.emptyTitle} body={section.emptyBody} />
            </AnimatedCard>
          )}
        </View>
      ))}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing[5],
    paddingBottom: spacing[20],
  },
  context: { ...typography.roles.caption, color: colors.textMuted },
  pageTabs: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingRight: spacing[5] },
  pageTab: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing[3], borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated },
  pageTabSelected: { borderColor: colors.nav, backgroundColor: colors.nav },
  pageTabText: { color: colors.textSecondary, fontFamily: typography.fonts.bodySemibold, fontSize: 13 },
  pageTabTextSelected: { color: colors.textOnBrand },
  overviewBlock: { gap: spacing[3] },
  summaryCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3], padding: spacing[4], borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated },
  summaryMain: { flex: 1, gap: spacing[1] },
  summaryLabel: { ...typography.roles.caption, color: colors.textMuted },
  summaryValue: { color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 28, lineHeight: 34, fontVariant: ['tabular-nums'] },
  summaryHelper: { ...typography.roles.caption, color: colors.successText },
  summaryRisk: { minWidth: 84, minHeight: 64, alignItems: 'flex-start', justifyContent: 'center', gap: 1, paddingHorizontal: spacing[3], borderRadius: radius.sm, backgroundColor: colors.dangerSurface },
  summaryRiskValue: { color: colors.dangerText, fontFamily: typography.fonts.bodyBold, fontSize: 22, lineHeight: 26 },
  summaryRiskLabel: { ...typography.roles.caption, fontFamily: typography.fonts.bodySemibold, color: colors.dangerText },
  summaryRiskArrow: { position: 'absolute', right: spacing[2], top: spacing[2] },
  updatingScope: { gap: spacing[3], paddingVertical: spacing[2] },
  updatingTitle: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 17 },
  updatingBody: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 13, lineHeight: 19 },
  assistantCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  assistantIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.accent}14`,
  },
  assistantCopy: {
    flex: 1,
    gap: spacing[3],
  },
  assistantAction: {
    alignSelf: 'flex-start',
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: radius.lg,
    backgroundColor: colors.accentStrong,
  },
  assistantActionText: {
    color: colors.textOnBrand,
    fontSize: typography.sizes.sm,
    fontFamily: typography.fonts.bodySemibold,
  },
  filterArea: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated, paddingHorizontal: spacing[3] },
  filterTriggerRow: { flexDirection: 'row', alignItems: 'center' },
  filterTrigger: { flex: 1, minWidth: 0, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  filterQuickClear: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  filterTriggerIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: radius.xs, backgroundColor: colors.backgroundMuted },
  filterTriggerCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: spacing[2] },
  filterTriggerTitle: { ...typography.roles.body, fontFamily: typography.fonts.bodyBold, color: colors.nav },
  filterTriggerMeta: { ...typography.roles.caption, flex: 1, color: colors.textMuted },
  filterComposer: { gap: spacing[3], paddingBottom: spacing[4] },
  filterDates: { flexDirection: 'row', gap: spacing[3] },
  filterDate: { flex: 1 },
  clearFilters: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2] },
  clearFiltersText: { color: colors.accentStrong, fontFamily: typography.fonts.bodySemibold, fontSize: 13 },
  filterError: { color: colors.danger, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  statTile: { width: '48.5%', justifyContent: 'space-between', gap: 2, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated, paddingHorizontal: spacing[3], paddingVertical: spacing[3] },
  statTileDisabled: { opacity: 0.56 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  statDot: { width: 7, height: 7, borderRadius: 4 },
  statLabel: { ...typography.roles.caption, flex: 1, fontFamily: typography.fonts.bodySemibold, color: colors.textMuted },
  statValue: { color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 22, lineHeight: 28, fontVariant: ['tabular-nums'] },
  statHelper: { ...typography.roles.caption, fontSize: 11.5, color: colors.textMuted },
  statArrow: { position: 'absolute', right: spacing[3], top: spacing[3] },
  metricSkeleton: {
    flex: 1,
    minWidth: '47%',
  },
  loadingHeader: { minHeight: 92 },
  loadingTabs: { minHeight: 48 },
  listCard: { paddingVertical: 0, paddingHorizontal: spacing[4], borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated },
  section: {
    gap: spacing[3],
  },
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  lastRow: {
    borderBottomWidth: 0,
  },
  rowIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowPressed: { opacity: 0.68, backgroundColor: colors.backgroundMuted },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  rowTitle: { ...typography.roles.body, flex: 1, fontFamily: typography.fonts.bodyBold, color: colors.nav },
  rowMeta: { ...typography.roles.caption, marginTop: 2, color: colors.textMuted },
  rowValue: {
    maxWidth: 76,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
    textAlign: 'right',
    textTransform: 'capitalize',
  },
  progressTrack: {
    height: 5,
    marginTop: spacing[2],
    overflow: 'hidden',
    borderRadius: radius.full,
    backgroundColor: colors.borderSubtle,
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  quietState: { marginTop: spacing[2] },
  pressed: { opacity: 0.72 },
})
