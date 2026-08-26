import apiClient from './client'

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'excused'
export type AttendanceSheetStatus = 'draft' | 'submitted' | 'reopened' | 'locked'
export type AttendanceCorrectionStatus = 'pending' | 'approved' | 'rejected'

export interface AttendanceSheetSummary {
  total_students: number
  present_count: number
  absent_count: number
  late_count: number
  half_day_count: number
  excused_count: number
  scheduled_count: number
}

export interface AttendanceRecord {
  id: string
  student_id: string
  student_name: string
  student_code: string
  standard: string
  division?: string | null
  status: AttendanceStatus
  note?: string | null
  is_override: boolean
  updated_by_user_id?: string | null
  updated_by_role?: string | null
  updated_at: string
}

export interface AttendanceSheet {
  id: string
  school_id: string
  branch_id: string
  class_section_id: string
  attendance_date: string
  standard: string
  division: string
  status: AttendanceSheetStatus
  marked_by_teacher_id?: string | null
  submitted_at?: string | null
  reopened_at?: string | null
  reopened_reason?: string | null
  locked_at?: string | null
  class_note?: string | null
  revision: number
  records: AttendanceRecord[]
  summary: AttendanceSheetSummary
}

export interface TeacherAttendanceHome {
  class_section_id: string
  attendance_date: string
  sheet: AttendanceSheet
}

export interface TeacherAttendanceClass {
  class_section_id: string
  standard: string
  division: string
}

export interface TeacherAttendanceSummary {
  attendance_date: string
  class_section_id?: string | null
  standard?: string | null
  division?: string | null
  status?: AttendanceSheetStatus | null
  total_students: number
  present_count: number
  absent_count: number
  late_count: number
  half_day_count: number
  excused_count: number
}

export interface LeadershipPendingClass {
  class_section_id: string
  standard: string
  division: string
  class_teacher_name?: string | null
  class_teacher_id?: string | null
  student_count: number
  status?: AttendanceSheetStatus | null
  submitted_at?: string | null
}

export interface LeadershipAttendanceSummary {
  attendance_date: string
  total_classes: number
  submitted_classes: number
  pending_classes: number
  total_students: number
  present_count: number
  absent_count: number
  late_count: number
  half_day_count: number
  excused_count: number
  reopened_sheets: number
  classes: LeadershipPendingClass[]
  pending: LeadershipPendingClass[]
}

export interface StudentAttendanceHistoryRow {
  attendance_date: string
  record_id: string
  status: AttendanceStatus
  note?: string | null
  class_note?: string | null
  standard: string
  division?: string | null
}

export interface StudentAttendanceSummary {
  month: string
  attendance_percent: number
  present_equivalent: number
  scheduled_count: number
  absent_count: number
  excused_count: number
  latest_status?: AttendanceStatus | null
  history: StudentAttendanceHistoryRow[]
}

export interface AttendanceCorrectionRequest {
  id: string
  sheet_id: string
  record_id?: string | null
  student_id?: string | null
  requested_by_user_id?: string | null
  requested_by_role?: string | null
  reason: string
  status: AttendanceCorrectionStatus
  resolved_by_user_id?: string | null
  resolved_by_role?: string | null
  resolved_at?: string | null
  resolution_note?: string | null
}

export interface AttendanceRecordUpdate {
  record_id: string
  status: AttendanceStatus
  note?: string | null
}

export const attendanceApi = {
  async getTeacherClasses() {
    const response = await apiClient.get<TeacherAttendanceClass[]>('/attendance/teacher/classes')
    return response.data
  },

  async getTeacherToday(attendanceDate?: string, classSectionId?: string | null) {
    const response = await apiClient.get<TeacherAttendanceHome>('/attendance/teacher/today', {
      params: {
        ...(attendanceDate ? { attendance_date: attendanceDate } : {}),
        ...(classSectionId ? { class_section_id: classSectionId } : {}),
      },
    })
    return response.data
  },

  async getTeacherSummary(attendanceDate?: string, classSectionId?: string | null) {
    const response = await apiClient.get<TeacherAttendanceSummary>('/attendance/dashboard/teacher-summary', {
      params: {
        ...(attendanceDate ? { attendance_date: attendanceDate } : {}),
        ...(classSectionId ? { class_section_id: classSectionId } : {}),
      },
    })
    return response.data
  },

  async getLeadershipSummary(attendanceDate?: string) {
    const response = await apiClient.get<LeadershipAttendanceSummary>('/attendance/dashboard/leadership', {
      params: attendanceDate ? { attendance_date: attendanceDate } : undefined,
    })
    return response.data
  },

  async getSheet(classSectionId: string, attendanceDate: string) {
    const response = await apiClient.get<AttendanceSheet>(`/attendance/classes/${classSectionId}/sheet`, {
      params: { attendance_date: attendanceDate },
    })
    return response.data
  },

  async getStudentSummary() {
    const response = await apiClient.get<StudentAttendanceSummary>('/attendance/students/me/summary')
    return response.data
  },

  async getCorrections() {
    const response = await apiClient.get<AttendanceCorrectionRequest[]>('/attendance/corrections')
    return response.data
  },

  async updateRecords(sheetId: string, expectedRevision: number, records: AttendanceRecordUpdate[], classNote?: string | null) {
    const response = await apiClient.patch<AttendanceSheet>(`/attendance/sheets/${sheetId}/records`, {
      class_note: classNote,
      expected_revision: expectedRevision,
      records,
    })
    return response.data
  },

  async markAllPresent(sheetId: string, expectedRevision: number) {
    const response = await apiClient.post<AttendanceSheet>(`/attendance/sheets/${sheetId}/mark-all-present`, {
      expected_revision: expectedRevision,
    })
    return response.data
  },

  async submitSheet(sheetId: string, expectedRevision: number, classNote?: string | null, records: AttendanceRecordUpdate[] = []) {
    const response = await apiClient.post<AttendanceSheet>(`/attendance/sheets/${sheetId}/submit`, {
      class_note: classNote,
      expected_revision: expectedRevision,
      records,
    })
    return response.data
  },

  async reopenSheet(sheetId: string, reason: string) {
    const response = await apiClient.post<AttendanceSheet>(`/attendance/sheets/${sheetId}/reopen`, { reason })
    return response.data
  },

  async overrideRecord(recordId: string, status: AttendanceStatus, reason: string, note?: string | null) {
    const response = await apiClient.post<AttendanceSheet>(`/attendance/records/${recordId}/override`, {
      status,
      reason,
      note: note?.trim() || null,
    })
    return response.data
  },

  async createCorrection(recordId: string, reason: string) {
    const response = await apiClient.post<AttendanceCorrectionRequest>('/attendance/corrections', {
      record_id: recordId,
      reason,
    })
    return response.data
  },

  async resolveCorrection(requestId: string, status: AttendanceCorrectionStatus, resolutionNote: string) {
    const response = await apiClient.post<AttendanceCorrectionRequest>(`/attendance/corrections/${requestId}/resolve`, {
      status,
      resolution_note: resolutionNote,
    })
    return response.data
  },
}
