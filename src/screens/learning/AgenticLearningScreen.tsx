import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { AnimatedCard, AppScreen, ErrorState, GradientHeroCard, SelectableChip } from '../../components/ui'
import { agenticLearningApi, AgenticLearningSubjectBucket, AgenticLearningSubtopicCard } from '../../api/agenticLearning'
import { colors, radius, shadows, spacing, typography } from '../../theme'

function masteryColor(value: number) {
  if (value >= 75) return colors.success
  if (value >= 45) return colors.warning
  return colors.danger
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ')
}

function SubjectCard({ subject, active, onPress }: { subject: AgenticLearningSubjectBucket; active: boolean; onPress: () => void }) {
  const tone = masteryColor(subject.average_mastery)

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.subjectCard, active && styles.subjectCardActive, pressed && styles.pressed]}>
      <View style={styles.subjectTop}>
        <Text style={styles.subjectName} numberOfLines={1}>{subject.subject_name}</Text>
        <Text style={[styles.masteryText, { color: tone }]}>{Math.round(subject.average_mastery)}%</Text>
      </View>
      <Text style={styles.subjectMeta}>{subject.unresolved_count} open / {subject.total_subtopics} tracked</Text>
      {subject.top_weak_topic ? <Text style={styles.subjectWeak} numberOfLines={1}>{subject.top_weak_topic}</Text> : null}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(8, Math.min(100, subject.average_mastery))}%`, backgroundColor: tone }]} />
      </View>
    </Pressable>
  )
}

function TopicCard({ topic, onPress }: { topic: AgenticLearningSubtopicCard; onPress: () => void }) {
  const tone = masteryColor(topic.mastery_score)

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.topicCard, pressed && styles.pressed]}>
      <View style={styles.topicTop}>
        <View style={styles.topicCopy}>
          <Text style={styles.topicKicker}>{topic.chapter_title || topic.branch || 'Concept'}</Text>
          <Text style={styles.topicTitle}>{topic.topic_name}</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: `${tone}14` }]}>
          <Text style={[styles.statusText, { color: tone }]}>{statusLabel(topic.status)}</Text>
        </View>
      </View>
      <Text style={styles.topicSummary}>{topic.summary}</Text>
      <View style={styles.topicFooter}>
        <Text style={styles.topicFooterText}>{Math.round(topic.mastery_score)}% mastery</Text>
        {topic.pyq_frequency != null ? <Text style={styles.topicFooterText}>{topic.pyq_frequency} PYQs</Text> : null}
        {topic.read_time_minutes ? <Text style={styles.topicFooterText}>{topic.read_time_minutes} min</Text> : null}
      </View>
    </Pressable>
  )
}

export default function AgenticLearningScreen() {
  const navigation = useNavigation<any>()
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)

  const subjectsQuery = useQuery({
    queryKey: ['agentic-subjects'],
    queryFn: agenticLearningApi.getSubjects,
  })

  const quickActionsQuery = useQuery({
    queryKey: ['agentic-quick-actions'],
    queryFn: agenticLearningApi.getQuickActions,
  })

  const subjects = subjectsQuery.data ?? []
  const selectedSubject = useMemo(
    () => subjects.find((subject) => subject.subject_id === selectedSubjectId) ?? subjects[0],
    [selectedSubjectId, subjects],
  )

  useEffect(() => {
    if (!selectedSubjectId && subjects[0]) {
      setSelectedSubjectId(subjects[0].subject_id)
    }
  }, [selectedSubjectId, subjects])

  const subtopicsQuery = useQuery({
    queryKey: ['agentic-subtopics', selectedSubject?.subject_id],
    queryFn: () => agenticLearningApi.getSubtopics(selectedSubject!.subject_id),
    enabled: Boolean(selectedSubject?.subject_id),
  })

  if (subjectsQuery.isLoading) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading Agentic Learning</Text>
      </AppScreen>
    )
  }

  if (subjectsQuery.isError) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ErrorState
          title="Agentic Learning is unavailable"
          message="This student account could not load the learning graph yet."
          onAction={() => void subjectsQuery.refetch()}
        />
      </AppScreen>
    )
  }

  const quickActions = quickActionsQuery.data ?? []
  const subtopics = subtopicsQuery.data ?? []
  const openCount = subjects.reduce((sum, subject) => sum + subject.unresolved_count, 0)

  return (
    <AppScreen contentStyle={styles.screen}>
      <GradientHeroCard
        eyebrow="AGENTIC LEARNING"
        title={openCount > 0 ? `${openCount} concepts need work` : 'Concept graph is stable'}
        subtitle="Study the exact topic cards created from attempts, checked work, and repeated mistake patterns."
      />

      {quickActions.length > 0 ? (
        <AnimatedCard style={styles.actionCard}>
          <Text style={styles.sectionKicker}>Quick actions</Text>
          {quickActions.slice(0, 3).map((action) => (
            <Pressable
              key={action.id}
              onPress={() => {
                if (action.target_topic_id) navigation.navigate('AgenticTopic', { topicId: action.target_topic_id })
                else if (action.target_subject_id) setSelectedSubjectId(action.target_subject_id)
              }}
              style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="flash" size={15} color={colors.accent} />
              </View>
              <View style={styles.actionCopy}>
                <Text style={styles.actionTitle}>{action.label}</Text>
                {action.description ? <Text style={styles.actionBody}>{action.description}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.textSoft} />
            </Pressable>
          ))}
        </AnimatedCard>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Subjects</Text>
        <Text style={styles.sectionSubtitle}>Pick the bucket to inspect.</Text>
      </View>

      <View style={styles.subjectList}>
        {subjects.map((subject) => (
          <SubjectCard
            key={subject.subject_id}
            subject={subject}
            active={subject.subject_id === selectedSubject?.subject_id}
            onPress={() => setSelectedSubjectId(subject.subject_id)}
          />
        ))}
      </View>

      {selectedSubject ? (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{selectedSubject.subject_name}</Text>
          <Text style={styles.sectionSubtitle}>{selectedSubject.total_subtopics} tracked subtopics.</Text>
        </View>
      ) : null}

      {subtopicsQuery.isLoading ? <ActivityIndicator color={colors.accent} /> : null}

      {!subtopicsQuery.isLoading && subtopics.length === 0 ? (
        <AnimatedCard style={styles.emptyCard}>
          <SelectableChip label="No weak subtopics yet" selected />
          <Text style={styles.emptyText}>Once this student has attempts or checked papers, Agentic Learning will surface the exact concepts to study.</Text>
        </AnimatedCard>
      ) : null}

      {subtopics.map((topic) => (
        <TopicCard key={topic.topic_id} topic={topic} onPress={() => navigation.navigate('AgenticTopic', { topicId: topic.topic_id })} />
      ))}
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
  actionCard: {
    gap: spacing[3],
  },
  sectionKicker: {
    ...typography.roles.eyebrow,
    color: colors.accent,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
  },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  actionCopy: {
    flex: 1,
  },
  actionTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  actionBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  sectionHeader: {
    gap: spacing[1],
  },
  sectionTitle: {
    ...typography.roles.title,
    color: colors.text,
  },
  sectionSubtitle: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  subjectList: {
    gap: spacing[3],
  },
  subjectCard: {
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[4],
    gap: spacing[2],
    ...shadows.xs,
  },
  subjectCardActive: {
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
  },
  subjectTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  subjectName: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
  },
  masteryText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  subjectMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
  },
  subjectWeak: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  progressTrack: {
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  topicCard: {
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[4],
    gap: spacing[3],
    ...shadows.sm,
  },
  topicTop: {
    flexDirection: 'row',
    gap: spacing[3],
    alignItems: 'flex-start',
  },
  topicCopy: {
    flex: 1,
  },
  topicKicker: {
    ...typography.roles.eyebrow,
    color: colors.textSoft,
    letterSpacing: 0.6,
  },
  topicTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
    lineHeight: 22,
    marginTop: spacing[1],
  },
  topicSummary: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  statusPill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  statusText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  topicFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  topicFooterText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  emptyCard: {
    gap: spacing[3],
  },
  emptyText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.78,
  },
})
