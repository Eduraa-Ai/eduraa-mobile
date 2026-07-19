import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import Svg, { Circle } from 'react-native-svg'
import { checkedPapersApi } from '../../api/checkedPapers'
import { AppScreen, AnimatedButton, AuthLogoMark, ErrorState } from '../../components/ui'
import { colors, layout, radius, shadows, spacing, typography } from '../../theme'
import type { CheckedPaper } from '../../types'
import {
  buildAssessmentModel,
  buildSubjectOptions,
  canOpenPaper,
  formatPaperCount,
  getPaperSubject,
  getPaperTitle,
  getQuestionCount,
  matchesSearch,
  matchesTab,
  normalize,
  paperAccessibilityLabel,
  paperInsight,
  scorePercent,
  sortByRecency,
} from './checkedPapersLibraryModel'
import type { CheckedPaperTab } from './checkedPapersLibraryModel'

const TAB_CONFIG: Array<{ key: CheckedPaperTab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'all', label: 'All papers', icon: 'layers-outline' },
  { key: 'needs_attention', label: 'Needs attention', icon: 'alert-circle-outline' },
  { key: 'strong', label: 'Strong', icon: 'checkmark-done-outline' },
]

function formatDate(value?: string | null) {
  if (!value) return 'Date pending'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date pending'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function getPaperIcon(paper: CheckedPaper): { name: keyof typeof Ionicons.glyphMap; tone: string } {
  const subject = normalize(paper.subject_name)
  if (subject.includes('physics')) return { name: 'magnet-outline', tone: colors.info }
  if (subject.includes('chem')) return { name: 'flask-outline', tone: colors.accent }
  if (subject.includes('math')) return { name: 'calculator-outline', tone: colors.success }
  if (subject.includes('bio')) return { name: 'leaf-outline', tone: colors.success }
  if (subject.includes('english')) return { name: 'book-outline', tone: colors.info }
  if (subject.includes('jee') || subject.includes('competitive')) return { name: 'ribbon-outline', tone: colors.accentStrong }
  return { name: 'document-text-outline', tone: colors.accentStrong }
}

function errorMessage(error: unknown) {
  const anyError = error as { response?: { data?: { detail?: string } }; message?: string }
  return anyError.response?.data?.detail || anyError.message || 'Unable to load checked papers right now.'
}

function ScoreRing({ percent, compact }: { percent: number | null; compact: boolean }) {
  const size = compact ? 70 : 76
  const stroke = 6
  const radiusValue = (size - stroke) / 2
  const circumference = 2 * Math.PI * radiusValue
  const progress = percent == null ? 0 : Math.max(0, Math.min(100, percent))
  const tone = colors.accent

  return (
    <View style={[styles.scoreRingWrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={radiusValue} stroke="rgba(255,255,255,0.10)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radiusValue}
          stroke={tone}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference - (progress / 100) * circumference}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.scoreRingCopy}>
        <Text style={styles.scoreRingValue}>{percent == null ? '--' : `${percent}%`}</Text>
        <Text style={styles.scoreRingLabel}>latest</Text>
      </View>
    </View>
  )
}

function SummaryMetric({ label, value, divider = false }: { label: string; value: string; divider?: boolean }) {
  return (
    <View style={[styles.metricCard, divider && styles.metricCardDivider]}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  )
}

