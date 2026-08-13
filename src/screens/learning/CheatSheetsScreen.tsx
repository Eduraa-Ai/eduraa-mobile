import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
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

// Web: /student/cheat-sheets. Mirrors StudentCheatSheets.tsx.
// Only cheat-sheet-typed resources; subject and chapter pickers filter them.
// Sheet selection opens a per-page PNG viewer (mirrors CheatSheetPageImage
// with authenticated image fetching).
const TITLE = 'Cheat Sheets'
const SUBTITLE = 'Select subject, chapter, and sheet'
const EYEBROW = 'Revision Library'
const NO_SHEETS = 'No sheets match this chapter.'
const PICK_HINT = 'Select a subject and chapter to view sheets.'
const LOADING_LIBRARY = 'Loading revision library'
const PICK_TITLE = 'Select a revision sheet'
const PICK_BODY = 'Choose a subject and chapter to open a published PDF.'
const PREVIEW_UNAVAILABLE = 'Preview unavailable'
const PREVIEW_UNAVAILABLE_BODY =
  'This sheet does not have page preview data yet. You can still download the PDF.'
const LIST_ERROR = 'Unable to load revision resources.'
const DOWNLOAD_ERROR = 'Unable to download this PDF.'
const PAGE_ERROR = 'Unable to load this page.'

// Web uses fixed order: Full Cheat Sheet | Physics | Chemistry | Mathematics.
const FULL_CHEAT_SHEET_SUBJECT = 'Full Cheat Sheet'
const SUBJECT_ORDER = [
  FULL_CHEAT_SHEET_SUBJECT,
  'Physics',
  'Chemistry',
  'Mathematics',
]

function normalizeKey(value: string | null | undefined) {
  return String(value || '').trim().toLocaleLowerCase()
}

// Match the web's normalizeSubject exactly. Resources without a subject_name
// (or with "full"/"master" in the name) fold into "Full Cheat Sheet" so no
// resource is silently dropped.
function normalizeSubject(value: string | null | undefined) {
  const subject = String(value || 'General').trim()
  const key = normalizeKey(subject)
  if (key.includes('full') || key.includes('master')) return FULL_CHEAT_SHEET_SUBJECT
  if (key.includes('physics')) return 'Physics'
  if (key.includes('chem')) return 'Chemistry'
  if (key.includes('math')) return 'Mathematics'
  return subject || 'General'
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function safeStem(input: string) {
  const stem = input.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '')
  return stem || 'cheat-sheet'
}

function orderSubjects(subjects: string[]): string[] {
  const set = new Set(subjects)
  const ordered: string[] = []
  for (const name of SUBJECT_ORDER) {
    if (set.has(name)) {
      ordered.push(name)
      set.delete(name)
    }
  }
  return [...ordered, ...Array.from(set).sort()]
}

// Web: getChapters — only 'chapter' node_type, trimmed and non-empty.
function scopeChapters(resource: LearningResource): string[] {
  const names = resource.scopes
    .filter((s) => s.node_type === 'chapter')
    .map((s) => (s.node_name || '').trim())
    .filter((s): s is string => Boolean(s))
  return Array.from(new Set(names))
}

function isResourceInChapter(resource: LearningResource, chapter: string) {
  const key = normalizeKey(chapter)
  return scopeChapters(resource).some((c) => normalizeKey(c) === key)
}

