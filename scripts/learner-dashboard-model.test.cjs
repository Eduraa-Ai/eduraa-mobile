const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const model = require(process.env.LEARNER_DASHBOARD_MODEL_PATH || '../src/screens/home/learnerDashboardModel')

const dashboard = {
  semesters: [{ id: 'sem-1', index: 1, name: 'Semester 1' }, { id: 'sem-2', index: 2, name: 'Semester 2' }],
  subjects: [{ name: 'Maths' }, { name: 'Physics' }],
  submissions: [
    { id: 'math-graded', paper: 'Math test', subject: 'Maths', sem: 1, cat: 'practice', status: 'graded', difficulty: 'hard', date: '2026-03-08T10:00:00Z', score: 8, max_score: 10 },
    { id: 'physics-pending', paper: 'Physics test', subject: 'Physics', sem: 2, cat: 'exam', status: 'submitted', difficulty: 'medium', date: '2026-03-12T10:00:00Z', score: null, max_score: null },
  ],
  exam_scores: [
    { exam: 'Math test', sem: 1, cat: 'practice', date: '2026-03-08', avg: 80, subject_scores: { Maths: 80 } },
    { exam: 'Physics test', sem: 2, cat: 'exam', date: '2026-03-12', avg: 70, subject_scores: { Physics: 70 } },
  ],
  topic_mastery: [
    { topic: 'Algebra', topic_id: 'topic-algebra', subtopic: 'Two-step equations', subtopic_id: 'subtopic-two-step', subject: 'Maths', difficulty: 'hard', mastery: 42, evidence_count: 4 },
    { topic: 'Motion', subject: 'Physics', difficulty: 'medium', mastery: 78 },
  ],
  question_type_performance: [{ type: 'MCQ', attempts: 8, scored: 6, total: 8, accuracy: 75 }],
  subject_question_types: { Maths: [{ type: 'MCQ', accuracy: 62, marks: 10 }] },
  ai_usage: [{ week: '2026-W10', conversations: 2, messages: 7 }],
}

test('learner dashboard filters match the web client-side data dimensions', () => {
  const filtered = model.filterLearnerDashboard(dashboard, {
    ...model.defaultLearnerDashboardFilters,
    semester: '1', subject: 'Maths', category: 'practice', status: 'graded', difficulty: 'hard', dateFrom: '2026-03-01', dateTo: '2026-03-10',
  })

  assert.deepEqual(filtered.submissions.map((item) => item.id), ['math-graded'])
  assert.deepEqual(filtered.examScores.map((item) => item.exam), ['Math test'])
  assert.deepEqual(filtered.topics.map((item) => item.topic), ['Algebra'])
  assert.equal(filtered.questionTypes[0].accuracy, 62)
})

test('learner dashboard date validation prevents an invalid query scope', () => {
  assert.equal(model.hasValidLearnerDashboardDateRange({ ...model.defaultLearnerDashboardFilters, dateFrom: '2026-03-12', dateTo: '2026-03-11' }), false)
  assert.equal(model.hasValidLearnerDashboardDateRange({ ...model.defaultLearnerDashboardFilters, dateFrom: '2026-03-11', dateTo: '2026-03-11' }), true)
  const timezoneBoundary = model.filterLearnerDashboard(dashboard, { ...model.defaultLearnerDashboardFilters, dateFrom: '2026-03-08', dateTo: '2026-03-08' })
  assert.deepEqual(timezoneBoundary.submissions.map((item) => item.id), ['math-graded'])
})

test('learner dashboard keeps global question-type data until a subject is selected', () => {
  const globalData = model.filterLearnerDashboard(dashboard, model.defaultLearnerDashboardFilters)
  const selectedSubject = model.filterLearnerDashboard(dashboard, { ...model.defaultLearnerDashboardFilters, subject: 'Physics' })

  assert.equal(globalData.questionTypes[0].type, 'MCQ')
  assert.equal(selectedSubject.questionTypes.length, 0)
})

test('learner dashboard groups retries without deleting real attempts', () => {
  const attempts = [
    { id: 'a-1', paper_id: 'paper-algebra', kind: 'digital', paper: 'Algebra check', subject: 'Maths', date: '2026-03-08T10:00:00Z' },
    { id: 'a-2', paper_id: 'paper-algebra', kind: 'digital', paper: 'Algebra check renamed', subject: 'Maths', date: '2026-03-10T10:00:00Z' },
    { id: 'a-2', paper_id: 'paper-algebra', kind: 'digital', paper: 'Algebra check renamed', subject: 'Maths', date: '2026-03-10T10:00:00Z' },
    { id: 'same-title-other-paper', paper_id: 'paper-other', kind: 'digital', paper: 'Algebra check', subject: 'Maths', date: '2026-03-09T12:00:00Z' },
    { id: 'p-1', paper_id: 'paper-physics', kind: 'checked', paper: 'Physics check', subject: 'Physics', date: '2026-03-09T10:00:00Z' },
  ]
  const groups = model.groupDashboardSubmissions(attempts)
  assert.equal(groups.length, 3)
  assert.equal(groups[0].paper, 'Algebra check renamed')
  assert.deepEqual(groups[0].attempts.map((item) => item.id), ['a-2', 'a-1'])
})

