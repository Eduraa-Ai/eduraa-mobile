import type { LeadershipAttendanceSummary } from '../../api/attendance'
import type { PrincipalDashboardOverview, TeacherDashboardOverview } from '../../api/dashboard'
import type { Role } from '../../types'

export type StaffDashboardKind = 'teacher' | 'institution' | 'operations'
export type DashboardMetricTone = 'default' | 'success' | 'warning' | 'danger' | 'info'

export type StaffDashboardPayload =
  | { kind: 'teacher'; data: TeacherDashboardOverview }
  | { kind: 'institution'; data: PrincipalDashboardOverview }
  | { kind: 'operations'; data: LeadershipAttendanceSummary }

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
  sectionTitle: string
  sectionSubtitle: string
  rows: Array<{
    id: string
    title: string
    meta: string
    value: string
    tone: DashboardMetricTone
  }>
  emptyTitle: string
  emptyBody: string
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

const displayRole = (role?: Role | null) => role?.replace(/_/g, ' ') ?? 'staff'

export function resolveStaffDashboardKind(role?: Role | null): StaffDashboardKind {
  if (role === 'teacher') return 'teacher'
  if (role === 'principal' || role === 'school_super_admin') return 'institution'
  return 'operations'
}

function classLabel(standard?: string | null, division?: string | null) {
  const base = standard?.trim() || 'Class'
  return division?.trim() ? `${base} · ${division.trim()}` : base
}

function teacherModel(data: TeacherDashboardOverview): StaffDashboardViewModel {
  const summary = data.summary
  const name = data.teacher.first_name?.trim() || 'Teacher'
  const context = [data.teacher.school_name, data.teacher.branch_name].filter(Boolean).join(' · ')
  const students = [...(data.students ?? [])]
    .sort((left, right) => {
      const priority = (risk?: string | null) => risk === 'at_risk' ? 0 : risk === 'needs_attention' ? 1 : 2
      return priority(left.risk_level) - priority(right.risk_level) || left.average_percent - right.average_percent
    })
    .slice(0, 5)

  return {
    eyebrow: 'TEACHING DASHBOARD',
    title: `${name}, here is your class pulse.`,
    subtitle: context || 'Live learning performance across your assigned students and papers.',
    metrics: [
      { label: 'Roster', value: formatCount(summary.roster_students), helper: `${formatCount(summary.active_students)} active`, tone: 'info' },
      { label: 'Average', value: formatPercent(summary.average_percent), helper: deltaHelper(summary.change_vs_prev_week), tone: summary.average_percent >= 60 ? 'success' : 'warning' },
      { label: 'At risk', value: formatCount(summary.at_risk_students), helper: 'Students needing attention', tone: summary.at_risk_students > 0 ? 'danger' : 'success' },
      { label: 'Submissions', value: formatCount(summary.submissions), helper: `${formatCount(summary.papers)} papers`, tone: 'default' },
    ],
    sectionTitle: 'Student pulse',
    sectionSubtitle: 'Students needing attention appear first.',
    rows: students.map((student) => ({
      id: student.student_id,
      title: student.student_name,
      meta: `${classLabel(student.standard, student.division)} · ${formatCount(student.submissions_count)} submissions`,
      value: formatPercent(student.average_percent),
      tone: student.risk_level === 'at_risk' ? 'danger' : student.risk_level === 'needs_attention' ? 'warning' : 'success',
    })),
    emptyTitle: 'No student performance yet',
    emptyBody: 'Student performance will appear after assigned papers receive submissions.',
  }
}

function institutionModel(data: PrincipalDashboardOverview): StaffDashboardViewModel {
  const summary = data.summary
  const name = data.profile.first_name?.trim() || 'Leader'
  const context = [data.profile.school_name, data.profile.branch_name].filter(Boolean).join(' · ')
  const classes = [...(data.classes ?? [])]
    .sort((left, right) => right.at_risk_count - left.at_risk_count || left.average_percent - right.average_percent)
    .slice(0, 5)

  return {
    eyebrow: 'INSTITUTION DASHBOARD',
    title: `${name}, your school at a glance.`,
    subtitle: context || 'Live academic health across teachers, students, classes, and submissions.',
    metrics: [
      { label: 'Students', value: formatCount(summary.total_students), helper: `${formatCount(summary.active_students)} active`, tone: 'info' },
      { label: 'Teachers', value: formatCount(summary.total_teachers), helper: `${formatCount(summary.active_teachers)} active`, tone: 'default' },
      { label: 'Average', value: formatPercent(summary.average_percent), helper: deltaHelper(summary.change_vs_prev_week), tone: summary.average_percent >= 60 ? 'success' : 'warning' },
      { label: 'At risk', value: formatCount(summary.at_risk_students), helper: 'Students needing support', tone: summary.at_risk_students > 0 ? 'danger' : 'success' },
    ],
    sectionTitle: 'Class health',
    sectionSubtitle: 'Classes needing attention appear first.',
    rows: classes.map((item, index) => ({
      id: `${item.standard}-${item.division ?? ''}-${index}`,
      title: classLabel(item.standard, item.division),
      meta: `${formatCount(item.student_count)} students · ${formatCount(item.submissions_count)} submissions`,
      value: formatPercent(item.average_percent),
      tone: item.at_risk_count > 0 ? 'warning' : 'success',
    })),
    emptyTitle: 'No class performance yet',
    emptyBody: 'Class analytics will appear after teachers publish papers and students submit work.',
  }
}

function operationsModel(data: LeadershipAttendanceSummary, role?: Role | null): StaffDashboardViewModel {
  const attendanceRate = data.total_students > 0
    ? (safeNumber(data.present_count) / safeNumber(data.total_students)) * 100
    : 0
  const pending = (data.pending ?? []).slice(0, 5)

  return {
    eyebrow: 'OPERATIONS DASHBOARD',
    title: 'Today’s school operations.',
    subtitle: `Live attendance command center for ${displayRole(role)} access.`,
    metrics: [
      { label: 'Classes', value: formatCount(data.total_classes), helper: `${formatCount(data.submitted_classes)} submitted`, tone: 'info' },
      { label: 'Pending', value: formatCount(data.pending_classes), helper: 'Attendance sheets', tone: data.pending_classes > 0 ? 'warning' : 'success' },
      { label: 'Students', value: formatCount(data.total_students), helper: `${formatCount(data.present_count)} present`, tone: 'default' },
      { label: 'Present', value: formatPercent(attendanceRate), helper: `${formatCount(data.absent_count)} absent · ${formatCount(data.late_count)} late`, tone: attendanceRate >= 85 ? 'success' : 'warning' },
    ],
    sectionTitle: 'Pending classes',
    sectionSubtitle: 'Attendance sheets still awaiting submission.',
    rows: pending.map((item) => ({
      id: item.class_section_id,
      title: classLabel(item.standard, item.division),
      meta: `${item.class_teacher_name || 'Class teacher not assigned'} · ${formatCount(item.student_count)} students`,
      value: item.status ? item.status.replace(/_/g, ' ') : 'Pending',
      tone: 'warning',
    })),
    emptyTitle: 'Attendance is on track',
    emptyBody: 'There are no pending class attendance sheets for the selected school day.',
  }
}

export function buildStaffDashboardModel(payload: StaffDashboardPayload, role?: Role | null) {
  if (payload.kind === 'teacher') return teacherModel(payload.data)
  if (payload.kind === 'institution') return institutionModel(payload.data)
  return operationsModel(payload.data, role)
}
