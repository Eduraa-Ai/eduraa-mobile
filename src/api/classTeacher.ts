import apiClient from './client'

export { toApiFailure } from './errors'
export type { ApiFailure, ApiFailureKind } from './errors'

/**
 * Class teacher management contracts.
 * Mirrors backend/app/schemas/class_management.py + class_teacher.py so the
 * native workspace speaks exactly the same shapes the web page does.
 */

export type SubjectGroupRule = 'choose_one' | 'choose_n'

export interface ClassTeacherProfile {
  opt_in: boolean | null
  standard: string | null
  division: string | null
}

/** The server currently supports pending and approved requests. Keep this
 * open-ended so a future server-side status remains visible rather than being
 * misrepresented by the app. */
export type ClassTeacherRequestStatus = 'pending' | 'approved' | string

export interface AssignmentTeacherOption {
  id: string
  first_name: string
  last_name: string
  email: string
  teacher_id: string
}

export interface ClassTeacherAssignment {
  teacher_id: string
  teacher_name: string
  subject: string
}

export interface ClassTeacherRequest {
  id: string
  status: ClassTeacherRequestStatus
  standard: string
  division: string
  assignments: ClassTeacherAssignment[]
}

export interface ClassTeacherAssignmentInput {
  teacher_id: string
  subject: string
}

/** Mirrors frontend/src/data/classTeacherSubjects.ts in the web app. The
 * backend validates this canonical list; it is not an ad-hoc mobile catalog. */
export const classTeacherAssignmentSubjects = [
  'English Language', 'English Literature', 'Hindi', 'Marathi', 'Sanskrit',
  'Mathematics', 'Algebra', 'Geometry', 'Trigonometry', 'Statistics', 'Physics',
  'Chemistry', 'Biology', 'General Science', 'Environmental Science', 'Social Studies',
  'History', 'Geography', 'Civics', 'Economics', 'Computer Science', 'Information Technology',
  'Coding', 'Robotics', 'Art', 'Music', 'Dance', 'Physical Education', 'Health Education',
  'Moral Science', 'Value Education', 'General Knowledge', 'Life Skills', 'Reading', 'Writing',
  'Grammar', 'Spelling', 'Science Lab', 'Math Lab', 'Library', 'Drawing', 'Craft', 'Drama',
  'Public Speaking', 'Debate', 'French', 'German', 'Spanish', 'Sports', 'Yoga',
] as const

export interface ClassSection {
  id: string
  standard: string
  division: string
}

export interface RosterStudent {
  id: string
  student_id: string
  first_name: string
  last_name: string
  standard: string
  division?: string | null
}

export interface Semester {
  id: string
  name: string
  start_date?: string | null
  end_date?: string | null
}

export interface SubjectOption {
  id: string
  school_id: string
  name: string
  code?: string | null
  description?: string | null
}

export interface SubjectGroup {
  id: string
  name: string
  rule: SubjectGroupRule
  required_count: number
}

export interface ClassSemesterSubject {
  subject_id: string
  subject_name: string
  is_mandatory: boolean
  group_id?: string | null
}

export interface ClassSemesterConfig {
  expected_subject_count: number
  groups: SubjectGroup[]
  subjects: ClassSemesterSubject[]
}

export interface SubjectGroupConfigInput {
  name: string
  rule: SubjectGroupRule
  required_count: number
}

export interface ClassSemesterSubjectInput {
  subject_id: string
  is_mandatory: boolean
  /** The backend links a subject to a group by group name, not id. */
  group_name?: string | null
}

export interface ClassSemesterConfigInput {
  expected_subject_count: number
  groups: SubjectGroupConfigInput[]
  subjects: ClassSemesterSubjectInput[]
}

export interface SubjectEnrollmentStudent {
  id: string
  student_id: string
  first_name: string
  last_name: string
  division?: string | null
  enrolled: boolean
}

export interface SubjectEnrollment {
  subject_id: string
  students: SubjectEnrollmentStudent[]
}

export interface ValidationIssue {
  student_id: string
  student_name: string
  missing_mandatory: string[]
  group_issues: string[]
  total_subjects: number
  expected_subjects: number
}

export interface ClassValidationReport {
  expected_subject_count: number
  total_students: number
  assigned_students: number
  unassigned_students: number
  issues: ValidationIssue[]
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const classTeacherApi = {
  async getAssignmentTeachers() {
    const response = await apiClient.get<AssignmentTeacherOption[]>('/class-teacher/teachers')
    return response.data
  },

  async getMyRequests() {
    const response = await apiClient.get<ClassTeacherRequest[]>('/class-teacher/requests/me')
    return response.data
  },

  async createRequest(assignments: ClassTeacherAssignmentInput[]) {
    const response = await apiClient.post<ClassTeacherRequest>('/class-teacher/requests', { assignments })
    return response.data
  },

  async getMyClasses() {
    const response = await apiClient.get<ClassSection[]>('/class-teacher/classes/me')
    return response.data
  },

  async getRoster(standard?: string) {
    const response = await apiClient.get<RosterStudent[]>('/class-teacher/roster', {
      params: standard ? { standard } : undefined,
    })
    return response.data
  },

  async getStandardDivisions(standard: string) {
    const response = await apiClient.get<string[]>('/class-teacher/standard-divisions', { params: { standard } })
    return response.data
  },

  /** Returns the canonical roster rows for the standard after the write. */
  async assignDivision(input: { standard: string; division: string; student_ids: string[] }) {
    const response = await apiClient.post<RosterStudent[]>('/class-teacher/roster/assign-division', input)
    return response.data
  },

  async getSemesters() {
    const response = await apiClient.get<Semester[]>('/class-teacher/semesters')
    return response.data
  },

  async getSubjects() {
    const response = await apiClient.get<SubjectOption[]>('/subjects')
    return response.data
  },

  async getSemesterConfig(classSectionId: string, semesterId?: string | null) {
    const response = await apiClient.get<ClassSemesterConfig>(`/class-teacher/classes/${classSectionId}/semester-config`, {
      params: semesterId ? { semester_id: semesterId } : undefined,
    })
    return response.data
  },

  async updateSemesterConfig(classSectionId: string, semesterId: string | null | undefined, payload: ClassSemesterConfigInput) {
    const response = await apiClient.put<ClassSemesterConfig>(
      `/class-teacher/classes/${classSectionId}/semester-config`,
      payload,
      { params: semesterId ? { semester_id: semesterId } : undefined },
    )
    return response.data
  },

  async getSubjectEnrollments(classSectionId: string, subjectId: string, semesterId?: string | null) {
    const response = await apiClient.get<SubjectEnrollment>(
      `/class-teacher/classes/${classSectionId}/subjects/${subjectId}/enrollments`,
      { params: semesterId ? { semester_id: semesterId } : undefined },
    )
    return response.data
  },

  async updateSubjectEnrollments(
    classSectionId: string,
    subjectId: string,
    semesterId: string | null | undefined,
    payload: { student_ids: string[]; select_all?: boolean },
  ) {
    const response = await apiClient.put<SubjectEnrollment>(
      `/class-teacher/classes/${classSectionId}/subjects/${subjectId}/enrollments`,
      payload,
      { params: semesterId ? { semester_id: semesterId } : undefined },
    )
    return response.data
  },

  async getValidation(classSectionId: string, semesterId?: string | null) {
    const response = await apiClient.get<ClassValidationReport>(`/class-teacher/classes/${classSectionId}/validation`, {
      params: semesterId ? { semester_id: semesterId } : undefined,
    })
    return response.data
  },
}
