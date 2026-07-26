/**
 * Eduraa Mobile — Papers API
 */

import apiClient from './client'
import type { DownloadedPdf } from '../utils/pdfDownload'
import type {
  Paper,
  PaperListItem,
  PaperGenerateRequest,
  PaperSubmissionCreate,
  PaperSubmissionRead,
  PaperAttemptsResponse,
  PaperOptions,
  PaginatedResponse,
  Chapter,
} from '../types'

type JeeSyllabusResponse = {
  chapters?: Array<{
    key: string
    title: string
    standard?: string | null
    subtopics?: string[]
  }>
}

type JeeGenerateFormPaperResponse = {
  paper_id: string | null
  draft_id: string
  job_id: string
  status: string
  failed_count?: number
  error?: string | null
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

export const papersApi = {
  getOptions: async (): Promise<PaperOptions> => {
    const response = await apiClient.get<PaperOptions>('/papers/options')
    return response.data
  },

  /** Chapters are fetched separately per subject — GET /chapters?subject_id=... */
  getChapters: async (subjectId: string): Promise<Chapter[]> => {
    const response = await apiClient.get<Chapter[]>('/chapters', {
      params: { subject_id: subjectId },
    })
    return response.data
  },

  generate: async (data: PaperGenerateRequest): Promise<Paper> => {
    const response = await apiClient.post<Paper>('/papers/generate', data)
    return response.data
  },

  getJeeSyllabus: async (params: { exam_type: string; subject: string }): Promise<JeeSyllabusResponse> => {
    const response = await apiClient.get<JeeSyllabusResponse>('/ai/jee/syllabus', { params })
    return response.data
  },

  generateJeeFormPaper: async (data: {
    exam_type: string
    subject: string
    chapter_keys: string[]
    count: number
    question_marks: number
    subtopic?: string
    title: string
  }): Promise<JeeGenerateFormPaperResponse> => {
    const response = await apiClient.post<JeeGenerateFormPaperResponse>('/ai/jee/generate-form-paper', data, { timeout: 240000 })
    return response.data
  },

  // Backend uses skip/limit (not page/size)
  list: async (params?: {
    skip?: number
    limit?: number
    subject_id?: string
    status?: string
    scope?: 'mine'
  }): Promise<PaginatedResponse<PaperListItem>> => {
    const response = await apiClient.get<PaginatedResponse<PaperListItem>>('/papers', { params })
    return response.data
  },

  getById: async (paperId: string): Promise<Paper> => {
    const response = await apiClient.get<Paper>(`/papers/${paperId}`)
    return response.data
  },

  submit: async (paperId: string, data: PaperSubmissionCreate): Promise<PaperSubmissionRead> => {
    const response = await apiClient.post<PaperSubmissionRead>(`/papers/${paperId}/submit`, data)
    return response.data
  },

  createAttempt: async (paperId: string, data?: { exam_id?: string; reason?: string }): Promise<PaperSubmissionRead> => {
    const response = await apiClient.post<PaperSubmissionRead>(`/papers/${paperId}/attempts`, data)
    return response.data
  },

  listAttempts: async (paperId: string, params?: { exam_id?: string }): Promise<PaperAttemptsResponse> => {
    const response = await apiClient.get<PaperAttemptsResponse>(`/papers/${paperId}/attempts`, { params })
    return response.data
  },

  getSubmission: async (
    paperId: string,
    params?: { exam_id?: string; attempt_id?: string },
  ): Promise<PaperSubmissionRead> => {
    const response = await apiClient.get<PaperSubmissionRead>(`/papers/${paperId}/submission`, { params })
    return response.data
  },

  downloadPdf: async (paperId: string): Promise<DownloadedPdf> => {
    const response = await apiClient.get<ArrayBuffer>(`/papers/${paperId}/export/pdf`, {
      params: { include_answers: false },
      responseType: 'arraybuffer',
      timeout: 120000,
    })
    return {
      bytes: response.data,
      filename: downloadFilename(response.headers['content-disposition'], `eduraa-paper-${paperId}.pdf`),
    }
  },

  delete: async (paperId: string): Promise<void> => {
    await apiClient.delete(`/papers/${paperId}`)
  },

  getInteractiveAssist: async (
    paperId: string,
    data: { question_id: string; mode: 'hint' | 'explain' | 'mistake'; student_answer?: string }
  ): Promise<{ content: string }> => {
    const response = await apiClient.post(`/papers/${paperId}/interactive/assist`, data)
    return response.data
  },
}
