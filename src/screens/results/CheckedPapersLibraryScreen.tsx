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
import { useQueries, useQuery } from '@tanstack/react-query'
import Svg, { Circle } from 'react-native-svg'
import { checkedPapersApi } from '../../api/checkedPapers'
import { isLearnerRole } from '../../auth/roles'
import { AppScreen, AnimatedButton, AuthLogoMark, ErrorState } from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'
import { colors, layout, radius, shadows, spacing, typography } from '../../theme'
import type { CheckedPaper } from '../../types'
import { downloadCheckedPaperPdf } from '../../utils/openProtectedDocument'
import {
  buildAssessmentModel,
  buildSubjectOptions,
  canOpenPaper,
  CHECKED_PAPERS_POLL_INTERVAL_MS,
  formatPaperCount,
  getPaperSubject,
  getPaperTitle,
  getQuestionCount,
  getQuestionReviewCount,
  getQuestionReviewLabels,
  getUnreadReviewResponseCount,
  getUnreadReviewResponseLabels,
  matchesSearch,
  matchesTab,
  normalize,
  isPaperChecking,
  paperAccessibilityLabel,
  paperInsight,
  scorePercent,
  sortByRecency,
} from './checkedPapersLibraryModel'
import type { CheckedPaperTab } from './checkedPapersLibraryModel'
import { loadSeenReviewResponseKeys } from './reviewNotificationState'

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

