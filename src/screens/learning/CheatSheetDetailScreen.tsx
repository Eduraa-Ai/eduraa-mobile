import React, { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { AnimatedButton, AppScreen, ErrorState, PremiumHeader, SkeletonCard } from '../../components/ui'
import {
  cheatSheetsApi,
  CheatSheet,
  CheatSheetContentItem,
  CheatSheetPayloadChapter,
  resolveCheatSheetPdfUrl,
} from '../../api/cheatSheets'
import { colors, radius, shadows, spacing, typography } from '../../theme'

const MONO_FAMILY = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'ui-monospace, SFMono-Regular, Menlo, monospace',
})

const READING_MAX_WIDTH = 720
const WIDE_SCREEN_BREAKPOINT = 720

async function openPdf(url: string) {
  try {
    const canOpen = await Linking.canOpenURL(url)
    if (!canOpen) {
      Alert.alert('Cannot open PDF', 'No app is available to open this PDF.')
      return
    }
    await Linking.openURL(url)
  } catch {
    Alert.alert('Cannot open PDF', 'Something went wrong opening the PDF.')
  }
}

type SubjectHint = 'physics' | 'chemistry' | 'mathematics' | 'biology' | null

const SUBJECT_KEYWORDS: { hint: SubjectHint; label: string; keywords: string[] }[] = [
  { hint: 'physics', label: 'Physics', keywords: ['physics', 'mechanic', 'electro', 'magnet', 'optic', 'thermodyn', 'kinemat'] },
  { hint: 'chemistry', label: 'Chemistry', keywords: ['chemistry', 'organic', 'inorganic', 'reaction', 'chemical', 'compound', 'molecule'] },
  { hint: 'mathematics', label: 'Mathematics', keywords: ['math', 'algebra', 'calculus', 'trigonometry', 'geometry', 'integral', 'derivative'] },
  { hint: 'biology', label: 'Biology', keywords: ['biology', 'cell', 'plant', 'animal', 'genetic', 'evolution'] },
]

