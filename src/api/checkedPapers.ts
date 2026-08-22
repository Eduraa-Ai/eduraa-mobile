/**
 * Eduraa Mobile — Checked Papers API
 * Backend returns a plain array (list[CheckedPaperListRead]), NOT a paginated object.
 */

import apiClient from './client'
import type { CheckedPaper } from '../types'
import type { DownloadedPdf } from '../utils/pdfDownload'

export interface ManualReviewRequestPayload {
  note?: string | null
  question_id?: string | null
  result_id?: string | null
}

export interface CheckedPaperScannedPage {
  id: string
  content_sha256?: string | null
  pixel_sha256?: string | null
  width?: number | null
  height?: number | null
}

export interface CheckedPaperIntegrity {
  script_version: Record<string, unknown> | null
  integrity_run: Record<string, unknown> | null
  pages: CheckedPaperScannedPage[]
}

export interface RevisionPayload {
  expected_revision: number
}

export interface IdempotentRevisionPayload extends RevisionPayload {
  idempotency_key: string
}

export interface IntegrityResolvePayload extends IdempotentRevisionPayload {
  ordered_page_ids: string[]
  complete_script_confirmed: true
  identity_confirmed: true
  acknowledged_issue_ids: string[]
}

export interface RevokePayload extends IdempotentRevisionPayload {
  reason: string
}

export interface QuestionReviewCommentPayload {
  note?: string | null
  question_id?: string | null
  result_id?: string | null
  resolve?: boolean
}

export interface QuestionReviewSeenPayload {
  question_id?: string | null
  result_id?: string | null
}

export interface TeacherReviewResultPayload {
  result_id?: string | null
  question_id?: string | null
  score: number
  feedback?: string | null
  selected?: boolean | null
}

export interface TeacherReviewPayload {
  grading_feedback?: string | null
  results: TeacherReviewResultPayload[]
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

export const checkedPapersApi = {
  list: async (): Promise<CheckedPaper[]> => {
    const response = await apiClient.get<CheckedPaper[]>('/checked-papers')
    return response.data
  },

  getById: async (id: string): Promise<CheckedPaper> => {
    const response = await apiClient.get<CheckedPaper>(`/checked-papers/${id}`)
    return response.data
  },

  downloadPdf: async (id: string): Promise<DownloadedPdf> => {
    const response = await apiClient.get<ArrayBuffer>(`/checked-papers/${id}/download`, {
      responseType: 'arraybuffer',
      timeout: 120000,
    })
    return {
      bytes: response.data,
      filename: downloadFilename(response.headers['content-disposition'], `eduraa-result-${id}.pdf`),
    }
  },

  requestManualReview: async (
    id: string,
    payload: ManualReviewRequestPayload = { note: null, question_id: null, result_id: null },
  ): Promise<CheckedPaper> => {
    const response = await apiClient.post<CheckedPaper>(
      `/checked-papers/${id}/manual-review-request`,
      payload,
    )
    return response.data
  },

  addQuestionReviewComment: async (
    id: string,
    payload: QuestionReviewCommentPayload,
  ): Promise<CheckedPaper> => {
    const response = await apiClient.post<CheckedPaper>(
      `/checked-papers/${id}/question-review-comment`,
      payload,
    )
    return response.data
  },

  markQuestionReviewSeen: async (
    id: string,
    payload: QuestionReviewSeenPayload,
  ): Promise<void> => {
    await apiClient.post(`/checked-papers/${id}/question-review-seen`, payload)
  },

  updateTeacherReview: async (
    id: string,
    payload: TeacherReviewPayload,
  ): Promise<CheckedPaper> => {
    const response = await apiClient.patch<CheckedPaper>(
      `/checked-papers/${id}/teacher-review`,
      payload,
    )
    return response.data
  },

  getIntegrity: async (id: string): Promise<CheckedPaperIntegrity> => {
    const response = await apiClient.get<CheckedPaperIntegrity>(`/checked-papers/${id}/integrity`)
    return response.data
  },

  integrityRetry: async (id: string, payload: IdempotentRevisionPayload): Promise<CheckedPaper> => {
    const response = await apiClient.post<CheckedPaper>(`/checked-papers/${id}/integrity/retry`, payload)
    return response.data
  },

  integrityResolve: async (id: string, payload: IntegrityResolvePayload): Promise<CheckedPaper> => {
    const response = await apiClient.post<CheckedPaper>(`/checked-papers/${id}/integrity/resolve`, payload)
    return response.data
  },

  evidenceRetry: async (id: string, payload: RevisionPayload): Promise<CheckedPaper> => {
    const response = await apiClient.post<CheckedPaper>(`/checked-papers/${id}/evidence/retry`, payload)
    return response.data
  },

  regrade: async (id: string, payload: IdempotentRevisionPayload): Promise<CheckedPaper> => {
    const response = await apiClient.post<CheckedPaper>(`/checked-papers/${id}/regrade`, payload)
    return response.data
  },

  approve: async (id: string, payload: IdempotentRevisionPayload): Promise<CheckedPaper> => {
    const response = await apiClient.post<CheckedPaper>(`/checked-papers/${id}/approve`, payload)
    return response.data
  },

  publish: async (id: string, payload: IdempotentRevisionPayload): Promise<CheckedPaper> => {
    const response = await apiClient.post<CheckedPaper>(`/checked-papers/${id}/publish`, payload)
    return response.data
  },

  revoke: async (id: string, payload: RevokePayload): Promise<CheckedPaper> => {
    const response = await apiClient.post<CheckedPaper>(`/checked-papers/${id}/revoke`, payload)
    return response.data
  },
}
