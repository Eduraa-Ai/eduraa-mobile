import React, { useMemo, useState } from 'react'
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
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

type SectionTone = 'diamond' | 'trap' | 'check' | 'idea' | 'star' | 'brain'

const SECTION_TONES: Record<
  keyof CheatSheet['payload']['chapters'][number]['topics'][number]['sections'],
  { label: string; tone: SectionTone }
> = {
  formulas: { label: 'Formulas', tone: 'diamond' },
  must_know_concepts: { label: 'Must-know concepts', tone: 'diamond' },
  definitions: { label: 'Definitions', tone: 'idea' },
  process_steps: { label: 'Process steps', tone: 'idea' },
  common_mistakes: { label: 'Common mistakes', tone: 'trap' },
  mini_examples: { label: 'Mini examples', tone: 'star' },
  memory_tips: { label: 'Memory tips', tone: 'brain' },
  last_minute_revision: { label: 'Last-minute revision', tone: 'check' },
}

const TONE_SURFACE: Record<SectionTone, { background: string; tint: string; iconName: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap }> = {
  diamond: { background: colors.infoSurface, tint: colors.info, iconName: 'shapes-outline' },
  trap: { background: colors.dangerSurface, tint: colors.danger, iconName: 'warning-outline' },
  check: { background: colors.successSurface, tint: colors.success, iconName: 'checkmark' },
  idea: { background: colors.violet[50], tint: colors.violet[600], iconName: 'bulb-outline' },
  star: { background: colors.accentSurface, tint: colors.accentStrong, iconName: 'star-outline' },
  brain: { background: colors.warm.goldSoft, tint: colors.warning, iconName: 'sparkles-outline' },
}

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

function collectSectionItems(
  chapter: CheatSheetPayloadChapter,
  sectionKey: keyof CheatSheetPayloadChapter['topics'][number]['sections'],
): CheatSheetContentItem[] {
  return chapter.topics.flatMap((topic) => topic.sections[sectionKey] || [])
}

