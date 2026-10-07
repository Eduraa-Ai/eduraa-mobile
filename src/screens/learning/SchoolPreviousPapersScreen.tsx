import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNetInfo } from '@react-native-community/netinfo'
import { useNavigation } from '@react-navigation/native'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AppScreen, EmptyState, ErrorState, SectionHeading, SegmentedTabs, StatusPill } from '../../components/ui'
import { b2bProfileApi } from '../../api/b2bProfile'
import {
  previousPapersApi,
  type SchoolPreviousPaper,
} from '../../api/previousPapers'
import { papersApi } from '../../api/papers'
import { accountCacheScope } from '../../auth/queryCacheScope'
import { isSchoolPreviousPapersEligible } from '../../auth/landing'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, spacing, typography } from '../../theme'
import type { PaperListItem } from '../../types'
import { presentPdf } from '../../utils/pdfDownload'
import {
  filterPracticeSchoolPapers,
  filterSharedSchoolPapers,
  getSchoolPreviousPaperFilters,
  schoolPaperActions,
  schoolPaperContextLabel,
  schoolPaperFilename,
  schoolPaperYear,
  type SchoolPaperSource,
} from './schoolPreviousPapersModel'

type SchoolContext = {
  school?: string | null
  branch?: string | null
  board?: string | null
  standards: string[]
  divisions: string[]
  subjects: string[]
}

function formatDate(value?: string | null) {
  if (!value) return 'Date not provided'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date not provided'
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 'PDF'
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

function apiStatus(error: unknown) {
  return (error as { response?: { status?: number } } | null)?.response?.status
}

function SearchField({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) {
  return (
    <View style={styles.searchField}>
      <Ionicons name="search" size={18} color={colors.textSoft} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Search papers or subjects"
        placeholderTextColor={colors.textSoft}
        accessibilityLabel="Search school previous papers"
        autoCorrect={false}
        returnKeyType="search"
        style={styles.searchInput}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear paper search"
          hitSlop={8}
          onPress={() => onChangeText('')}
          style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
        >
          <Ionicons name="close-circle" size={19} color={colors.textSoft} />
        </Pressable>
      ) : null}
    </View>
  )
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        selected && styles.filterChipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>{label}</Text>
    </Pressable>
  )
}

