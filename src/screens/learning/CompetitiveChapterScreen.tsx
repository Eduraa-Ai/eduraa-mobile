import React, { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LearningStackParamList } from '../../navigation'
import { AnimatedButton, AnimatedCard, AppScreen, SelectableChip } from '../../components/ui'
import {
  competitiveExamApi,
  CompetitiveChapterOption,
  CompetitiveStandard,
  CompetitiveWorkspacePayload,
  StudyPackKey,
} from '../../api/competitiveExam'
import { aiApi } from '../../api/ai'
import { learningResourcesApi, LearningResource, resolveResourceUrl } from '../../api/learningResources'
import { getCompetitiveSyllabus } from '../../data/competitiveSyllabus'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import {
  buildFallbackStudyPack,
  buildScopedTutorPrompt,
  chapterIdentity,
  decodeRouteParam,
  dedupeChapters,
  diagramSteps,
  diagramTitle,
  isCompetitiveLearner,
  normalizeSubjectName,
  profileSubjects,
  splitDistinctValues,
  standardVariants,
  studyPackKeys,
  studyTabIcon,
  studyTabLabel,
  subjectSymbol,
  subjectTone,
} from './competitiveExamUtils'

type Route = RouteProp<LearningStackParamList, 'CompetitiveChapter'>
type ChatMessage = { role: 'user' | 'assistant'; content: string }

