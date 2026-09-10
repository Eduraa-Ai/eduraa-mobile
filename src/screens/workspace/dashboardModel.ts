import type { TeacherAttendanceSummary } from '../../api/attendance'
import type { PrincipalDashboardOverview, TeacherDashboardOverview } from '../../api/dashboard'
import type { Role } from '../../types'

export type StaffDashboardKind = 'teacher' | 'institution'
export type DashboardMetricTone = 'default' | 'success' | 'warning' | 'danger' | 'info'

export type StaffDashboardPayload =
  | { kind: 'teacher'; data: TeacherDashboardOverview; attendance?: TeacherAttendanceSummary | null }
  | { kind: 'institution'; data: PrincipalDashboardOverview }

export interface DashboardRow {
  id: string
  title: string
  meta: string
  value: string
  tone: DashboardMetricTone
  progress?: number
  action?:
    | { kind: 'student'; id: string }
    | { kind: 'paper'; id: string }
    | { kind: 'filter'; field: 'standard' | 'division' | 'subject_id' | 'teacher_id'; value: string; extra?: { field: 'division'; value: string } }
}

export interface DashboardSection {
  id: string
  title: string
  subtitle: string
  rows: DashboardRow[]
  emptyTitle: string
  emptyBody: string
}

export interface StaffDashboardViewModel {
  eyebrow: string
  title: string
  subtitle: string
  metrics: Array<{
    label: string
    value: string
    helper: string
    tone: DashboardMetricTone
  }>
  sections: DashboardSection[]
}

const safeNumber = (value: unknown) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const formatCount = (value: unknown) => Math.max(0, Math.round(safeNumber(value))).toLocaleString()
const formatPercent = (value: unknown) => `${Math.min(100, Math.max(0, safeNumber(value))).toFixed(1)}%`

