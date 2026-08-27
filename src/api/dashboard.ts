import apiClient from './client'

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