interface ChapterLoadResult {
  chapters: CompetitiveChapterOption[]
  isFallback: boolean
  sourceSummary?: string
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

function resourceTypeLabel(value: string) {
  return value.replace(/_/g, ' ')
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function backendUuid(value?: string | null) {
  if (!value || !uuidPattern.test(value)) return null
  return value
}

export default function CompetitiveChapterScreen() {
  const navigation = useNavigation<any>()
  const { params } = useRoute<Route>()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [selectedStandard, setSelectedStandard] = useState<CompetitiveStandard>(
    user?.b2c_standard?.toLowerCase().includes('12') ? '12th' : '11th',
  )
  const [activeStudyTab, setActiveStudyTab] = useState<StudyPackKey>('formula_sheet')
  const [resourceType, setResourceType] = useState('all')
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | undefined>(undefined)

  const availableSubjects = useMemo(() => profileSubjects(user?.b2c_subjects), [user?.b2c_subjects])
  const decodedSubjectName = decodeRouteParam(params.subjectName)
  const decodedChapterKey = decodeRouteParam(params.chapterKey)
  const activeSubjectName = availableSubjects.find((subject) => normalizeSubjectName(subject) === normalizeSubjectName(decodedSubjectName)) ?? ''
  const trackLabel = user?.b2c_board || 'JEE Mains / JEE Advanced / MH-CET'
  const tone = subjectTone(activeSubjectName)
  const allowed = isCompetitiveLearner(user)

  const optionsQuery = useQuery({
    queryKey: ['competitive-options'],
    queryFn: competitiveExamApi.getOptions,
    enabled: allowed,
  })

  const activeSubject = useMemo(
    () =>
      (optionsQuery.data?.subjects ?? []).find(
        (subject) => normalizeSubjectName(subject.name) === normalizeSubjectName(activeSubjectName),
      ) ?? null,
    [activeSubjectName, optionsQuery.data?.subjects],
  )

  const boardCandidates = useMemo(() => {
    const fromOptions = (optionsQuery.data?.courses ?? []).map((item) => item.trim()).filter(Boolean)
    if (fromOptions.length > 0) return fromOptions
    return splitDistinctValues(user?.b2c_board)
  }, [optionsQuery.data?.courses, user?.b2c_board])

  const syllabusFallback = useMemo(
    () => getCompetitiveSyllabus(user?.b2c_board, activeSubjectName, selectedStandard),
    [activeSubjectName, selectedStandard, user?.b2c_board],
  )

  const fallbackChapters = useMemo<CompetitiveChapterOption[]>(
    () =>
      syllabusFallback.chapters.map((title, index) => ({
        id: `syllabus-${syllabusFallback.trackKey}-${selectedStandard}-${index + 1}`,
        title,
        index: index + 1,
      })),
    [selectedStandard, syllabusFallback.chapters, syllabusFallback.trackKey],
  )

  const chaptersQuery = useQuery<ChapterLoadResult>({
    queryKey: ['competitive-chapters', activeSubject?.id, boardCandidates.join(','), selectedStandard, activeSubjectName],
    enabled: Boolean(allowed && activeSubjectName),
    queryFn: async () => {
      if (!activeSubject) {
        return { chapters: fallbackChapters, isFallback: true, sourceSummary: syllabusFallback.sourceSummary }
      }

      const standards = standardVariants(selectedStandard)
      const boards = boardCandidates.length > 0 ? boardCandidates : [undefined]
      const requests = standards.flatMap((standard) =>
        boards.map((board) =>
          competitiveExamApi.getChapters({
            subject_id: activeSubject.id,
            board,
            standard,
            indexed_only: true,
          }),
        ),
      )

      let merged = dedupeChapters((await Promise.all(requests)).flat())
      if (merged.length === 0) {
        merged = dedupeChapters(
          (
            await Promise.all(
              standards.map((standard) =>
                competitiveExamApi.getChapters({
                  subject_id: activeSubject.id,
                  standard,
                  indexed_only: true,
                }),
              ),
            )
          ).flat(),
        )
      }

      if (merged.length > 0) return { chapters: merged, isFallback: false }
      return { chapters: fallbackChapters, isFallback: true, sourceSummary: syllabusFallback.sourceSummary }
    },
  })

  const chapters = chaptersQuery.data?.chapters ?? []
  const activeChapter = useMemo(() => {
    if (!chapters.length) return null
    return chapters.find((chapter, index) => chapterIdentity(chapter, index) === decodedChapterKey) ?? chapters[0]
  }, [chapters, decodedChapterKey])
  const activeChapterIndex = useMemo(() => {
    if (!activeChapter) return -1
    const keyedIndex = chapters.findIndex((chapter, index) => chapterIdentity(chapter, index) === decodedChapterKey)
    if (keyedIndex >= 0) return keyedIndex
    return chapters.findIndex((chapter) => chapter === activeChapter)
  }, [activeChapter, chapters, decodedChapterKey])
  const activeChapterKey = activeChapter ? chapterIdentity(activeChapter, Math.max(activeChapterIndex, 0)) : ''
  const backendSubjectId = backendUuid(activeSubject?.id)
  const backendChapterId = backendUuid(activeChapter?.id)

  const fallbackPack = useMemo(
    () =>
      buildFallbackStudyPack({
        subject: activeSubjectName || 'Subject',
        chapter: activeChapter?.title || 'Chapter',
        standard: selectedStandard,
      }),
    [activeChapter?.title, activeSubjectName, selectedStandard],
  )

  const workspaceQuery = useQuery<CompetitiveWorkspacePayload>({
    queryKey: ['competitive-workspace', activeSubjectName, activeChapterKey, selectedStandard],
    enabled: Boolean(allowed && activeSubjectName && activeChapter),
    queryFn: () =>
      competitiveExamApi.getWorkspace({
        subject_name: activeSubjectName,
        chapter_key: activeChapterKey,
        chapter_title: activeChapter!.title,
        standard: selectedStandard,
        track_label: trackLabel,
        subject_id: backendSubjectId,
        chapter_id: backendChapterId,
      }),
  })

  const refreshPackMutation = useMutation({
    mutationFn: () =>
      competitiveExamApi.getWorkspace({
        subject_name: activeSubjectName,
        chapter_key: activeChapterKey,
        chapter_title: activeChapter!.title,
        standard: selectedStandard,
        track_label: trackLabel,
        subject_id: backendSubjectId,
        chapter_id: backendChapterId,
        force_refresh: true,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['competitive-workspace', activeSubjectName, activeChapterKey, selectedStandard], data)
    },
  })

  const resourcesQuery = useQuery({
    queryKey: ['learning-resources', activeSubject?.id, activeChapter?.title, selectedStandard],
    queryFn: () =>
      learningResourcesApi.list({
        subject_id: activeSubject?.id || undefined,
        chapter_name: activeChapter?.title || undefined,
        target_exam: user?.b2c_target_exam || undefined,
        standard: selectedStandard,
      }),
    enabled: Boolean(allowed && activeSubjectName && activeChapter),
  })

  const startPracticeMutation = useMutation({
    mutationFn: () => {
      if (!activeSubject || !activeChapter || !backendSubjectId || !backendChapterId) {
        throw new Error('This chapter is not linked to an indexed textbook bank yet.')
      }
      return competitiveExamApi.startMcqPractice({
        subject_id: backendSubjectId,
        chapter_id: backendChapterId,
        chapter_title: activeChapter.title,
        course: user?.b2c_board || trackLabel,
        standard: selectedStandard,
      })
    },
    onSuccess: (result) => {
      const paperId = result.id || result.paper_id
      if (paperId) navigation.getParent()?.navigate('Papers', { screen: 'Quiz', params: { paperId } })
    },
  })

  const chatMutation = useMutation({
    mutationFn: async (question: string) => {
      if (!activeChapter) throw new Error('No chapter selected')
      return aiApi.chat({
        message: buildScopedTutorPrompt({
          track: trackLabel,
          subject: activeSubjectName,
          standard: selectedStandard,
          chapter: activeChapter.title,
          question,
        }),
        conversation_id: conversationId,
      })
    },
    onSuccess: (response) => {
      setConversationId(response.conversation_id)
      setChatMessages((current) => [...current, { role: 'assistant', content: response.response }])
    },
    onError: () => {
      setChatMessages((current) => [...current, { role: 'assistant', content: 'I could not reach the tutor service. Try again in a moment.' }])
    },
  })

  const sendChat = (text?: string) => {
    const next = (text ?? chatInput).trim()
    if (!next || chatMutation.isPending) return
    setChatInput('')
    setChatMessages((current) => [...current, { role: 'user', content: next }])
    chatMutation.mutate(next)
  }

  if (!allowed) {
    return (
      <AppScreen contentStyle={styles.center}>
        <Ionicons name="lock-closed-outline" size={34} color={colors.accentStrong} />
        <Text style={styles.centerTitle}>Competitive Exam is for JEE learners</Text>
        <TouchableOpacity activeOpacity={0.86} onPress={() => navigation.navigate('LearningHome')} style={styles.centerButton}>
          <Text style={styles.centerButtonText}>Back to Learning</Text>
        </TouchableOpacity>
      </AppScreen>
    )
  }

  if (!activeSubjectName) {
    return (
      <AppScreen contentStyle={styles.center}>
        <Ionicons name="alert-circle-outline" size={34} color={colors.warning} />
        <Text style={styles.centerTitle}>Chapter unavailable</Text>
        <TouchableOpacity activeOpacity={0.86} onPress={() => navigation.navigate('CompetitiveExam')} style={styles.centerButton}>
          <Text style={styles.centerButtonText}>Back to Competitive Exam</Text>
        </TouchableOpacity>
      </AppScreen>
    )
  }

  const activePack = workspaceQuery.data ?? fallbackPack
  const activeTabItems = activePack[activeStudyTab]
  const steps = diagramSteps(activePack.text_diagram)
  const resources = resourcesQuery.data?.items ?? []
  const resourceTypes = Array.from(new Set(resources.map((item) => item.resource_type))).sort()
  const filteredResources = resourceType === 'all' ? resources : resources.filter((resource) => resource.resource_type === resourceType)
  const isFallbackChapter = Boolean(!backendSubjectId || !backendChapterId)

  return (
    <AppScreen contentStyle={styles.screen}>
      <View style={styles.topRow}>
        <TouchableOpacity
          activeOpacity={0.82}
          onPress={() => navigation.navigate('CompetitiveSubject', { subjectName: activeSubjectName })}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={17} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.topCopy}>
          <Text style={styles.topKicker}>Chapter workspace</Text>
          <Text style={styles.topTitle} numberOfLines={1}>{activeChapter?.title || 'Loading chapter'}</Text>
        </View>
      </View>

      <LinearGradient colors={[colors.slate[950], colors.slate[900], `${tone}55`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroHead}>
          <View style={[styles.subjectMark, { backgroundColor: tone }]}>
            <Text style={styles.subjectMarkText}>{subjectSymbol(activeSubjectName)}</Text>
          </View>
          <View style={styles.trackPill}>
            <Text style={styles.trackPillText}>{selectedStandard} / {trackLabel}</Text>
          </View>
        </View>
        <Text style={styles.heroKicker}>{activeSubjectName}</Text>
        <Text style={styles.heroTitle}>{activeChapter?.title || 'Study workspace'}</Text>
        <Text style={styles.heroBody}>Formula sheet, exam hacks, real-life intuition, revision notes, tutor chat, and an MCQ drill from one chapter context.</Text>
      </LinearGradient>

      <View style={styles.standardRow}>
        <SelectableChip label="11th" selected={selectedStandard === '11th'} onPress={() => setSelectedStandard('11th')} />
        <SelectableChip label="12th" selected={selectedStandard === '12th'} onPress={() => setSelectedStandard('12th')} />
      </View>

      {chaptersQuery.isLoading ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.inlineLoadingText}>Loading chapter list</Text>
        </View>
      ) : null}

      {chapters.length > 1 ? (
        <View style={styles.chapterRail}>
          {chapters.slice(0, 12).map((chapter, index) => {
            const key = chapterIdentity(chapter, index)
            const active = key === activeChapterKey
            return (
              <Pressable
                key={key}
                onPress={() => navigation.navigate('CompetitiveChapter', { subjectName: activeSubjectName, chapterKey: key })}
                style={({ pressed }) => [styles.railChip, active && styles.railChipActive, pressed && styles.pressed]}
              >
                <Text style={[styles.railChipText, active && styles.railChipTextActive]} numberOfLines={1}>
                  {chapter.index ?? index + 1}. {chapter.title}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}

      <AnimatedCard style={styles.actionCard}>
        <View style={styles.actionCopy}>
          <Text style={styles.sectionKicker}>Study workspace</Text>
          <Text style={styles.sectionTitle}>{workspaceQuery.isLoading ? 'Building study pack' : 'Ready for revision'}</Text>
          <Text style={styles.actionBody}>
            {workspaceQuery.isError
              ? 'AI pack could not load, so fallback chapter guidance is shown.'
              : activePack.summary}
          </Text>
          {isFallbackChapter ? <Text style={styles.warningText}>MCQ drill needs an indexed chapter. Study pack and tutor still work.</Text> : null}
          {startPracticeMutation.isError ? <Text style={styles.errorText}>Could not start this MCQ practice right now.</Text> : null}
        </View>
        <View style={styles.actionButtons}>
          <AnimatedButton
            label={startPracticeMutation.isPending ? 'Starting...' : 'Start MCQ drill'}
            loading={startPracticeMutation.isPending}
            disabled={!activeChapter || isFallbackChapter}
            onPress={() => startPracticeMutation.mutate()}
          />
          <AnimatedButton
            label={refreshPackMutation.isPending ? 'Refreshing...' : 'Refresh pack'}
            variant="secondary"
            loading={refreshPackMutation.isPending}
            disabled={!activeChapter}
            onPress={() => refreshPackMutation.mutate()}
          />
        </View>
      </AnimatedCard>

      <View style={styles.tabRow}>
        {studyPackKeys.map((key) => (
          <Pressable
            key={key}
            onPress={() => setActiveStudyTab(key)}
            style={({ pressed }) => [styles.studyTab, activeStudyTab === key && styles.studyTabActive, pressed && styles.pressed]}
          >
            <Ionicons name={studyTabIcon(key)} size={15} color={activeStudyTab === key ? colors.white : colors.textSecondary} />
            <Text style={[styles.studyTabText, activeStudyTab === key && styles.studyTabTextActive]}>{studyTabLabel(key)}</Text>
          </Pressable>
        ))}
      </View>

      {steps.length > 1 ? (
        <AnimatedCard style={styles.diagramCard}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="git-branch-outline" size={16} color={colors.accentStrong} />
            <Text style={styles.smallSectionTitle}>{diagramTitle(activePack.diagram_kind)}</Text>
          </View>
          <View style={styles.diagramSteps}>
            {steps.slice(0, 6).map((step, index) => (
              <View key={`${index + 1}-${step}`} style={styles.diagramStep}>
                <View style={styles.diagramIndex}>
                  <Text style={styles.diagramIndexText}>{index + 1}</Text>
                </View>
                <Text style={styles.diagramText}>{step}</Text>
              </View>
            ))}
          </View>
        </AnimatedCard>
      ) : null}

      {activePack.memory_tips.length > 0 ? (
        <AnimatedCard style={styles.memoryCard}>
          <Text style={styles.smallSectionTitle}>Memory tips</Text>
          {activePack.memory_tips.slice(0, 4).map((tip, index) => (
            <View key={`${index + 1}-${tip}`} style={styles.tipRow}>
              <Ionicons name="flash-outline" size={14} color={colors.warning} />
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </AnimatedCard>
      ) : null}

      <View style={styles.packList}>
        {activeTabItems.map((item, index) => (
          <AnimatedCard key={`${activeStudyTab}-${index}`} style={styles.packItem}>
            <Text style={styles.packTitle}>{item.title}</Text>
            <Text style={styles.packDetail}>{item.detail}</Text>
          </AnimatedCard>
        ))}
      </View>

      <AnimatedCard style={styles.tutorCard}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="sparkles" size={16} color={colors.info} />
          <Text style={styles.smallSectionTitle}>Chapter tutor</Text>
        </View>
        <View style={styles.quickPrompts}>
          {[
            'Give me a 5-minute revision of this chapter.',
            'List the top 5 traps from this chapter.',
            'Show must-know formulas and when to use them.',
          ].map((prompt) => (
            <Pressable key={prompt} onPress={() => sendChat(prompt)} style={({ pressed }) => [styles.promptChip, pressed && styles.pressed]}>
              <Text style={styles.promptText}>{prompt}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.chatList}>
          {chatMessages.length === 0 ? <Text style={styles.chatEmpty}>Ask a question and the tutor will stay scoped to this chapter.</Text> : null}
          {chatMessages.map((message, index) => (
            <View key={`${message.role}-${index}`} style={[styles.chatBubble, message.role === 'user' && styles.chatBubbleUser]}>
              <Text style={[styles.chatText, message.role === 'user' && styles.chatTextUser]}>{message.content}</Text>
            </View>
          ))}
          {chatMutation.isPending ? (
            <View style={styles.inlineLoading}>
              <ActivityIndicator color={colors.info} />
              <Text style={styles.inlineLoadingText}>Tutor is thinking</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.chatInputWrap}>
          <TextInput
            value={chatInput}
            onChangeText={setChatInput}
            placeholder={`Ask about ${activeChapter?.title || 'this chapter'}...`}
            placeholderTextColor={colors.textSoft}
            multiline
            style={styles.chatInput}
          />
          <TouchableOpacity activeOpacity={0.85} onPress={() => sendChat()} disabled={!chatInput.trim() || chatMutation.isPending} style={styles.sendButton}>
            <Ionicons name="send" size={16} color={colors.white} />
          </TouchableOpacity>
        </View>
      </AnimatedCard>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionKicker}>Published library</Text>
          <Text style={styles.sectionTitle}>Chapter resources</Text>
        </View>
      </View>

      <View style={styles.chipRow}>
        {['all', ...resourceTypes].map((type) => (
          <SelectableChip key={type} label={resourceTypeLabel(type)} selected={resourceType === type} onPress={() => setResourceType(type)} />
        ))}
      </View>

      {resourcesQuery.isLoading ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.inlineLoadingText}>Loading resources</Text>
        </View>
      ) : null}

      {filteredResources.length === 0 && !resourcesQuery.isLoading ? (
        <AnimatedCard style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No chapter resources yet</Text>
          <Text style={styles.emptyBody}>Published PDFs for this subject or chapter will appear here.</Text>
        </AnimatedCard>
      ) : null}

      {filteredResources.map((resource) => (
        <ResourceCard key={resource.id} resource={resource} />
      ))}
    </AppScreen>
  )
}

function ResourceCard({ resource }: { resource: LearningResource }) {
  return (
    <AnimatedCard style={styles.resourceCard}>
      <View style={styles.resourceHeader}>
        <View style={styles.resourceIcon}>
          <Ionicons name="document-text-outline" size={19} color={colors.accentStrong} />
        </View>
        <View style={styles.resourceTypePill}>
          <Text style={styles.resourceType}>{resourceTypeLabel(resource.resource_type)}</Text>
        </View>
      </View>
      <Text style={styles.resourceTitle}>{resource.title}</Text>
      <Text style={styles.resourceMeta}>
        {[resource.provider_label, resource.subject_name, resource.page_count ? `${resource.page_count} pages` : null].filter(Boolean).join(' / ')}
      </Text>
      {resource.description ? <Text style={styles.resourceDescription} numberOfLines={3}>{resource.description}</Text> : null}
      <View style={styles.resourceActions}>
        <AnimatedButton label="View" variant="secondary" disabled={!resource.view_url} onPress={() => void openResourceUrl(resource.view_url)} style={styles.resourceAction} />
        <AnimatedButton label="Download" variant="ghost" disabled={!resource.download_url} onPress={() => void openResourceUrl(resource.download_url)} style={styles.resourceAction} />
      </View>
    </AnimatedCard>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[20],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing[20],
  },
  centerTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
  },
  centerButton: {
    minHeight: 44,
    borderRadius: radius.full,
    backgroundColor: colors.nav,
    paddingHorizontal: spacing[5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerButtonText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.xs,
  },
  topCopy: {
    flex: 1,
    minWidth: 0,
  },
  topKicker: {
    ...typography.roles.eyebrow,
    color: colors.accentStrong,
  },
  topTitle: {
    color: colors.text,
    fontFamily: typography.fonts.heading,
    fontSize: 21,
    lineHeight: 26,
  },
  hero: {
    borderRadius: radius['2xl'],
    padding: spacing[5],
    gap: spacing[3],
    overflow: 'hidden',
    ...shadows.lg,
  },
  heroHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  subjectMark: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectMarkText: {
    color: colors.white,
    fontFamily: typography.fonts.heading,
    fontSize: 21,
  },
  trackPill: {
    flexShrink: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  trackPillText: {
    color: colors.textOnDark,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  heroKicker: {
    ...typography.roles.eyebrow,
    color: colors.accentLight,
  },
  heroTitle: {
    color: colors.white,
    fontFamily: typography.fonts.heading,
    fontSize: 27,
    lineHeight: 33,
  },
  heroBody: {
    color: 'rgba(255,255,255,0.74)',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 20,
  },
  standardRow: {
    flexDirection: 'row',
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
  chapterRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  railChip: {
    maxWidth: '100%',
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  railChipActive: {
    backgroundColor: colors.nav,
    borderColor: colors.nav,
  },
  railChipText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  railChipTextActive: {
    color: colors.white,
  },
  actionCard: {
    gap: spacing[4],
  },
  actionCopy: {
    gap: spacing[2],
  },
  sectionKicker: {
    ...typography.roles.eyebrow,
    color: colors.accentStrong,
  },
  sectionTitle: {
    ...typography.roles.title,
    color: colors.text,
  },
  actionBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 20,
  },
  warningText: {
    color: colors.warning,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  errorText: {
    color: colors.danger,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  actionButtons: {
    gap: spacing[2],
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  studyTab: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  studyTabActive: {
    backgroundColor: colors.nav,
    borderColor: colors.nav,
  },
  studyTabText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  studyTabTextActive: {
    color: colors.white,
  },
  diagramCard: {
    gap: spacing[3],
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  smallSectionTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
  },
  diagramSteps: {
    gap: spacing[2],
  },
  diagramStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    borderRadius: radius.lg,
    padding: spacing[3],
    backgroundColor: colors.backgroundMuted,
  },
  diagramIndex: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  diagramIndexText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  diagramText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  memoryCard: {
    gap: spacing[3],
    backgroundColor: colors.warningSurface,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
  },
  tipText: {
    flex: 1,
    color: colors.warningText,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  packList: {
    gap: spacing[3],
  },
  packItem: {
    gap: spacing[2],
  },
  packTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
    lineHeight: 21,
  },
  packDetail: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 20,
  },
  tutorCard: {
    gap: spacing[3],
  },
  quickPrompts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  promptChip: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: colors.backgroundElevated,
  },
  promptText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  chatList: {
    gap: spacing[2],
    borderRadius: radius.lg,
    padding: spacing[3],
    backgroundColor: colors.backgroundMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  chatEmpty: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  chatBubble: {
    alignSelf: 'flex-start',
    maxWidth: '94%',
    borderRadius: radius.lg,
    padding: spacing[3],
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.nav,
    borderColor: colors.nav,
  },
  chatText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 20,
  },
  chatTextUser: {
    color: colors.white,
  },
  chatInputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing[2],
    borderRadius: radius.lg,
    padding: spacing[2],
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chatInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 118,
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.nav,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[3],
    alignItems: 'flex-start',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  resourceCard: {
    gap: spacing[3],
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
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
    lineHeight: 23,
  },
  resourceMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
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
  emptyCard: {
    gap: spacing[2],
  },
  emptyTitle: {
    ...typography.roles.title,
    color: colors.text,
  },
  emptyBody: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
})
