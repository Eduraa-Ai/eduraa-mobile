import apiClient from './client'
import type { TeacherProfileApprovalPayload } from '../screens/profile/b2bProfileModel'

export interface StudentProfileCore {
  student_id: string
  first_name: string
  last_name: string
  email: string
  school_name?: string | null
  branch_name?: string | null
  board: string
  standard: string
  division?: string | null
}

export interface StudentProfileSubject {
  subject_name: string
}

export interface StudentTeacherSubjectMapping {
  subject_name: string
  teacher_id: string
  teacher_code?: string | null
  teacher_name: string
  teacher_email?: string | null
  is_class_teacher: boolean
}

export interface StudentProfileDocument {
  document_id: string
  title: string
  file_name: string
  subject_name?: string | null
  board?: string | null
  standard?: string | null
  page_count?: number | null
  processing_status: string
}

export interface StudentMasterProfile {
  profile: StudentProfileCore
  class_teacher_name?: string | null
  assignment_status?: string | null
  subjects: StudentProfileSubject[]
  teacher_subject_mappings: StudentTeacherSubjectMapping[]
  documents: StudentProfileDocument[]
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

export interface TeacherProfileUpdateRequest {
  id: string
  teacher_id: string
  status: string
  created_at: string
  updated_at: string
  requested_profile: TeacherProfileSnapshot
}

export interface TeacherProfileCore extends TeacherProfileSnapshot {
  school_id?: string | null
  class_teacher_opt_in?: boolean | null
  class_teacher_standard?: string | null
  class_teacher_division?: string | null
  is_approved: boolean
  is_active: boolean
}

export interface TeacherSubjectMapping {
  subject_name: string
  standard: string
  division: string
  assignment_type: string
}

export interface TeacherProfileSubjectOption {
  id: string
  name: string
}

export interface TeacherMasterProfile {
  profile: TeacherProfileCore
  assignment_status?: string | null
  subject_mappings: TeacherSubjectMapping[]
  pending_update_request?: TeacherProfileUpdateRequest | null
}

export interface PrincipalProfile {
  profile: {
    first_name: string
    last_name: string
    school_name?: string | null
    branch_name?: string | null
    role: string
  }
  filters: {
    standards: string[]
    divisions: string[]
    subjects: Array<{ id?: string | null; name: string; code?: string | null }>
  }
  summary: {
    total_teachers: number
    active_teachers: number
    total_students: number
    active_students: number
  }
}

export const b2bProfileApi = {
  getStudentProfile: async (): Promise<StudentMasterProfile> => {
    const response = await apiClient.get<StudentMasterProfile>('/roster/student/master-profile')
    const data = response.data
    return {
      profile: {
        student_id: data.profile.student_id,
        first_name: data.profile.first_name,
        last_name: data.profile.last_name,
        email: data.profile.email,
        school_name: data.profile.school_name,
        branch_name: data.profile.branch_name,
        board: data.profile.board,
        standard: data.profile.standard,
        division: data.profile.division,
      },
      class_teacher_name: data.class_teacher_name,
      assignment_status: data.assignment_status,
      subjects: (data.subjects ?? []).map((subject) => ({
        subject_name: subject.subject_name,
      })),
      teacher_subject_mappings: (data.teacher_subject_mappings ?? []).map((mapping) => ({
        subject_name: mapping.subject_name,
        teacher_id: mapping.teacher_id,
        teacher_code: mapping.teacher_code,
        teacher_name: mapping.teacher_name,
        teacher_email: mapping.teacher_email,
        is_class_teacher: mapping.is_class_teacher,
      })),
      documents: (data.documents ?? []).map((document) => ({
        document_id: document.document_id,
        title: document.title,
        file_name: document.file_name,
        subject_name: document.subject_name,
        board: document.board,
        standard: document.standard,
        page_count: document.page_count,
        processing_status: document.processing_status,
      })),
    }
  },

  getTeacherProfile: async (): Promise<TeacherMasterProfile> => {
    const response = await apiClient.get<TeacherMasterProfile>('/roster/teacher/master-profile')
    const data = response.data
    return {
      profile: {
        first_name: data.profile.first_name,
        last_name: data.profile.last_name,
        email: data.profile.email,
        teacher_id: data.profile.teacher_id,
        school_id: data.profile.school_id,
        school_name: data.profile.school_name,
        branch_id: data.profile.branch_id,
        branch_name: data.profile.branch_name,
        board: data.profile.board,
        standards_taught: data.profile.standards_taught ?? [],
        divisions_taught: data.profile.divisions_taught ?? [],
        subjects_taught: data.profile.subjects_taught ?? [],
        class_teacher_opt_in: data.profile.class_teacher_opt_in,
        class_teacher_standard: data.profile.class_teacher_standard,
        class_teacher_division: data.profile.class_teacher_division,
        is_approved: data.profile.is_approved,
        is_active: data.profile.is_active,
      },
      assignment_status: data.assignment_status,
      subject_mappings: (data.subject_mappings ?? []).map((mapping) => ({
        subject_name: mapping.subject_name,
        standard: mapping.standard,
        division: mapping.division,
        assignment_type: mapping.assignment_type,
      })),
      pending_update_request: data.pending_update_request,
    }
  },

  submitTeacherProfileUpdate: async (
    payload: TeacherProfileApprovalPayload,
  ): Promise<TeacherProfileUpdateRequest> => {
    const response = await apiClient.post<TeacherProfileUpdateRequest>(
      '/roster/teacher/profile-update-request',
      payload,
    )
    return response.data
  },

  listTeacherProfileSubjects: async (): Promise<TeacherProfileSubjectOption[]> => {
    const response = await apiClient.get<TeacherProfileSubjectOption[]>('/subjects')
    return (response.data ?? []).map((subject) => ({ id: subject.id, name: subject.name }))
  },

  getPrincipalProfile: async (): Promise<PrincipalProfile> => {
    const response = await apiClient.get<PrincipalProfile>('/analytics/principal-dashboard-lab')
    const data = response.data
    return {
      profile: data.profile,
      filters: data.filters,
      summary: data.summary,
    }
  },
}