export default function CheatSheetsScreen() {
  const insets = useSafeAreaInsets()
  const [subject, setSubject] = useState<string | null>(null)
  // Empty array = no chapter filter (show all sheets in the subject bucket).
  // 2+ items = union filter; the user can also open a merged viewer that
  // concatenates every matching sheet's pages.
  const [selectedChapters, setSelectedChapters] = useState<string[]>([])
  const [activeResourceIds, setActiveResourceIds] = useState<string[]>([])
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false)
  const [chapterPickerOpen, setChapterPickerOpen] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const listQuery = useQuery({
    queryKey: ['cheat-sheets-library'],
    queryFn: () => learningResourcesApi.list(),
    refetchInterval: 30_000,
  })

  const resources = listQuery.data?.items ?? []

  // Web parity: NO resource_type prefilter. Every resource returned by the
  // API is a candidate; the subject/chapter picker is the only filter. This
  // matches StudentCheatSheets.tsx which never inspects resource_type.
  const resourcesByBucket = useMemo(() => {
    const map = new Map<string, LearningResource[]>()
    for (const r of resources) {
      const bucket = normalizeSubject(r.subject_name)
      const bucketList = map.get(bucket)
      if (bucketList) bucketList.push(r)
      else map.set(bucket, [r])
    }
    return map
  }, [resources])

  const subjects = useMemo(
    () => orderSubjects(Array.from(resourcesByBucket.keys())),
    [resourcesByBucket],
  )

  const chapters = useMemo(() => {
    if (!subject) return []
    const bucketResources = resourcesByBucket.get(subject) ?? []
    return Array.from(new Set(bucketResources.flatMap(scopeChapters))).sort()
  }, [resourcesByBucket, subject])

  const sheetsForChapter = useMemo(() => {
    if (!subject) return []
    const bucketResources = resourcesByBucket.get(subject) ?? []
    if (selectedChapters.length === 0) return bucketResources
    return bucketResources.filter((r) =>
      selectedChapters.some((c) => isResourceInChapter(r, c)),
    )
  }, [resourcesByBucket, subject, selectedChapters])

  // Auto-select first subject on first load.
  useEffect(() => {
    if (!subject && subjects.length > 0) setSubject(subjects[0])
  }, [subject, subjects])

  // Prune chapters that no longer exist in the current subject.
  useEffect(() => {
    if (selectedChapters.length === 0) return
    const kept = selectedChapters.filter((c) => chapters.includes(c))
    if (kept.length !== selectedChapters.length) setSelectedChapters(kept)
  }, [selectedChapters, chapters])

  // Resources actually rendered in the viewer, in the order the user selected.
  const activeResources = useMemo(() => {
    if (activeResourceIds.length === 0) return []
    return activeResourceIds
      .map((id) => sheetsForChapter.find((r) => r.id === id))
      .filter((r): r is LearningResource => Boolean(r))
  }, [activeResourceIds, sheetsForChapter])

  const canMergeMultiple =
    selectedChapters.length >= 2 && sheetsForChapter.length >= 2

  const handleDownload = useCallback(async (resource: LearningResource) => {
    const url = resource.download_url || resource.view_url
    if (!url) return
    setDownloadError(null)
    setDownloadingId(resource.id)
    try {
      await openProtectedDocument(url, safeStem(resource.title))
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

      <View style={styles.pickers}>
        <PickerField
          label="Subject"
          value={subject ?? undefined}
          placeholder="Select subject"
          onPress={() => setSubjectPickerOpen(true)}
          disabled={subjects.length === 0 && !listQuery.isLoading}
        />
        <PickerField
          label="Chapter"
          value={
            selectedChapters.length === 0
              ? undefined
              : selectedChapters.length === 1
                ? formatLabel(selectedChapters[0])
                : `${selectedChapters.length} chapters`
          }
          placeholder={subject ? 'All chapters' : 'Choose subject first'}
          onPress={() => setChapterPickerOpen(true)}
          disabled={!subject || chapters.length === 0}
        />
      </View>

      {listQuery.isError ? (
        <ErrorState
          title={LIST_ERROR}
          message="Refresh and try again."
          onAction={() => void listQuery.refetch()}
        />
      ) : listQuery.isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>{LOADING_LIBRARY}</Text>
        </View>
      ) : subject === null ? (
        <EmptyPanel
          icon="library-outline"
          title={PICK_TITLE}
          body={PICK_HINT}
        />
      ) : sheetsForChapter.length === 0 ? (
        <EmptyPanel
          icon="document-outline"
          title={NO_SHEETS}
          body="Try picking a different chapter or clearing the chapter filter."
        />
      ) : (
        <View style={styles.list}>
          <Text style={styles.listHeader}>
            Sheets · {sheetsForChapter.length}
          </Text>
          {canMergeMultiple ? (
            <Pressable
              onPress={() =>
                setActiveResourceIds(sheetsForChapter.map((r) => r.id))
              }
              style={({ pressed }) => [
                styles.combinedCta,
                pressed && styles.combinedCtaPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Open combined cheat sheet for ${selectedChapters.length} chapters`}
            >
              <View style={styles.combinedCtaIcon}>
                <Ionicons name="layers-outline" size={20} color={colors.textOnBrand} />
              </View>
              <View style={styles.combinedCtaCopy}>
                <Text style={styles.combinedCtaTitle}>
                  Open combined cheat sheet
                </Text>
                <Text style={styles.combinedCtaBody}>
                  {sheetsForChapter.length} sheets · {selectedChapters.length} chapters
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textOnBrand} />
            </Pressable>
          ) : null}
          {sheetsForChapter.map((sheet) => (
            <SheetRow
              key={sheet.id}
              sheet={sheet}
              onPress={() => setActiveResourceIds([sheet.id])}
              onDownload={() => void handleDownload(sheet)}
              downloading={downloadingId === sheet.id}
            />
          ))}
        </View>
      )}

      {downloadError ? (
        <View style={styles.bannerError}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
          <Text style={styles.bannerErrorText}>{downloadError}</Text>
        </View>
      ) : null}

      <OptionSheet
        visible={subjectPickerOpen}
        title="Subject"
        options={subjects}
        selectedValue={subject ?? undefined}
        onSelect={(value) => {
          setSubject(value)
          setSelectedChapters([])
          setActiveResourceIds([])
          setSubjectPickerOpen(false)
        }}
        onClose={() => setSubjectPickerOpen(false)}
      />
      <MultiSelectSheet
        visible={chapterPickerOpen}
        title="Chapters"
        subtitle="Select one or more chapters to merge their sheets."
        options={chapters}
        selectedValues={selectedChapters}
        formatLabel={formatLabel}
        onApply={(next) => {
          setSelectedChapters(next)
          setActiveResourceIds([])
          setChapterPickerOpen(false)
        }}
        onClose={() => setChapterPickerOpen(false)}
      />

      <SheetViewerModal
        visible={activeResources.length > 0}
        resources={activeResources}
        onClose={() => setActiveResourceIds([])}
        onDownload={() =>
          activeResources.length === 1 &&
          void handleDownload(activeResources[0])
        }
        downloading={
          activeResources.length === 1 &&
          downloadingId === activeResources[0].id
        }
      />
    </AppScreen>
  )
}

function PickerField({
  label,
  value,
  placeholder,
  onPress,
  disabled,
}: {
  label: string
  value?: string
  placeholder: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <View style={styles.pickerField}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <Pressable
        onPress={disabled ? undefined : onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.pickerButton,
          disabled && styles.pickerButtonDisabled,
          pressed && !disabled && styles.pickerButtonPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
      >
        <Text
          style={[styles.pickerButtonText, !value && styles.pickerButtonPlaceholder]}
          numberOfLines={1}
        >
          {value ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textSoft} />
      </Pressable>
    </View>
  )
}

function SheetRow({
  sheet,
  onPress,
  onDownload,
  downloading,
}: {
  sheet: LearningResource
  onPress: () => void
  onDownload: () => void
  downloading: boolean
}) {
  const meta = [
    sheet.provider_label,
    sheet.page_count ? `${sheet.page_count} pages` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.sheetRow, pressed && styles.sheetRowPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open cheat sheet: ${sheet.title}`}
    >
      <View style={styles.sheetIcon}>
        <Ionicons name="document-text-outline" size={20} color={colors.accentStrong} />
      </View>
      <View style={styles.sheetCopy}>
        <Text style={styles.sheetTitle} numberOfLines={2}>
          {sheet.title}
        </Text>
        {meta ? <Text style={styles.sheetMeta}>{meta}</Text> : null}
      </View>
      <Pressable
        onPress={(event) => {
          event.stopPropagation()
          onDownload()
        }}
        disabled={downloading}
        hitSlop={8}
        style={({ pressed }) => [
          styles.sheetDownload,
          pressed && !downloading && styles.buttonPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Download PDF: ${sheet.title}`}
      >
        {downloading ? (
          <ActivityIndicator size="small" color={colors.accentStrong} />
        ) : (
          <Ionicons name="download-outline" size={18} color={colors.accentStrong} />
        )}
      </Pressable>
    </Pressable>
  )
}

function EmptyPanel({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  body: string
}) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={22} color={colors.accentStrong} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  )
}

function OptionSheet({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
  formatLabel: formatLabelProp,
}: {
  visible: boolean
  title: string
  options: string[]
  selectedValue?: string
  onSelect: (value: string) => void
  onClose: () => void
  formatLabel?: (value: string) => string
}) {
  const insets = useSafeAreaInsets()
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={sheetStyles.backdrop} onPress={onClose} accessibilityLabel="Dismiss">
        <Pressable
          style={[sheetStyles.card, { paddingBottom: insets.bottom + spacing[4] }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={sheetStyles.header}>
            <Text style={sheetStyles.title}>{title}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityLabel="Close"
              style={({ pressed }) => [sheetStyles.close, pressed && styles.buttonPressed]}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView style={sheetStyles.body} contentContainerStyle={sheetStyles.bodyContent}>
            {options.map((option) => {
              const active = option === selectedValue
              return (
                <Pressable
                  key={option}
                  onPress={() => onSelect(option)}
                  style={({ pressed }) => [
                    sheetStyles.option,
                    active && sheetStyles.optionActive,
                    pressed && styles.buttonPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[sheetStyles.optionText, active && sheetStyles.optionTextActive]}>
                    {formatLabelProp ? formatLabelProp(option) : option}
                  </Text>
                  {active ? (
                    <Ionicons name="checkmark" size={18} color={colors.accentStrong} />
                  ) : null}
                </Pressable>
              )
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// Multi-select bottom sheet used for the chapter picker. Users can toggle
// individual chapters, and hit Apply to commit the selection. The picker
// shows a running count so the user can see whether they'll get a single
// sheet or a merged view.
function MultiSelectSheet({
  visible,
  title,
  subtitle,
  options,
  selectedValues,
  onApply,
  onClose,
  formatLabel: formatLabelProp,
}: {
  visible: boolean
  title: string
  subtitle?: string
  options: string[]
  selectedValues: string[]
  onApply: (next: string[]) => void
  onClose: () => void
  formatLabel?: (value: string) => string
}) {
  const insets = useSafeAreaInsets()
  const [draft, setDraft] = useState<string[]>(selectedValues)

  // Sync draft when opened, so partial edits don't leak between openings.
  useEffect(() => {
    if (visible) setDraft(selectedValues)
  }, [visible, selectedValues])

  const toggle = useCallback((value: string) => {
    setDraft((current) =>
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    )
  }, [])

  const applyLabel =
    draft.length === 0
      ? 'Show all sheets'
      : draft.length === 1
        ? 'Apply 1 chapter'
        : `Apply ${draft.length} chapters`

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose} accessibilityLabel="Dismiss">
        <Pressable
          style={[sheetStyles.card, { paddingBottom: insets.bottom + spacing[4] }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={sheetStyles.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={sheetStyles.title}>{title}</Text>
              {subtitle ? <Text style={sheetStyles.subtitle}>{subtitle}</Text> : null}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityLabel="Close"
              style={({ pressed }) => [sheetStyles.close, pressed && styles.buttonPressed]}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView style={sheetStyles.body} contentContainerStyle={sheetStyles.bodyContent}>
            {options.map((option) => {
              const active = draft.includes(option)
              return (
                <Pressable
                  key={option}
                  onPress={() => toggle(option)}
                  style={({ pressed }) => [
                    sheetStyles.option,
                    active && sheetStyles.optionActive,
                    pressed && styles.buttonPressed,
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: active }}
                >
                  <View style={[sheetStyles.checkbox, active && sheetStyles.checkboxActive]}>
                    {active ? (
                      <Ionicons name="checkmark" size={14} color={colors.textOnBrand} />
                    ) : null}
                  </View>
                  <Text style={[sheetStyles.optionText, active && sheetStyles.optionTextActive]}>
                    {formatLabelProp ? formatLabelProp(option) : option}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>

          <View style={sheetStyles.footer}>
            <Pressable
              onPress={() => setDraft([])}
              disabled={draft.length === 0}
              style={({ pressed }) => [
                sheetStyles.footerSecondary,
                draft.length === 0 && sheetStyles.buttonDisabled,
                pressed && draft.length > 0 && styles.buttonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Clear chapter selection"
            >
              <Text style={sheetStyles.footerSecondaryText}>Clear</Text>
            </Pressable>
            <Pressable
              onPress={() => onApply(draft)}
              style={({ pressed }) => [
                sheetStyles.footerPrimary,
                pressed && styles.buttonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={applyLabel}
            >
              <Text style={sheetStyles.footerPrimaryText}>{applyLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

type ViewerPage =
  | { kind: 'header'; sheetIndex: number; sheetTitle: string; totalSheets: number; id: string }
  | { kind: 'page'; resourceId: string; assetId: string; pageNumber: number; resourceTitle: string; id: string }

function buildViewerPages(resources: LearningResource[]): ViewerPage[] {
  const items: ViewerPage[] = []
  const totalSheets = resources.length
  resources.forEach((resource, index) => {
    const assetId = resource.original_asset_id
    const pageCount = resource.page_count ?? 0
    if (!assetId || pageCount <= 0) return
    if (totalSheets > 1) {
      items.push({
        kind: 'header',
        sheetIndex: index + 1,
        sheetTitle: resource.title,
        totalSheets,
        id: `header-${resource.id}`,
      })
    }
    for (let p = 1; p <= pageCount; p += 1) {
      items.push({
        kind: 'page',
        resourceId: resource.id,
        assetId,
        pageNumber: p,
        resourceTitle: resource.title,
        id: `${resource.id}-page-${p}`,
      })
    }
  })
  return items
}

function SheetViewerModal({
  visible,
  resources,
  onClose,
  onDownload,
  downloading,
}: {
  visible: boolean
  resources: LearningResource[]
  onClose: () => void
  onDownload: () => void
  downloading: boolean
}) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const viewerPages = useMemo(() => buildViewerPages(resources), [resources])
  const totalPages = viewerPages.filter((p) => p.kind === 'page').length

  if (resources.length === 0) return null
  const merged = resources.length > 1
  const titleText = merged ? 'Combined cheat sheet' : resources[0].title
  const metaText = merged
    ? `${resources.length} sheets · ${totalPages} pages`
    : [
        resources[0].provider_label,
        resources[0].page_count ? `${resources[0].page_count} pages` : null,
      ]
        .filter(Boolean)
        .join(' · ')
  const canRenderPages = viewerPages.length > 0
  const contentWidth = Math.min(width - spacing[4] * 2, 720)
  const pageHeight = Math.round(contentWidth * 1.414)

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[viewerStyles.container, { paddingTop: insets.top }]}>
        <View style={viewerStyles.header}>
          <View style={viewerStyles.headerCopy}>
            <Text style={viewerStyles.title} numberOfLines={1}>
              {titleText}
            </Text>
            {metaText ? (
              <Text style={viewerStyles.meta} numberOfLines={1}>
                {metaText}
              </Text>
            ) : null}
          </View>
          {!merged ? (
            <Pressable
              onPress={onDownload}
              disabled={downloading}
              hitSlop={8}
              style={({ pressed }) => [
                viewerStyles.iconButton,
                pressed && !downloading && styles.buttonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Download cheat sheet PDF"
            >
              {downloading ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Ionicons name="download-outline" size={20} color={colors.text} />
              )}
            </Pressable>
          ) : null}
          <Pressable
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [viewerStyles.iconButton, pressed && styles.buttonPressed]}
            accessibilityRole="button"
            accessibilityLabel="Close viewer"
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        {canRenderPages ? (
          <FlatList
            data={viewerPages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              viewerStyles.pagesContent,
              { paddingBottom: insets.bottom + spacing[6] },
            ]}
            initialNumToRender={2}
            windowSize={4}
            removeClippedSubviews={Platform.OS !== 'web'}
            renderItem={({ item }) =>
              item.kind === 'header' ? (
                <View style={[viewerStyles.sectionHeader, { width: contentWidth }]}>
                  <Text style={viewerStyles.sectionKicker}>
                    Sheet {item.sheetIndex} of {item.totalSheets}
                  </Text>
                  <Text style={viewerStyles.sectionTitle} numberOfLines={2}>
                    {item.sheetTitle}
                  </Text>
                </View>
              ) : (
                <View style={[viewerStyles.pageWrap, { width: contentWidth }]}>
                  <Text style={viewerStyles.pageLabel}>Page {item.pageNumber}</Text>
                  <AuthenticatedImage
                    uri={learningResourcePageImagePath(item.resourceId, item.assetId, item.pageNumber)}
                    accessibilityLabel={`Page ${item.pageNumber} of ${item.resourceTitle}`}
                    containerStyle={{ width: contentWidth, height: pageHeight }}
                    imageStyle={{ width: contentWidth, height: pageHeight }}
                  />
                </View>
              )
            }
          />
        ) : (
          <View style={viewerStyles.previewFallback}>
            <Ionicons name="document-outline" size={28} color={colors.textSoft} />
            <Text style={viewerStyles.fallbackTitle}>{PREVIEW_UNAVAILABLE}</Text>
            <Text style={viewerStyles.fallbackBody}>
              {merged
                ? 'None of the selected chapter sheets have page previews. Close and download each PDF individually.'
                : PREVIEW_UNAVAILABLE_BODY}
            </Text>
            {!merged ? (
              <Pressable
                onPress={onDownload}
                disabled={downloading}
                style={({ pressed }) => [
                  viewerStyles.fallbackButton,
                  pressed && !downloading && styles.buttonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Download cheat sheet PDF"
              >
                {downloading ? (
                  <ActivityIndicator size="small" color={colors.textOnBrand} />
                ) : (
                  <Ionicons name="download-outline" size={16} color={colors.textOnBrand} />
                )}
                <Text style={viewerStyles.fallbackButtonText}>Download PDF</Text>
              </Pressable>
            ) : null}
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
  pickers: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  pickerField: {
    flex: 1,
    gap: spacing[1],
  },
  pickerLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  pickerButton: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: spacing[2],
    ...shadows.xs,
  },
  pickerButtonDisabled: {
    opacity: 0.5,
  },
  pickerButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  pickerButtonText: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 13,
  },
  pickerButtonPlaceholder: {
    color: colors.textSoft,
  },
  loadingWrap: {
    paddingVertical: spacing[8],
    alignItems: 'center',
    gap: spacing[2],
  },
  loadingText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
  },
  list: { gap: spacing[2] },
  listHeader: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing[1],
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadows.xs,
  },
  sheetRowPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
    borderColor: colors.borderBrand,
  },
  sheetIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  sheetCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  sheetTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 14,
    lineHeight: 18,
  },
  sheetMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11.5,
  },
  sheetDownload: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderBrand,
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
  combinedCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    marginTop: spacing[1],
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    ...shadows.xs,
  },
  combinedCtaPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  combinedCtaIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  combinedCtaCopy: { flex: 1, minWidth: 0, gap: 2 },
  combinedCtaTitle: {
    color: colors.textOnBrand,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 14,
    lineHeight: 18,
  },
  combinedCtaBody: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11.5,
  },
  buttonPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
})

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  card: {
    maxHeight: '75%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.card,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing[3],
  },
  title: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flexGrow: 0 },
  bodyContent: {
    gap: spacing[1],
    paddingBottom: spacing[2],
  },
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[3],
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  optionActive: {
    backgroundColor: colors.accentSurface,
  },
  optionText: {
    color: colors.text,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 14,
    flex: 1,
    minWidth: 0,
  },
  optionTextActive: {
    color: colors.accentStrong,
  },
  subtitle: {
    marginTop: 2,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
    backgroundColor: colors.card,
  },
  checkboxActive: {
    backgroundColor: colors.accentStrong,
    borderColor: colors.accentStrong,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing[2],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    marginTop: spacing[2],
  },
  footerSecondary: {
    height: 44,
    paddingHorizontal: spacing[4],
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  footerSecondaryText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 13,
  },
  footerPrimary: {
    flex: 1,
    height: 44,
    paddingHorizontal: spacing[4],
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  footerPrimaryText: {
    color: colors.textOnBrand,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  buttonDisabled: { opacity: 0.4 },
})

const viewerStyles = StyleSheet.create({
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
  sectionHeader: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radius.md,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    gap: 2,
  },
  sectionKicker: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
    lineHeight: 19,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    height: 44,
    minWidth: 200,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing[4],
    marginTop: spacing[2],
  },
  fallbackButtonText: {
    color: colors.textOnBrand,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
})
