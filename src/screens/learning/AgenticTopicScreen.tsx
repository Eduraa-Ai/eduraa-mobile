import React from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRoute } from '@react-navigation/native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatedButton, AnimatedCard, AppScreen, ErrorState, GradientHeroCard } from '../../components/ui'
import { agenticLearningApi } from '../../api/agenticLearning'
import { colors, radius, spacing, typography } from '../../theme'

type RouteParams = {
  topicId: string
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null

  return (
    <AnimatedCard style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {items.map((item, index) => (
        <View key={`${title}-${index}`} style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </AnimatedCard>
  )
}

export default function AgenticTopicScreen() {
  const route = useRoute()
  const { topicId } = route.params as RouteParams
  const queryClient = useQueryClient()

  const topicQuery = useQuery({
    queryKey: ['agentic-topic', topicId],
    queryFn: () => agenticLearningApi.getTopic(topicId),
  })

  const resolveMutation = useMutation({
    mutationFn: async () => {
      const topic = topicQuery.data
      if (!topic) return null
      return agenticLearningApi.setTopicResolved(topic.topic_id, topic.subject_id, topic.status !== 'resolved')
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['agentic-topic', topicId] })
      await queryClient.invalidateQueries({ queryKey: ['agentic-subjects'] })
      await queryClient.invalidateQueries({ queryKey: ['agentic-subtopics'] })
    },
    onError: () => {
      Alert.alert('Update failed', 'Unable to update this topic right now.')
    },
  })

  if (topicQuery.isLoading) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading lesson</Text>
      </AppScreen>
    )
  }

  if (topicQuery.isError || !topicQuery.data) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ErrorState
          title="Lesson unavailable"
          message="This Agentic Learning topic could not be loaded."
          onAction={() => void topicQuery.refetch()}
        />
      </AppScreen>
    )
  }

  const topic = topicQuery.data
  const isResolved = topic.status === 'resolved'

  return (
    <AppScreen contentStyle={styles.screen}>
      <GradientHeroCard
        eyebrow={topic.curriculum_label}
        title={topic.topic_name}
        subtitle={[topic.subject_name, topic.chapter_title, topic.weightage_label].filter(Boolean).join(' / ')}
      />

      <AnimatedCard style={styles.metricsCard}>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{Math.round(topic.mastery_score)}%</Text>
          <Text style={styles.metricLabel}>Mastery</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{Math.round(topic.confidence)}%</Text>
          <Text style={styles.metricLabel}>Confidence</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{topic.attempt_count}</Text>
          <Text style={styles.metricLabel}>Attempts</Text>
        </View>
      </AnimatedCard>

      <AnimatedCard style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="book" size={18} color={colors.accent} />
          <Text style={styles.cardTitle}>Concept explanation</Text>
        </View>
        <Text style={styles.bodyText}>{topic.concept_explanation}</Text>
        {topic.text_diagram ? <Text style={styles.diagramText}>{topic.text_diagram}</Text> : null}
      </AnimatedCard>

      <BulletList title="Easy ways to learn" items={topic.easy_ways_to_learn} />
      <BulletList title="Memory tips" items={topic.memory_tips} />
      <BulletList title="Recap points" items={topic.recap_points} />
      <BulletList title="Practice prompts" items={topic.practice_questions} />

      {topic.coach_note ? (
        <AnimatedCard style={styles.coachCard}>
          <Text style={styles.coachKicker}>Coach note</Text>
          <Text style={styles.bodyText}>{topic.coach_note}</Text>
        </AnimatedCard>
      ) : null}

      <AnimatedButton
        label={resolveMutation.isPending ? 'Updating...' : isResolved ? 'Mark active again' : 'Mark resolved'}
        variant={isResolved ? 'secondary' : 'primary'}
        loading={resolveMutation.isPending}
        onPress={() => resolveMutation.mutate()}
      />
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[20],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  metricsCard: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  metric: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
  },
  metricValue: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 20,
  },
  metricLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    marginTop: spacing[1],
    textTransform: 'uppercase',
  },
  card: {
    gap: spacing[3],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  cardTitle: {
    ...typography.roles.title,
    color: colors.text,
  },
  bodyText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  diagramText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
    lineHeight: 20,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
  },
  bulletRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    marginTop: 7,
    backgroundColor: colors.accent,
  },
  bulletText: {
    flex: 1,
    ...typography.roles.body,
    color: colors.textMuted,
  },
  coachCard: {
    gap: spacing[2],
    backgroundColor: colors.accentSurface,
  },
  coachKicker: {
    ...typography.roles.eyebrow,
    color: colors.accent,
  },
})
