import apiClient from './client'
import type { Exam, PaperListItem, StudentExamRead, Subject } from '../types'

export interface ExamPayload {
  name: string
  subject_id?: string | null
  standard?: string | null
  division?: string | null
  semester?: string | null
  category?: string | null
  exam_date?: string | null
  duration_minutes?: number | null
  auto_grade_enabled: boolean
  results_published: boolean
  teacher_id?: string | null
  paper_ids: string[]
}

export interface TeacherOption {
  id: string
  first_name: string
  last_name: string
  email: string
  teacher_id: string
  standards_taught: string[]
  divisions_taught: string[]
  subjects_taught: string[]
  is_approved: boolean
  is_active: boolean
  school_name?: string | null
}

export interface PaperGenerateOptions {
  standards: string[]
  divisions: string[]
}

async function safeList<T>(path: string): Promise<T[]> {
  try {
    const response = await apiClient.get<T[]>(path)
    return response.data
  } catch {
    return []
  }
}

export const examsApi = {
  async listStaffExams() {
    const response = await apiClient.get<Exam[]>('/exams')
    return response.data
  },

  async listStudentExams() {
    const response = await apiClient.get<StudentExamRead[]>('/exams/student')
    return response.data
  },

  async listSubjects() {
    const response = await apiClient.get<Subject[]>('/subjects')
    return response.data
  },

  async listPublishedPapers() {
    const response = await apiClient.get<{ items: PaperListItem[] }>('/papers', {
      params: { status: 'published', limit: 200 },
    })
    return response.data.items ?? []
  },

  async listPracticePapers() {
    const response = await apiClient.get<{ items: PaperListItem[] }>('/papers', {
      params: { scope: 'mine', limit: 200 },
    })
    return response.data.items ?? []
  },

  async deletePracticePaper(paperId: string) {
    await apiClient.delete(`/papers/${paperId}`)
  },

  async getPaperOptions() {
    const response = await apiClient.get<PaperGenerateOptions>('/papers/options')
    return response.data
  },

  async listTeachers() {
    return safeList<TeacherOption>('/admin/teachers')
  },

  async create(payload: ExamPayload) {
    const response = await apiClient.post<Exam>('/exams', payload)
    return response.data
  },

  async update(examId: string, payload: ExamPayload) {
    const response = await apiClient.patch<Exam>(`/exams/${examId}`, payload)
    return response.data
  },

  async deleteExam(examId: string) {
    await apiClient.delete(`/exams/${examId}`)
  },
}
