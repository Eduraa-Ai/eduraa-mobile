import type {
  AgenticLearningQuickAction,
  AgenticLearningSubjectBucket,
  AgenticLearningSubtopicCard,
} from '../../api/agenticLearning'

export type AgenticTone = 'repair' | 'polish' | 'stable' | 'resolved'

export function clampPercent(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value ?? 0)))
}

export function totalOpenConcepts(subjects: AgenticLearningSubjectBucket[]) {
  return subjects.reduce((sum, subject) => sum + Math.max(0, subject.unresolved_count || 0), 0)
}

export function topicTone(topic: Pick<AgenticLearningSubtopicCard, 'status' | 'mastery_score'>): AgenticTone {
  if (topic.status.toLowerCase() === 'resolved') return 'resolved'
  const mastery = clampPercent(topic.mastery_score)
  if (mastery >= 75) return 'stable'
  if (mastery >= 45) return 'polish'
  return 'repair'
}

export function topicStatusLabel(topic: Pick<AgenticLearningSubtopicCard, 'status' | 'mastery_score'>) {
  const tone = topicTone(topic)
  if (tone === 'resolved') return 'Resolved'
  if (tone === 'stable') return 'Stable'
  if (tone === 'polish') return 'Needs polish'
  return 'Repair now'
}

export function priorityAction(actions: AgenticLearningQuickAction[]) {
  return actions.find((action) => action.available && Boolean(action.target_topic_id || action.target_subject_id)) ?? null
}

export function weakestSubject(subjects: AgenticLearningSubjectBucket[]) {
  return [...subjects]
    .filter((subject) => subject.unresolved_count > 0)
    .sort((left, right) => clampPercent(left.average_mastery) - clampPercent(right.average_mastery))[0] ?? null
}

export function nextOpenTopic(topics: AgenticLearningSubtopicCard[], currentTopicId: string) {
  return topics.find((topic) => topic.topic_id !== currentTopicId && topic.status.toLowerCase() !== 'resolved') ?? null
}

export function topicAccessibilityLabel(
  topic: AgenticLearningSubtopicCard,
  showExamMetrics = false,
) {
  const details = [
    topic.topic_name,
    topicStatusLabel(topic),
    `${clampPercent(topic.mastery_score)} percent mastery`,
    showExamMetrics && topic.pyq_frequency != null ? `${topic.pyq_frequency} previous-year questions` : null,
  ].filter(Boolean)
  return details.join(', ')
}
