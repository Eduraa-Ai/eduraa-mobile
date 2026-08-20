import apiClient, { API_BASE_URL } from './client'
import type { DownloadedPdf } from '../utils/pdfDownload'
import { resolveSchoolQuestionPaperFileUrl } from '../utils/protectedDocumentModel'

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
  subjects?: string[]
  chapter_id?: string | null
  chapter_ids?: string[]
  timer_enabled?: boolean
  duration_minutes?: number | null
  attempt_action?: 'auto' | 'new'
}

export interface StartPreviousPaperExamResponse {
  paper_id: string
  question_count: number
  redirect_path: string
  title: string
  reused_existing: boolean
}

export interface SchoolPreviousPaper {
  id: string
  title: string
  description?: string | null
  original_filename: string
  content_type: string
  file_size_bytes: number
  subject_id?: string | null
  subject_label?: string | null
  target_scope: 'all_classes' | 'class' | string
  class_section_id?: string | null
  class_label?: string | null
  standard?: string | null
  division?: string | null
  status: 'published' | 'archived' | string
  uploaded_by_teacher_id: string
  teacher_name: string
  view_url: string
  download_url: string
  published_at?: string | null
  archived_at?: string | null
  created_at: string
  updated_at: string
}

export interface SchoolPreviousPaperListResponse {
  items: SchoolPreviousPaper[]
  total: number
  page: number
  page_size: number
}

export interface StudentSchoolPreviousPaperFilters {
  subject_id?: string
  search?: string
  page?: number
  page_size?: number
}

function downloadFilename(contentDisposition: unknown, fallback: string) {
  if (typeof contentDisposition !== 'string') return fallback
  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded)
    } catch {
      return encoded
    }
  }
  return contentDisposition.match(/filename="?([^";]+)"?/i)?.[1] || fallback
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

  async getChapters(params: { paper_id?: string; subject?: string }, signal?: AbortSignal) {
    const response = await apiClient.get<PreviousChapter[]>('/previous-papers/chapters', { params, signal })
    return response.data
  },

  async getQuestions(params: { paper_id?: string; subject?: string; chapter_id?: string }, signal?: AbortSignal) {
    const response = await apiClient.get<PreviousQuestion[]>('/previous-papers/questions', { params, signal })
    return response.data
  },

  async startExam(paperId: string, payload: StartPreviousPaperExamRequest) {
    const response = await apiClient.post<StartPreviousPaperExamResponse>(`/previous-papers/${paperId}/start-exam`, payload)
    return response.data
  },

  async getStudentSchoolPapers(
    filters: StudentSchoolPreviousPaperFilters = {},
  ): Promise<SchoolPreviousPaperListResponse> {
    const response = await apiClient.get<SchoolPreviousPaperListResponse>(
      '/question-papers/student',
      {
        params: {
          subject_id: filters.subject_id || undefined,
          search: filters.search?.trim() || undefined,
          page: filters.page ?? 1,
          page_size: filters.page_size ?? 100,
        },
      },
    )
    return response.data
  },

  async getTeacherSchoolPapers(): Promise<SchoolPreviousPaperListResponse> {
    const response = await apiClient.get<SchoolPreviousPaperListResponse>(
      '/question-papers/teacher',
    )
    return response.data
  },

  async downloadSchoolPaper(
    url: string,
    fallbackFilename: string,
  ): Promise<DownloadedPdf> {
    const response = await apiClient.get<ArrayBuffer>(resolveSchoolQuestionPaperFileUrl(url, API_BASE_URL), {
      responseType: 'arraybuffer',
      timeout: 120000,
    })
    return {
      bytes: response.data,
      filename: downloadFilename(
        response.headers['content-disposition'],
        fallbackFilename,
      ),
    }
  },
}
