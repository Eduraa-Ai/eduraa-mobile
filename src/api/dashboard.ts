import apiClient from './client'

export interface DashboardTrendPoint {
  week_start: string
  week_end: string
  average_percent: number
  submissions: number
}

export interface DashboardPerformanceRow {
  key: string
  accuracy: number
  scored: number
  total: number
}

export interface TeacherDashboardOverview {
  teacher: {
    first_name: string
    last_name: string
    school_name?: string | null
    branch_name?: string | null
  }
  summary: {
    roster_students: number
    active_students: number
    completion_rate?: number | null
    submissions: number
    papers: number
    average_percent: number
    change_vs_prev_week?: number | null
    at_risk_students: number
    integrity_flags: number
  }
  students: Array<{
    student_id: string
    student_name: string
    standard?: string | null
    division?: string | null
    average_percent: number
    submissions_count: number
    risk_level?: string | null
  }>
  trend?: DashboardTrendPoint[]
  distribution?: Array<{ label: string; count: number }>
  weak_question_types?: DashboardPerformanceRow[]
  weak_topics?: DashboardPerformanceRow[]
  papers?: Array<{
    paper_id: string
    paper_title: string
    average_score: number
    average_percent: number
    submissions_count: number
    subject_name?: string | null
    standard?: string | null
    division?: string | null
  }>
  recent_submissions?: Array<{
    submission_id: string
    paper_id: string
    paper_title: string
    student_id: string
    student_name: string
    misconduct_score?: number | null
    misconduct_report?: Record<string, unknown> | null
    submitted_at: string
  }>
}

export interface PrincipalDashboardOverview {
  profile: {
    first_name: string
    last_name: string
    school_name?: string | null
    branch_name?: string | null
    role: string
  }
  summary: {
    total_teachers: number
    active_teachers: number
    total_students: number
    active_students: number
    total_papers: number
    total_submissions: number
    average_percent: number
    change_vs_prev_week?: number | null
    at_risk_students: number
    integrity_flags: number
    completion_rate?: number | null
  }
  classes: Array<{
    standard: string
    division?: string | null
    student_count: number
    active_students: number
    average_percent: number
    submissions_count: number
    at_risk_count: number
    class_teacher?: string | null
  }>
  trend?: Array<DashboardTrendPoint & {
    student_average?: number | null
    teacher_average?: number | null
  }>
  teachers?: Array<{
    teacher_id: string
    teacher_name: string
    papers_created: number
    submissions_received: number
    average_percent: number
    students_taught: number
    at_risk_students: number
    last_activity?: string | null
  }>
  students?: Array<{
    student_id: string
    student_name: string
    standard?: string | null
    division?: string | null
    average_percent: number
    submissions_count: number
    risk_level?: string | null
  }>
  subjects?: Array<{
    subject_id?: string | null
    subject_name: string
    papers_count: number
    submissions_count: number
    average_percent: number
    students_attempted: number
    teacher_count: number
    pass_rate: number
    weak_topics?: string[]
  }>
}

export const dashboardApi = {
  async getTeacherOverview() {
    const response = await apiClient.get<TeacherDashboardOverview>('/analytics/teacher-dashboard-lab')
    return response.data
  },

  async getPrincipalOverview() {
    const response = await apiClient.get<PrincipalDashboardOverview>('/analytics/principal-dashboard-lab')
    return response.data
  },
}