test('learner dashboard creates an evidence-led plan and real AI usage scale', () => {
  const data = model.filterLearnerDashboard(dashboard, model.defaultLearnerDashboardFilters)
  const plan = model.buildDashboardStudyPlan(data)
  assert.equal(plan[0].topic, 'Two-step equations')
  assert.equal(plan[0].title, 'Practice Two-step equations')
  assert.match(plan[0].detail, /4 answers/)
  assert.equal(plan.at(-1).title, 'Review MCQ')
  assert.equal(model.aiUsagePeak(dashboard.ai_usage), 7)
  assert.equal(model.aiUsagePeak([]), 1)
  assert.equal(model.dashboardEvidenceIsStale([
    { topic: 'Algebra', mastery: 42, last_assessed_at: '2025-01-01T00:00:00Z' },
  ], new Date('2026-03-01T00:00:00Z')), true)
  assert.equal(model.dashboardEvidenceIsStale([
    { topic: 'Algebra', mastery: 42, last_assessed_at: '2026-02-01T00:00:00Z' },
  ], new Date('2026-03-01T00:00:00Z')), false)
})

test('learner dashboard exposes the server-backed mobile contract and real destinations', () => {
  const screen = fs.readFileSync('src/screens/home/LearnerDashboardScreen.tsx', 'utf8')
  const home = fs.readFileSync('src/screens/home/HomeScreen.tsx', 'utf8')
  const api = fs.readFileSync('src/api/analytics.ts', 'utf8')
  const navigation = fs.readFileSync('src/navigation/index.tsx', 'utf8')
  const resultDetail = fs.readFileSync('src/screens/results/ResultDetailScreen.tsx', 'utf8')

  assert.match(api, /student-dashboard-insights/)
  assert.match(screen, /attendanceApi\.getStudentSummary/)
  assert.match(screen, /queryKey: \['student-dashboard-lab', user\?\.id\]/)
  assert.match(screen, /queryKey: \['student-dashboard-insights', user\?\.id\]/)
  assert.match(screen, /const isLearner = user\?\.role === 'student' \|\| user\?\.role === 'b2c_student'/)
  assert.match(screen, /enabled: isLearner/)
  assert.match(screen, /submission\.kind === 'checked'/)
  assert.match(screen, /\{ checkedPaperId: submission\.id \}/)
  assert.match(screen, /\{ submissionId: submission\.id \}/)
  assert.match(screen, /disabled=\{!submission\.id\}/)
  assert.match(screen, /screen: 'GeneratePaper'/)
  assert.match(screen, /dashboardSource: 'learner-dashboard'/)
  assert.match(screen, /focusExamId: exam\.id/)
  assert.match(screen, /AI LEARNING ACTIVITY/)
  assert.match(screen, /type InsightMode = 'Patterns' \| 'Actions' \| 'Recovery' \| 'Study plan'/)
  assert.match(navigation, /ResultDetail: 'results\/checked\/:checkedPaperId\?'/)
  assert.match(resultDetail, /Result not released yet/)
  assert.match(resultDetail, /paper\?\.results_visible_to_student === false/)
  assert.match(navigation, /name="LearnerDashboard"/)
  assert.match(home, /onDashboard=\{\(\) => navigation\.navigate\("LearnerDashboard"\)\}/)
  assert.match(home, /navigation\.navigate\("LearnerDashboard"\)/)
})

test('release actions invalidate learner evidence caches and preserve the exam gate', () => {
  const status = fs.readFileSync('src/screens/workspace/CheckedPaperStatusScreen.tsx', 'utf8')
  const workspace = fs.readFileSync('src/screens/results/CheckedPaperWorkspaceScreen.tsx', 'utf8')
  const exams = fs.readFileSync('src/screens/workspace/ExamsScreen.tsx', 'utf8')

  for (const source of [status, workspace, exams]) {
    assert.match(source, /invalidateQueries\(\{ queryKey: \['student-dashboard-lab'\] \}\)/)
    assert.match(source, /invalidateQueries\(\{ queryKey: \['student-dashboard-insights'\] \}\)/)
  }
  assert.match(workspace, /It will appear when the exam results are released/)
  assert.match(exams, /results_published: form\.resultsPublished/)
})
