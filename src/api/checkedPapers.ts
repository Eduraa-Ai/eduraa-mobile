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
    payload: ManualReviewRequestPayload = { note: null, question_id: null },
  ): Promise<CheckedPaper> => {
    const response = await apiClient.post<CheckedPaper>(
      `/checked-papers/${id}/manual-review-request`,
      payload,
    )
    return response.data
  },
}
