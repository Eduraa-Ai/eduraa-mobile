import { File as ExpoFile } from 'expo-file-system'
import { Platform } from 'react-native'
import apiClient, { API_BASE_URL, authenticatedFetch } from './client'
import type { CheckedPaper, Exam, Subject } from '../types'

export const SCAN_UPLOAD_OPTIONS_QUERY_KEY = ['scan-upload', 'options'] as const

export interface StudentUploadOption {
  id: string
  first_name: string
  last_name: string
  student_id: string
  standard: string
  division?: string | null
}

export interface PaperUploadOption {
  id: string
  title: string
  source_type?: string | null
  subject_id?: string | null
  subject_name?: string | null
  standard?: string | null
  division?: string | null
  created_at: string
}

export interface ScanUploadOptions {
  exams: Exam[]
  subjects: Subject[]
  students: StudentUploadOption[]
  papers: PaperUploadOption[]
}

export interface ScanUploadFile {
  uri: string
  name: string
  type: string
  size?: number | null
  file?: File
}

export interface ScanUploadPayload {
  examId?: string | null
  subjectId?: string | null
  paperId?: string | null
  studentId?: string | null
  uploadMode?: string | null
  files: ScanUploadFile[]
  signal?: AbortSignal
  onPhase?: (phase: ScanUploadPhase) => void
}

export type ScanUploadPhase = 'preparing' | 'uploading' | 'confirming'

function appendOptional(formData: FormData, key: string, value?: string | null) {
  if (value) formData.append(key, value)
}

function appendFile(formData: FormData, file: ScanUploadFile) {
  if (file.file) {
    formData.append('files', file.file, file.name)
    return
  }

  formData.append('files', {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob)
}

function buildFormData(payload: ScanUploadPayload, nativeFiles: boolean) {
  const formData = new FormData()
  appendOptional(formData, 'exam_id', payload.examId)
  appendOptional(formData, 'subject_id', payload.subjectId)
  appendOptional(formData, 'paper_id', payload.paperId)
  appendOptional(formData, 'student_id', payload.studentId)
  appendOptional(formData, 'upload_mode', payload.uploadMode)

  payload.files.forEach((file) => {
    if (nativeFiles && !file.file) {
      // Expo's fetch stack requires a real Blob-compatible File. React Native's
      // legacy { uri, name, type } pseudo-file can stall while streaming.
      formData.append('files', new ExpoFile(file.uri), file.name)
      return
    }
    appendFile(formData, file)
  })
  return formData
}

function responseDetail(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object') return fallback
  const detail = (data as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') {
    const code = (detail as { code?: unknown }).code
    const message = (detail as { message?: unknown }).message
    if (typeof code === 'string') return code
    if (typeof message === 'string') return message
  }
  return fallback
}

function uploadError(detail: string, status?: number) {
  return Object.assign(new Error(detail), {
    response: { status, data: { detail } },
  })
}

async function uploadNative(payload: ScanUploadPayload) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120000)
  const abortFromCaller = () => controller.abort()
  payload.signal?.addEventListener('abort', abortFromCaller, { once: true })

  try {
    payload.onPhase?.('preparing')
    const body = buildFormData(payload, true)
    payload.onPhase?.('uploading')
    const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/checked-papers/scan`, {
      method: 'POST',
      body,
      signal: controller.signal,
    })
    payload.onPhase?.('confirming')
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      throw uploadError(responseDetail(data, 'The upload was not accepted. Please check the selections and try again.'), response.status)
    }
    return data as CheckedPaper
  } catch (error) {
    if (controller.signal.aborted) {
      if (payload.signal?.aborted) {
        throw uploadError('Upload cancelled. Your selections and pages are still here.')
      }
      throw uploadError('The upload took too long. Your selections are still here; check your connection and try again.')
    }
    if ((error as { response?: unknown }).response) throw error
    throw uploadError('Eduraa could not receive the scan. Check your connection and try again; your selections are still here.')
  } finally {
    clearTimeout(timeout)
    payload.signal?.removeEventListener('abort', abortFromCaller)
  }
}

export const scanUploadApi = {
  async getOptions() {
    const response = await apiClient.get<ScanUploadOptions>('/checked-papers/options')
    return response.data
  },

  async upload(payload: ScanUploadPayload) {
    if (Platform.OS !== 'web') return uploadNative(payload)

    payload.onPhase?.('preparing')
    const formData = buildFormData(payload, false)
    payload.onPhase?.('uploading')

    const response = await apiClient.post<CheckedPaper>('/checked-papers/scan', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 120000,
      signal: payload.signal,
      onUploadProgress: (event) => {
        payload.onPhase?.(event.loaded < (event.total ?? Number.POSITIVE_INFINITY) ? 'uploading' : 'confirming')
      },
    })
    return response.data
  },
}
