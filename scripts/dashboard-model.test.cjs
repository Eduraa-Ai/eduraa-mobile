const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const model = require(process.env.DASHBOARD_MODEL_PATH || '../src/screens/workspace/dashboardModel')

test('dashboard roles resolve only to product-owned dashboard families', () => {
  assert.equal(model.resolveStaffDashboardKind('teacher'), 'teacher')
  assert.equal(model.resolveStaffDashboardKind('principal'), 'institution')
  assert.equal(model.resolveStaffDashboardKind('school_super_admin'), 'institution')
  assert.equal(model.resolveStaffDashboardKind('admin'), null)
  assert.equal(model.resolveStaffDashboardKind('branch_admin'), null)
  assert.equal(model.resolveStaffDashboardKind('developer'), null)
})

test('teacher dashboard normalizes metrics and prioritizes at-risk students', () => {
  const view = model.buildStaffDashboardModel({
    kind: 'teacher',
    data: {
      teacher: { first_name: 'Mira', last_name: 'Shah', school_name: 'Eduraa School' },
      summary: {
        roster_students: 30,
        active_students: 27,
        submissions: 42,
        papers: 6,
        average_percent: 68.25,
        change_vs_prev_week: 2.4,
        at_risk_students: 1,
        integrity_flags: 0,
      },
      students: [
        { student_id: 'strong', student_name: 'Strong Student', average_percent: 92, submissions_count: 4, risk_level: 'strong' },
        { student_id: 'risk', student_name: 'Risk Student', average_percent: 35, submissions_count: 2, risk_level: 'at_risk' },
      ],
    },
  })

  assert.equal(view.metrics[1].value, '68.3%')
  assert.equal(view.metrics[4].value, '92.0%')
  assert.equal(view.sections[0].rows[0].id, 'risk')
  assert.equal(view.sections[0].rows[0].tone, 'danger')
})

test('teacher dashboard exposes the web analytics sections and tolerates optional arrays', () => {
  const view = model.buildStaffDashboardModel({
    kind: 'teacher',
    data: {
      teacher: { first_name: 'Mira', last_name: 'Shah' },
      summary: { roster_students: 2, active_students: 2, submissions: 4, papers: 2, average_percent: 55, at_risk_students: 1, integrity_flags: 1 },
      students: [],
      trend: [{ week_start: '2026-08-17', week_end: '2026-08-23', average_percent: 55, submissions: 4 }],
      weak_topics: [{ key: 'Algebra', accuracy: 32, scored: 8, total: 25 }],
      papers: [{ paper_id: 'paper-1', paper_title: 'Weekly test', average_score: 22, average_percent: 55, submissions_count: 4 }],
    },
  })

  assert.deepEqual(view.sections.map((section) => section.id), ['student-pulse', 'trend', 'distribution', 'weak-areas', 'papers', 'ranking', 'attention', 'focus', 'integrity'])
  assert.equal(view.sections[1].rows[0].value, '55.0%')
  assert.equal(view.sections[3].rows[0].title, 'Algebra')
})

test('teacher dashboard rankings and intervention insight use the same scoped analytics and preserve drill-down actions', () => {
  const view = model.buildStaffDashboardModel({
    kind: 'teacher',
    data: {
      teacher: { first_name: 'Mira', last_name: 'Shah' },
      summary: { roster_students: 3, active_students: 2, submissions: 4, papers: 1, average_percent: 55, at_risk_students: 1, integrity_flags: 0 },
      students: [
        { student_id: 'steady', student_name: 'Steady Student', standard: '10', average_percent: 74, submissions_count: 3, trend_delta: 4.2, risk_level: 'on_track' },
        { student_id: 'needs-help', student_name: 'Needs Help', standard: '10', average_percent: 36, submissions_count: 1, risk_level: 'at_risk' },
        { student_id: 'inactive', student_name: 'Inactive', standard: '10', average_percent: 0, submissions_count: 0, risk_level: 'no_attempts' },
      ],
      weak_topics: [{ key: 'Algebra', accuracy: 32, scored: 8, total: 25 }],
    },
  })

  const ranking = view.sections.find((section) => section.id === 'ranking')
  const attention = view.sections.find((section) => section.id === 'attention')
  const focus = view.sections.find((section) => section.id === 'focus')
  assert.equal(ranking.rows[0].title, '#1 Steady Student')
  assert.match(ranking.rows[0].meta, /\+4\.2 pts/)
  assert.deepEqual(ranking.rows[0].action, { kind: 'student', id: 'steady' })
  assert.deepEqual(attention.rows.map((row) => row.id), ['needs-help', 'inactive'])
  assert.equal(attention.rows[1].meta, '10 · No submissions yet')
  assert.equal(focus.rows[0].title, 'Focus: Algebra')
})

