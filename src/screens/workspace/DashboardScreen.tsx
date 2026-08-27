import React, { useMemo } from 'react'
import { RefreshControl, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import {
  AnimatedCard,
  AppScreen,
  EmptyState,
  ErrorState,
  GradientHeroCard,
  MetricCard,
  SectionHeading,
  SkeletonCard,
} from '../../components/ui'
import { attendanceApi } from '../../api/attendance'
import { dashboardApi } from '../../api/dashboard'
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

export default function DashboardScreen() {
  const user = useAuthStore((state) => state.user)
  const role = user?.role
  const dashboardKind = resolveStaffDashboardKind(role)

  const dashboardQuery = useQuery({
    queryKey: ['analytics', 'staff-dashboard', dashboardKind, role, user?.id],
    queryFn: async (): Promise<StaffDashboardPayload> => {
      if (dashboardKind === 'teacher') {
        return { kind: 'teacher', data: await dashboardApi.getTeacherOverview() }
      }
      if (dashboardKind === 'institution') {
        return { kind: 'institution', data: await dashboardApi.getPrincipalOverview() }
      }
      return { kind: 'operations', data: await attendanceApi.getLeadershipSummary() }
    },
    enabled: Boolean(role),
    retry: 1,
  })

  const model = useMemo(
    () => dashboardQuery.data ? buildStaffDashboardModel(dashboardQuery.data, role) : null,
    [dashboardQuery.data, role],
  )

  if (dashboardQuery.isLoading || !role) {
    return (
      <AppScreen contentStyle={styles.screen}>
        <GradientHeroCard eyebrow="ROLE DASHBOARD" title="Loading your command center" subtitle="Gathering the latest school and learning signals." />
        <View style={styles.metricsGrid}>
          <SkeletonCard lines={2} style={styles.metricSkeleton} />
          <SkeletonCard lines={2} style={styles.metricSkeleton} />
        </View>
        <SkeletonCard lines={4} />
      </AppScreen>
    )
  }

  if (dashboardQuery.isError || !model) {
    return (
      <AppScreen contentStyle={styles.screen}>
        <GradientHeroCard eyebrow="ROLE DASHBOARD" title="Dashboard" subtitle="Your role-aware school and learning command center." />
        <ErrorState
          title="Dashboard could not load"
          message="Your workspace is still available. Check your connection and try loading the dashboard again."
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
          onRefresh={() => void dashboardQuery.refetch()}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      )}
    >
      <GradientHeroCard eyebrow={model.eyebrow} title={model.title} subtitle={model.subtitle} />

      <View style={styles.metricsGrid}>
        {model.metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            helper={metric.helper}
            tone={metric.tone}
            style={styles.metricCard}
          />
        ))}
      </View>

      <SectionHeading title={model.sectionTitle} subtitle={model.sectionSubtitle} />

      {model.rows.length ? (
        <AnimatedCard style={styles.listCard}>
          {model.rows.map((row, index) => (
            <View key={row.id} style={[styles.row, index === model.rows.length - 1 && styles.lastRow]}>
              <View style={[styles.rowIcon, { backgroundColor: `${toneColors[row.tone]}14` }]}>
                <Ionicons name={row.tone === 'danger' ? 'alert' : row.tone === 'warning' ? 'pulse' : 'checkmark'} size={17} color={toneColors[row.tone]} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle} numberOfLines={1}>{row.title}</Text>
                <Text style={styles.rowMeta} numberOfLines={2}>{row.meta}</Text>
              </View>
              <Text style={[styles.rowValue, { color: toneColors[row.tone] }]}>{row.value}</Text>
            </View>
          ))}
        </AnimatedCard>
      ) : (
        <AnimatedCard>
          <EmptyState icon="analytics-outline" title={model.emptyTitle} body={model.emptyBody} />
        </AnimatedCard>
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[20],
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[3],
  },
  metricCard: {
    minWidth: '47%',
  },
  metricSkeleton: {
    flex: 1,
    minWidth: '47%',
  },
  listCard: {
    paddingVertical: spacing[1],
  },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  rowMeta: {
    marginTop: spacing[1],
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
  },
  rowValue: {
    maxWidth: 76,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
    textAlign: 'right',
    textTransform: 'capitalize',
  },
})
