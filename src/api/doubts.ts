import axios from 'axios'
import apiClient from './client'

export type DoubtStatus = 'pending' | 'answered' | 'resolved'

export interface DoubtTeacherOption {
  teacher_id: string
  teacher_name: string
  teacher_email?: string | null
  subject_id?: string | null
  subject_name: string
}

export interface DoubtSummary {
  id: string
  student_id: string
  student_name: string
  teacher_id: string
  teacher_name: string
  subject_id?: string | null
  subject: string
  title: string
  school_id?: string | null
  class_label?: string | null
  status: DoubtStatus
  revision: number
  latest_message_at: string
  created_at: string
  updated_at: string
  last_message?: string | null
}

export interface DoubtMessage {
  id: string
  sender_id: string
  sender_role: 'student' | 'teacher'
  sender_name: string
  body: string
  created_at: string
}

export interface DoubtEvent {
  id: string
  actor_id: string
  actor_role: 'student' | 'teacher'
  actor_name: string
  event_type: 'created' | 'message_added' | 'status_changed'
  from_status?: DoubtStatus | null
  to_status?: DoubtStatus | null
  message_id?: string | null
  created_at: string
}

export interface DoubtDetail {
  doubt: DoubtSummary
  messages: DoubtMessage[]
  history: DoubtEvent[]
}

export interface CreateDoubtInput {
  teacher_id: string
  subject_id?: string | null
  subject: string
  title: string
  description: string
  client_request_id: string
}

type ApiDetail = string | { message?: string; code?: string }

export function doubtErrorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError<{ detail?: ApiDetail }>(error)) return fallback
  const detail = error.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail.message === 'string') return detail.message
  if (!error.response) return 'Eduraa could not connect. Your work is still on this device.'
  return fallback
}

export function doubtErrorCode(error: unknown) {
  if (!axios.isAxiosError<{ detail?: ApiDetail }>(error)) return undefined
  const detail = error.response?.data?.detail
  return typeof detail === 'object' ? detail?.code : undefined
}

export function doubtHttpStatus(error: unknown) {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}

export const doubtsApi = {
  async list() {
    const response = await apiClient.get<{ items: DoubtSummary[] }>('/communication/doubts')
    return response.data.items
  },

  async teacherOptions() {
    const response = await apiClient.get<DoubtTeacherOption[]>('/communication/doubts/teachers')
    return response.data
  },

  async detail(id: string) {
    const response = await apiClient.get<DoubtDetail>(`/communication/doubts/${id}`)
    return response.data
  },

  async create(input: CreateDoubtInput) {
    const response = await apiClient.post<DoubtDetail>('/communication/doubts', input, {
      headers: { 'Idempotency-Key': input.client_request_id },
    })
    return response.data
  },

  async reply(id: string, body: string, expectedRevision: number) {
    const response = await apiClient.post<DoubtDetail>(`/communication/doubts/${id}/messages`, {
      body,
      expected_revision: expectedRevision,
    })
    return response.data
  },

  async resolve(id: string, expectedRevision: number) {
    const response = await apiClient.patch<DoubtDetail>(`/communication/doubts/${id}/resolve`, {
      expected_revision: expectedRevision,
    })
    return response.data
  },
}

