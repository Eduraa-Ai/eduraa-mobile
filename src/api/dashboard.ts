import apiClient from './client'
import type { DownloadedPdf } from '../utils/pdfDownload'

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

export interface DashboardFilterParams {
  standard?: string
  division?: string
  subject_id?: string
  paper_id?: string
  teacher_id?: string
  date_from?: string
  date_to?: string
}

export interface DashboardFilterOptions {
  standards: string[]
  divisions: string[]
  subjects: Array<{ id?: string | null; name: string; code?: string | null }>
  papers?: Array<{ id: string; title: string }>
  teachers?: Array<{ id: string; name: string }>
}

export interface TeacherDashboardOverview {
  teacher: {
    first_name: string
    last_name: string
    school_name?: string | null
    branch_name?: string | null
  }
  filters: DashboardFilterOptions
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
    last_percent?: number | null
    last_submitted_at?: string | null
    trend_delta?: number | null
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
  filters: DashboardFilterOptions
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
  distribution?: Array<{ label: string; count: number }>
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

export interface DashboardStudentDetail {
  student_id: string
  student_name: string
  standard?: string | null
  division?: string | null
  average_percent: number
  submissions_count: number
  class_rank?: number | null
  class_size: number
  percentile?: number | null
  growth_percent?: number | null
  growth_direction?: string | null
  best_score?: number | null
  completion_total: number
  consistency_percent?: number | null
  consistency_std_dev?: number | null
  recent_submissions: Array<{ submission_id: string; paper_id: string; paper_title: string; score: number; max_score: number; percent: number; submitted_at: string }>
  paper_history: Array<{ paper_id: string; paper_title: string; subject_name?: string | null; score: number; max_score: number; percent: number; class_average_percent: number; rank?: number | null; total_submissions: number; submitted_at?: string | null }>
  question_type_performance: DashboardPerformanceRow[]
  topic_mastery: DashboardPerformanceRow[]
  weak_question_types: DashboardPerformanceRow[]
  weak_topics: DashboardPerformanceRow[]
}

export interface DashboardPaperDetail {
  paper: NonNullable<TeacherDashboardOverview['papers']>[number] & {
    total_marks?: number | null
    highest_score?: number | null
    lowest_score?: number | null
    display_date?: string | null
  }
  question_count: number
  duration_minutes?: number | null
  median_score?: number | null
  pass_rate: number
  performance_summary: Array<{ label: string; count: number }>
  distribution: Array<{ label: string; count: number }>
  topic_accuracy: DashboardPerformanceRow[]
  question_type_accuracy: DashboardPerformanceRow[]
  student_results: Array<{ rank: number; submission_id: string; student_id: string; student_name: string; score: number; max_score: number; percent: number; status: string; time_taken_seconds?: number | null }>
  recommendations: Array<{ kind: string; title: string; detail: string }>
}

const compactParams = (params?: DashboardFilterParams) => params
  ? Object.fromEntries(Object.entries(params).filter(([, value]) => Boolean(value?.trim())))
  : undefined

export const dashboardApi = {
  async getTeacherOverview(params?: DashboardFilterParams) {
    const response = await apiClient.get<TeacherDashboardOverview>('/analytics/teacher-dashboard-lab', { params: compactParams(params) })
    return response.data
  },

  async getPrincipalOverview(params?: DashboardFilterParams) {
    const response = await apiClient.get<PrincipalDashboardOverview>('/analytics/principal-dashboard-lab', { params: compactParams(params) })
    return response.data
  },

  async getStudentDetail(studentId: string, source: 'teacher' | 'institution', params?: DashboardFilterParams) {
    const family = source === 'teacher' ? 'teacher' : 'principal'
    const response = await apiClient.get<DashboardStudentDetail>(`/analytics/${family}-dashboard-lab/student/${studentId}`, { params: compactParams(params) })
    return response.data
  },

  async getTeacherPaperDetail(paperId: string, params?: DashboardFilterParams) {
    const response = await apiClient.get<DashboardPaperDetail>(`/analytics/teacher-dashboard-lab/paper/${paperId}`, {
      params: compactParams({ standard: params?.standard, division: params?.division, date_from: params?.date_from, date_to: params?.date_to }),
    })
    return response.data
  },

  async downloadStudentReport(studentId: string, source: 'teacher' | 'institution', params?: DashboardFilterParams, studentName?: string): Promise<DownloadedPdf> {
    const family = source === 'teacher' ? 'teacher' : 'principal'
    const response = await apiClient.get<ArrayBuffer>(`/analytics/${family}-dashboard-lab/student/${studentId}/report-card-pdf`, {
      params: compactParams(params), responseType: 'arraybuffer', timeout: 120000,
    })
    const safeName = (studentName || studentId).trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || studentId
    return { bytes: response.data, filename: `eduraa-${safeName}-report-card.pdf` }
  },
}