test('institution dashboard exposes only role-safe filters and student drill-down actions', () => {
  const view = model.buildStaffDashboardModel({
    kind: 'institution',
    data: {
      profile: { first_name: 'Asha', last_name: 'Patel', role: 'principal', school_name: 'Eduraa School' },
      filters: { standards: [], divisions: [], subjects: [], teachers: [] },
      summary: { total_teachers: 4, active_teachers: 4, total_students: 90, active_students: 82, total_papers: 6, total_submissions: 150, average_percent: 62, at_risk_students: 3, integrity_flags: 0 },
      classes: [{ standard: '10', division: 'A', student_count: 30, active_students: 28, average_percent: 58, submissions_count: 60, at_risk_count: 2 }],
      teachers: [{ teacher_id: 'teacher-1', teacher_name: 'Mira Shah', papers_created: 3, submissions_received: 60, average_percent: 70, students_taught: 30, at_risk_students: 1 }],
      students: [{ student_id: 'student-1', student_name: 'Ravi Kumar', standard: '10', division: 'A', average_percent: 35, submissions_count: 2, risk_level: 'at_risk' }],
      subjects: [{ subject_id: 'maths', subject_name: 'Mathematics', papers_count: 2, submissions_count: 60, average_percent: 56, students_attempted: 30, teacher_count: 1, pass_rate: 65 }],
    },
  })

  const classHealth = view.sections.find((section) => section.id === 'class-health')
  const students = view.sections.find((section) => section.id === 'students')
  const teachers = view.sections.find((section) => section.id === 'teachers')
  const subjects = view.sections.find((section) => section.id === 'subjects')
  assert.deepEqual(classHealth.rows[0].action, { kind: 'filter', field: 'standard', value: '10', extra: { field: 'division', value: 'A' } })
  assert.deepEqual(students.rows[0].action, { kind: 'student', id: 'student-1' })
  assert.deepEqual(teachers.rows[0].action, { kind: 'filter', field: 'teacher_id', value: 'teacher-1' })
  assert.deepEqual(subjects.rows[0].action, { kind: 'filter', field: 'subject_id', value: 'maths' })
})

test('workspace dashboard control opens a registered screen instead of the active tab', () => {
  const workspace = fs.readFileSync('src/screens/workspace/WorkspaceScreen.tsx', 'utf8')
  const navigation = fs.readFileSync('src/navigation/index.tsx', 'utf8')
  const catalog = fs.readFileSync('src/data/mobileControlCatalog.ts', 'utf8')

  assert.match(workspace, /control\.id === 'dashboard'[\s\S]*navigation\.navigate\('Dashboard'\)/)
  assert.match(navigation, /StaffWorkspaceStack\.Screen[\s\S]*name="Dashboard"[\s\S]*component=\{DashboardScreen\}/)
  assert.match(catalog, /id: 'dashboard'[\s\S]*target: \{ kind: 'detail' \}/)
  const dashboardEntry = catalog.match(/\{\s*id: 'dashboard',[\s\S]*?\n  \},/)
  assert.ok(dashboardEntry)
  assert.match(dashboardEntry[0], /roles: \['student', 'b2c_student', 'teacher', 'principal', 'school_super_admin'\]/)
  assert.doesNotMatch(dashboardEntry[0], /branch_admin|developer|\badmin\b/)
})