function deriveSubject(sheet: CheatSheet): { label: string; hint: SubjectHint } | null {
  const metaSubject = ((sheet.source_meta || {}) as Record<string, unknown>)['subject_name']
  if (typeof metaSubject === 'string' && metaSubject.trim()) {
    return { label: metaSubject.trim(), hint: matchSubject(metaSubject) }
  }
  const haystack = [
    sheet.title,
    sheet.payload?.scope_summary,
    ...(sheet.payload?.chapters || []).flatMap((c) => [c.chapter_title, c.book_title, ...c.topics.map((t) => t.topic_name)]),
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
  const match = SUBJECT_KEYWORDS.find(({ keywords }) => keywords.some((keyword) => haystack.includes(keyword)))
  return match ? { label: match.label, hint: match.hint } : null
}

function matchSubject(name: string): SubjectHint {
  const lowered = name.toLowerCase()
  const match = SUBJECT_KEYWORDS.find(({ keywords }) => keywords.some((keyword) => lowered.includes(keyword)))
  return match ? match.hint : null
}

type SectionTone = 'diamond' | 'trap' | 'check' | 'idea' | 'star' | 'brain'
type SectionKey = keyof CheatSheetPayloadChapter['topics'][number]['sections']

const SECTION_TONES: Record<SectionKey, { label: string; tone: SectionTone }> = {
  formulas: { label: 'Formulas', tone: 'diamond' },
  must_know_concepts: { label: 'Must-know concepts', tone: 'diamond' },
  definitions: { label: 'Definitions', tone: 'idea' },
  process_steps: { label: 'Process steps', tone: 'idea' },
  common_mistakes: { label: 'Common mistakes', tone: 'trap' },
  mini_examples: { label: 'Mini examples', tone: 'star' },
  memory_tips: { label: 'Memory tips', tone: 'brain' },
  last_minute_revision: { label: 'Last-minute revision', tone: 'check' },
}

const TONE_SURFACE: Record<SectionTone, { background: string; tint: string; iconName: keyof typeof Ionicons.glyphMap }> = {
  diamond: { background: colors.infoSurface, tint: colors.info, iconName: 'shapes-outline' },
  trap: { background: colors.dangerSurface, tint: colors.danger, iconName: 'warning-outline' },
  check: { background: colors.successSurface, tint: colors.success, iconName: 'checkmark' },
  idea: { background: colors.violet[50], tint: colors.violet[600], iconName: 'bulb-outline' },
  star: { background: colors.accentSurface, tint: colors.accentStrong, iconName: 'star-outline' },
  brain: { background: colors.warm.goldSoft, tint: colors.warning, iconName: 'sparkles-outline' },
}

// Order matters — this is the visual reading order on the chapter view.
const BULLET_SECTIONS: SectionKey[] = [
  'must_know_concepts',
  'definitions',
  'process_steps',
  'mini_examples',
  'common_mistakes',
  'memory_tips',
  'last_minute_revision',
]

function countChapterPoints(chapter: CheatSheetPayloadChapter) {
  return chapter.topics.reduce((topicTotal, topic) => {
    const s = topic.sections
    return (
      topicTotal +
      s.definitions.length +
      s.must_know_concepts.length +
      s.formulas.length +
      s.process_steps.length +
      s.mini_examples.length +
      s.common_mistakes.length +
      s.memory_tips.length +
      s.last_minute_revision.length
    )
  }, 0)
}

function collectSectionItems(chapter: CheatSheetPayloadChapter, sectionKey: SectionKey): CheatSheetContentItem[] {
  return chapter.topics.flatMap((topic) => topic.sections[sectionKey] || [])
}

function statusLook(status: string): { label: string; kind: 'ready' | 'progress' | 'muted' } {
  const value = String(status || '').toLowerCase()
  if (value === 'ready' || value === 'published') return { label: 'Ready', kind: 'ready' }
  if (value === 'generating' || value === 'processing' || value === 'queued') return { label: 'Generating…', kind: 'progress' }
  return { label: status || 'Draft', kind: 'muted' }
}

export default function CheatSheetDetailScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute()
  const params = (route.params || {}) as { cheatSheetId?: string }
  const cheatSheetId = params.cheatSheetId
  const [chapterIndex, setChapterIndex] = useState(0)
  const { width } = useWindowDimensions()
  const isWide = width >= WIDE_SCREEN_BREAKPOINT

  const listQuery = useQuery({
    queryKey: ['cheat-sheets-detail'],
    queryFn: () => cheatSheetsApi.list(),
    enabled: Boolean(cheatSheetId),
  })

  const sheet = useMemo(
    () => listQuery.data?.items.find((entry) => entry.id === cheatSheetId) || null,
    [listQuery.data, cheatSheetId],
  )

  const handleRefresh = useCallback(async () => {
    await listQuery.refetch()
  }, [listQuery])

  const refreshControl = (
    <RefreshControl refreshing={listQuery.isRefetching} onRefresh={handleRefresh} tintColor={colors.accent} />
  )

  const responsiveContentStyle = useMemo(
    () => (isWide ? StyleSheet.flatten([styles.screen, styles.screenWide]) : styles.screen),
    [isWide],
  )

  if (!cheatSheetId) {
    return (
      <AppScreen contentStyle={responsiveContentStyle}>
        <PremiumHeader eyebrow="Cheat sheet" title="Cheat sheet not found" onBack={() => navigation.goBack()} />
        <ErrorState
          title="Missing cheat sheet"
          message="Return to the library and pick one."
          onAction={() => navigation.goBack()}
        />
      </AppScreen>
    )
  }

  if (listQuery.isLoading) {
    return (
      <AppScreen contentStyle={responsiveContentStyle}>
        <PremiumHeader eyebrow="Cheat sheet" title="Loading cheat sheet" subtitle="Fetching chapters and revision points" onBack={() => navigation.goBack()} />
        <SkeletonCard />
        <SkeletonCard lines={5} />
        <SkeletonCard lines={4} />
      </AppScreen>
    )
  }

  if (listQuery.isError) {
    return (
      <AppScreen contentStyle={responsiveContentStyle} refreshControl={refreshControl}>
        <PremiumHeader eyebrow="Cheat sheet" title="Could not open" onBack={() => navigation.goBack()} />
        <ErrorState
          title="Could not load cheat sheet"
          message="Check your connection and try again."
          onAction={() => void listQuery.refetch()}
        />
      </AppScreen>
    )
  }

  if (!sheet) {
    return (
      <AppScreen contentStyle={responsiveContentStyle} refreshControl={refreshControl}>
        <PremiumHeader eyebrow="Cheat sheet" title="Cheat sheet not found" onBack={() => navigation.goBack()} />
        <ErrorState
          title="Cheat sheet unavailable"
          message="This cheat sheet may have been removed. Return to the library and pick another."
          actionLabel="Back to library"
          onAction={() => navigation.goBack()}
        />
      </AppScreen>
    )
  }

  const chapters = sheet.payload.chapters || []
  const safeIndex = chapters.length > 0 ? Math.min(chapterIndex, chapters.length - 1) : 0
  const chapter = chapters[safeIndex] || null
  const totalPoints = chapters.reduce((total, entry) => total + countChapterPoints(entry), 0)
  const status = statusLook(sheet.status)
  const pdfUrl = sheet.pdf_url || resolveCheatSheetPdfUrl(sheet.id)
  const canDownload = status.kind === 'ready' || Boolean(sheet.pdf_url)
  const subject = deriveSubject(sheet)
  const canOpenStudyPack = Boolean(subject && chapter?.chapter_title)

  return (
    <AppScreen contentStyle={responsiveContentStyle} refreshControl={refreshControl}>
      <PremiumHeader
        eyebrow={`AI cheat sheet · ${chapters.length} ${chapters.length === 1 ? 'chapter' : 'chapters'}`}
        title={sheet.title}
        subtitle={
          chapters.length
            ? `${chapters.length} ${chapters.length === 1 ? 'chapter' : 'chapters'} · ${totalPoints} revision points`
            : 'Awaiting chapter content'
        }
        onBack={() => navigation.goBack()}
        right={
          <View
            style={[
              styles.pill,
              status.kind === 'progress' && styles.pillProgress,
              status.kind === 'muted' && styles.pillDraft,
            ]}
          >
            <Text
              style={[
                styles.pillText,
                status.kind === 'progress' && styles.pillTextProgress,
                status.kind === 'muted' && styles.pillTextDraft,
              ]}
              numberOfLines={1}
            >
              {status.label}
            </Text>
          </View>
        }
      />

      {sheet.payload.scope_summary ? (
        <Text style={styles.summary} numberOfLines={4}>
          {sheet.payload.scope_summary}
        </Text>
      ) : null}

      {chapters.length > 1 ? (
        <ChapterChips
          chapters={chapters}
          activeIndex={safeIndex}
          onSelect={setChapterIndex}
        />
      ) : null}

      {chapter ? (
        <ChapterCard chapter={chapter} index={safeIndex} points={countChapterPoints(chapter)} />
      ) : (
        <View style={styles.emptyChapter}>
          <View style={styles.emptyChapterIcon}>
            <Ionicons name="hourglass-outline" size={20} color={colors.accentStrong} />
          </View>
          <Text style={styles.emptyChapterTitle}>Chapter content is still being generated</Text>
          <Text style={styles.emptyChapterBody}>
            {status.kind === 'progress'
              ? 'Pull down to refresh — this cheat sheet is still generating.'
              : 'Regenerate this cheat sheet once your teacher publishes the chapter list.'}
          </Text>
        </View>
      )}

      {chapter ? <ChapterSections chapter={chapter} /> : null}

      <View style={styles.actions}>
        <AnimatedButton
          label={canDownload ? 'Download cheat sheet PDF' : 'PDF not ready yet'}
          variant="primary"
          disabled={!canDownload}
          onPress={() => void openPdf(pdfUrl)}
          style={styles.actionButton}
        />
        {canOpenStudyPack && subject && chapter ? (
          <AnimatedButton
            label={`Open ${chapter.chapter_title} study pack`}
            variant="secondary"
            onPress={() =>
              navigation.navigate('StudyPack', {
                subject: subject.label,
                chapter: chapter.chapter_title,
                standard: '12th',
                subjectId: sheet.subject_id ?? null,
                chapterId: chapter.chapter_id ?? null,
                trackLabel: sheet.exam_id ? String(sheet.exam_id) : undefined,
              })
            }
            style={styles.actionButton}
          />
        ) : null}
      </View>
    </AppScreen>
  )
}

