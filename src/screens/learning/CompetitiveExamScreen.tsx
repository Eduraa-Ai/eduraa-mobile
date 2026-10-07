import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { AnimatedButton, AnimatedCard, AppScreen, ErrorState, SelectableChip, SummaryStrip, EmptyState, SectionHeading } from '../../components/ui'
import { learningResourcesApi, LearningResource, resolveResourceUrl } from '../../api/learningResources'
import { cheatSheetsApi, CheatSheet } from '../../api/cheatSheets'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import { isCompetitiveLearner, profileSubjects, subjectSupportCopy, subjectSymbol, subjectTone } from './competitiveExamUtils'

function resourceTypeLabel(value: string) {
  return value.replace(/_/g, ' ')
}

async function openResourceUrl(url?: string | null) {
  const resolved = resolveResourceUrl(url)
  if (!resolved) return
  const canOpen = await Linking.canOpenURL(resolved)
  if (!canOpen) {
    Alert.alert('Could not open resource', 'No app is available to open this resource.')
    return
  }
  await Linking.openURL(resolved)
}

function ResourceCard({ resource }: { resource: LearningResource }) {
  return (
    <AnimatedCard style={styles.resourceCard}>
      <View style={styles.resourceHeader}>
        <View style={styles.resourceIcon}>
          <Ionicons name="document-text-outline" size={20} color={colors.accentStrong} />
        </View>
        <View style={styles.resourceTypePill}>
          <Text style={styles.resourceType}>{resourceTypeLabel(resource.resource_type)}</Text>
        </View>
      </View>
      <Text style={styles.resourceTitle}>{resource.title}</Text>
      <Text style={styles.resourceMeta}>
        {[resource.provider_label, resource.subject_name, resource.page_count ? `${resource.page_count} pages` : null].filter(Boolean).join(' / ')}
      </Text>
      {resource.scopes.length ? <Text style={styles.resourceScopes} numberOfLines={2}>{resource.scopes.map((scope) => scope.node_name).join(', ')}</Text> : null}
      {resource.description ? <Text style={styles.resourceDescription} numberOfLines={3}>{resource.description}</Text> : null}
      <View style={styles.resourceActions}>
        <AnimatedButton label="View" variant="secondary" disabled={!resource.view_url} onPress={() => void openResourceUrl(resource.view_url)} style={styles.resourceAction} />
        <AnimatedButton label="Download" variant="ghost" disabled={!resource.download_url} onPress={() => void openResourceUrl(resource.download_url)} style={styles.resourceAction} />
      </View>
    </AnimatedCard>
  )
}

function countCheatSheetItems(sheet: CheatSheet) {
  return sheet.payload.chapters.reduce(
    (total, chapter) =>
      total +
      chapter.topics.reduce((topicTotal, topic) => {
        const sections = topic.sections
        return (
          topicTotal +
          sections.definitions.length +
          sections.must_know_concepts.length +
          sections.formulas.length +
          sections.process_steps.length +
          sections.mini_examples.length +
          sections.common_mistakes.length +
          sections.memory_tips.length +
          sections.last_minute_revision.length
        )
      }, 0),
    0,
  )
}

function CheatSheetCard({ sheet }: { sheet: CheatSheet }) {
  const firstChapter = sheet.payload.chapters[0]

  return (
    <AnimatedCard style={styles.sheetCard}>
      <View style={styles.resourceHeader}>
        <View style={styles.sheetIcon}>
          <Ionicons name="newspaper-outline" size={20} color={colors.info} />
        </View>
        <View style={styles.sheetPill}>
          <Text style={styles.sheetPillText}>{sheet.status}</Text>
        </View>
      </View>
      <Text style={styles.resourceTitle}>{sheet.title}</Text>
      <Text style={styles.resourceMeta}>
        {sheet.payload.chapters.length} chapters / {countCheatSheetItems(sheet)} revision points
      </Text>
      {sheet.payload.scope_summary ? <Text style={styles.resourceDescription} numberOfLines={3}>{sheet.payload.scope_summary}</Text> : null}
      {firstChapter ? (
        <View style={styles.sheetChapterRow}>
          <Text style={styles.chapterNumber}>01</Text>
          <View style={styles.sheetChapterCopy}>
            <Text style={styles.chapterTitle}>{firstChapter.chapter_title}</Text>
            <Text style={styles.sheetTopics}>{firstChapter.topics.map((topic) => topic.topic_name).slice(0, 3).join(', ')}</Text>
          </View>
        </View>
      ) : null}
    </AnimatedCard>
  )
}