test('dashboard uses focused analytics pages without a promotional hero', () => {
  const screen = fs.readFileSync('src/screens/workspace/DashboardScreen.tsx', 'utf8')

  assert.doesNotMatch(screen, /GradientHeroCard/)
  assert.match(screen, /label: 'Overview'/)
  assert.match(screen, /label: 'Students'/)
  assert.match(screen, /label: 'Performance'/)
  assert.match(screen, /label: 'Ranking'/)
  assert.match(screen, /label: 'Insights'/)
  assert.match(screen, /label: 'Integrity'/)
  assert.match(screen, /label: 'Assistant'/)
  assert.match(screen, /navigation\.navigate\('StaffAIStudio'\)/)
  assert.match(screen, /accessibilityRole="tab"/)
  assert.match(screen, /DashboardStudentDetail/)
  assert.match(screen, /DashboardPaperDetail/)
  assert.match(screen, /SelectField label="Standard"/)
  assert.match(screen, /DateField label="From"/)
  assert.match(screen, /Update the filters before opening an analysis/)
  assert.match(screen, /if \(dateRangeInvalid\) return/)
  assert.match(screen, /Dashboard not available/)
  assert.match(screen, /enabled: Boolean\(dashboardKind\)/)
  assert.doesNotMatch(screen, /getLeadershipSummary\(\)/)
  assert.match(screen, /flexWrap: 'wrap'/)

  const detail = fs.readFileSync('src/screens/workspace/DashboardDetailScreen.tsx', 'utf8')
  assert.match(detail, /enabled: canAccess/)
  assert.match(detail, /user\?\.role === 'teacher'/)
  assert.match(detail, /user\?\.role === 'principal' \|\| user\?\.role === 'school_super_admin'/)
  assert.match(detail, /Student analysis not available/)
  assert.match(detail, /Paper analysis not available/)
  assert.match(detail, /isEmptyScopeError/)
  assert.match(detail, /No graded work in this scope/)
  assert.match(detail, /Adjust filters/)
  assert.match(detail, /Back to students/)
  assert.match(detail, /openFilters: true/)
})

test('learner dashboard actions retain their real destination, recovery, and return path', () => {
  const home = fs.readFileSync('src/screens/home/HomeScreen.tsx', 'utf8')
  const learning = fs.readFileSync('src/screens/learning/AgenticLearningScreen.tsx', 'utf8')

  assert.match(home, /onExams: \(\) => void/)
  assert.match(home, /onExams=\{\(\) => navigation\.navigate\("Exams"\)\}/)
  assert.match(home, /useFocusEffect\(useCallback\(\(\) => \{/)
  assert.match(home, /loading=\{isRefetching\}/)
  assert.match(home, /accessibilityLabel="Ask Eduraa AI"/)
  assert.match(learning, /navigation\.navigate\('HomeMain'\)/)
  assert.doesNotMatch(learning, /LearningHome/)
})

test('dashboard API keeps the website filter and drill-down contracts', () => {
  const api = fs.readFileSync('src/api/dashboard.ts', 'utf8')
  const navigation = fs.readFileSync('src/navigation/index.tsx', 'utf8')

  assert.match(api, /getTeacherOverview\(params\?: DashboardFilterParams\)/)
  assert.match(api, /getPrincipalOverview\(params\?: DashboardFilterParams\)/)
  assert.match(api, /trend_delta\?: number \| null/)
  assert.match(api, /teacher-dashboard-lab\/paper\/\$\{paperId\}/)
  assert.match(api, /\$\{family\}-dashboard-lab\/student\/\$\{studentId\}/)
  assert.match(navigation, /name="DashboardStudentDetail"/)
  assert.match(navigation, /name="DashboardPaperDetail"/)
})