function CheckedPaperRow({
  paper,
  onPress,
  onDownload,
  opening,
  downloading,
  downloadBlocked,
  featured,
  isStaff,
  seenReviewResponseKeys,
}: {
  paper: CheckedPaper
  onPress: () => void
  onDownload: () => void
  opening: boolean
  downloading: boolean
  downloadBlocked: boolean
  featured: boolean
  isStaff: boolean
  seenReviewResponseKeys: ReadonlySet<string>
}) {
  const percent = scorePercent(paper)
  const icon = getPaperIcon(paper)
  const title = getPaperTitle(paper)
  const subject = getPaperSubject(paper)
  const questions = getQuestionCount(paper)
  const questionLabel = questions == null ? 'Question count unavailable' : `${questions} question${questions === 1 ? '' : 's'}`
  const reviewCount = getQuestionReviewCount(paper)
  const reviewLabels = getQuestionReviewLabels(paper)
  const reviewLabel = reviewLabels.slice(0, 2).join(', ')
  const reviewTitle = `${reviewCount} question review${reviewCount === 1 ? '' : 's'} pending`
  const unreadResponseCount = isStaff ? 0 : getUnreadReviewResponseCount(paper, seenReviewResponseKeys)
  const unreadResponseLabels = isStaff ? [] : getUnreadReviewResponseLabels(paper, seenReviewResponseKeys)
  const unreadResponseLabel = unreadResponseLabels.slice(0, 2).join(', ')
  const noticeTitle = unreadResponseCount > 0
    ? `${unreadResponseCount} teacher response${unreadResponseCount === 1 ? '' : 's'}`
    : reviewTitle
  const noticeLabel = unreadResponseCount > 0
    ? `Teacher replied: ${unreadResponseLabel || 'review question'}${reviewCount > 0 ? ` · ${reviewCount} still pending` : ''}`
    : reviewLabel

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
        <Text style={styles.paperInsight} numberOfLines={2}>{paperInsight(paper)}</Text>
        <View style={styles.paperActions}>
          {!isPaperChecking(paper) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Download ${title} as PDF`}
              accessibilityHint={downloadBlocked ? 'Another PDF is downloading. Try again when it finishes.' : 'Downloads the checked paper report as a PDF.'}
              accessibilityState={{ busy: downloading, disabled: downloading || downloadBlocked }}
              hitSlop={4}
              onPress={(event) => {
                event.stopPropagation()
                if (downloading || downloadBlocked) return
                onDownload()
              }}
              style={({ pressed }) => [
                styles.downloadAction,
                pressed && !downloading && !downloadBlocked && styles.downloadActionPressed,
                downloading && styles.downloadActionDisabled,
                downloadBlocked && styles.downloadActionBlocked,
              ]}
            >
              {downloading ? (
                <ActivityIndicator color={colors.accentStrong} size="small" />
              ) : (
                <Ionicons name="download-outline" size={16} color={downloadBlocked ? colors.textSoft : colors.accentStrong} />
              )}
              <Text style={[styles.downloadActionText, downloadBlocked && styles.downloadActionTextBlocked]}>PDF</Text>
            </Pressable>
          ) : null}
          <View style={styles.openAction}>
            <Text style={styles.openActionText}>{opening ? 'Opening' : 'View'}</Text>
            {opening ? <ActivityIndicator color={colors.accentStrong} size="small" /> : <Ionicons name="chevron-forward" size={13} color={colors.accentStrong} />}
          </View>
        </View>
      </View>
      {unreadResponseCount > 0 || reviewCount > 0 ? (
        <View style={styles.reviewNotice}>
          <Ionicons name={unreadResponseCount > 0 ? 'notifications-outline' : 'chatbox-ellipses-outline'} size={16} color={colors.accentStrong} />
          <View style={styles.reviewNoticeCopy}>
            <Text style={styles.reviewNoticeTitle}>
              {noticeTitle}
            </Text>
            {noticeLabel ? <Text style={styles.reviewNoticeText} numberOfLines={1}>{noticeLabel}</Text> : null}
          </View>
        </View>
      ) : null}
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
  const user = useAuthStore((state) => state.user)
  const isStaff = Boolean(user && !isLearnerRole(user.role))
  const { width } = useWindowDimensions()
  const compact = width < 380
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<CheckedPaperTab>('all')
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
  const [filterVisible, setFilterVisible] = useState(false)
  const [openingPaperId, setOpeningPaperId] = useState<string | null>(null)
  const [downloadingPaperId, setDownloadingPaperId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [seenReviewResponseKeys, setSeenReviewResponseKeys] = useState<Set<string>>(new Set())
  const [seenReviewResponseKeysLoaded, setSeenReviewResponseKeysLoaded] = useState(false)
  const openingPaperRef = useRef<string | null>(null)
  const downloadingPaperRef = useRef<string | null>(null)
  const focusOnceRef = useRef(false)

  const { data, error, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['checked-papers'],
    queryFn: checkedPapersApi.list,
    refetchInterval: (activeQuery) => (
      (activeQuery.state.data ?? []).some(isPaperChecking)
        ? CHECKED_PAPERS_POLL_INTERVAL_MS
        : false
    ),
    refetchIntervalInBackground: false,
    refetchOnMount: 'always',
  })

  useFocusEffect(
    useCallback(() => {
      if (focusOnceRef.current) {
        void refetch()
      }
      focusOnceRef.current = true
      openingPaperRef.current = null
      setOpeningPaperId(null)
      if (!isStaff && user?.id) {
        setSeenReviewResponseKeysLoaded(false)
        void loadSeenReviewResponseKeys(user.id).then((keys) => {
          setSeenReviewResponseKeys(keys)
          setSeenReviewResponseKeysLoaded(true)
        })
      } else {
        setSeenReviewResponseKeysLoaded(true)
      }
    }, [isStaff, refetch, user?.id]),
  )

  const papers = useMemo(() => sortByRecency(data ?? []), [data])
  const reviewDetailCandidates = useMemo(
    () => isStaff ? [] : papers.filter((paper) => (
      paper.manual_review_requested
      || paper.manual_review_completed
      || (paper.pending_question_review_count ?? 0) > 0
      || (paper.unread_question_review_response_count ?? 0) > 0
    )),
    [isStaff, papers],
  )
  const reviewDetailQueries = useQueries({
    queries: reviewDetailCandidates.map((paper) => ({
      queryKey: ['checked-paper', paper.id],
      queryFn: () => checkedPapersApi.getById(paper.id),
      staleTime: 15_000,
    })),
  })
  const notificationPaperById = useMemo(() => {
    const details = new Map<string, CheckedPaper>()
    reviewDetailCandidates.forEach((paper, index) => {
      const detail = reviewDetailQueries[index]?.data
      details.set(paper.id, detail ? { ...paper, ...detail } : paper)
    })
    return details
  }, [reviewDetailCandidates, reviewDetailQueries])
  const notificationPapersSource = useMemo(
    () => papers.map((paper) => notificationPaperById.get(paper.id) ?? paper),
    [notificationPaperById, papers],
  )
  const subjectOptions = useMemo(() => buildSubjectOptions(papers), [papers])
  const assessment = useMemo(() => buildAssessmentModel(papers), [papers])
  const questionReviewPapers = useMemo(
    () => notificationPapersSource.filter((paper) => getQuestionReviewCount(paper) > 0),
    [notificationPapersSource],
  )
  const questionReviewTotal = useMemo(
    () => questionReviewPapers.reduce((sum, paper) => sum + getQuestionReviewCount(paper), 0),
    [questionReviewPapers],
  )
  const questionReviewPreview = useMemo(() => {
    const first = questionReviewPapers[0]
    if (!first) return ''
    const labels = getQuestionReviewLabels(first).slice(0, 2).join(', ')
    const paperTitle = getPaperTitle(first)
    return labels ? `${paperTitle}: ${labels}` : paperTitle
  }, [questionReviewPapers])
  const questionReviewBannerTitle = `${questionReviewTotal} question review${questionReviewTotal === 1 ? '' : 's'} pending`
  const unreadResponsePapers = useMemo(
    () => isStaff || !seenReviewResponseKeysLoaded ? [] : notificationPapersSource.filter((paper) => getUnreadReviewResponseCount(paper, seenReviewResponseKeys) > 0),
    [isStaff, notificationPapersSource, seenReviewResponseKeys, seenReviewResponseKeysLoaded],
  )
  const unreadResponseTotal = useMemo(
    () => unreadResponsePapers.reduce((sum, paper) => sum + getUnreadReviewResponseCount(paper, seenReviewResponseKeys), 0),
    [seenReviewResponseKeys, unreadResponsePapers],
  )
  const unreadResponsePreview = useMemo(() => {
    const first = unreadResponsePapers[0]
    if (!first) return ''
    const labels = getUnreadReviewResponseLabels(first, seenReviewResponseKeys).slice(0, 2).join(', ')
    return `${getPaperTitle(first)}${labels ? `: ${labels}` : ''}`
  }, [seenReviewResponseKeys, unreadResponsePapers])
  const studentNotificationTitle = `${unreadResponseTotal} teacher response${unreadResponseTotal === 1 ? '' : 's'}`
  const notificationPapers = unreadResponseTotal > 0 ? unreadResponsePapers : questionReviewPapers
  const notificationTitle = unreadResponseTotal > 0 ? studentNotificationTitle : questionReviewBannerTitle
  const notificationPreview = unreadResponseTotal > 0
    ? `${unreadResponsePreview}${questionReviewTotal > 0 ? ` · ${questionReviewTotal} review${questionReviewTotal === 1 ? '' : 's'} still pending` : ''}`
    : questionReviewPreview
  const notificationTotal = unreadResponseTotal + questionReviewTotal
  const displayedReviewCount = isStaff
    ? assessment.reviewCount
    : notificationPapersSource.filter((paper) => getQuestionReviewCount(paper) > 0 || getUnreadReviewResponseCount(paper, seenReviewResponseKeys) > 0).length

  const visiblePapers = useMemo(() => {
    const term = normalize(query)
    return papers.filter((paper) => matchesTab(paper, activeTab) && matchesSearch(paper, term) && (!selectedSubject || getPaperSubject(paper) === selectedSubject))
  }, [activeTab, papers, query, selectedSubject])

  const visibleCount = visiblePapers.length
  const totalCount = papers.length
  const scorePercentValue = assessment.latest ? scorePercent(assessment.latest) : assessment.average
  const isSearchEmpty = totalCount > 0 && visibleCount === 0
  const hasCacheAndError = isError && totalCount > 0
  const listExtraData = useMemo(
    () => ({ downloadingPaperId, notificationPaperById, seenReviewResponseKeys }),
    [downloadingPaperId, notificationPaperById, seenReviewResponseKeys],
  )

  const openPaper = useCallback(
    (paper: CheckedPaper) => {
      if (!canOpenPaper(paper.id, openingPaperRef.current)) return
      openingPaperRef.current = paper.id
      setOpeningPaperId(paper.id)
      navigation.navigate('ResultDetail', { checkedPaperId: paper.id })
    },
    [navigation],
  )

  const downloadPaper = useCallback(async (paper: CheckedPaper) => {
    if (downloadingPaperRef.current) return
    downloadingPaperRef.current = paper.id
    setDownloadError(null)
    setDownloadingPaperId(paper.id)
    try {
      await downloadCheckedPaperPdf(paper.id, `${getPaperTitle(paper)}-checked-report`)
    } catch {
      setDownloadError('The PDF could not be downloaded. Check your connection and try again.')
    } finally {
      downloadingPaperRef.current = null
      setDownloadingPaperId(null)
    }
  }, [])

  const clearSearch = () => setQuery('')
  const clearFilters = () => {
    setQuery('')
    setSelectedSubject(null)
    setActiveTab('all')
  }

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
          <SummaryMetric label="In review" value={String(displayedReviewCount).padStart(2, '0')} divider />
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

      {notificationTotal > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${notificationTitle}. ${notificationPreview}`}
          accessibilityHint="Opens the related checked paper."
          onPress={() => {
            const first = notificationPapers[0]
            if (first) openPaper(first)
          }}
          style={({ pressed }) => [styles.questionReviewBanner, pressed && styles.questionReviewBannerPressed]}
        >
          <View style={styles.questionReviewIcon}>
            <Ionicons name="notifications-outline" size={17} color={colors.accentStrong} />
          </View>
          <View style={styles.questionReviewCopy}>
            <Text style={styles.questionReviewTitle}>
              {notificationTitle}
            </Text>
            <Text style={styles.questionReviewText} numberOfLines={2}>
              {notificationPreview || 'Open the related checked paper.'}
            </Text>
          </View>
        </Pressable>
      ) : null}

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

      {downloadError ? (
        <View style={styles.downloadErrorBanner} accessibilityRole="alert">
          <Ionicons name="alert-circle-outline" size={17} color={colors.danger} />
          <Text style={styles.downloadErrorText}>{downloadError}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss download error" hitSlop={8} onPress={() => setDownloadError(null)}>
            <Ionicons name="close" size={17} color={colors.textSecondary} />
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
          onAction={() => navigation.getParent()?.navigate(isStaff ? 'StaffPapers' : 'Papers')}
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
        <View style={styles.warmSurface}><LibrarySkeleton /></View>
      </AppScreen>
    )
  }

  if (isError && totalCount === 0) {
    return (
      <AppScreen scroll={false} padded={false} contentStyle={styles.screenRoot}>
        <View style={[styles.warmSurface, styles.errorWrap]}>
          <ErrorState title="Checked papers could not load" message={errorMessage(error)} actionLabel="Retry" onAction={() => void refetch()} style={styles.errorCard} />
        </View>
      </AppScreen>
    )
  }

  return (
    <AppScreen scroll={false} padded={false} contentStyle={styles.screenRoot}>
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
          extraData={listExtraData}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          ListEmptyComponent={listEmpty}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={() => void refetch()} tintColor={colors.accent} colors={[colors.accent]} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => (
            <CheckedPaperRow
              paper={notificationPaperById.get(item.id) ?? item}
              featured={index === 0}
              isStaff={isStaff}
              seenReviewResponseKeys={seenReviewResponseKeys}
              opening={openingPaperId === item.id}
              downloading={downloadingPaperId === item.id}
              downloadBlocked={Boolean(downloadingPaperId && downloadingPaperId !== item.id)}
              onPress={() => openPaper(item)}
              onDownload={() => void downloadPaper(item)}
            />
          )}
        />
      </View>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    paddingBottom: 0,
    backgroundColor: '#fffaf2',
  },
  warmSurface: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#fffaf2',
    overflow: 'hidden',
  },
  list: {
    flex: 1,
    overflow: 'hidden',
  },
  listContent: {
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingTop: spacing[3],
    paddingBottom: layout.bottomTabHeight + spacing[10],
  },
  headerStack: {
    gap: spacing[3],
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
    fontSize: 15,
    lineHeight: 19,
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
    fontSize: 24,
    lineHeight: 25,
    letterSpacing: -0.3,
  },
  pageTitleCompact: {
    fontSize: 23,
    lineHeight: 25,
  },
  pageSubtitle: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
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
    fontSize: 15,
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
  questionReviewBanner: {
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f8c979',
    backgroundColor: '#fff8e7',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  questionReviewBannerPressed: {
    opacity: 0.82,
  },
  questionReviewIcon: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff0cf',
  },
  questionReviewCopy: {
    flex: 1,
    minWidth: 0,
  },
  questionReviewTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 12,
    lineHeight: 16,
  },
  questionReviewText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 9,
    lineHeight: 13,
    marginTop: 2,
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
    fontSize: 16,
    lineHeight: 19,
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
    fontSize: 13,
    lineHeight: 17,
  },
  paperInsight: {
    flex: 1,
    minWidth: 0,
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
    fontSize: 16,
    lineHeight: 19,
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
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing[1],
    paddingLeft: 55,
  },
  reviewNotice: {
    marginTop: spacing[2],
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f8c979',
    backgroundColor: '#fff8e7',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  reviewNoticeCopy: {
    flex: 1,
    minWidth: 0,
  },
  reviewNoticeTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    lineHeight: 14,
  },
  reviewNoticeText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 9,
    lineHeight: 12,
  },
  paperActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    flexShrink: 0,
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
    fontSize: 9,
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
    fontSize: 9,
  },
  openAction: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    flexShrink: 0,
    paddingHorizontal: spacing[1],
    borderRadius: radius.full,
    backgroundColor: 'transparent',
  },
  openActionText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
  },
  downloadAction: {
    width: 44,
    minHeight: 44,
    paddingHorizontal: 0,
    borderRadius: radius.full,
    borderWidth: 0,
    backgroundColor: 'transparent',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  downloadActionPressed: {
    backgroundColor: colors.accentSurface,
  },
  downloadActionDisabled: {
    opacity: 0.68,
  },
  downloadActionBlocked: {
    opacity: 0.5,
  },
  downloadActionText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 7,
    lineHeight: 9,
    letterSpacing: 0.35,
  },
  downloadActionTextBlocked: {
    color: colors.textSoft,
  },
  downloadErrorBanner: {
    minHeight: 48,
    marginHorizontal: spacing[4],
    marginBottom: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerSurface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  downloadErrorText: {
    flex: 1,
    color: colors.danger,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 14,
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
