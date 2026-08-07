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
  const [chapter, setChapter] = useState<string | null>(null)
  const [activeResourceId, setActiveResourceId] = useState<string | null>(null)
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
    if (!chapter) return bucketResources
    return bucketResources.filter((r) => isResourceInChapter(r, chapter))
  }, [resourcesByBucket, subject, chapter])

  // Auto-select first subject on first load.
  useEffect(() => {
    if (!subject && subjects.length > 0) setSubject(subjects[0])
  }, [subject, subjects])

  // Reset chapter when subject changes to something that doesn't include it.
  useEffect(() => {
    if (chapter && !chapters.includes(chapter)) setChapter(null)
  }, [chapter, chapters])

  const activeResource =
    activeResourceId != null
      ? sheetsForChapter.find((r) => r.id === activeResourceId) ?? null
      : null

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
          value={chapter ?? undefined}
          placeholder={subject ? 'Select chapter' : 'Choose subject first'}
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
          {sheetsForChapter.map((sheet) => (
            <SheetRow
              key={sheet.id}
              sheet={sheet}
              onPress={() => setActiveResourceId(sheet.id)}
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
          setChapter(null)
          setActiveResourceId(null)
          setSubjectPickerOpen(false)
        }}
        onClose={() => setSubjectPickerOpen(false)}
      />
      <OptionSheet
        visible={chapterPickerOpen}
        title="Chapter"
        options={['All chapters', ...chapters]}
        selectedValue={chapter ?? 'All chapters'}
        formatLabel={(v) => (v === 'All chapters' ? v : formatLabel(v))}
        onSelect={(value) => {
          setChapter(value === 'All chapters' ? null : value)
          setActiveResourceId(null)
          setChapterPickerOpen(false)
        }}
        onClose={() => setChapterPickerOpen(false)}
      />

      <SheetViewerModal
        visible={activeResource !== null}
        resource={activeResource}
        onClose={() => setActiveResourceId(null)}
        onDownload={() => activeResource && void handleDownload(activeResource)}
        downloading={activeResource != null && downloadingId === activeResource.id}
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

function SheetViewerModal({
  visible,
  resource,
  onClose,
  onDownload,
  downloading,
}: {
  visible: boolean
  resource: LearningResource | null
  onClose: () => void
  onDownload: () => void
  downloading: boolean
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
              {resource.title}
            </Text>
            {resource.provider_label ? (
              <Text style={viewerStyles.meta} numberOfLines={1}>
                {resource.provider_label}
                {resource.page_count ? ` · ${resource.page_count} pages` : ''}
              </Text>
            ) : null}
          </View>
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
            data={pages}
            keyExtractor={(n) => `${resource.id}-page-${n}`}
            contentContainerStyle={[
              viewerStyles.pagesContent,
              { paddingBottom: insets.bottom + spacing[6] },
            ]}
            initialNumToRender={2}
            windowSize={4}
            removeClippedSubviews={Platform.OS !== 'web'}
            renderItem={({ item }) => (
              <View style={[viewerStyles.pageWrap, { width: contentWidth }]}>
                <Text style={viewerStyles.pageLabel}>Page {item}</Text>
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
          <View style={viewerStyles.previewFallback}>
            <Ionicons name="document-outline" size={28} color={colors.textSoft} />
            <Text style={viewerStyles.fallbackTitle}>{PREVIEW_UNAVAILABLE}</Text>
            <Text style={viewerStyles.fallbackBody}>{PREVIEW_UNAVAILABLE_BODY}</Text>
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
  },
  optionTextActive: {
    color: colors.accentStrong,
  },
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