function ChapterChips({
  chapters,
  activeIndex,
  onSelect,
}: {
  chapters: CheatSheetPayloadChapter[]
  activeIndex: number
  onSelect: (index: number) => void
}) {
  const usesHorizontalScroll = chapters.length > 4
  const chips = chapters.map((c, index) => (
    <Pressable
      key={c.chapter_id || `${c.chapter_title}-${index}`}
      onPress={() => onSelect(index)}
      style={({ pressed }) => [
        styles.chapterChip,
        activeIndex === index && styles.chapterChipActive,
        pressed && styles.chapterChipPressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: activeIndex === index }}
      accessibilityLabel={`Chapter ${index + 1}: ${c.chapter_title}`}
    >
      <Text
        style={[styles.chapterChipLabel, activeIndex === index && styles.chapterChipLabelActive]}
        numberOfLines={1}
      >
        {c.chapter_title}
      </Text>
    </Pressable>
  ))

  if (usesHorizontalScroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chapterChipsScrollContent}
      >
        {chips}
      </ScrollView>
    )
  }
  return <View style={styles.chapterChips}>{chips}</View>
}

function ChapterCard({
  chapter,
  index,
  points,
}: {
  chapter: CheatSheetPayloadChapter
  index: number
  points: number
}) {
  const topicPreview = chapter.topics
    .slice(0, 4)
    .map((topic) => topic.topic_name)
    .filter(Boolean)
    .join(', ')
  return (
    <View style={styles.chapterCard}>
      <View style={styles.chapterHead}>
        <View style={styles.chapterHeadCopy}>
          <Text style={styles.chapterKicker}>Chapter {String(index + 1).padStart(2, '0')}</Text>
          <Text style={styles.chapterTitle} numberOfLines={3}>
            {chapter.chapter_title}
          </Text>
        </View>
        <View style={styles.pointsPill}>
          <Text style={styles.pointsPillText} numberOfLines={1}>
            {points} {points === 1 ? 'point' : 'points'}
          </Text>
        </View>
      </View>
      {topicPreview ? (
        <Text style={styles.chapterTopics} numberOfLines={3}>
          {topicPreview}
        </Text>
      ) : null}
      {chapter.book_title ? (
        <Text style={styles.chapterBook} numberOfLines={1}>
          From {chapter.book_title}
        </Text>
      ) : null}
    </View>
  )
}

