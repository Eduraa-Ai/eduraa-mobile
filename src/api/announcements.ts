import apiClient from './client'

export type AnnouncementType = 'announcement' | 'home_work' | 'class_work' | 'exam_time_table'
export type AnnouncementState = 'draft' | 'published' | 'archived'

export interface AnnouncementAttachmentInput {
  file_name: string
  content_type: string
  data_base64: string
}

export interface AnnouncementAttachment {
  id: string
  file_name: string
  content_type: string
  file_size: number
  url: string
}

export interface AnnouncementDraftPayload {
  announcement_type: AnnouncementType
  target_scope: 'all_classes' | 'class'
  class_section_id: string | null
  title: string
  body: string
  attachments: AnnouncementAttachmentInput[]
  publish_state: 'draft' | 'published'
}

export interface Announcement {
  id: string
  teacher_id: string
  teacher_name: string
  announcement_type: AnnouncementType
  target_scope: 'all_classes' | 'class'
  class_section_id: string | null
  class_label: string | null
  title: string
  body: string
  recipient_count: number
  attachments: AnnouncementAttachment[]
  publish_state: AnnouncementState
  published_at: string | null
  archived_at: string | null
  updated_at: string
  created_at: string
  is_read: boolean | null
}

export interface TeacherAnnouncementClass {
  id: string
  standard: string
  division: string
  student_count: number
}

export const announcementsApi = {
  async list() {
    const response = await apiClient.get<{ items: Announcement[] }>('/communication/announcements')
    return response.data.items ?? []
  },
  async get(id: string) {
    const response = await apiClient.get<Announcement>(`/communication/announcements/${encodeURIComponent(id)}`)
    return response.data
  },
  async classes() {
    const response = await apiClient.get<TeacherAnnouncementClass[]>('/communication/teacher/classes')
    return response.data ?? []
  },
  async create(payload: AnnouncementDraftPayload) {
    const response = await apiClient.post<Announcement>('/communication/announcements', payload)
    return response.data
  },
  async update(id: string, payload: Omit<AnnouncementDraftPayload, 'attachments'> & { attachments?: AnnouncementAttachmentInput[] | null }) {
    const response = await apiClient.put<Announcement>(`/communication/announcements/${encodeURIComponent(id)}`, payload)
    return response.data
  },
  async publish(id: string) {
    const response = await apiClient.post<Announcement>(`/communication/announcements/${encodeURIComponent(id)}/publish`)
    return response.data
  },
  async archive(id: string) {
    const response = await apiClient.post<Announcement>(`/communication/announcements/${encodeURIComponent(id)}/archive`)
    return response.data
  },
  async markRead(id: string) {
    const response = await apiClient.post<Announcement>(`/communication/announcements/${encodeURIComponent(id)}/read`)
    return response.data
  },
}

export default announcementsApi
