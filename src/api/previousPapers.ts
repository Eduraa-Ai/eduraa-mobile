import apiClient, { API_BASE_URL } from './client'

export interface PreviousPaper {
  id: string
  title: string
  exam_family: 'jee_main' | 'jee_advanced'
  exam: string
  year?: number | null
  session_label?: string | null
  shift_label?: string | null
  paper_label?: string | null
  question_count: number
  subjects: string[]
  has_solutions: boolean
}

export interface PreviousQuestionOption {
  id?: string
  label?: string
  value?: string
  text?: string
}

export interface PreviousQuestion {
  id: string
  previous_paper_id: string
  question_number: number
  subject?: string | null
  branch?: string | null
  chapter_id?: string | null
  chapter_title?: string | null
  topic_slug?: string | null
  question_text: string
  options?: PreviousQuestionOption[] | null
  answer_key?: string | null
  solution_text?: string | null
  question_figure_urls: string[]
  solution_figure_urls: string[]
  question_type: string
  exam_session: string
}

export interface PreviousChapter {
  previous_paper_id: string
  subject?: string | null
  branch?: string | null
  chapter_id?: string | null
  chapter_title: string
  topic_slug?: string | null
  question_count: number
}

export interface StartPreviousPaperExamRequest {
  mode: 'paper' | 'subject' | 'chapter'
  subject?: string | null
  chapter_id?: string | null
  attempt_action?: 'auto' | 'new'
}

export interface StartPreviousPaperExamResponse {
  paper_id: string
  question_count: number
  redirect_path: string
  title: string
  reused_existing: boolean
}

export function resolvePreviousPaperAssetUrl(url?: string | null) {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`
}

export const previousPapersApi = {
  async getPublished() {
    const response = await apiClient.get<PreviousPaper[]>('/previous-papers/published')
    return response.data
  },

  async getChapters(params: { paper_id?: string; subject?: string }) {
    const response = await apiClient.get<PreviousChapter[]>('/previous-papers/chapters', { params })
    return response.data
  },

  async getQuestions(params: { paper_id?: string; subject?: string; chapter_id?: string }) {
    const response = await apiClient.get<PreviousQuestion[]>('/previous-papers/questions', { params })
    return response.data
  },

  async startExam(paperId: string, payload: StartPreviousPaperExamRequest) {
    const response = await apiClient.post<StartPreviousPaperExamResponse>(`/previous-papers/${paperId}/start-exam`, payload)
    return response.data
  },
}