function ChapterSections({ chapter }: { chapter: CheatSheetPayloadChapter }) {
  const formulas = useMemo(() => collectSectionItems(chapter, 'formulas'), [chapter])
  const bulletSections = useMemo(
    () =>
      BULLET_SECTIONS.map((key) => ({
        key,
        items: collectSectionItems(chapter, key),
      })).filter((section) => section.items.length > 0),
    [chapter],
  )

  const hasAnyContent = formulas.length > 0 || bulletSections.length > 0
  if (!hasAnyContent) {
    return (
      <View style={styles.emptyChapter}>
        <View style={styles.emptyChapterIcon}>
          <Ionicons name="sparkles-outline" size={20} color={colors.accentStrong} />
        </View>
        <Text style={styles.emptyChapterTitle}>This chapter is still being written</Text>
        <Text style={styles.emptyChapterBody}>
          Once formulas, mistakes, and revision points are ready they will appear here.
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.sectionsStack}>
      {formulas.length > 0 ? <FormulaSection formulas={formulas} /> : null}
      {bulletSections.map(({ key, items }) => (
        <BulletSection key={key} sectionKey={key} items={items} />
      ))}
    </View>
  )
}

function FormulaSection({ formulas }: { formulas: CheatSheetContentItem[] }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{SECTION_TONES.formulas.label}</Text>
        <Text style={styles.sectionMeta}>· {formulas.length}</Text>
      </View>
      <View style={styles.formulaChips}>
        {formulas.map((entry, i) => (
          <View key={`${entry.title}-${i}`} style={styles.formulaChip}>
            <Text style={styles.formulaChipText}>{entry.title}</Text>
            {entry.detail ? (
              <Text style={styles.formulaDetail} numberOfLines={2}>
                {entry.detail}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  )
}

function BulletSection({
  sectionKey,
  items,
}: {
  sectionKey: SectionKey
  items: CheatSheetContentItem[]
}) {
  const config = SECTION_TONES[sectionKey]
  const tone = TONE_SURFACE[config.tone]
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{config.label}</Text>
        <Text style={styles.sectionMeta}>· {items.length}</Text>
      </View>
      <View style={styles.bulletList}>
        {items.map((item, i) => (
          <View
            key={`${item.title}-${i}`}
            style={[styles.bulletRow, i > 0 && styles.bulletRowSpacing]}
          >
            <View style={[styles.bulletIcon, { backgroundColor: tone.background }]}>
              <Ionicons name={tone.iconName} size={13} color={tone.tint} />
            </View>
            <View style={styles.bulletCopy}>
              <Text style={styles.bulletTitle}>{item.title}</Text>
              {item.detail ? <Text style={styles.bulletDetail}>{item.detail}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[20],
    gap: spacing[4],
    width: '100%',
  },
  screenWide: {
    maxWidth: READING_MAX_WIDTH,
    alignSelf: 'center',
  },
  pill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.successSurface,
    maxWidth: 130,
  },
  pillText: {
    color: colors.success,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  pillDraft: {
    backgroundColor: colors.slate[100],
  },
  pillTextDraft: {
    color: colors.textSecondary,
  },
  pillProgress: {
    backgroundColor: colors.warningSurface,
  },
  pillTextProgress: {
    color: colors.warning,
  },
  summary: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: spacing[1],
  },
  chapterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  chapterChipsScrollContent: {
    flexDirection: 'row',
    gap: spacing[2],
    paddingHorizontal: 2,
  },
  chapterChip: {
    paddingHorizontal: spacing[3],
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
    maxWidth: 240,
  },
  chapterChipActive: {
    backgroundColor: colors.slate[900],
    borderColor: colors.slate[900],
  },
  chapterChipPressed: {
    transform: [{ scale: 0.97 }],
  },
  chapterChipLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 12,
  },
  chapterChipLabelActive: {
    color: colors.textInverse,
  },
  chapterCard: {
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[4],
    gap: spacing[2],
    ...shadows.xs,
  },
  chapterHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  chapterHeadCopy: {
    flex: 1,
    minWidth: 0,
  },
  chapterKicker: {
    color: colors.violet[600],
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  chapterTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
    lineHeight: 23,
    marginTop: 2,
  },
  chapterTopics: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  chapterBook: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  pointsPill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.violet[50],
    flexShrink: 0,
  },
  pointsPillText: {
    color: colors.violet[700],
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  emptyChapter: {
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[5],
    gap: spacing[2],
    alignItems: 'flex-start',
    ...shadows.xs,
  },
  emptyChapterIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    marginBottom: spacing[1],
  },
  emptyChapterTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
  },
  emptyChapterBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12.5,
    lineHeight: 17,
  },
  sectionsStack: {
    gap: spacing[4],
  },
  section: {
    gap: spacing[2],
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing[1],
    paddingHorizontal: spacing[1],
  },
  sectionTitle: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sectionMeta: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  formulaChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  formulaChip: {
    paddingHorizontal: spacing[3],
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.infoSurface,
    borderWidth: 1,
    borderColor: colors.info + '33',
    maxWidth: '100%',
    gap: 3,
  },
  formulaChipText: {
    color: colors.info,
    fontFamily: MONO_FAMILY,
    fontSize: 12.5,
    lineHeight: 17,
    flexShrink: 1,
    flexWrap: 'wrap',
  },
  formulaDetail: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 15,
  },
  bulletList: {
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[4],
    ...shadows.xs,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
  },
  bulletRowSpacing: {
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  bulletIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  bulletCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  bulletTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13.5,
    lineHeight: 18,
  },
  bulletDetail: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12.5,
    lineHeight: 17,
  },
  actions: {
    gap: spacing[2],
    marginTop: spacing[2],
  },
  actionButton: {
    width: '100%',
  },
})
