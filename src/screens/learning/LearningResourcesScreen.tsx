import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { AppScreen, AuthenticatedImage, ErrorState, PremiumHeader } from '../../components/ui'
import {
  learningResourcePageImagePath,
  learningResourcesApi,
  type LearningResource,
} from '../../api/learningResources'
import { openProtectedDocument } from '../../utils/openProtectedDocument'
import { colors, radius, shadows, spacing, typography } from '../../theme'

// Web: /student/competitive-exam — "Learning Resources" nav item.
// Same GET /learning-resources endpoint, no server-side filters.
// Filtering is client-side by resource_type, subject_name, and free-text search.
// Verbatim copy from StudentCompetitiveExam.tsx.
const TITLE = 'Learning Resources'
const SUBTITLE = 'Open chapter-wise formula sheets and notes before an exam.'
const EYEBROW = 'Published revision library'
const CARD_TITLE = 'Quick Revision Resources'
const SEARCH_PLACEHOLDER = 'Search papers, chapters, or question text'
const EMPTY_FILTERED_TITLE = 'No revision PDFs match this filter.'
const EMPTY_FILTERED_BODY = 'Try another subject or search term.'
const EMPTY_TITLE = 'No revision PDFs have been published yet.'
const EMPTY_BODY = 'Published chapter-wise resources will appear here.'
const LIST_ERROR = 'Unable to load revision PDFs.'
const VIEW_ERROR = 'Unable to open this PDF.'
const DOWNLOAD_ERROR = 'Unable to download this PDF.'

function resourceTypeLabel(type: string) {
  return type
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function safeStem(input: string) {
  const stem = input.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '')
  return stem || 'learning-resource'
}

async function downloadResource(resource: LearningResource) {
  const url = resource.download_url || resource.view_url
  if (!url) throw new Error('no url')
  await openProtectedDocument(url, safeStem(resource.title))
}