function FilterRow({
  label,
  values,
  selected,
  onChange,
}: {
  label: string
  values: string[]
  selected: string | null
  onChange: (value: string | null) => void
}) {
  if (!values.length) return null
  return (
    <View style={styles.filterRow}>
      <Text style={styles.filterLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
        <FilterChip label="All" selected={!selected} onPress={() => onChange(null)} />
        {values.map((value) => (
          <FilterChip
            key={value}
            label={value}
            selected={selected === value}
            onPress={() => onChange(selected === value ? null : value)}
          />
        ))}
      </ScrollView>
    </View>
  )
}

function SourceSwitch({
  value,
  onChange,
  practiceCount,
  sharedCount,
  teacher,
  compact,
}: {
  value: SchoolPaperSource
  onChange: (value: SchoolPaperSource) => void
  practiceCount: number
  sharedCount: number
  teacher: boolean
  compact: boolean
}) {
  const items: Array<{ value: SchoolPaperSource; label: string; count: number }> = [
    {
      value: 'practice',
      label: compact ? teacher ? 'Structured' : 'Practice' : teacher ? 'Structured papers' : 'Practice ready',
      count: practiceCount,
    },
    {
      value: 'shared',
      label: compact ? 'PDFs' : 'Shared PDFs',
      count: sharedCount,
    },
  ]
  return (
    <SegmentedTabs
      accessibilityLabel="Paper sources"
      tabs={items.map((item) => ({ id: item.value, label: item.label, count: item.count }))}
      value={value}
      onChange={onChange}
    />
  )
}

const ContextHero = React.memo(function ContextHero({ context, teacher, compact }: { context?: SchoolContext; teacher: boolean; compact: boolean }) {
  const school = context?.school?.trim() || 'Your school'
  const curriculum = teacher
    ? schoolPaperContextLabel([
        context?.board,
        context?.standards.length ? `Standards ${context.standards.join(', ')}` : null,
      ])
    : schoolPaperContextLabel([
        context?.board,
        context?.standards[0] ? `Standard ${context.standards[0]}` : null,
        context?.divisions[0] ? `Division ${context.divisions[0]}` : null,
      ])

  return (
    <View
      style={styles.contextRow}
      accessible
      accessibilityLabel={`${school}. ${curriculum || 'Curriculum access is managed by your school'}. ${teacher ? 'Only papers owned by your teacher account appear here.' : 'Papers are matched to your school and class.'}`}
    >
      <View style={styles.contextIcon}>
        <Ionicons name="school-outline" size={19} color={colors.iconInk} />
      </View>
      <View style={styles.contextCopy}>
        <Text style={styles.contextSchool} numberOfLines={1}>{school}</Text>
        <Text style={styles.contextMeta} numberOfLines={1}>{curriculum || context?.branch || 'Curriculum access is managed by your school'}</Text>
      </View>
      <StatusPill label="Verified" tone="success" icon="shield-checkmark-outline" />
    </View>
  )
})

function PartialDataNotice({ message }: { message: string }) {
  return (
    <View accessibilityRole="alert" style={styles.partialNotice}>
      <Ionicons name="cloud-offline-outline" size={19} color={colors.warning} />
      <View style={styles.partialCopy}>
        <Text style={styles.partialTitle}>Some papers are temporarily unavailable</Text>
        <Text style={styles.partialBody}>{message}</Text>
      </View>
    </View>
  )
}

function PracticePaperCard({
  paper,
  teacher,
  compact,
  busy,
  onPress,
}: {
  paper: PaperListItem
  teacher: boolean
  compact: boolean
  busy: boolean
  onPress: () => void
}) {
  const action = schoolPaperActions(teacher ? 'teacher' : 'student', 'practice')[0]
  const year = schoolPaperYear(paper.created_at)
  const context = schoolPaperContextLabel([
    paper.subject_name,
    paper.standard ? `Std ${paper.standard}` : null,
    paper.division ? `Division ${paper.division}` : null,
    year,
  ])
  const count = paper.question_count ?? 0
  const actionLabel = action === 'attempt'
    ? paper.is_submitted_by_me ? 'Attempt again' : 'Start practice'
    : 'View details'
  const compactActionLabel = action === 'attempt'
    ? paper.is_submitted_by_me ? 'Retake' : 'Start'
    : 'Details'

  const meta = schoolPaperContextLabel([
    count ? `${count} questions` : null,
    paper.total_marks != null ? `${paper.total_marks} marks` : null,
    paper.duration_minutes ? `${paper.duration_minutes} min` : null,
  ])

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${compact ? compactActionLabel : actionLabel}: ${paper.title}`}
      accessibilityState={{ disabled: busy || !action, busy }}
      disabled={busy || !action}
      onPress={onPress}
      style={({ pressed }) => [styles.paperRow, (busy || !action) && styles.disabled, pressed && styles.pressed]}
    >
      <View style={styles.paperIcon}>
        <Ionicons name="flash-outline" size={18} color={colors.iconInk} />
      </View>
      <View style={styles.paperCopy}>
        <Text style={styles.paperTitle} numberOfLines={2}>{paper.title}</Text>
        <Text style={styles.paperContext} numberOfLines={1}>{context || 'Published school practice paper'}</Text>
        {meta ? <Text style={styles.paperContext} numberOfLines={1}>{meta}</Text> : null}
        {paper.is_submitted_by_me ? <StatusPill label="Attempted" tone="success" icon="checkmark" style={styles.paperPill} /> : null}
      </View>
      {busy ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="chevron-forward" size={17} color={colors.textSoft} />}
    </Pressable>
  )
}

function SharedPaperCard({
  paper,
  busy,
  error,
  onOpen,
  onDismissError,
}: {
  paper: SchoolPreviousPaper
  busy: boolean
  error?: string | null
  onOpen: () => void
  onDismissError: () => void
}) {
  const year = schoolPaperYear(paper.published_at || paper.created_at)
  const context = schoolPaperContextLabel([
    paper.subject_label,
    paper.class_label,
    year,
  ])
  const archived = paper.status === 'archived'

  return (
    <View style={[styles.sharedCard, archived && styles.archivedCard]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open PDF: ${paper.title}`}
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={onOpen}
        style={({ pressed }) => [styles.paperRow, busy && styles.disabled, pressed && styles.pressed]}
      >
        <View style={[styles.paperIcon, styles.sharedIcon]}>
          <Ionicons name="document-text-outline" size={18} color={colors.info} />
        </View>
        <View style={styles.paperCopy}>
          <Text style={styles.paperTitle} numberOfLines={2}>{paper.title}</Text>
          <Text style={styles.paperContext} numberOfLines={1}>{context || 'Shared school question paper'}</Text>
          <Text style={styles.paperContext} numberOfLines={1}>
            {[paper.teacher_name || 'School teacher', formatBytes(paper.file_size_bytes), formatDate(paper.published_at || paper.created_at)].join(' · ')}
          </Text>
          {paper.description ? <Text style={styles.description} numberOfLines={2}>{paper.description}</Text> : null}
          <StatusPill label={archived ? 'Archived' : 'Published'} tone={archived ? 'neutral' : 'success'} style={styles.paperPill} />
        </View>
        {busy ? <ActivityIndicator size="small" color={colors.info} /> : <Ionicons name="open-outline" size={16} color={colors.textSoft} />}
      </Pressable>
      {error ? (
        <View accessibilityRole="alert" style={styles.pdfError}>
          <View style={styles.pdfErrorCopy}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <View style={styles.pdfErrorTextGroup}>
              <Text style={styles.pdfErrorTitle}>We couldn’t open this PDF</Text>
              <Text style={styles.pdfErrorBody}>{error}</Text>
            </View>
          </View>
          <View style={styles.pdfErrorActions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onOpen}
              style={({ pressed }) => [styles.pdfRetry, busy && styles.disabled, pressed && styles.pressed]}
            >
              <Text style={styles.pdfRetryText}>Try again</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onDismissError} style={({ pressed }) => [styles.pdfDismiss, pressed && styles.pressed]}>
              <Text style={styles.pdfDismissText}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  )
}