export default function CheatSheetDetailScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute()
  const params = (route.params || {}) as { cheatSheetId?: string }
  const cheatSheetId = params.cheatSheetId
  const [chapterIndex, setChapterIndex] = useState(0)

  const listQuery = useQuery({
    queryKey: ['cheat-sheets-detail'],
    queryFn: () => cheatSheetsApi.list(),
    enabled: Boolean(cheatSheetId),
  })

  const sheet = useMemo(
    () => listQuery.data?.items.find((entry) => entry.id === cheatSheetId) || null,
    [listQuery.data, cheatSheetId],
  )

  if (!cheatSheetId) {
    return (
      <AppScreen contentStyle={styles.screen}>
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
      <AppScreen contentStyle={styles.screen}>
        <PremiumHeader eyebrow="Cheat sheet" title="Loading…" onBack={() => navigation.goBack()} />
        <SkeletonCard />
        <SkeletonCard lines={5} />
      </AppScreen>
    )
  }

  if (listQuery.isError) {
    return (
      <AppScreen contentStyle={styles.screen}>
        <PremiumHeader eyebrow="Cheat sheet" title="Could not open" onBack={() => navigation.goBack()} />
        <ErrorState
          title="Could not load cheat sheet"
          message="Refresh and try again."
          onAction={() => void listQuery.refetch()}
        />
      </AppScreen>
    )
  }

  if (!sheet) {
    return (
      <AppScreen contentStyle={styles.screen}>
        <PremiumHeader eyebrow="Cheat sheet" title="Cheat sheet not found" onBack={() => navigation.goBack()} />
        <ErrorState
          title="Cheat sheet unavailable"
          message="This cheat sheet may have been removed. Return to the library."
          onAction={() => navigation.goBack()}
        />
      </AppScreen>
    )
  }

  const chapters = sheet.payload.chapters
  const chapter = chapters[chapterIndex] || null
  const totalPoints = chapters.reduce((total, entry) => total + countChapterPoints(entry), 0)

  const pdfUrl = sheet.pdf_url || resolveCheatSheetPdfUrl(sheet.id)
  const canDownload = sheet.status === 'ready' || Boolean(sheet.pdf_url)

  return (
    <AppScreen contentStyle={styles.screen}>
      <PremiumHeader
        eyebrow={`AI cheat sheet · ${chapters.length} ${chapters.length === 1 ? 'chapter' : 'chapters'}`}
        title={sheet.title}
        subtitle={`${chapters.length} ${chapters.length === 1 ? 'chapter' : 'chapters'} · ${totalPoints} revision points`}
        onBack={() => navigation.goBack()}
        right={
          <View style={[styles.pill, sheet.status !== 'ready' && styles.pillDraft]}>
            <Text style={[styles.pillText, sheet.status !== 'ready' && styles.pillTextDraft]}>
              {sheet.status === 'ready' ? 'Ready' : sheet.status}
            </Text>
          </View>
        }
      />

      {chapters.length > 1 ? (
        <View style={styles.chapterChips}>
          {chapters.map((c, index) => (
            <Pressable
              key={c.chapter_id || c.chapter_title}
              onPress={() => setChapterIndex(index)}
              style={({ pressed }) => [
                styles.chapterChip,
                chapterIndex === index && styles.chapterChipActive,
                pressed && styles.chapterChipPressed,
              ]}
            >
              <Text
                style={[
                  styles.chapterChipLabel,
                  chapterIndex === index && styles.chapterChipLabelActive,
                ]}
                numberOfLines={1}
              >
                {c.chapter_title}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {chapter ? (
        <ChapterCard
          chapter={chapter}
          index={chapterIndex}
          points={countChapterPoints(chapter)}
        />
      ) : (
        <View style={styles.emptyChapter}>
          <Text style={styles.emptyChapterTitle}>No chapters generated yet</Text>
          <Text style={styles.emptyChapterBody}>
            Regenerate this cheat sheet once your teacher publishes the chapter list.
          </Text>
        </View>
      )}

      {chapter ? (
        <View style={styles.sectionsStack}>
          <FormulaSection chapter={chapter} />
          <BulletSection
            chapter={chapter}
            sectionKey="must_know_concepts"
            hideEmpty
          />
          <BulletSection chapter={chapter} sectionKey="common_mistakes" hideEmpty />
          <BulletSection chapter={chapter} sectionKey="last_minute_revision" hideEmpty />
          <BulletSection chapter={chapter} sectionKey="memory_tips" hideEmpty />
        </View>
      ) : null}

      <AnimatedButton
        label={canDownload ? 'Download cheat sheet PDF' : 'PDF not ready yet'}
        variant="primary"
        disabled={!canDownload}
        onPress={() => void openPdf(pdfUrl)}
        style={styles.downloadButton}
      />
      {chapter ? (
        <AnimatedButton
          label={`Open ${chapter.chapter_title} study pack`}
          variant="secondary"
          onPress={() =>
            navigation.navigate('StudyPack', {
              subject: 'Physics',
              chapter: chapter.chapter_title,
              standard: '12th',
            })
          }
          style={styles.studyPackButton}
        />
      ) : null}
    </AppScreen>
  )
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
    .slice(0, 3)
    .map((topic) => topic.topic_name)
    .filter(Boolean)
    .join(', ')
  return (
    <View style={styles.chapterCard}>
      <View style={styles.chapterHead}>
        <View>
          <Text style={styles.chapterKicker}>Chapter {String(index + 1).padStart(2, '0')}</Text>
          <Text style={styles.chapterTitle}>{chapter.chapter_title}</Text>
        </View>
        <View style={styles.pointsPill}>
          <Text style={styles.pointsPillText}>{points} points</Text>
        </View>
      </View>
      {topicPreview ? <Text style={styles.chapterTopics}>{topicPreview}</Text> : null}
    </View>
  )
}

function FormulaSection({ chapter }: { chapter: CheatSheetPayloadChapter }) {
  const formulas = collectSectionItems(chapter, 'formulas')
  if (formulas.length === 0) return null
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
          </View>
        ))}
      </View>
    </View>
  )
}

function BulletSection({
  chapter,
  sectionKey,
  hideEmpty,
}: {
  chapter: CheatSheetPayloadChapter
  sectionKey: keyof CheatSheetPayloadChapter['topics'][number]['sections']
  hideEmpty?: boolean
}) {
  const items = collectSectionItems(chapter, sectionKey)
  if (items.length === 0 && hideEmpty) return null
  const config = SECTION_TONES[sectionKey]
  const tone = TONE_SURFACE[config.tone]
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{config.label}</Text>
      </View>
      <View style={styles.bulletList}>
        {items.map((item, i) => (
          <View key={`${item.title}-${i}`} style={styles.bulletRow}>
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
  },
  pill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.successSurface,
  },
  pillText: {
    color: colors.success,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  pillDraft: {
    backgroundColor: colors.warningSurface,
  },
  pillTextDraft: {
    color: colors.warning,
  },
  chapterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  chapterChip: {
    paddingHorizontal: spacing[3],
    height: 34,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
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
    lineHeight: 22,
    marginTop: 2,
  },
  chapterTopics: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
  },
  pointsPill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.violet[50],
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
    padding: spacing[4],
    gap: spacing[1],
  },
  emptyChapterTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
  },
  emptyChapterBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
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
    paddingVertical: 7,
    borderRadius: radius.md,
    backgroundColor: colors.infoSurface,
    borderWidth: 1,
    borderColor: colors.info + '33',
  },
  formulaChipText: {
    color: colors.info,
    fontFamily: 'Courier',
    fontSize: 12,
  },
  bulletList: {
    gap: spacing[3],
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
  bulletIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  bulletCopy: {
    flex: 1,
    gap: 2,
  },
  bulletTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
    lineHeight: 17,
  },
  bulletDetail: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  downloadButton: {
    marginTop: spacing[2],
  },
  studyPackButton: {
    marginTop: spacing[2],
  },
})
