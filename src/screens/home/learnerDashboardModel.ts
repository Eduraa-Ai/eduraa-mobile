import type {
  DashboardAiUsageRow,
  DashboardExamScore,
  DashboardQuestionTypePerf,
  DashboardSubmission,
  DashboardTopicMastery,
  StudentDashboardLab,
  SubjectQuestionTypeRow,
} from '../../types'

export type LearnerDashboardFilters = {
  semester: string
  subject: string
  category: string
  status: string
  difficulty: string
  dateFrom: string
  dateTo: string
}

export const defaultLearnerDashboardFilters: LearnerDashboardFilters = {
  semester: 'all',
  subject: 'all',
  category: 'all',
  status: 'all',
  difficulty: 'all',
  dateFrom: '',
  dateTo: '',
}

const dateKey = (value?: string | null) => {
  if (!value) return ''
  // API timestamps carry an ISO calendar date. Preserve that source date instead
  // of converting it through the device timezone (which can move a late-night
  // attempt into the previous/next filter day).
  const isoDate = String(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (isoDate) return isoDate
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

const matchesDateRange = (value: string, filters: LearnerDashboardFilters) => {
  const key = dateKey(value)
  if (!key) return !filters.dateFrom && !filters.dateTo
  return (!filters.dateFrom || key >= filters.dateFrom) && (!filters.dateTo || key <= filters.dateTo)
}

export const hasValidLearnerDashboardDateRange = (filters: LearnerDashboardFilters) =>
  !filters.dateFrom || !filters.dateTo || filters.dateFrom <= filters.dateTo

export type LearnerDashboardData = {
  submissions: DashboardSubmission[]
  examScores: DashboardExamScore[]
  topics: DashboardTopicMastery[]
  questionTypes: Array<DashboardQuestionTypePerf | SubjectQuestionTypeRow>
}

export type DashboardSubmissionGroup = {
  key: string
  paper: string
  subject?: string | null
  attempts: DashboardSubmission[]
  latestDate: string
}

export type DashboardStudyStep = {
  id: string
  eyebrow: string
  title: string
  detail: string
  subject?: string | null
  chapter?: string | null
  topic?: string | null
  difficulty?: string | null
}

export const masteryFocusLabel = (
  item: Partial<Pick<DashboardTopicMastery, 'topic' | 'subtopic'>>,
) => item.subtopic?.trim() || item.topic?.trim() || 'Focused practice'

export const dashboardEvidenceIsStale = (
  topics: DashboardTopicMastery[],
  now = new Date(),
) => {
  const assessedTimes = topics
    .map((item) => new Date(item.last_assessed_at ?? '').getTime())
    .filter(Number.isFinite)
  if (!assessedTimes.length) return false
  const newestEvidence = Math.max(...assessedTimes)
  return now.getTime() - newestEvidence > 90 * 24 * 60 * 60 * 1000
}

export const filterLearnerDashboard = (
  data: StudentDashboardLab,
  filters: LearnerDashboardFilters,
): LearnerDashboardData => {
  const submissions = data.submissions.filter((item) =>
    (filters.semester === 'all' || String(item.sem ?? '') === filters.semester)
    && (filters.subject === 'all' || item.subject === filters.subject)
    && (filters.category === 'all' || item.cat === filters.category)
    && (filters.status === 'all' || item.status === filters.status)
    && (filters.difficulty === 'all' || item.difficulty === filters.difficulty)
    && matchesDateRange(item.date, filters),
  )
  const examScores = data.exam_scores.filter((item) =>
    (filters.semester === 'all' || String(item.sem ?? '') === filters.semester)
    && (filters.category === 'all' || item.cat === filters.category)
    && matchesDateRange(item.date, filters),
  )
  const topics = data.topic_mastery.filter((item) =>
    (filters.subject === 'all' || item.subject === filters.subject)
    && (filters.difficulty === 'all' || item.difficulty === filters.difficulty),
  )
  const questionTypes = filters.subject === 'all'
    ? data.question_type_performance
    : (data.subject_question_types[filters.subject] ?? [])

  return { submissions, examScores, topics, questionTypes }
}

export const dashboardFilterOptions = (data: StudentDashboardLab) => ({
  semesters: data.semesters.map((item) => ({ value: String(item.index), label: item.name })),
  subjects: data.subjects.map((item) => ({ value: item.name, label: item.name })),
  categories: Array.from(new Set([
    ...data.submissions.map((item) => item.cat),
    ...data.exam_scores.map((item) => item.cat),
  ].filter((item): item is string => Boolean(item)))).sort(),
  statuses: Array.from(new Set(data.submissions.map((item) => item.status).filter(Boolean))).sort(),
  difficulties: Array.from(new Set(data.submissions.map((item) => item.difficulty).filter((item): item is string => Boolean(item)))).sort(),
})

const submissionIdentity = (item: DashboardSubmission) => item.id
  ? `${item.kind}:${item.id}`
  : [item.kind, item.paper, item.subject, item.date, item.score, item.max_score].join(':')

export const groupDashboardSubmissions = (
  submissions: DashboardSubmission[],
): DashboardSubmissionGroup[] => {
  const unique = new Map<string, DashboardSubmission>()
  submissions.forEach((item) => unique.set(submissionIdentity(item), item))

  const groups = new Map<string, DashboardSubmissionGroup>()
  unique.forEach((item) => {
    const paperIdentity = item.exam_id
      ? `exam:${item.exam_id}`
      : item.paper_id
        ? `paper:${item.paper_id}`
        : `legacy:${item.paper.trim().toLocaleLowerCase()}`
    const key = `${paperIdentity}::${(item.subject ?? '').trim().toLocaleLowerCase()}`
    const existing = groups.get(key)
    if (existing) {
      existing.attempts.push(item)
      if (new Date(item.date).getTime() > new Date(existing.latestDate).getTime()) {
        existing.latestDate = item.date
        existing.paper = item.paper
        existing.subject = item.subject
      }
      return
    }
    groups.set(key, {
      key,
      paper: item.paper,
      subject: item.subject,
      attempts: [item],
      latestDate: item.date,
    })
  })

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      attempts: [...group.attempts].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    }))
    .sort(
      (a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime(),
    )
}

