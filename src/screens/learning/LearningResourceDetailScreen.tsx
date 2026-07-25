import React, { useMemo, useState } from 'react'
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { AnimatedButton, AppScreen, ErrorState, PremiumHeader, SkeletonCard } from '../../components/ui'
import { learningResourcesApi, LearningResource, resolveResourceUrl } from '../../api/learningResources'
import { colors, radius, shadows, spacing, typography } from '../../theme'

type PreviewLine = { lhs: string; rhs?: string }

async function openResourceUrl(url?: string | null) {
  const resolved = resolveResourceUrl(url)
  if (!resolved) return
  try {
    const canOpen = await Linking.canOpenURL(resolved)
    if (!canOpen) {
      Alert.alert('Cannot open resource', 'No app is available to open this resource.')
      return
    }
    await Linking.openURL(resolved)
  } catch {
    Alert.alert('Cannot open resource', 'Something went wrong opening this resource.')
  }
}

function extractPreviewLines(resource: LearningResource): PreviewLine[] {
  const metadata = resource.metadata || {}
  const candidates = [
    metadata.preview_formulas,
    metadata.formulas,
    metadata.key_formulas,
    metadata.preview,
  ]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .slice(0, 6)
        .map((entry: any) => {
          if (typeof entry === 'string') return { lhs: entry }
          if (entry && typeof entry === 'object' && 'formula' in entry) {
            return { lhs: String(entry.formula), rhs: entry.label ? String(entry.label) : undefined }
          }
          return null
        })
        .filter((entry): entry is PreviewLine => Boolean(entry))
    }
  }
  return []
}

