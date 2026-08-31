import apiClient from './client'
import type { Role } from '../types'
import type { ApprovalQueueKey } from '../screens/workspace/approvalsModel'

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

export type ApprovalQueueData = {
  principals: PendingAccount[]
  teachers: PendingAccount[]
  students: PendingAccount[]
  classTeacherRequests: ClassTeacherApproval[]
  teacherProfileUpdates: TeacherProfileApproval[]
}

export const approvalsApi = {
  async getQueue<K extends ApprovalQueueKey>(key: K): Promise<ApprovalQueueData[K]> {
    const paths: Record<ApprovalQueueKey, string> = {
      principals: '/approvals/principals/pending',
      teachers: '/approvals/teachers/pending',
      students: '/approvals/students/pending',
      classTeacherRequests: '/approvals/class-teacher-requests/pending',
      teacherProfileUpdates: '/approvals/teacher-profile-updates/pending',
    }
    const response = await apiClient.get<ApprovalQueueData[K]>(paths[key])
    return response.data
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

  async rejectPrincipal(id: string, reason: string, password: string) { return (await apiClient.post<PendingAccount>(`/approvals/principals/${id}/reject`, { reason, password })).data },
  async rejectTeacher(id: string, reason: string) { return (await apiClient.post<PendingAccount>(`/approvals/teachers/${id}/reject`, { reason })).data },
  async rejectStudent(id: string, reason: string) { return (await apiClient.post<PendingAccount>(`/approvals/students/${id}/reject`, { reason })).data },
  async rejectClassTeacherRequest(id: string, reason: string) { return (await apiClient.post<ClassTeacherApproval>(`/approvals/class-teacher-requests/${id}/reject`, { reason })).data },
  async rejectTeacherProfileUpdate(id: string, reason: string) { return (await apiClient.post<TeacherProfileApproval>(`/approvals/teacher-profile-updates/${id}/reject`, { reason })).data },

}
