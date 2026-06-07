import apiClient, { API_BASE_URL } from './client'

export interface CheatSheetContentItem {
  title: string
  detail: string
  page_start?: number | null
  page_end?: number | null
}

export interface CheatSheetTopicSections {
  definitions: CheatSheetContentItem[]
  must_know_concepts: CheatSheetContentItem[]
  formulas: CheatSheetContentItem[]
  process_steps: CheatSheetContentItem[]
  mini_examples: CheatSheetContentItem[]
  common_mistakes: CheatSheetContentItem[]
  memory_tips: CheatSheetContentItem[]
  last_minute_revision: CheatSheetContentItem[]
}

export interface CheatSheetPayloadTopic {
  topic_id?: string | null
  topic_name: string
  topic_order: number
  subtopic_names: string[]
  sections: CheatSheetTopicSections
}

export interface CheatSheetPayloadChapter {
  chapter_id: string
  chapter_title: string
  chapter_order: number
  book_id: string
  book_title: string
  topics: CheatSheetPayloadTopic[]
}

export interface CheatSheetPayload {
  title: string
  scope_summary: string
  chapters: CheatSheetPayloadChapter[]
  source_scope: Record<string, unknown>
}

export interface CheatSheet {
  id: string
  owner_id: string
  owner_role: string
  subject_id?: string | null
  exam_id?: string | null
  paper_id?: string | null
  title: string
  status: string
  payload: CheatSheetPayload
  source_meta: Record<string, unknown>
  pdf_url?: string | null
  pdf_generated_at?: string | null
  published_at?: string | null
  created_at: string
  updated_at: string
}

export interface CheatSheetList {
  items: CheatSheet[]
  total: number
}

export function resolveCheatSheetPdfUrl(sheetId: string) {
  return `${API_BASE_URL}/api/v1/cheat-sheets/${sheetId}/pdf`
}

export const cheatSheetsApi = {
  async list(status?: string) {
    const response = await apiClient.get<CheatSheetList>('/cheat-sheets', { params: { status } })
    return response.data
  },
}