const deltaHelper = (value?: number | null) => {
  if (value == null || !Number.isFinite(value)) return 'Current reporting period'
  if (value === 0) return 'No change from last week'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} pts vs last week`
}

export function resolveStaffDashboardKind(role?: Role | null): 'teacher' | 'institution' | null {
  if (role === 'teacher') return 'teacher'
  if (role === 'principal' || role === 'school_super_admin') return 'institution'
  return null
}

function classLabel(standard?: string | null, division?: string | null) {
  const base = standard?.trim() || 'Class'
  return division?.trim() ? `${base} · ${division.trim()}` : base
}

function compactDate(value?: string | null) {
  if (!value) return 'Recent period'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recent period'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const performanceTone = (value: number): DashboardMetricTone => value >= 75 ? 'success' : value >= 50 ? 'warning' : 'danger'

function teacherModel(data: TeacherDashboardOverview, attendance?: TeacherAttendanceSummary | null): StaffDashboardViewModel {
  const summary = data.summary
  const name = data.teacher.first_name?.trim() || 'Teacher'
  const context = [data.teacher.school_name, data.teacher.branch_name].filter(Boolean).join(' · ')
  const students = [...(data.students ?? [])]
    .sort((left, right) => {
      const priority = (risk?: string | null) => risk === 'at_risk' ? 0 : risk === 'needs_attention' ? 1 : 2
      return priority(left.risk_level) - priority(right.risk_level) || left.average_percent - right.average_percent
    })
  const topStudent = [...(data.students ?? [])]
    .filter((student) => student.submissions_count > 0)
    .sort((left, right) => right.average_percent - left.average_percent)[0]
  const rankedStudents = [...(data.students ?? [])]
    .sort((left, right) => right.average_percent - left.average_percent || right.submissions_count - left.submissions_count)
  const attendancePercent = attendance && attendance.total_students > 0
    ? (attendance.present_count / attendance.total_students) * 100
    : null

  const trendRows: DashboardRow[] = [...(data.trend ?? [])].slice(-6).reverse().map((point) => ({
    id: `${point.week_start}-${point.week_end}`,
    title: `${compactDate(point.week_start)} – ${compactDate(point.week_end)}`,
    meta: `${formatCount(point.submissions)} submissions`,
    value: formatPercent(point.average_percent),
    tone: performanceTone(point.average_percent),
    progress: point.average_percent,
  }))
  const weakRows: DashboardRow[] = [
    ...(data.weak_topics ?? []).slice(0, 3).map((item) => ({ ...item, kind: 'Topic' })),
    ...(data.weak_question_types ?? []).slice(0, 3).map((item) => ({ ...item, kind: 'Question type' })),
  ].sort((left, right) => left.accuracy - right.accuracy).slice(0, 5).map((item, index) => ({
    id: `${item.kind}-${item.key}-${index}`,
    title: item.key,
    meta: `${item.kind} · ${formatCount(item.scored)}/${formatCount(item.total)} marks`,
    value: formatPercent(item.accuracy),
    tone: performanceTone(item.accuracy),
    progress: item.accuracy,
  }))
  const paperRows: DashboardRow[] = [...(data.papers ?? [])]
    .sort((left, right) => right.submissions_count - left.submissions_count)
    .map((paper) => ({
      id: paper.paper_id,
      title: paper.paper_title,
      meta: `${paper.subject_name || 'Paper'} · ${formatCount(paper.submissions_count)} submissions`,
      value: formatPercent(paper.average_percent),
      tone: performanceTone(paper.average_percent),
      progress: paper.average_percent,
      action: { kind: 'paper', id: paper.paper_id },
    }))
  const distributionRows: DashboardRow[] = (data.distribution ?? []).map((item, index) => ({
    id: `${item.label}-${index}`, title: item.label, meta: 'Students in this score band',
    value: formatCount(item.count), tone: 'info',
  }))
  const integrityRows: DashboardRow[] = (data.recent_submissions ?? [])
    .filter((submission) => safeNumber(submission.misconduct_score) > 0 || Boolean(submission.misconduct_report))
    .slice(0, 5)
    .map((submission) => ({
      id: submission.submission_id,
      title: submission.student_name,
      meta: `${submission.paper_title} · ${compactDate(submission.submitted_at)}`,
      value: safeNumber(submission.misconduct_score) > 0 ? formatPercent(submission.misconduct_score) : 'Review',
      tone: 'danger',
    }))
  const rankingRows: DashboardRow[] = rankedStudents.map((student, index) => ({
    id: student.student_id,
    title: `#${index + 1} ${student.student_name}`,
    meta: `${classLabel(student.standard, student.division)} · ${formatCount(student.submissions_count)} submissions${student.trend_delta == null ? '' : ` · ${student.trend_delta > 0 ? '+' : ''}${student.trend_delta.toFixed(1)} pts`}`,
    value: formatPercent(student.average_percent),
    tone: student.risk_level === 'at_risk' ? 'danger' : student.risk_level === 'needs_attention' ? 'warning' : 'success',
    progress: student.average_percent,
    action: { kind: 'student', id: student.student_id },
  }))
  const attentionRows: DashboardRow[] = students
    .filter((student) => student.risk_level === 'at_risk' || student.risk_level === 'needs_attention' || student.submissions_count === 0)
    .slice(0, 7)
    .map((student) => ({
      id: student.student_id,
      title: student.student_name,
      meta: student.submissions_count === 0
        ? `${classLabel(student.standard, student.division)} · No submissions yet`
        : `${classLabel(student.standard, student.division)} · ${formatCount(student.submissions_count)} submissions`,
      value: formatPercent(student.average_percent),
      tone: student.risk_level === 'at_risk' || student.submissions_count === 0 ? 'danger' : 'warning',
      progress: student.average_percent,
      action: { kind: 'student', id: student.student_id },
    }))
  const focusRows: DashboardRow[] = weakRows.map((row) => ({
    ...row,
    id: `focus-${row.id}`,
    title: `Focus: ${row.title}`,
  }))

  return {
    eyebrow: 'TEACHING DASHBOARD',
    title: `${name}, here is your class pulse.`,
    subtitle: context || 'Live learning performance across your assigned students and papers.',
    metrics: [
      { label: 'Total students', value: formatCount(summary.roster_students), helper: `${formatCount(summary.active_students)} active`, tone: 'info' },
      { label: 'Class average', value: formatPercent(summary.average_percent), helper: deltaHelper(summary.change_vs_prev_week), tone: performanceTone(summary.average_percent) },
      { label: 'At risk', value: formatCount(summary.at_risk_students), helper: 'Below 40%', tone: summary.at_risk_students > 0 ? 'danger' : 'success' },
      { label: 'Papers given', value: formatCount(summary.papers), helper: `${formatCount(summary.submissions)} submissions`, tone: 'default' },
      { label: 'Highest avg', value: topStudent ? formatPercent(topStudent.average_percent) : '—', helper: topStudent?.student_name || 'No active students', tone: 'success' },
      { label: 'Integrity flags', value: formatCount(summary.integrity_flags), helper: summary.integrity_flags > 0 ? 'Review needed' : 'No alerts', tone: summary.integrity_flags > 0 ? 'danger' : 'success' },
      ...(attendancePercent == null ? [] : [{
        label: 'Attendance today', value: formatPercent(attendancePercent),
        helper: `${formatCount(attendance?.present_count)} of ${formatCount(attendance?.total_students)} present`,
        tone: attendancePercent >= 85 ? 'success' as const : 'warning' as const,
      }]),
    ],
    sections: [
      {
        id: 'student-pulse', title: 'Student pulse', subtitle: 'Students needing attention appear first.',
        rows: students.map((student) => ({
          id: student.student_id, title: student.student_name,
          meta: `${classLabel(student.standard, student.division)} · ${formatCount(student.submissions_count)} submissions`,
          value: formatPercent(student.average_percent),
          tone: student.risk_level === 'at_risk' ? 'danger' : student.risk_level === 'needs_attention' ? 'warning' : 'success',
          progress: student.average_percent,
          action: { kind: 'student', id: student.student_id },
        })),
        emptyTitle: 'No student performance yet', emptyBody: 'Student performance will appear after assigned papers receive submissions.',
      },
      { id: 'trend', title: 'Class performance trend', subtitle: 'Weekly average and submission volume.', rows: trendRows, emptyTitle: 'No trend yet', emptyBody: 'Weekly movement appears after students submit graded work.' },
      { id: 'distribution', title: 'Score distribution', subtitle: 'How students are spread across score bands.', rows: distributionRows, emptyTitle: 'No score distribution yet', emptyBody: 'Score bands appear after graded submissions.' },
      { id: 'weak-areas', title: 'Weak areas', subtitle: 'Topics and question formats with the lowest accuracy.', rows: weakRows, emptyTitle: 'No weak areas identified', emptyBody: 'Weak-area insights appear when enough answers have been graded.' },
      { id: 'papers', title: 'Paper performance', subtitle: 'Most-attempted papers and their class average.', rows: paperRows, emptyTitle: 'No paper performance yet', emptyBody: 'Publish a paper and collect submissions to see performance.' },
      { id: 'ranking', title: 'Student ranking', subtitle: 'Ranked by average score for the active filters. Tap a student for the full analysis.', rows: rankingRows, emptyTitle: 'No ranked students yet', emptyBody: 'Student rankings appear after graded submissions are available.' },
      { id: 'attention', title: 'Students needing attention', subtitle: 'Prioritised from the current reporting period. Tap a student to plan support from their analysis.', rows: attentionRows, emptyTitle: 'No students need attention', emptyBody: 'No at-risk, low-progress, or inactive students match these filters.' },
      { id: 'focus', title: 'Priority learning focus', subtitle: 'Lowest-performing topics and question formats from graded work.', rows: focusRows, emptyTitle: 'No priority focus yet', emptyBody: 'Learning focus appears once enough answers have been graded.' },
      ...(summary.integrity_flags > 0 ? [{ id: 'integrity', title: 'Integrity review', subtitle: 'Recent submissions that may need review.', rows: integrityRows, emptyTitle: 'Flag details are not available yet', emptyBody: 'Open the web integrity view for the complete flagged-submission report.' }] : []),
    ],
  }
}

