import apiClient from './client'
import type { PaperOptions } from '../types'

export type CompetitiveStandard = '11th' | '12th'
export type StudyPackKey = 'formula_sheet' | 'hacks' | 'real_life' | 'revision_notes'

export interface CompetitiveChapterOption {
  id: string
  title: string
  index?: number | null
  document_title?: string | null
  syllabus_node_id?: string | null
}

export interface StudyPackItem {
  title: string
  detail: string
}

export interface CompetitiveWorkspacePayload {
  summary: string
  formula_sheet: StudyPackItem[]
  hacks: StudyPackItem[]
  real_life: StudyPackItem[]
  revision_notes: StudyPackItem[]
  memory_tips: string[]
  diagram_kind: string | null
  text_diagram: string | null
  source: string
  generated_at: string
}

export interface CompetitiveWorkspaceRequest {
  subject_name: string
  chapter_key: string
  chapter_title: string
  standard: CompetitiveStandard
  track_label: string
  subject_id?: string | null
  chapter_id?: string | null
  force_refresh?: boolean
}

export interface CompetitivePracticeRequest {
  subject_id: string
  chapter_id: string
  chapter_title: string
  course?: string
  standard: CompetitiveStandard
  additional_instructions?: string
}

export interface CompetitivePracticeResponse {
  id?: string
  paper_id?: string
}

export const competitiveExamApi = {
  getOptions: async (): Promise<PaperOptions> => {
    const response = await apiClient.get<PaperOptions>('/papers/options')
    return response.data
  },

  getChapters: async (params: {
    subject_id: string
    board?: string
    standard?: string
    indexed_only?: boolean
  }): Promise<CompetitiveChapterOption[]> => {
    const response = await apiClient.get<CompetitiveChapterOption[]>('/chapters', { params })
    return response.data
  },

  getWorkspace: async (payload: CompetitiveWorkspaceRequest): Promise<CompetitiveWorkspacePayload> => {
    const response = await apiClient.post<CompetitiveWorkspacePayload>('/competitive-exam/workspace', payload)
    return response.data
  },

  startMcqPractice: async (payload: CompetitivePracticeRequest): Promise<CompetitivePracticeResponse> => {
    const response = await apiClient.post<CompetitivePracticeResponse>('/papers/generate', {
      subject_id: payload.subject_id,
      chapter_ids: [payload.chapter_id],
      difficulty: 'medium',
      title_line_1: `${payload.chapter_title} MCQ Practice`,
      course: payload.course,
      standard: payload.standard,
      division: 'Individual',
      mcq_count: 10,
      marks_per_mcq: 1,
      short_answer_count: 0,
      long_answer_count: 0,
      fill_blank_count: 0,
      match_columns_count: 0,
      true_false_count: 0,
      duration_minutes: 20,
      timer_value: 20,
      timer_unit: 'minutes',
      additional_instructions: payload.additional_instructions || `Use random textbook MCQs from ${payload.chapter_title}.`,
    })
    return response.data
  },
}
