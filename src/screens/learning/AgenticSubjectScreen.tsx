import React, { useEffect } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { agenticLearningApi, AgenticLearningSubtopicCard, warmTopicLessons } from '../../api/agenticLearning'
import { AppScreen, ErrorState, MathText } from '../../components/ui'
import { colors, radius, spacing, typography } from '../../theme'
import { AgenticHeader, AgenticIntro, AgenticSurface } from './AgenticLearningFrame'
import { clampPercent, topicAccessibilityLabel, topicStatusLabel, topicTone } from './agenticLearningModel'
import { useLearnerTrack } from '../../hooks/useLearnerTrack'

type RouteParams = { subjectId: string }

const toneColors = {
  repair: { text: colors.danger, surface: colors.dangerSurface },
  polish: { text: colors.warning, surface: colors.warningSurface },
  stable: { text: colors.success, surface: colors.successSurface },
  resolved: { text: colors.success, surface: colors.successSurface },
}

function TopicCard({
  topic,
  onPress,
  showExamMetrics,
}: {
  topic: AgenticLearningSubtopicCard
  onPress: () => void
  showExamMetrics: boolean
}) {
  const tone = toneColors[topicTone(topic)]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={topicAccessibilityLabel(topic, showExamMetrics)}
      accessibilityHint="Opens the concept repair lesson."
      onPress={onPress}
      style={({ pressed }) => [styles.topicCard, pressed && styles.pressed]}
    >
      <View style={styles.topicTop}>
        <View style={styles.topicCopy}>
          <Text style={styles.topicKicker}>{topic.chapter_title || topic.branch || 'Concept'}</Text>
          <Text style={styles.topicTitle}>{topic.topic_name}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: tone.surface }]}>
          <Text style={[styles.statusText, { color: tone.text }]}>{topicStatusLabel(topic)}</Text>
        </View>
      </View>
      <MathText style={styles.topicSummary} value={topic.summary} />
      <View style={styles.topicFooter}>
        <Text style={styles.topicMetric}>{clampPercent(topic.mastery_score)}% mastery</Text>
        {showExamMetrics && topic.pyq_frequency != null ? (
          <Text style={styles.topicMetric}>· {topic.pyq_frequency} PYQs</Text>
        ) : null}
        {topic.read_time_minutes ? <Text style={styles.topicMetric}>· {topic.read_time_minutes} min read</Text> : null}
      </View>
    </Pressable>
  )
}

export default function AgenticSubjectScreen() {
  const navigation = useNavigation<any>()
  // Exam metrics such as PYQ counts belong to competitive tracks only; a B2B
  // school learner must never see them (issue #63).
  const { isJee } = useLearnerTrack()
  const showExamMetrics = isJee
  const route = useRoute()
  const { subjectId } = route.params as RouteParams
  const subjectsQuery = useQuery({ queryKey: ['agentic-subjects'], queryFn: agenticLearningApi.getSubjects, retry: 1 })
  const subtopicsQuery = useQuery({
    queryKey: ['agentic-subtopics', subjectId],
    queryFn: () => agenticLearningApi.getSubtopics(subjectId),
    retry: 1,
  })

  const subject = subjectsQuery.data?.find((item) => item.subject_id === subjectId)
  const topics = subtopicsQuery.data ?? []

  // Warm the lessons a learner is most likely to open. Without this the first
  // tap waits 15-20s for the LLM to build the lesson.
  const queryClient = useQueryClient()
  const warmKey = topics.slice(0, 3).map((topic) => topic.topic_id).join(',')
  useEffect(() => {
    if (!warmKey) return
    void warmTopicLessons(queryClient, warmKey.split(','), 3)
  }, [queryClient, warmKey])
  const subjectName = subject?.subject_name || 'Subject'
  const tracked = subject?.total_subtopics ?? topics.length
  const mastery = clampPercent(subject?.average_mastery)

  return (
    <AppScreen protectedChrome contentStyle={styles.screen}>
      <AgenticHeader
        meta={`${subjectName} · ${tracked} subtopics`}
        pill={subject ? `${mastery}% ready` : 'Learning'}
        onBack={() => navigation.goBack()}
      />
      <AgenticIntro
        kicker={subjectName}
        title="Weak subtopics"
        subtitle="Ranked by exam value and how often the mistake repeats."
      />

      {subtopicsQuery.isLoading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Ranking your learning signals</Text>
          {[0, 1, 2].map((item) => <View key={item} style={styles.skeletonCard} />)}
        </View>
      ) : null}

      {subtopicsQuery.isError ? (
        <ErrorState
          title="Subtopics unavailable"
          message="The subject is still selected. Retry without losing your place."
          loading={subtopicsQuery.isFetching}
          onAction={() => void subtopicsQuery.refetch()}
        />
      ) : null}

      {!subtopicsQuery.isLoading && !subtopicsQuery.isError && topics.length === 0 ? (
        <AgenticSurface style={styles.emptySurface}>
          <Text style={styles.emptyTitle}>No weak subtopics right now.</Text>
          <Text style={styles.emptyBody}>New attempts will add evidence here when a concept starts repeating.</Text>
        </AgenticSurface>
      ) : null}

      {!subtopicsQuery.isLoading && !subtopicsQuery.isError ? (
        <View style={styles.topicList}>
          {topics.map((topic) => (
            <TopicCard
              key={topic.topic_id}
              topic={topic}
              showExamMetrics={showExamMetrics}
              onPress={() => navigation.navigate('AgenticTopic', {
                topicId: topic.topic_id,
                topicName: topic.topic_name,
                subjectName,
              })}
            />
          ))}
        </View>
      ) : null}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: { gap: spacing[3], paddingBottom: spacing[6], backgroundColor: '#FBF6EC' },
  topicList: { gap: spacing[2] },
  topicCard: {
    borderRadius: radius.lg,
    backgroundColor: '#FFFCF6',
    borderWidth: 1,
    borderColor: '#E6D7C5',
    padding: spacing[3],
    gap: spacing[1],
  },
  topicTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  topicCopy: { flex: 1, minWidth: 0, gap: 2 },
  topicKicker: { color: '#927C69', fontFamily: typography.fonts.bodyBold, fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' },
  topicTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 17, lineHeight: 21 },
  statusPill: { minHeight: 28, justifyContent: 'center', borderRadius: radius.full, paddingHorizontal: spacing[3] },
  statusText: { fontFamily: typography.fonts.bodyBold, fontSize: 9 },
  topicSummary: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 16 },
  topicFooter: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[1] },
  topicMetric: { color: colors.textSecondary, fontFamily: typography.fonts.bodyBold, fontSize: 10, lineHeight: 14 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  loadingState: { gap: spacing[3], alignItems: 'center' },
  loadingText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12 },
  skeletonCard: { alignSelf: 'stretch', height: 142, borderRadius: radius.xl, backgroundColor: colors.slate[100], borderWidth: 1, borderColor: colors.borderSubtle },
  emptySurface: { alignItems: 'center', gap: spacing[2], paddingVertical: spacing[8] },
  emptyTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 19, textAlign: 'center' },
  emptyBody: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 13, lineHeight: 20, textAlign: 'center' },
})