function institutionModel(data: PrincipalDashboardOverview): StaffDashboardViewModel {
  const summary = data.summary
  const name = data.profile.first_name?.trim() || 'Leader'
  const context = [data.profile.school_name, data.profile.branch_name].filter(Boolean).join(' · ')
  const classes = [...(data.classes ?? [])]
    .sort((left, right) => right.at_risk_count - left.at_risk_count || left.average_percent - right.average_percent)
  const trendRows: DashboardRow[] = [...(data.trend ?? [])].slice(-6).reverse().map((point) => ({
    id: `${point.week_start}-${point.week_end}`, title: `${compactDate(point.week_start)} – ${compactDate(point.week_end)}`,
    meta: `${formatCount(point.submissions)} submissions`, value: formatPercent(point.average_percent),
    tone: performanceTone(point.average_percent), progress: point.average_percent,
  }))
  const teacherRows: DashboardRow[] = [...(data.teachers ?? [])]
    .sort((left, right) => right.average_percent - left.average_percent).map((teacher) => ({
      id: teacher.teacher_id, title: teacher.teacher_name,
      meta: `${formatCount(teacher.students_taught)} students · ${formatCount(teacher.papers_created)} papers`,
      value: formatPercent(teacher.average_percent), tone: performanceTone(teacher.average_percent), progress: teacher.average_percent,
      action: { kind: 'filter', field: 'teacher_id', value: teacher.teacher_id },
    }))
  const subjectRows: DashboardRow[] = [...(data.subjects ?? [])]
    .sort((left, right) => left.average_percent - right.average_percent).map((subject, index) => ({
      id: subject.subject_id || `${subject.subject_name}-${index}`, title: subject.subject_name,
      meta: `${formatCount(subject.students_attempted)} students · ${formatCount(subject.papers_count)} papers`,
      value: formatPercent(subject.average_percent), tone: performanceTone(subject.average_percent), progress: subject.average_percent,
      ...(subject.subject_id ? { action: { kind: 'filter' as const, field: 'subject_id' as const, value: subject.subject_id } } : {}),
    }))
  const studentRows: DashboardRow[] = [...(data.students ?? [])]
    .sort((left, right) => {
      const priority = (risk?: string | null) => risk === 'at_risk' ? 0 : risk === 'needs_attention' ? 1 : 2
      return priority(left.risk_level) - priority(right.risk_level) || left.average_percent - right.average_percent
    })
    .map((student) => ({
      id: student.student_id, title: student.student_name,
      meta: `${classLabel(student.standard, student.division)} · ${formatCount(student.submissions_count)} submissions`,
      value: formatPercent(student.average_percent),
      tone: student.risk_level === 'at_risk' ? 'danger' : student.risk_level === 'needs_attention' ? 'warning' : 'success',
      progress: student.average_percent,
      action: { kind: 'student', id: student.student_id },
    }))
  const distributionRows: DashboardRow[] = (data.distribution ?? []).map((item, index) => ({
    id: `${item.label}-${index}`, title: item.label, meta: 'Students in this score band',
    value: formatCount(item.count), tone: 'info',
  }))

  return {
    eyebrow: 'INSTITUTION DASHBOARD',
    title: `${name}, your school at a glance.`,
    subtitle: context || 'Live academic health across teachers, students, classes, and submissions.',
    metrics: [
      { label: 'Students', value: formatCount(summary.total_students), helper: `${formatCount(summary.active_students)} active`, tone: 'info' },
      { label: 'Teachers', value: formatCount(summary.total_teachers), helper: `${formatCount(summary.active_teachers)} active`, tone: 'default' },
      { label: 'School average', value: formatPercent(summary.average_percent), helper: deltaHelper(summary.change_vs_prev_week), tone: performanceTone(summary.average_percent) },
      { label: 'At risk', value: formatCount(summary.at_risk_students), helper: 'Students needing support', tone: summary.at_risk_students > 0 ? 'danger' : 'success' },
      { label: 'Papers', value: formatCount(summary.total_papers), helper: `${formatCount(summary.total_submissions)} submissions`, tone: 'default' },
      { label: 'Completion', value: summary.completion_rate == null ? '—' : formatPercent(summary.completion_rate), helper: 'Active student rate', tone: safeNumber(summary.completion_rate) >= 75 ? 'success' : 'warning' },
      { label: 'Integrity flags', value: formatCount(summary.integrity_flags), helper: summary.integrity_flags > 0 ? 'Review needed' : 'No alerts', tone: summary.integrity_flags > 0 ? 'danger' : 'success' },
    ],
    sections: [
      {
        id: 'class-health', title: 'Class health', subtitle: 'Classes needing attention appear first.',
        rows: classes.map((item, index) => ({
          id: `${item.standard}-${item.division ?? ''}-${index}`, title: classLabel(item.standard, item.division),
          meta: `${formatCount(item.student_count)} students · ${formatCount(item.submissions_count)} submissions`,
          value: formatPercent(item.average_percent), tone: item.at_risk_count > 0 ? 'warning' : 'success', progress: item.average_percent,
          action: { kind: 'filter', field: 'standard', value: item.standard, ...(item.division ? { extra: { field: 'division' as const, value: item.division } } : {}) },
        })),
        emptyTitle: 'No class performance yet', emptyBody: 'Class analytics will appear after teachers publish papers and students submit work.',
      },
      { id: 'trend', title: 'School performance trend', subtitle: 'Weekly average and submission volume.', rows: trendRows, emptyTitle: 'No trend yet', emptyBody: 'Weekly movement appears after graded submissions.' },
      { id: 'distribution', title: 'Score distribution', subtitle: 'School-wide performance across score bands.', rows: distributionRows, emptyTitle: 'No score distribution yet', emptyBody: 'Score bands appear after graded submissions.' },
      { id: 'students', title: 'Student performance', subtitle: 'Students needing support appear first. Tap a student for the full analysis.', rows: studentRows, emptyTitle: 'No student performance yet', emptyBody: 'Student analytics appear after graded submissions.' },
      { id: 'teachers', title: 'Teacher performance', subtitle: 'Top instructional impact across active classes.', rows: teacherRows, emptyTitle: 'No teacher performance yet', emptyBody: 'Teacher analytics appear after their students submit graded work.' },
      { id: 'subjects', title: 'Subjects needing focus', subtitle: 'Lowest-performing subjects appear first.', rows: subjectRows, emptyTitle: 'No subject performance yet', emptyBody: 'Subject analytics appear after graded work is available.' },
    ],
  }
}

export function buildStaffDashboardModel(payload: StaffDashboardPayload) {
  if (payload.kind === 'teacher') return teacherModel(payload.data, payload.attendance)
  return institutionModel(payload.data)
}