export const buildDashboardStudyPlan = (
  data: LearnerDashboardData,
): DashboardStudyStep[] => {
  const weakTopics = [...data.topics]
    .filter((item) => Number.isFinite(item.mastery))
    .sort((a, b) => a.mastery - b.mastery)

  const topicSteps: DashboardStudyStep[] = weakTopics.slice(0, 2).map((topic, index) => ({
    id: `topic:${topic.topic_id ?? topic.topic}:${topic.subtopic_id ?? topic.subtopic ?? 'all'}`,
    eyebrow: index === 0 ? 'START HERE' : 'NEXT FOCUS',
    title: `Practice ${masteryFocusLabel(topic)}`,
    detail: `${Math.round(topic.mastery)}% mastery${topic.subtopic ? ` · ${topic.topic}` : topic.chapter ? ` · ${topic.chapter}` : ''}${topic.evidence_count ? ` · ${topic.evidence_count} answers` : ''}`,
    subject: topic.subject,
    chapter: topic.chapter,
    topic: masteryFocusLabel(topic),
    difficulty: topic.difficulty,
  }))

  const weakType = [...data.questionTypes]
    .filter((item) => Number.isFinite(item.accuracy))
    .sort((a, b) => a.accuracy - b.accuracy)[0]

  if (weakType) {
    topicSteps.push({
      id: `type:${weakType.type}`,
      eyebrow: 'RECAP',
      title: `Review ${weakType.type}`,
      detail: `${Math.round(weakType.accuracy)}% accuracy · check common mistakes`,
    })
  }

  return topicSteps
}

export const aiUsagePeak = (rows: DashboardAiUsageRow[]) => Math.max(
  1,
  ...rows.map((row) => Math.max(row.messages, row.conversations)),
)
