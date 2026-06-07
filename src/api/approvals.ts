import apiClient from './client'
import type { Role } from '../types'

export interface PendingAccount {
  id: string
  display_name: string
  identifier: string
  role: Role
  is_active?: boolean
  created_at?: string
  updated_at?: string
  class_teacher_opt_in?: boolean | null
  class_teacher_standard?: string | null
  class_teacher_division?: string | null
  standards_taught?: string[] | null
  divisions_taught?: string[] | null
  subjects_taught?: string[] | null
}

export interface ClassTeacherAssignment {
  teacher_id: string
  teacher_name: string
  subject: string
}

export interface ClassTeacherApproval {
  id: string
  class_teacher_name: string
  standard: string
  division: string
  assignments: ClassTeacherAssignment[]
}

export interface TeacherProfileSnapshot {
  first_name: string
  last_name: string
  email: string
  teacher_id: string
  school_name?: string | null
  branch_id?: string | null
  branch_name?: string | null
  board: string
  standards_taught: string[]
  divisions_taught: string[]
  subjects_taught: string[]
}

export interface TeacherProfileApproval {
  id: string
  teacher_uuid: string
  teacher_name: string
  submitted_at: string
  current_profile: TeacherProfileSnapshot
  requested_profile: TeacherProfileSnapshot
}

export interface ApprovalQueues {
  principals: PendingAccount[]
  teachers: PendingAccount[]
  students: PendingAccount[]
  classTeacherRequests: ClassTeacherApproval[]
  teacherProfileUpdates: TeacherProfileApproval[]
  errors: Partial<Record<keyof Omit<ApprovalQueues, 'errors'>, string>>
}

async function safeList<T>(path: string): Promise<{ data: T[]; error?: string }> {
  try {
    const response = await apiClient.get<T[]>(path)
    return { data: response.data }
  } catch (error) {
    const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
    return { data: [], error: detail || 'Unable to load this approval queue.' }
  }
}

export const approvalsApi = {
  async getQueues(): Promise<ApprovalQueues> {
    const [principals, teachers, students, classTeacherRequests, teacherProfileUpdates] = await Promise.all([
      safeList<PendingAccount>('/approvals/principals/pending'),
      safeList<PendingAccount>('/approvals/teachers/pending'),
      safeList<PendingAccount>('/approvals/students/pending'),
      safeList<ClassTeacherApproval>('/approvals/class-teacher-requests/pending'),
      safeList<TeacherProfileApproval>('/approvals/teacher-profile-updates/pending'),
    ])

    return {
      principals: principals.data,
      teachers: teachers.data,
      students: students.data,
      classTeacherRequests: classTeacherRequests.data,
      teacherProfileUpdates: teacherProfileUpdates.data,
      errors: {
        principals: principals.error,
        teachers: teachers.error,
        students: students.error,
        classTeacherRequests: classTeacherRequests.error,
        teacherProfileUpdates: teacherProfileUpdates.error,
      },
    }
  },

  async approvePrincipal(id: string, password: string) {
    const response = await apiClient.post<PendingAccount>(`/approvals/principals/${id}/approve`, { password })
    return response.data
  },

  async approveTeacher(id: string) {
    const response = await apiClient.post<PendingAccount>(`/approvals/teachers/${id}/approve`)
    return response.data
  },

  async approveStudent(id: string) {
    const response = await apiClient.post<PendingAccount>(`/approvals/students/${id}/approve`)
    return response.data
  },

  async approveClassTeacherRequest(id: string) {
    const response = await apiClient.post<ClassTeacherApproval>(`/approvals/class-teacher-requests/${id}/approve`)
    return response.data
  },

  async approveTeacherProfileUpdate(id: string) {
    const response = await apiClient.post<TeacherProfileApproval>(`/approvals/teacher-profile-updates/${id}/approve`)
    return response.data
  },
}