export default function CompetitiveExamScreen() {
  const navigation = useNavigation<any>()
  const user = useAuthStore((state) => state.user)
  const [resourceType, setResourceType] = useState('all')
  const allowed = isCompetitiveLearner(user)

  const subjects = useMemo(() => profileSubjects(user?.b2c_subjects), [user?.b2c_subjects])
  const trackLabel = user?.b2c_board || user?.b2c_standard || user?.b2c_target_exam || 'JEE Mains / Advanced'

  const resourcesQuery = useQuery({
    queryKey: ['learning-resources', user?.id],
    queryFn: () => learningResourcesApi.list({ target_exam: user?.b2c_target_exam || undefined, standard: user?.b2c_standard || undefined }),
    enabled: allowed,
  })

  const cheatSheetsQuery = useQuery({
    queryKey: ['cheat-sheets', user?.id],
    queryFn: () => cheatSheetsApi.list(),
    enabled: allowed,
  })

  const resources = resourcesQuery.data?.items ?? []
  const resourceTypes = useMemo(() => Array.from(new Set(resources.map((item) => item.resource_type))).sort(), [resources])
  const filteredResources = useMemo(
    () => (resourceType === 'all' ? resources : resources.filter((resource) => resource.resource_type === resourceType)),
    [resourceType, resources],
  )

  if (!allowed) {
    return (
      <AppScreen contentStyle={styles.center}>
        <View style={styles.lockIcon}>
          <Ionicons name="lock-closed-outline" size={24} color={colors.accentStrong} />
        </View>
        <Text style={styles.centerTitle}>Competitive Exam is for JEE learners</Text>
        <Text style={styles.centerBody}>Switch your individual learner profile to a competitive exam track to unlock chapter workspaces and JEE resources.</Text>
        <AnimatedButton label="Back to Learning" onPress={() => navigation.navigate('LearningHome')} />
      </AppScreen>
    )
  }

  return (
    <AppScreen contentStyle={styles.screen}>
      <Text style={styles.trackLine}>{trackLabel} · revision PDFs, chapter workspaces, tutor help and MCQ drills</Text>
      <SummaryStrip
        stats={[
          { label: 'Subjects', value: String(subjects.length) },
          { label: 'Scope', value: '11/12' },
          { label: 'Mode', value: 'MCQ' },
        ]}
      />

      <SectionHeading title="Subjects" meta={String(subjects.length)} />
      <View style={styles.subjectList}>
        {subjects.map((subject, index) => {
          const tone = subjectTone(subject)
          return (
            <Pressable
              key={`${subject}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={`Open ${subject} chapters`}
              onPress={() => navigation.navigate('CompetitiveSubject', { subjectName: subject })}
              style={({ pressed }) => [styles.subjectRow, index > 0 && styles.subjectDivider, pressed && styles.pressed]}
            >
              <View style={[styles.subjectIcon, { backgroundColor: `${tone}1A` }]}>
                <Text style={[styles.subjectIconText, { color: tone }]}>{subjectSymbol(subject)}</Text>
              </View>
              <View style={styles.subjectCopy}>
                <Text style={styles.subjectTitle}>{subject}</Text>
                <Text style={styles.subjectBody} numberOfLines={1}>{subjectSupportCopy(subject)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.textSoft} />
            </Pressable>
          )
        })}
      </View>

      <SectionHeading title="Revision resources" subtitle="Published chapter-wise PDFs" />

      {resourceTypes.length ? <View style={styles.chipRow}>
        {['all', ...resourceTypes].map((type) => (
          <SelectableChip key={type} label={resourceTypeLabel(type)} selected={resourceType === type} onPress={() => setResourceType(type)} />
        ))}
      </View> : null}

      {resourcesQuery.isLoading ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.inlineLoadingText}>Loading resources</Text>
        </View>
      ) : null}

      {resourcesQuery.isError ? (
        <ErrorState title="Could not load resources" message="Refresh and try again." onAction={() => void resourcesQuery.refetch()} />
      ) : null}

      {!resourcesQuery.isLoading && filteredResources.length === 0 ? (
        <View style={styles.emptyCard}>
          <EmptyState icon="document-text-outline" title="No revision PDFs yet" body="Published chapter-wise resources will appear here automatically." />
        </View>
      ) : null}

      {filteredResources.map((resource) => (
        <ResourceCard key={resource.id} resource={resource} />
      ))}

      <SectionHeading title="Cheat sheets" subtitle="Generated revision sheets" />

      {cheatSheetsQuery.isLoading ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={colors.info} />
          <Text style={styles.inlineLoadingText}>Loading cheat sheets</Text>
        </View>
      ) : null}

      {cheatSheetsQuery.isError ? (
        <ErrorState title="Could not load cheat sheets" message="Refresh and try again." onAction={() => void cheatSheetsQuery.refetch()} />
      ) : null}

      {!cheatSheetsQuery.isLoading && (cheatSheetsQuery.data?.items ?? []).length === 0 ? (
        <View style={styles.emptyCard}>
          <EmptyState icon="reader-outline" title="No cheat sheets yet" body="Generated JEE cheat sheets will appear here after they are created or shared." />
        </View>
      ) : null}

      {(cheatSheetsQuery.data?.items ?? []).map((sheet) => (
        <CheatSheetCard key={sheet.id} sheet={sheet} />
      ))}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  subjectList: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated, paddingHorizontal: spacing[3] },
  subjectRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[2] },
  subjectDivider: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  subjectCopy: { flex: 1, minWidth: 0, gap: 1 },
  trackLine: { ...typography.roles.caption, fontSize: 13, color: colors.textSecondary },
  screen: {
    paddingBottom: spacing[20],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing[20],
  },
  lockIcon: {
    width: 60,
    height: 60,
    borderRadius: radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  centerTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 20,
    lineHeight: 25,
    textAlign: 'center',
  },
  centerBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 310,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  inlineLoadingText: {
    ...typography.roles.label,
    color: colors.textMuted,
  },
  subjectIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  subjectIconText: { fontFamily: typography.fonts.bodyBold, fontSize: 15 },
  subjectTitle: { ...typography.roles.rowTitle, color: colors.nav },
  subjectBody: { ...typography.roles.caption, color: colors.textMuted },
  resourceCard: {
    gap: spacing[3],
  },
  sheetCard: {
    gap: spacing[3],
    backgroundColor: colors.infoSurface,
  },
  resourceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  resourceIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  sheetIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  resourceTypePill: {
    borderRadius: radius.full,
    backgroundColor: colors.backgroundMuted,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    alignSelf: 'flex-start',
  },
  resourceType: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  resourceTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 18,
    lineHeight: 23,
  },
  resourceMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  resourceScopes: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  resourceDescription: {
    ...typography.roles.body,
    color: colors.textSecondary,
  },
  resourceActions: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  resourceAction: {
    flex: 1,
  },
  sheetPill: {
    borderRadius: radius.full,
    backgroundColor: colors.card,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    alignSelf: 'flex-start',
  },
  sheetPillText: {
    color: colors.info,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  sheetChapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundElevated,
    padding: spacing[3],
  },
  chapterNumber: {
    color: colors.info,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
    minWidth: 24,
  },
  chapterTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  sheetChapterCopy: {
    flex: 1,
    gap: 2,
  },
  sheetTopics: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
  },
  emptyCard: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
})
