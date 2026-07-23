import React, { useMemo } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRoute } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { AnimatedCard, AppScreen, ErrorState, GradientHeroCard, SelectableChip } from '../../components/ui'
import { workspaceApi, WorkspaceSnapshotBlock } from '../../api/workspace'
import { mobileControls } from '../../data/mobileControlCatalog'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, spacing, typography } from '../../theme'

type RouteParams = {
  featureId: string
}

function valueCount(data: unknown) {
  if (Array.isArray(data)) return data.length
  if (data && typeof data === 'object') return Object.keys(data as Record<string, unknown>).length
  return data == null ? 0 : 1
}

function compactPreview(data: unknown) {
  if (Array.isArray(data)) {
    return data.slice(0, 3).map((item, index) => {
      if (!item || typeof item !== 'object') return { key: String(index + 1), title: String(item), subtitle: null }
      const row = item as Record<string, unknown>
      const title = row.display_name || row.name || row.title || row.student_name || row.exam_name || row.email || row.id || `Item ${index + 1}`
      const subtitle = [row.role, row.status, row.subject, row.standard, row.division].filter(Boolean).join(' / ')
      return { key: String(row.id || index), title: String(title), subtitle: subtitle || null }
    })
  }

  if (data && typeof data === 'object') {
    return Object.entries(data as Record<string, unknown>)
      .slice(0, 5)
      .map(([key, value]) => ({ key, title: key.replace(/_/g, ' '), subtitle: typeof value === 'object' ? JSON.stringify(value).slice(0, 90) : String(value) }))
  }

  return []
}

function SnapshotBlock({ block }: { block: WorkspaceSnapshotBlock }) {
  const count = valueCount(block.data)
  const preview = compactPreview(block.data)
  const tone = block.state === 'blocked' ? colors.danger : block.state === 'empty' ? colors.textMuted : colors.success

  return (
    <AnimatedCard style={styles.blockCard}>
      <View style={styles.blockHeader}>
        <View>
          <Text style={styles.blockLabel}>{block.label}</Text>
          <Text style={styles.blockCount}>{block.state === 'blocked' ? 'Needs attention' : `${count} record${count === 1 ? '' : 's'}`}</Text>
        </View>
        <View style={[styles.statePill, { backgroundColor: `${tone}14` }]}>
          <Text style={[styles.stateText, { color: tone }]}>{block.state}</Text>
        </View>
      </View>

      {block.message ? <Text style={styles.message}>{block.message}</Text> : null}

      {preview.map((item) => (
        <View key={item.key} style={styles.previewRow}>
          <View style={styles.previewDot} />
          <View style={styles.previewCopy}>
            <Text style={styles.previewTitle}>{item.title}</Text>
            {item.subtitle ? <Text style={styles.previewSubtitle}>{item.subtitle}</Text> : null}
          </View>
        </View>
      ))}

      {block.state === 'empty' ? <Text style={styles.message}>No records are available for this account right now.</Text> : null}
    </AnimatedCard>
  )
}

export default function FeatureScreen() {
  const route = useRoute()
  const { featureId } = route.params as RouteParams
  const user = useAuthStore((state) => state.user)
  const control = useMemo(() => mobileControls.find((item) => item.id === featureId), [featureId])

  const snapshotQuery = useQuery({
    queryKey: ['workspace-feature', featureId, user?.role],
    queryFn: () => workspaceApi.getFeatureSnapshot(featureId, user?.role),
  })

  if (!control) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ErrorState title="Feature unavailable" message="This mobile feature is not registered." />
      </AppScreen>
    )
  }

  return (
    <AppScreen contentStyle={styles.screen}>
      <GradientHeroCard eyebrow="MOBILE WORKFLOW" title={control.label} subtitle={control.description} />

      <View style={styles.chipRow}>
        <SelectableChip label="In app" selected />
        <SelectableChip label={control.nativeStatus === 'native' ? 'Ready' : control.nativeStatus === 'partial' ? 'In progress' : 'Mobile screen'} selected={false} />
      </View>

      {snapshotQuery.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Loading mobile data</Text>
        </View>
      ) : null}

      {snapshotQuery.isError ? (
        <ErrorState title="Could not load feature" message="Refresh and try again." onAction={() => void snapshotQuery.refetch()} />
      ) : null}

      {(snapshotQuery.data ?? []).map((block) => (
        <SnapshotBlock key={block.label} block={block} />
      ))}

      <AnimatedCard style={styles.noteCard}>
        <View style={styles.noteHeader}>
          <Ionicons name="phone-portrait" size={18} color={colors.accent} />
          <Text style={styles.noteTitle}>Native integration status</Text>
        </View>
        <Text style={styles.noteBody}>
          This control now opens inside the mobile app and loads live backend data. Deeper edit/upload actions can be added here without sending users to the website.
        </Text>
      </AnimatedCard>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[20],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  loadingText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  blockCard: {
    gap: spacing[3],
  },
  blockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  blockLabel: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
  },
  blockCount: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
    marginTop: spacing[1],
  },
  statePill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    alignSelf: 'flex-start',
  },
  stateText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  message: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  previewRow: {
    flexDirection: 'row',
    gap: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
  },
  previewDot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    marginTop: 6,
    backgroundColor: colors.accent,
  },
  previewCopy: {
    flex: 1,
  },
  previewTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
    textTransform: 'capitalize',
  },
  previewSubtitle: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    marginTop: 2,
  },
  noteCard: {
    gap: spacing[3],
    backgroundColor: colors.accentSurface,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  noteTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
  },
  noteBody: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
})
