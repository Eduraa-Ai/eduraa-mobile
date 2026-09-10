import type {
  CurriculumTopicOption,
  PaperManifestOccurrence,
} from '../../api/paperManifests'

export type CurriculumMappingDraft = {
  topicId: string
  subtopicId: string
}

export type CurriculumMappingDrafts = Record<string, CurriculumMappingDraft>

export function gradableManifestOccurrences(
  occurrences: PaperManifestOccurrence[],
) {
  const parentIds = new Set(
    occurrences
      .map((item) => item.parent_occurrence_id)
      .filter((value): value is string => Boolean(value)),
  )
  return occurrences.filter((item) => !parentIds.has(item.occurrence_id))
}

export function curriculumDraftsFromOccurrences(
  occurrences: PaperManifestOccurrence[],
): CurriculumMappingDrafts {
  return Object.fromEntries(
    gradableManifestOccurrences(occurrences).map((item) => {
      const mapping = item.question_content.curriculum_mapping
      return [
        item.occurrence_id,
        {
          topicId: mapping?.topic_id ?? '',
          subtopicId: mapping?.subtopic_id ?? '',
        },
      ]
    }),
  )
}

export function curriculumMappingFingerprint(drafts: CurriculumMappingDrafts) {
  return Object.entries(drafts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, value]) => `${id}:${value.topicId}:${value.subtopicId}`)
    .join('|')
}

export function mappedQuestionCount(drafts: CurriculumMappingDrafts) {
  return Object.values(drafts).filter((item) => item.topicId || item.subtopicId)
    .length
}

export function occurrencesWithCurriculumMappings(
  occurrences: PaperManifestOccurrence[],
  drafts: CurriculumMappingDrafts,
  subjectId: string,
  topics: CurriculumTopicOption[],
) {
  const topicsById = new Map(topics.map((topic) => [topic.id, topic]))
  return occurrences.map((item) => {
    const draft = drafts[item.occurrence_id]
    if (!draft) return item
    const subtopic = topicsById.get(draft.subtopicId)
    const isMapped = Boolean(draft.topicId || draft.subtopicId)
    return {
      ...item,
      question_content: {
        ...item.question_content,
        curriculum_mapping: isMapped
          ? {
              status: 'confirmed' as const,
              subject_id: subjectId,
              chapter_id: null,
              topic_id: draft.topicId || null,
              subtopic_id: draft.subtopicId || null,
              subtopic_name: subtopic?.name ?? null,
            }
          : {
              status: 'unmapped' as const,
              subject_id: subjectId,
              chapter_id: null,
              topic_id: null,
              subtopic_id: null,
              subtopic_name: null,
            },
      },
    }
  })
}