function CheckedPaperRow({ paper, onPress, opening, featured }: { paper: CheckedPaper; onPress: () => void; opening: boolean; featured: boolean }) {
  const percent = scorePercent(paper)
  const icon = getPaperIcon(paper)
  const title = getPaperTitle(paper)
  const subject = getPaperSubject(paper)
  const questions = getQuestionCount(paper)
  const questionLabel = questions == null ? 'Question count unavailable' : `${questions} question${questions === 1 ? '' : 's'}`

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={paperAccessibilityLabel(paper, formatDate(paper.updated_at || paper.created_at))}
      accessibilityHint="Opens the checked paper report."
      onPress={onPress}
      style={({ pressed }) => [styles.paperCard, featured && styles.paperCardFeatured, pressed && styles.paperCardPressed, opening && styles.paperCardOpening]}
    >
      {featured ? <View pointerEvents="none" style={styles.featuredRail} /> : null}
      <View style={styles.paperCardTop}>
        <View style={[styles.paperIconTile, { backgroundColor: `${icon.tone}14`, borderColor: `${icon.tone}26` }]}>
          <Ionicons name={icon.name} size={20} color={icon.tone} />
        </View>
        <View style={styles.paperCopy}>
          <Text style={styles.paperTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.paperMeta} numberOfLines={1}>
            {subject} · {formatDate(paper.updated_at || paper.created_at)} · {questionLabel}
          </Text>
        </View>
        <View style={styles.scoreTile}>
          <Text style={styles.scorePercent}>{paper.total_score ?? '--'}</Text>
          <Text style={styles.scoreFraction}>{paper.max_score == null ? 'pending' : `/ ${paper.max_score}`}</Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percent ?? 0}%` }]} />
      </View>

      <View style={styles.paperFooter}>
        <Text style={styles.paperInsight} numberOfLines={1}>{paperInsight(paper)}</Text>
        <View style={styles.openAction}>
          <Text style={styles.openActionText}>{opening ? 'Opening' : 'View'}</Text>
          {opening ? <ActivityIndicator color={colors.accentStrong} size="small" /> : <Ionicons name="chevron-forward" size={13} color={colors.accentStrong} />}
        </View>
      </View>
    </Pressable>
  )
}

function LibrarySkeleton() {
  return (
    <View style={styles.skeletonStack}>
      <View style={styles.shellHeader}>
        <View style={styles.headerIdentity}>
          <View style={styles.backButtonSkeleton} />
          <View style={styles.brandGroup}>
            <AuthLogoMark size={40} />
            <View>
              <View style={styles.skeletonLineShort} />
              <View style={[styles.skeletonLineTiny, { marginTop: spacing[1] }]} />
            </View>
          </View>
        </View>
        <View style={styles.countPillSkeleton} />
      </View>

      <View style={styles.overlineSkeleton} />
      <View style={styles.heroTitleSkeleton} />
      <View style={styles.heroTitleSkeletonShort} />
      <View style={styles.heroBodySkeleton} />

      <View style={styles.assessmentPanel}>
        <View style={styles.skeletonAssessmentRow}>
          <View style={styles.skeletonAssessmentCopy}>
            <View style={styles.overlineSkeletonDark} />
            <View style={styles.assessmentTitleSkeleton} />
            <View style={styles.assessmentBodySkeleton} />
          </View>
          <View style={styles.scoreRingPlaceholder} />
        </View>
        <View style={styles.metricGrid}>
          <View style={styles.metricCardSkeleton} />
          <View style={styles.metricCardSkeleton} />
          <View style={styles.metricCardSkeleton} />
        </View>
      </View>

      <View style={styles.searchRowSkeleton}>
        <View style={styles.searchSkeleton} />
        <View style={styles.filterSkeleton} />
      </View>

      <View style={styles.tabsRow}>
        <View style={styles.tabSkeletonActive} />
        <View style={styles.tabSkeleton} />
        <View style={styles.tabSkeleton} />
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <View style={styles.sectionTitleSkeleton} />
          <View style={[styles.sectionSubtitleSkeleton, { marginTop: spacing[1] }]} />
        </View>
      </View>

      <View style={styles.paperList}>
        {Array.from({ length: 3 }).map((_, index) => (
          <View key={index} style={styles.paperCardSkeleton}>
            <View style={styles.paperCardTop}>
              <View style={styles.paperIconSkeleton} />
              <View style={styles.paperCopy}>
                <View style={styles.paperMetaSkeleton} />
                <View style={styles.paperTitleSkeleton} />
                <View style={styles.paperTitleSkeletonShort} />
                <View style={styles.paperInsightSkeleton} />
              </View>
              <View style={styles.scoreTileSkeleton} />
            </View>
            <View style={styles.progressTrackSkeleton} />
            <View style={styles.paperFooterSkeleton}>
              <View style={styles.footerChipSkeleton} />
              <View style={styles.openActionSkeleton} />
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

function StateCard({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  body: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <View style={styles.stateCard}>
      <View style={styles.stateIconWrap}>
        <Ionicons name={icon} size={26} color={colors.accentStrong} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateBody}>{body}</Text>
      <AnimatedButton label={actionLabel} variant="secondary" onPress={onAction} style={styles.stateAction} />
    </View>
  )
}

function FilterSheet({
  visible,
  subjects,
  selectedSubject,
  onSelectSubject,
  onClear,
  onClose,
}: {
  visible: boolean
  subjects: Array<{ label: string; count: number }>
  selectedSubject: string | null
  onSelectSubject: (subject: string | null) => void
  onClear: () => void
  onClose: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <View style={styles.sheet} accessibilityLabel="Filter checked papers">
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Filter checked papers</Text>
          <Text style={styles.sheetBody}>Limit the inbox to a subject while keeping search and status tabs active.</Text>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: selectedSubject == null }}
            onPress={() => onSelectSubject(null)}
            style={({ pressed }) => [styles.sheetOption, pressed && styles.sheetOptionPressed, selectedSubject == null && styles.sheetOptionSelected]}
          >
            <View>
              <Text style={styles.sheetOptionTitle}>All subjects</Text>
              <Text style={styles.sheetOptionMeta}>Show every checked paper</Text>
            </View>
            <Ionicons name={selectedSubject == null ? 'radio-button-on' : 'ellipse-outline'} size={18} color={selectedSubject == null ? colors.accent : colors.textSoft} />
          </Pressable>

          {subjects.map((subject) => {
            const active = selectedSubject === subject.label
            return (
              <Pressable
                key={subject.label}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => onSelectSubject(subject.label)}
                style={({ pressed }) => [styles.sheetOption, pressed && styles.sheetOptionPressed, active && styles.sheetOptionSelected]}
              >
                <View style={styles.sheetOptionCopy}>
                  <Text style={styles.sheetOptionTitle}>{subject.label}</Text>
                  <Text style={styles.sheetOptionMeta}>{subject.count} paper{subject.count === 1 ? '' : 's'}</Text>
                </View>
                <Ionicons name={active ? 'radio-button-on' : 'ellipse-outline'} size={18} color={active ? colors.accent : colors.textSoft} />
              </Pressable>
            )
          })}

          <View style={styles.sheetActions}>
            <AnimatedButton label="Clear filters" variant="ghost" onPress={onClear} style={styles.sheetButton} />
            <AnimatedButton label="Done" variant="primary" onPress={onClose} style={styles.sheetButton} />
          </View>
        </View>
      </Pressable>
    </Modal>
  )
}

export default function CheckedPapersLibraryScreen() {
  const navigation = useNavigation<any>()
  const { width } = useWindowDimensions()
  const compact = width < 380
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<CheckedPaperTab>('all')
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
  const [filterVisible, setFilterVisible] = useState(false)
  const [openingPaperId, setOpeningPaperId] = useState<string | null>(null)
  const openingPaperRef = useRef<string | null>(null)
  const focusOnceRef = useRef(false)

  const { data, error, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['checked-papers'],
    queryFn: checkedPapersApi.list,
  })

  useFocusEffect(
    useCallback(() => {
      if (focusOnceRef.current) {
        void refetch()
      }
      focusOnceRef.current = true
      openingPaperRef.current = null
      setOpeningPaperId(null)
    }, [refetch]),
  )

  const papers = useMemo(() => sortByRecency(data ?? []), [data])
  const subjectOptions = useMemo(() => buildSubjectOptions(papers), [papers])
  const assessment = useMemo(() => buildAssessmentModel(papers), [papers])

  const visiblePapers = useMemo(() => {
    const term = normalize(query)
    return papers.filter((paper) => matchesTab(paper, activeTab) && matchesSearch(paper, term) && (!selectedSubject || getPaperSubject(paper) === selectedSubject))
  }, [activeTab, papers, query, selectedSubject])

  const visibleCount = visiblePapers.length
  const totalCount = papers.length
  const scorePercentValue = assessment.latest ? scorePercent(assessment.latest) : assessment.average
  const isSearchEmpty = totalCount > 0 && visibleCount === 0
  const hasCacheAndError = isError && totalCount > 0

  const openPaper = useCallback(
    (paper: CheckedPaper) => {
      if (!canOpenPaper(paper.id, openingPaperRef.current)) return
      openingPaperRef.current = paper.id
      setOpeningPaperId(paper.id)
      navigation.navigate('ResultDetail', { checkedPaperId: paper.id })
    },
    [navigation],
  )

  const clearSearch = () => setQuery('')
  const clearFilters = () => {
    setQuery('')
    setSelectedSubject(null)
    setActiveTab('all')
  }

  const pageIntro = (
    <View style={styles.pageIntro}>
      <Text style={styles.pageOverline}>CHECKED PAPERS · ASSESSMENT INTELLIGENCE</Text>
      <Text style={styles.libraryTitle}>Checked library</Text>
      <Text style={styles.librarySubtitle}>A focused results inbox that reveals what deserves attention.</Text>
    </View>
  )

  const header = (
    <View style={styles.headerStack}>
      <View style={styles.shellHeader}>
        <View style={styles.headerIdentity}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            accessibilityState={{ disabled: !navigation.canGoBack() }}
            disabled={!navigation.canGoBack()}
            onPress={() => {
              if (navigation.canGoBack()) {
                navigation.goBack()
              }
            }}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed, !navigation.canGoBack() && styles.backButtonDisabled]}
          >
            <Ionicons name="arrow-back" size={18} color={colors.nav} />
          </Pressable>
          <View style={styles.brandGroup}>
            <AuthLogoMark size={40} />
            <View>
              <Text style={styles.brandName}>Eduraa AI</Text>
              <Text style={styles.brandContext}>Assessment intelligence</Text>
            </View>
          </View>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>
            {formatPaperCount(totalCount)}
          </Text>
        </View>
      </View>

      <View style={styles.introBlock}>
        <Text style={[styles.pageTitle, compact && styles.pageTitleCompact]}>
          Results that{'\n'}move you forward.
        </Text>
        <Text style={styles.pageSubtitle}>
          Checked papers, honest feedback, and the next repair in one focused inbox.
        </Text>
      </View>

      <LinearGradient colors={['#07152d', '#0f1d37', '#13253f']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.assessmentPanel}>
        <View style={styles.assessmentTop}>
          <View style={styles.assessmentCopy}>
            <Text style={styles.assessmentEyebrow}>This week's signal</Text>
            <Text style={styles.assessmentTitle}>{assessment.headline}</Text>
            <Text style={styles.assessmentBody}>{assessment.insight}</Text>
          </View>
          <ScoreRing percent={scorePercentValue} compact={compact} />
        </View>

        <View style={styles.metricGrid}>
          <SummaryMetric label="Checked" value={String(totalCount).padStart(2, '0')} />
          <SummaryMetric label="Growth" value={assessment.delta == null ? '—' : `${assessment.delta > 0 ? '+' : ''}${assessment.delta}%`} divider />
          <SummaryMetric label="In review" value={String(assessment.reviewCount).padStart(2, '0')} divider />
        </View>
      </LinearGradient>

      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <Ionicons name="search" size={18} color={colors.textSoft} />
          <TextInput
            accessibilityLabel="Search your checked papers"
            placeholder="Search your checked papers"
            placeholderTextColor={colors.textSoft}
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            keyboardAppearance="light"
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={clearSearch} style={styles.clearSearchButton}>
              <Ionicons name="close" size={16} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open filters"
          accessibilityState={{ selected: Boolean(selectedSubject) }}
          onPress={() => setFilterVisible(true)}
          style={({ pressed }) => [styles.filterButton, pressed && styles.filterButtonPressed, selectedSubject && styles.filterButtonActive]}
        >
          <Ionicons name="funnel-outline" size={16} color={selectedSubject ? colors.accentStrong : colors.textSecondary} />
          {selectedSubject ? <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>1</Text></View> : null}
        </Pressable>
      </View>

      <View style={styles.tabsRow}>
        {TAB_CONFIG.map((tab) => {
          const selected = activeTab === tab.key
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected }}
              hitSlop={6}
              onPress={() => setActiveTab(tab.key)}
              style={({ pressed }) => [styles.tabPill, selected && styles.tabPillSelected, pressed && styles.tabPillPressed]}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{tab.label}</Text>
            </Pressable>
          )
        })}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent papers</Text>
        <Text style={styles.sectionSubtitle}>{visibleCount} result{visibleCount === 1 ? '' : 's'}</Text>
        {isFetching ? (
          <View style={styles.refreshChip}>
            <ActivityIndicator size="small" color={colors.accentStrong} />
            <Text style={styles.refreshChipText}>Refreshing</Text>
          </View>
        ) : null}
      </View>

      {hasCacheAndError ? (
        <View style={styles.cachedBanner}>
          <View style={styles.cachedBannerCopy}>
            <Ionicons name="cloud-offline-outline" size={18} color={colors.warning} />
            <Text style={styles.cachedBannerText}>{errorMessage(error)} Showing the last saved results.</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => void refetch()} style={styles.bannerRetry}>
            <Text style={styles.bannerRetryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )

  const listEmpty = () => {
    if (totalCount === 0) {
      return (
        <StateCard
          icon="documents-outline"
          title="No checked papers yet"
          body="Completed and checked papers will appear here as soon as Eduraa has a result to show."
          actionLabel="Open papers"
          onAction={() => navigation.getParent()?.navigate('Papers')}
        />
      )
    }

    return (
      <StateCard
        icon="search-outline"
        title="No papers match this view"
        body={selectedSubject ? `Nothing under ${selectedSubject} matches your current search and status filters.` : 'Try a different search term or switch the status tab.'}
        actionLabel={query ? 'Clear search' : 'Clear filters'}
        onAction={query ? clearSearch : clearFilters}
      />
    )
  }

  if (isLoading && totalCount === 0) {
    return (
      <AppScreen scroll={false} padded={false} contentStyle={styles.screenRoot}>
        {pageIntro}
        <View style={styles.warmSurface}><LibrarySkeleton /></View>
      </AppScreen>
    )
  }

  if (isError && totalCount === 0) {
    return (
      <AppScreen scroll={false} padded={false} contentStyle={styles.screenRoot}>
        {pageIntro}
        <View style={[styles.warmSurface, styles.errorWrap]}>
          <ErrorState title="Checked papers could not load" message={errorMessage(error)} actionLabel="Retry" onAction={() => void refetch()} style={styles.errorCard} />
        </View>
      </AppScreen>
    )
  }

  return (
    <AppScreen scroll={false} padded={false} contentStyle={styles.screenRoot}>
      {pageIntro}
      <FilterSheet
        visible={filterVisible}
        subjects={subjectOptions}
        selectedSubject={selectedSubject}
        onSelectSubject={(subject) => {
          setSelectedSubject(subject)
          setFilterVisible(false)
        }}
        onClear={() => {
          clearFilters()
          setFilterVisible(false)
        }}
        onClose={() => setFilterVisible(false)}
      />

      <View style={styles.warmSurface}>
        <FlatList
          style={styles.list}
          data={visiblePapers}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          ListEmptyComponent={listEmpty}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={() => void refetch()} tintColor={colors.accent} colors={[colors.accent]} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => <CheckedPaperRow paper={item} featured={index === 0} opening={openingPaperId === item.id} onPress={() => openPaper(item)} />}
        />
      </View>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    gap: spacing[2],
    paddingBottom: 0,
    backgroundColor: '#dce3ea',
  },
  pageIntro: {
    paddingHorizontal: spacing[4],
    paddingBottom: 2,
    gap: 1,
    backgroundColor: '#dce3ea',
    zIndex: 20,
    elevation: 20,
  },
  pageOverline: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 8,
    lineHeight: 11,
    letterSpacing: 0.7,
  },
  libraryTitle: {
    color: colors.nav,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 19,
    lineHeight: 23,
  },
  librarySubtitle: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 13,
  },
  warmSurface: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: spacing[3],
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(7,21,45,0.10)',
    backgroundColor: '#fffaf2',
    overflow: 'hidden',
  },
  list: {
    flex: 1,
    overflow: 'hidden',
    borderTopLeftRadius: 27,
    borderTopRightRadius: 27,
  },
  listContent: {
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingTop: spacing[3],
    paddingBottom: layout.bottomTabHeight + spacing[10],
  },
  headerStack: {
    gap: spacing[2],
  },
  shellHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  headerIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    minWidth: 0,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    ...shadows.xs,
  },
  backButtonPressed: {
    opacity: 0.75,
  },
  backButtonDisabled: {
    opacity: 0.56,
  },
  brandGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minWidth: 0,
  },
  brandName: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
    lineHeight: 20,
  },
  brandContext: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 1,
  },
  countPill: {
    minHeight: 36,
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff0e5',
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  countPillText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
  },
  introBlock: {
    gap: 1,
  },
  overline: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  pageTitle: {
    color: colors.text,
    fontFamily: typography.fonts.heading,
    fontSize: 28,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  pageTitleCompact: {
    fontSize: 27,
    lineHeight: 29,
  },
  pageSubtitle: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 15,
    maxWidth: 320,
  },
  assessmentPanel: {
    borderRadius: 24,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    gap: spacing[3],
    backgroundColor: '#0f1d37',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...shadows.hero,
  },
  assessmentTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  assessmentCopy: {
    flex: 1,
    gap: spacing[1],
    minWidth: 0,
  },
  assessmentEyebrow: {
    color: colors.accentLight,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  assessmentTitle: {
    color: colors.textOnDark,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  assessmentBody: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 9,
    lineHeight: 13,
  },
  scoreRingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRingCopy: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRingValue: {
    color: colors.textOnDark,
    fontFamily: typography.fonts.heading,
    fontSize: 18,
    lineHeight: 21,
  },
  scoreRingLabel: {
    color: 'rgba(255,255,255,0.62)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 7,
    marginTop: 1,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metricGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  metricCard: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: spacing[2],
    paddingTop: spacing[2],
    gap: 1,
  },
  metricCardDivider: {
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.10)',
  },
  metricLabel: {
    color: 'rgba(255,255,255,0.68)',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 7,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  metricValue: {
    color: colors.textOnDark,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 14,
    lineHeight: 17,
  },
  assessmentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  assessmentFooterText: {
    flex: 1,
    color: 'rgba(255,255,255,0.74)',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  searchField: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: 15,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.xs,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 11,
    paddingVertical: spacing[2],
  },
  clearSearchButton: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardMuted,
  },
  filterButton: {
    width: 44,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    paddingHorizontal: 0,
    borderRadius: 15,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonPressed: {
    opacity: 0.8,
  },
  filterButtonActive: {
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
  },
  filterButtonText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  filterButtonTextActive: {
    color: colors.accentStrong,
  },
  filterBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.full,
    paddingHorizontal: spacing[1],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  filterBadgeText: {
    color: colors.textOnDark,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: spacing[1],
  },
  tabPill: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    paddingHorizontal: spacing[2],
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabPillSelected: {
    backgroundColor: colors.nav,
    borderColor: colors.nav,
  },
  tabPillPressed: {
    opacity: 0.85,
  },
  tabText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
  },
  tabTextSelected: {
    color: colors.textOnDark,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
    lineHeight: 20,
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 9,
  },
  refreshChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.full,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  refreshChipText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  cachedBanner: {
    borderRadius: radius.card,
    padding: spacing[3],
    gap: spacing[2],
    backgroundColor: colors.warningSurface,
    borderWidth: 1,
    borderColor: colors.warningBorder,
  },
  cachedBannerCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  cachedBannerText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  bannerRetry: {
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: spacing[3],
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.nav,
  },
  bannerRetryText: {
    color: colors.textOnDark,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  paperList: {
    gap: spacing[3],
  },
  paperCard: {
    position: 'relative',
    paddingHorizontal: spacing[1],
    paddingVertical: spacing[3],
    gap: spacing[2],
    borderTopWidth: 1,
    borderTopColor: '#e9ddcf',
  },
  paperCardFeatured: {
    paddingHorizontal: spacing[3],
    borderTopWidth: 0,
    borderRadius: 22,
    backgroundColor: '#fffdf9',
    borderWidth: 1,
    borderColor: 'rgba(7,21,45,0.07)',
    overflow: 'hidden',
  },
  featuredRail: {
    position: 'absolute',
    left: 0,
    top: spacing[4],
    width: 3,
    height: 44,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: colors.accent,
  },
  paperCardPressed: {
    opacity: 0.92,
  },
  paperCardOpening: {
    borderColor: colors.borderBrand,
  },
  paperCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  paperIconTile: {
    width: 43,
    height: 43,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  paperCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  paperMeta: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 8,
    letterSpacing: 0,
  },
  paperTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 14,
    lineHeight: 17,
  },
  paperInsight: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 9,
    lineHeight: 13,
  },
  scoreTile: {
    alignItems: 'flex-end',
    gap: 2,
  },
  scorePercent: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
    lineHeight: 20,
  },
  scoreFraction: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 8,
    letterSpacing: 0,
  },
  progressTrack: {
    height: 4,
    marginLeft: 55,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  paperFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    paddingLeft: 55,
  },
  paperFooterLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    minWidth: 0,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing[2],
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.accentSurface,
  },
  statusText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  footerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
  },
  footerMetaText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  openAction: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    flexShrink: 0,
    paddingHorizontal: 0,
    borderRadius: radius.full,
    backgroundColor: 'transparent',
  },
  openActionText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
  },
  errorWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing[4],
  },
  errorCard: {
    borderRadius: radius.card,
  },
  stateCard: {
    alignItems: 'center',
    gap: spacing[3],
    padding: spacing[5],
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  stateIconWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  stateTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
    lineHeight: 23,
    textAlign: 'center',
  },
  stateBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 290,
  },
  stateAction: {
    alignSelf: 'stretch',
    marginTop: spacing[1],
  },
  skeletonStack: {
    gap: spacing[3],
    padding: spacing[3],
  },
  backButtonSkeleton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  skeletonLineShort: {
    width: 96,
    height: 14,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  skeletonLineTiny: {
    width: 70,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  countPillSkeleton: {
    width: 86,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  overlineSkeleton: {
    width: 198,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  heroTitleSkeleton: {
    width: '84%',
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  heroTitleSkeletonShort: {
    width: '56%',
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  heroBodySkeleton: {
    width: '80%',
    height: 16,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  skeletonAssessmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
  },
  skeletonAssessmentCopy: {
    flex: 1,
    gap: spacing[2],
  },
  overlineSkeletonDark: {
    width: 126,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  assessmentTitleSkeleton: {
    width: '86%',
    height: 24,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  assessmentBodySkeleton: {
    width: '74%',
    height: 15,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  scoreRingPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: radius.full,
    borderWidth: 10,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  metricCardSkeleton: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 96,
    height: 74,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  searchRowSkeleton: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  searchSkeleton: {
    flex: 1,
    height: 52,
    borderRadius: radius.card,
    backgroundColor: colors.cardMuted,
  },
  filterSkeleton: {
    width: 96,
    height: 52,
    borderRadius: radius.card,
    backgroundColor: colors.cardMuted,
  },
  tabSkeletonActive: {
    width: 110,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.nav,
  },
  tabSkeleton: {
    width: 108,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  sectionTitleSkeleton: {
    width: 118,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  sectionSubtitleSkeleton: {
    width: 86,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  paperCardSkeleton: {
    borderRadius: radius.card,
    padding: spacing[4],
    gap: spacing[3],
    backgroundColor: '#fffdf8',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadows.sm,
  },
  paperIconSkeleton: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.cardMuted,
  },
  paperMetaSkeleton: {
    width: 118,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  paperTitleSkeleton: {
    width: '82%',
    height: 16,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  paperTitleSkeletonShort: {
    width: '70%',
    height: 16,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  paperInsightSkeleton: {
    width: '68%',
    height: 14,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  scoreTileSkeleton: {
    width: 68,
    height: 54,
    borderRadius: radius.lg,
    backgroundColor: colors.cardMuted,
  },
  progressTrackSkeleton: {
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  paperFooterSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  footerChipSkeleton: {
    width: 136,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  openActionSkeleton: {
    width: 96,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.nav,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 6, 23, 0.42)',
  },
  sheet: {
    gap: spacing[3],
    padding: spacing[5],
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadows.lg,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 56,
    height: 5,
    borderRadius: radius.full,
    backgroundColor: colors.cardMuted,
  },
  sheetTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
    lineHeight: 23,
  },
  sheetBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  sheetOption: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  sheetOptionPressed: {
    opacity: 0.82,
  },
  sheetOptionSelected: {
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
  },
  sheetOptionCopy: {
    flex: 1,
    gap: 2,
  },
  sheetOptionTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  sheetOptionMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  sheetButton: {
    flex: 1,
  },
})