export default function SchoolPreviousPapersScreen() {
  const navigation = useNavigation<any>()
  const netInfo = useNetInfo()
  const { width } = useWindowDimensions()
  const compact = width <= 340
  const user = useAuthStore((state) => state.user)
  const role = user?.role
  const teacher = role === 'teacher'
  const allowed = isSchoolPreviousPapersEligible(user)
  const accountKey = accountCacheScope(user)
  const [source, setSource] = useState<SchoolPaperSource>('practice')
  const [search, setSearch] = useState('')
  const [subject, setSubject] = useState<string | null>(null)
  const [standard, setStandard] = useState<string | null>(null)
  const [year, setYear] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const [openingPaperId, setOpeningPaperId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const openingRef = useRef<string | null>(null)
  const openingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (openingTimer.current) clearTimeout(openingTimer.current)
  }, [])

  const contextQuery = useQuery({
    queryKey: ['school-previous-papers', accountKey, 'context'],
    enabled: allowed && Boolean(accountKey),
    queryFn: async (): Promise<SchoolContext> => {
      if (teacher) {
        const data = await b2bProfileApi.getTeacherProfile()
        return {
          school: data.profile.school_name,
          branch: data.profile.branch_name,
          board: data.profile.board,
          standards: data.profile.standards_taught ?? [],
          divisions: data.profile.divisions_taught ?? [],
          subjects: data.profile.subjects_taught ?? [],
        }
      }
      const data = await b2bProfileApi.getStudentProfile()
      return {
        school: data.profile.school_name,
        branch: data.profile.branch_name,
        board: data.profile.board,
        standards: data.profile.standard ? [data.profile.standard] : [],
        divisions: data.profile.division ? [data.profile.division] : [],
        subjects: (data.subjects ?? []).map((item) => item.subject_name),
      }
    },
  })

  const sharedQuery = useQuery({
    queryKey: ['school-previous-papers', accountKey, 'shared', role],
    enabled: allowed && Boolean(accountKey),
    queryFn: async () => {
      if (teacher) return previousPapersApi.getTeacherSchoolPapers()
      const PAGE_SIZE = 100
      const first = await previousPapersApi.getStudentSchoolPapers({ page: 1, page_size: PAGE_SIZE })
      const allItems = [...first.items]
      const totalPages = Math.ceil(first.total / PAGE_SIZE)
      for (let p = 2; p <= totalPages; p++) {
        const next = await previousPapersApi.getStudentSchoolPapers({ page: p, page_size: PAGE_SIZE })
        allItems.push(...next.items)
      }
      return { ...first, items: allItems }
    },
  })

  const practiceQuery = useQuery({
    queryKey: ['papers', accountKey, 'school-previous', 'published'],
    enabled: allowed && Boolean(accountKey),
    queryFn: async () => {
      const LIMIT = 100
      const first = await papersApi.list({ status: 'published', limit: LIMIT })
      const allItems = [...first.items]
      let skip = LIMIT
      while (skip < first.total) {
        const next = await papersApi.list({ status: 'published', skip, limit: LIMIT })
        allItems.push(...next.items)
        skip += LIMIT
      }
      return { ...first, items: allItems }
    },
    refetchOnWindowFocus: 'always',
  })

  const sharedPapers = sharedQuery.data?.items ?? []
  const practicePapers = practiceQuery.data?.items ?? []
  const availableFilters = useMemo(
    () => getSchoolPreviousPaperFilters(sharedPapers, practicePapers),
    [practicePapers, sharedPapers],
  )
  const filters = useMemo(() => ({ search, subject, standard, year, status }), [search, standard, status, subject, year])
  const visibleShared = useMemo(
    () => filterSharedSchoolPapers(sharedPapers, filters),
    [filters, sharedPapers],
  )
  const visiblePractice = useMemo(
    () => filterPracticeSchoolPapers(practicePapers, { search, subject, standard, year }),
    [practicePapers, search, standard, subject, year],
  )
  const activeFilterCount = [search, subject, standard, year, teacher ? status : null]
    .filter(Boolean).length

  const downloadMutation = useMutation({
    mutationFn: async (paper: SchoolPreviousPaper) => {
      const pdf = await previousPapersApi.downloadSchoolPaper(
        paper.view_url || paper.download_url,
        schoolPaperFilename(paper),
      )
      await presentPdf(pdf)
    },
    onMutate: () => setActionError(null),
    onError: () => setActionError('Check your connection or ask your school to confirm that the file is still available.'),
  })

  const retryAll = useCallback(() => {
    setActionError(null)
    void Promise.all([sharedQuery.refetch(), practiceQuery.refetch(), contextQuery.refetch()])
  }, [contextQuery, practiceQuery, sharedQuery])

  const openPracticePaper = useCallback((paper: PaperListItem) => {
    if (openingRef.current || !role) return
    const action = schoolPaperActions(role, 'practice')[0]
    if (!action) return
    openingRef.current = paper.id
    setOpeningPaperId(paper.id)
    if (action === 'attempt') {
      navigation.navigate('Papers', {
        screen: 'AttemptPaper',
        params: {
          paperId: paper.id,
          launchKey: `school-previous-${Date.now()}`,
          returnTo: 'PreviousPapers',
        },
      })
    } else {
      navigation.navigate('StaffPapers', {
        screen: 'PaperDetail',
        params: { paperId: paper.id, presentation: 'teacher_reference' },
      })
    }
    openingTimer.current = setTimeout(() => {
      openingRef.current = null
      setOpeningPaperId(null)
    }, 800)
  }, [navigation, role])

  if (!allowed) {
    return (
      <AppScreen scroll={false} protectedChrome contentStyle={styles.center}>
        <ErrorState
          title="School previous papers are unavailable"
          message="This library is available to enrolled school students and authorized teachers."
        />
      </AppScreen>
    )
  }

  const isRefreshing = sharedQuery.isRefetching || practiceQuery.isRefetching || contextQuery.isRefetching
  const hasAnyData = Boolean(sharedPapers.length || practicePapers.length)
  const bothFailed = sharedQuery.isError && practiceQuery.isError && !hasAnyData
  const permissionRevoked = bothFailed && [sharedQuery.error, practiceQuery.error].some((error) => apiStatus(error) === 403)
  const isInitialLoading = !hasAnyData && (sharedQuery.isLoading || practiceQuery.isLoading)
  const partialMessage = sharedQuery.isError
    ? 'Shared PDFs could not be loaded. Practice-ready papers are still available.'
    : practiceQuery.isError
      ? 'Practice-ready papers could not be loaded. Shared PDFs are still available.'
      : contextQuery.isError
        ? 'Your paper list is available, but school context could not be refreshed.'
        : null

  return (
    <AppScreen
      protectedChrome
      contentStyle={styles.screenContent}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={retryAll} tintColor={colors.accent} colors={[colors.accent]} />}
    >
      <ContextHero context={contextQuery.data} teacher={teacher} compact={compact} />

      {bothFailed ? (
        <ErrorState
          kind={netInfo.isConnected === false ? 'offline' : 'error'}
          title={netInfo.isConnected === false ? 'You are offline' : permissionRevoked ? 'Paper access changed' : 'Papers could not be loaded'}
          message={netInfo.isConnected === false
            ? 'Reconnect and retry. Your account and filters will stay selected.'
            : permissionRevoked
              ? 'Your school permissions no longer allow this library. Ask your school administrator for access, then retry.'
              : 'Your school access is unchanged. Try loading the catalog again.'}
          onAction={retryAll}
          loading={isRefreshing}
        />
      ) : (
        <>
          {partialMessage ? <PartialDataNotice message={partialMessage} /> : null}
          <SourceSwitch
            value={source}
            onChange={(next) => {
              setSource(next)
              setStatus(null)
            }}
            practiceCount={visiblePractice.length}
            sharedCount={visibleShared.length}
            teacher={teacher}
            compact={compact}
          />

          {filtersExpanded ? (
            <View style={styles.filterPanel}>
              <SearchField value={search} onChangeText={setSearch} />
              <FilterRow label="Subject" values={availableFilters.subjects} selected={subject} onChange={setSubject} />
              <FilterRow label="Standard" values={availableFilters.standards} selected={standard} onChange={setStandard} />
              <FilterRow label="Year" values={availableFilters.years} selected={year} onChange={setYear} />
              {teacher && source === 'shared' ? (
                <FilterRow label="Publication" values={availableFilters.statuses} selected={status} onChange={setStatus} />
              ) : null}
            </View>
          ) : null}

          <SectionHeading
            title={teacher
              ? source === 'practice' ? 'Your published papers' : 'Original paper files'
              : source === 'practice' ? 'Practice papers' : 'Shared PDFs'}
            meta={String(source === 'practice' ? visiblePractice.length : visibleShared.length)}
            action={
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: filtersExpanded }}
                accessibilityLabel={filtersExpanded ? 'Hide paper filters' : 'Show paper filters'}
                onPress={() => setFiltersExpanded((current) => !current)}
                style={({ pressed }) => [styles.filterToggle, filtersExpanded && styles.filterToggleActive, pressed && styles.pressed]}
              >
                <Ionicons name="options-outline" size={17} color={filtersExpanded ? colors.accentStrong : colors.textSecondary} />
                {activeFilterCount ? <Text style={styles.filterActiveCount}>{activeFilterCount}</Text> : null}
              </Pressable>
            }
          />

          {isInitialLoading ? (
            <View style={styles.loadingState} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.loadingTitle}>Matching your school papers</Text>
              <Text style={styles.loadingBody}>Checking curriculum and publication access…</Text>
            </View>
          ) : source === 'practice' ? (
            visiblePractice.length ? (
              <View style={styles.paperList}>
                {visiblePractice.map((paper) => (
                  <PracticePaperCard
                    key={paper.id}
                    paper={paper}
                    teacher={teacher}
                    compact={compact}
                    busy={openingPaperId === paper.id}
                    onPress={() => openPracticePaper(paper)}
                  />
                ))}
              </View>
            ) : (
              <EmptyState
                icon="flash-outline"
                title={search || subject || standard || year ? 'No practice-ready papers match' : 'No practice-ready papers yet'}
                body={teacher ? 'Published structured papers you create will appear here.' : 'Your school has not published a structured paper for this class and filter yet. Shared PDFs may still be available.'}
              />
            )
          ) : visibleShared.length ? (
            <View style={styles.paperList}>
              {visibleShared.map((paper) => (
                <SharedPaperCard
                  key={paper.id}
                  paper={paper}
                  busy={downloadMutation.isPending && downloadMutation.variables?.id === paper.id}
                  error={downloadMutation.variables?.id === paper.id ? actionError : null}
                  onOpen={() => {
                    if (!downloadMutation.isPending) downloadMutation.mutate(paper)
                  }}
                  onDismissError={() => setActionError(null)}
                />
              ))}
            </View>
          ) : (
            <EmptyState
              icon="documents-outline"
              title={search || subject || standard || year || status ? 'No shared PDFs match' : 'No shared papers yet'}
              body={teacher ? 'PDF papers shared from your authorized teacher account will appear here.' : 'Your teachers have not shared a PDF paper for this class and filter yet.'}
            />
          )}

        </>
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  contextCopy: { flex: 1, minWidth: 0, gap: 2 },
  contextSchool: { ...typography.roles.body, fontFamily: typography.fonts.bodyBold, color: colors.nav },
  contextMeta: { ...typography.roles.caption, color: colors.textMuted },
  paperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  sharedCard: { gap: spacing[2] },
  paperIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.iconSurface },
  sharedIcon: { backgroundColor: colors.infoSurface },
  paperCopy: { flex: 1, minWidth: 0, gap: 2 },
  paperPill: { marginTop: spacing[1] },
  screenContent: { paddingBottom: spacing[8] },
  center: { flex: 1, justifyContent: 'center' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.55 },
  contextIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.iconSurface },
  partialNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    backgroundColor: colors.warningSurface,
  },
  partialCopy: { flex: 1 },
  partialTitle: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  partialBody: { marginTop: 2, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  filterPanel: {
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  searchField: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.background,
  },
  searchInput: { flex: 1, minHeight: 48, paddingVertical: spacing[3], color: colors.text, fontFamily: typography.fonts.bodyMedium, fontSize: 13 },
  clearButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  filterRow: { gap: spacing[2] },
  filterLabel: { ...typography.roles.eyebrow, color: colors.textMuted, fontSize: 11, lineHeight: 12 },
  filterContent: { gap: spacing[2], paddingRight: spacing[2] },
  filterChip: { minHeight: 38, paddingHorizontal: spacing[4], borderRadius: radius.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  filterChipSelected: { borderColor: colors.nav, backgroundColor: colors.nav },
  filterChipText: { color: colors.textSecondary, fontFamily: typography.fonts.bodySemibold, fontSize: 11 },
  filterChipTextSelected: { color: colors.white },
  filterToggle: { minWidth: 40, height: 40, paddingHorizontal: spacing[2], borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1], borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated },
  filterToggleActive: { borderColor: colors.borderBrand, backgroundColor: colors.accentSurface },
  filterActiveCount: { minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, overflow: 'hidden', textAlign: 'center', textAlignVertical: 'center', color: colors.white, backgroundColor: colors.accent, fontFamily: typography.fonts.bodyBold, fontSize: 11, lineHeight: 18 },
  loadingState: { minHeight: 210, alignItems: 'center', justifyContent: 'center', padding: spacing[6], borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  loadingTitle: { marginTop: spacing[4], color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 17 },
  loadingBody: { marginTop: spacing[2], color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  paperList: { gap: spacing[2] },
  archivedCard: { opacity: 0.78 },
  paperTitle: { ...typography.roles.rowTitle, color: colors.nav },
  paperContext: { ...typography.roles.caption, color: colors.textMuted },
  description: { ...typography.roles.caption, marginTop: spacing[1], color: colors.textSecondary },
  pdfError: { marginTop: spacing[3], gap: spacing[3], padding: spacing[3], borderLeftWidth: 3, borderLeftColor: colors.danger, backgroundColor: colors.dangerSurface },
  pdfErrorCopy: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  pdfErrorTextGroup: { flex: 1 },
  pdfErrorTitle: { color: colors.dangerText, fontFamily: typography.fonts.bodyBold, fontSize: 12, lineHeight: 17 },
  pdfErrorBody: { marginTop: 2, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 16 },
  pdfErrorActions: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  pdfRetry: { minHeight: 36, paddingHorizontal: spacing[4], borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.nav },
  pdfRetryText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  pdfDismiss: { minHeight: 36, paddingHorizontal: spacing[3], alignItems: 'center', justifyContent: 'center' },
  pdfDismissText: { color: colors.textSecondary, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
})