export default function LearningResourcesScreen() {
  const insets = useSafeAreaInsets()
  const [resourceType, setResourceType] = useState<string>('all')
  const [subjectFilter, setSubjectFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [viewer, setViewer] = useState<LearningResource | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const listQuery = useQuery({
    queryKey: ['learning-resources-list'],
    queryFn: () => learningResourcesApi.list(),
    refetchInterval: 30_000,
  })

  const resources = listQuery.data?.items ?? []

  const resourceTypes = useMemo(
    () => Array.from(new Set(resources.map((r) => r.resource_type))).sort(),
    [resources],
  )
  const subjects = useMemo(
    () =>
      Array.from(
        new Set(resources.map((r) => r.subject_name).filter((v): v is string => Boolean(v))),
      ).sort(),
    [resources],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return resources.filter((r) => {
      if (resourceType !== 'all' && r.resource_type !== resourceType) return false
      if (subjectFilter !== 'all' && r.subject_name !== subjectFilter) return false
      if (!q) return true
      const haystack = [
        r.title,
        r.provider_label,
        r.description,
        r.subject_name,
        r.target_exam,
        r.board,
        r.standard,
        r.resource_type.replace(/_/g, ' '),
        ...r.scopes.map((s) => s.node_name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [resources, resourceType, subjectFilter, search])

  const openViewer = useCallback((resource: LearningResource) => {
    setViewer(resource)
    setDownloadError(null)
  }, [])

  const closeViewer = useCallback(() => setViewer(null), [])

  const handleDownload = useCallback(async (resource: LearningResource) => {
    setDownloadError(null)
    setDownloadingId(resource.id)
    try {
      await downloadResource(resource)
    } catch {
      setDownloadError(DOWNLOAD_ERROR)
    } finally {
      setDownloadingId(null)
    }
  }, [])

  return (
    <AppScreen
      protectedChrome
      contentStyle={styles.screen}
      refreshControl={
        <RefreshControl
          refreshing={listQuery.isFetching && !listQuery.isLoading}
          onRefresh={() => void listQuery.refetch()}
          tintColor={colors.accent}
        />
      }
    >
      <PremiumHeader eyebrow={EYEBROW} title={TITLE} subtitle={SUBTITLE} />

      <FilterPills
        label="Type"
        values={['all', ...resourceTypes]}
        activeValue={resourceType}
        onSelect={setResourceType}
        formatLabel={(v) => (v === 'all' ? 'All' : resourceTypeLabel(v))}
      />

      {subjects.length > 0 ? (
        <FilterPills
          label="Subject"
          values={['all', ...subjects]}
          activeValue={subjectFilter}
          onSelect={setSubjectFilter}
          formatLabel={(v) => (v === 'all' ? 'All subjects' : v)}
        />
      ) : null}

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={colors.textSoft} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={SEARCH_PLACEHOLDER}
          placeholderTextColor={colors.textSoft}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel="Search learning resources"
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={18} color={colors.textSoft} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>{CARD_TITLE}</Text>
        <Text style={styles.headerCount}>
          {listQuery.isLoading ? '…' : `${filtered.length} of ${resources.length}`}
        </Text>
      </View>

      {downloadError ? (
        <View style={styles.bannerError}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={styles.bannerErrorText}>{downloadError}</Text>
        </View>
      ) : null}

      {listQuery.isError ? (
        <ErrorState
          title={LIST_ERROR}
          message="Refresh and try again."
          onAction={() => void listQuery.refetch()}
        />
      ) : listQuery.isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons name="library-outline" size={22} color={colors.accentStrong} />
          </View>
          <Text style={styles.emptyTitle}>
            {resources.length === 0 ? EMPTY_TITLE : EMPTY_FILTERED_TITLE}
          </Text>
          <Text style={styles.emptyBody}>
            {resources.length === 0 ? EMPTY_BODY : EMPTY_FILTERED_BODY}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {filtered.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              onView={() => openViewer(resource)}
              onDownload={() => void handleDownload(resource)}
              downloading={downloadingId === resource.id}
            />
          ))}
        </View>
      )}

      <PdfPageViewerModal
        visible={viewer !== null}
        resource={viewer}
        onClose={closeViewer}
        onDownload={() => viewer && void handleDownload(viewer)}
      />
    </AppScreen>
  )
}

function FilterPills({
  label,
  values,
  activeValue,
  onSelect,
  formatLabel,
}: {
  label: string
  values: string[]
  activeValue: string
  onSelect: (value: string) => void
  formatLabel: (value: string) => string
}) {
  return (
    <View style={styles.filterRow} accessibilityLabel={`${label} filter`}>
      {values.map((value) => {
        const active = value === activeValue
        return (
          <Pressable
            key={`${label}-${value}`}
            onPress={() => onSelect(value)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && styles.chipPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${formatLabel(value)}`}
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
              {formatLabel(value)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function ResourceCard({
  resource,
  onView,
  onDownload,
  downloading,
}: {
  resource: LearningResource
  onView: () => void
  onDownload: () => void
  downloading: boolean
}) {
  const canView = Boolean(resource.view_url || resource.original_asset_id)
  const canDownload = Boolean(resource.download_url || resource.view_url)
  const meta = [
    resource.provider_label,
    resource.page_count ? `${resource.page_count} pages` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const scopeText = resource.scopes.map((s) => s.node_name).filter(Boolean).join(', ')

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardIcon}>
          <Ionicons name="document-text-outline" size={20} color={colors.accentStrong} />
        </View>
        <View style={styles.typePill}>
          <Text style={styles.typePillText}>{resourceTypeLabel(resource.resource_type)}</Text>
        </View>
      </View>
      <Text style={styles.cardTitle}>{resource.title}</Text>
      {meta ? <Text style={styles.cardMeta}>{meta}</Text> : null}
      {scopeText ? (
        <Text style={styles.cardScope} numberOfLines={2}>
          {scopeText}
        </Text>
      ) : null}
      {resource.description ? (
        <Text style={styles.cardDescription} numberOfLines={2}>
          {resource.description}
        </Text>
      ) : null}
      <View style={styles.cardActions}>
        <Pressable
          onPress={onView}
          disabled={!canView}
          style={({ pressed }) => [
            styles.primaryButton,
            !canView && styles.buttonDisabled,
            pressed && canView && styles.buttonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`View PDF: ${resource.title}`}
        >
          <Ionicons name="eye-outline" size={16} color={colors.textOnBrand} />
          <Text style={styles.primaryButtonText}>View PDF</Text>
        </Pressable>
        <Pressable
          onPress={onDownload}
          disabled={!canDownload || downloading}
          style={({ pressed }) => [
            styles.secondaryButton,
            (!canDownload || downloading) && styles.buttonDisabled,
            pressed && canDownload && !downloading && styles.buttonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Download PDF: ${resource.title}`}
        >
          {downloading ? (
            <ActivityIndicator size="small" color={colors.accentStrong} />
          ) : (
            <Ionicons name="download-outline" size={16} color={colors.accentStrong} />
          )}
          <Text style={styles.secondaryButtonText}>Download</Text>
        </Pressable>
      </View>
    </View>
  )
}

function PdfPageViewerModal({
  visible,
  resource,
  onClose,
  onDownload,
}: {
  visible: boolean
  resource: LearningResource | null
  onClose: () => void
  onDownload: () => void
}) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const pageCount = resource?.page_count ?? 0
  const assetId = resource?.original_asset_id ?? null
  const pages = useMemo(
    () => Array.from({ length: pageCount }, (_, i) => i + 1),
    [pageCount],
  )

  if (!resource) return null
  const canRenderPages = pageCount > 0 && Boolean(assetId)
  const contentWidth = Math.min(width - spacing[4] * 2, 720)
  const pageHeight = Math.round(contentWidth * 1.414) // A4 aspect ratio

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[modalStyles.container, { paddingTop: insets.top }]}>
        <View style={modalStyles.header}>
          <View style={modalStyles.headerCopy}>
            <Text style={modalStyles.title} numberOfLines={1}>
              {resource.title}
            </Text>
            {resource.provider_label ? (
              <Text style={modalStyles.meta} numberOfLines={1}>
                {resource.provider_label}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={onDownload}
            hitSlop={8}
            style={({ pressed }) => [modalStyles.iconButton, pressed && styles.buttonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Download PDF"
          >
            <Ionicons name="download-outline" size={20} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [modalStyles.iconButton, pressed && styles.buttonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Close viewer"
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        {canRenderPages ? (
          <FlatList
            data={pages}
            keyExtractor={(n) => `${resource.id}-page-${n}`}
            contentContainerStyle={[
              modalStyles.pagesContent,
              { paddingBottom: insets.bottom + spacing[6] },
            ]}
            initialNumToRender={2}
            windowSize={4}
            removeClippedSubviews={Platform.OS !== 'web'}
            renderItem={({ item }) => (
              <View style={[modalStyles.pageWrap, { width: contentWidth }]}>
                <Text style={modalStyles.pageLabel}>Page {item}</Text>
                <AuthenticatedImage
                  uri={learningResourcePageImagePath(resource.id, assetId as string, item)}
                  accessibilityLabel={`Page ${item} of ${resource.title}`}
                  containerStyle={{ width: contentWidth, height: pageHeight }}
                  imageStyle={{ width: contentWidth, height: pageHeight }}
                />
              </View>
            )}
          />
        ) : (
          <View style={modalStyles.previewFallback}>
            <Ionicons name="document-outline" size={28} color={colors.textSoft} />
            <Text style={modalStyles.fallbackTitle}>Preview unavailable</Text>
            <Text style={modalStyles.fallbackBody}>
              This resource does not have page previews yet. Download the PDF to view it.
            </Text>
            <Pressable
              onPress={onDownload}
              style={({ pressed }) => [
                styles.primaryButton,
                modalStyles.fallbackButton,
                pressed && styles.buttonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Download PDF"
            >
              <Ionicons name="download-outline" size={16} color={colors.textOnBrand} />
              <Text style={styles.primaryButtonText}>Download PDF</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[16],
    gap: spacing[3],
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  chip: {
    paddingHorizontal: spacing[3],
    height: 34,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.slate[900],
    borderColor: colors.slate[900],
  },
  chipPressed: { transform: [{ scale: 0.97 }] },
  chipLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 12,
  },
  chipLabelActive: { color: colors.textInverse },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 46,
    paddingHorizontal: spacing[4],
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadows.xs,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
    padding: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[1],
    marginTop: spacing[1],
  },
  headerTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
  },
  headerCount: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  bannerError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: colors.dangerSurface,
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.24)',
  },
  bannerErrorText: {
    flex: 1,
    color: colors.danger,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 12,
  },
  loadingWrap: {
    paddingVertical: spacing[8],
    alignItems: 'center',
  },
  emptyCard: {
    padding: spacing[5],
    gap: spacing[2],
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'flex-start',
    ...shadows.xs,
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
  },
  emptyBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12.5,
    lineHeight: 17,
  },
  list: { gap: spacing[3] },
  card: {
    padding: spacing[4],
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: spacing[2],
    ...shadows.xs,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  typePill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.slate[100],
  },
  typePillText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  cardTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
    lineHeight: 20,
  },
  cardMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 11,
  },
  cardScope: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  cardDescription: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  cardActions: {
    flexDirection: 'row',
    gap: spacing[2],
    marginTop: spacing[1],
  },
  primaryButton: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  primaryButtonText: {
    color: colors.textOnBrand,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  secondaryButton: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  secondaryButtonText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
})

const modalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.card,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
  },
  meta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    marginTop: 2,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  pagesContent: {
    alignItems: 'center',
    padding: spacing[4],
    gap: spacing[4],
  },
  pageWrap: {
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[3],
    gap: spacing[2],
    ...shadows.xs,
  },
  pageLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  previewFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[6],
    gap: spacing[3],
  },
  fallbackTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
  },
  fallbackBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 320,
  },
  fallbackButton: {
    marginTop: spacing[2],
    minWidth: 200,
    flex: undefined,
    width: 200,
  },
})
