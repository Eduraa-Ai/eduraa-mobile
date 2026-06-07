import apiClient from './client'
import type { CheckedPaper, Exam, Subject } from '../types'

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
  file?: File
}

export interface ScanUploadPayload {
  examId?: string | null
  subjectId?: string | null
  paperId?: string | null
  studentId?: string | null
  uploadMode?: string | null
  files: ScanUploadFile[]
}

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

export const scanUploadApi = {
  async getOptions() {
    const response = await apiClient.get<ScanUploadOptions>('/checked-papers/options')
    return response.data
  },

  async upload(payload: ScanUploadPayload) {
    const formData = new FormData()
    appendOptional(formData, 'exam_id', payload.examId)
    appendOptional(formData, 'subject_id', payload.subjectId)
    appendOptional(formData, 'paper_id', payload.paperId)
    appendOptional(formData, 'student_id', payload.studentId)
    appendOptional(formData, 'upload_mode', payload.uploadMode)
    payload.files.forEach((file) => appendFile(formData, file))

    const response = await apiClient.post<CheckedPaper>('/checked-papers/scan', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 120000,
    })
    return response.data
  },
}