export default function LearningResourceDetailScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute()
  const params = (route.params || {}) as { resourceId?: string }
  const resourceId = params.resourceId
  const [activeScopeIndex, setActiveScopeIndex] = useState(0)

  const detailQuery = useQuery({
    queryKey: ['learning-resource', resourceId],
    queryFn: () => learningResourcesApi.get(resourceId as string),
    enabled: Boolean(resourceId),
  })

  const resource = detailQuery.data
  const previewLines = useMemo<PreviewLine[]>(() => (resource ? extractPreviewLines(resource) : []), [resource])

  const scopes = resource?.scopes || []
  const activeScope = scopes[activeScopeIndex] || null

  if (!resourceId) {
    return (
      <AppScreen contentStyle={styles.screen}>
        <PremiumHeader eyebrow="Learning resource" title="Resource not found" onBack={() => navigation.goBack()} />
        <ErrorState
          title="Missing resource"
          message="Return to the library and pick a resource."
          onAction={() => navigation.goBack()}
        />
      </AppScreen>
    )
  }

  if (detailQuery.isLoading) {
    return (
      <AppScreen contentStyle={styles.screen}>
        <PremiumHeader eyebrow="Learning resource" title="Loading resource…" onBack={() => navigation.goBack()} />
        <SkeletonCard />
        <SkeletonCard lines={5} />
      </AppScreen>
    )
  }

  if (detailQuery.isError || !resource) {
    return (
      <AppScreen contentStyle={styles.screen}>
        <PremiumHeader eyebrow="Learning resource" title="Could not open resource" onBack={() => navigation.goBack()} />
        <ErrorState
          title="Could not load this resource"
          message="Refresh and try again."
          onAction={() => void detailQuery.refetch()}
        />
      </AppScreen>
    )
  }

  const pill = resource.page_count ? `${resource.page_count} pages` : resource.status
  const meta = [resource.provider_label, resource.subject_name].filter(Boolean).join(' · ')

  return (
    <AppScreen contentStyle={styles.screen}>
      <PremiumHeader
        eyebrow={resource.resource_type.replace(/_/g, ' ') || 'Learning resource'}
        title={resource.title}
        subtitle={meta || undefined}
        onBack={() => navigation.goBack()}
        right={
          <View style={styles.pill}>
            <Text style={styles.pillText}>{pill}</Text>
          </View>
        }
      />

      <View style={styles.docCard}>
        <View style={styles.docHead}>
          <Ionicons name="reader-outline" size={16} color={colors.accentStrong} />
          <Text style={styles.docHeadTitle}>
            {activeScope ? activeScope.node_name : 'Key relations'}
          </Text>
        </View>
        {previewLines.length > 0 ? (
          previewLines.map((line, index) => (
            <View key={`${line.lhs}-${index}`} style={styles.formulaRow}>
              <Text style={styles.formulaText}>{line.lhs}</Text>
              {line.rhs ? <Text style={styles.formulaAnnotation}>{line.rhs}</Text> : null}
            </View>
          ))
        ) : (
          <View style={styles.previewEmpty}>
            <Ionicons name="document-text-outline" size={20} color={colors.textSoft} />
            <Text style={styles.previewEmptyTitle}>Preview not available</Text>
            <Text style={styles.previewEmptyBody}>Open the full PDF to view every page.</Text>
          </View>
        )}
      </View>

      {scopes.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>In this pack</Text>
            <Text style={styles.sectionMeta}>
              {scopes.length} {scopes.length === 1 ? 'chapter' : 'chapters'}
            </Text>
          </View>
          <View style={styles.chipRow}>
            {scopes.map((scope, index) => (
              <Pressable
                key={scope.id}
                onPress={() => setActiveScopeIndex(index)}
                style={({ pressed }) => [
                  styles.chip,
                  activeScopeIndex === index && styles.chipActive,
                  pressed && styles.chipPressed,
                ]}
              >
                <Text
                  style={[styles.chipLabel, activeScopeIndex === index && styles.chipLabelActive]}
                  numberOfLines={1}
                >
                  {scope.node_name}
                </Text>
                {scope.start_page && scope.end_page ? (
                  <Text
                    style={[
                      styles.chipMeta,
                      activeScopeIndex === index && styles.chipMetaActive,
                    ]}
                  >
                    p{scope.start_page}–{scope.end_page}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.detailsCard}>
        <View style={styles.detailsHead}>
          <Text style={styles.detailsTitle}>Details</Text>
          <Text style={styles.detailsProvider}>{resource.provider_label}</Text>
        </View>
        {resource.description ? (
          <Text style={styles.detailsBody}>{resource.description}</Text>
        ) : (
          <Text style={styles.detailsBody}>
            {resource.page_count ? `${resource.page_count}-page ` : ''}
            {resource.resource_type.replace(/_/g, ' ') || 'reference'}
            {resource.target_exam ? ` aligned to ${resource.target_exam}` : ''}.
          </Text>
        )}
        <View style={styles.metaRow}>
          {resource.target_exam ? <MetaChip label={resource.target_exam} /> : null}
          {resource.board ? <MetaChip label={resource.board} /> : null}
          {resource.standard ? <MetaChip label={resource.standard} /> : null}
        </View>
      </View>

      <View style={styles.actions}>
        <AnimatedButton
          label="View full PDF"
          variant="primary"
          disabled={!resource.view_url}
          onPress={() => void openResourceUrl(resource.view_url)}
          style={styles.actionPrimary}
        />
        <AnimatedButton
          label="Download"
          variant="secondary"
          disabled={!resource.download_url}
          onPress={() => void openResourceUrl(resource.download_url)}
          style={styles.actionSecondary}
        />
      </View>

      {!resource.view_url && !resource.download_url ? (
        <Text style={styles.helperNote}>
          This resource has no attached file yet. Check back after your teacher publishes the PDF.
        </Text>
      ) : null}
    </AppScreen>
  )
}

function MetaChip({ label }: { label: string }) {
  return (
    <View style={styles.metaChip}>
      <Text style={styles.metaChipText}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[20],
    gap: spacing[4],
  },
  pill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  pillText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  docCard: {
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[4],
    ...shadows.xs,
  },
  docHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  docHeadTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 14,
  },
  formulaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  formulaText: {
    flex: 1,
    color: colors.text,
    fontFamily: 'Courier',
    fontSize: 13.5,
    letterSpacing: 0.2,
  },
  formulaAnnotation: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  previewEmpty: {
    alignItems: 'flex-start',
    gap: spacing[1],
    paddingVertical: spacing[3],
  },
  previewEmptyTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  previewEmptyBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
  },
  section: {
    gap: spacing[2],
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[1],
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  sectionMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    maxWidth: '100%',
  },
  chipActive: {
    backgroundColor: colors.slate[900],
    borderColor: colors.slate[900],
  },
  chipPressed: {
    transform: [{ scale: 0.97 }],
  },
  chipLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 12,
  },
  chipLabelActive: {
    color: colors.textInverse,
  },
  chipMeta: {
    marginTop: 2,
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
  },
  chipMetaActive: {
    color: 'rgba(255,255,255,0.72)',
  },
  detailsCard: {
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[4],
    gap: spacing[2],
    ...shadows.xs,
  },
  detailsHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  detailsTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  detailsProvider: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  detailsBody: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12.5,
    lineHeight: 17,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginTop: spacing[1],
  },
  metaChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.accentSurface,
  },
  metaChipText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 11,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  actionPrimary: {
    flex: 1,
  },
  actionSecondary: {
    width: 130,
  },
  helperNote: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    textAlign: 'center',
  },
})
