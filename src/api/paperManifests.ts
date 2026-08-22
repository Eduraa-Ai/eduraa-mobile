/**
 * Eduraa Mobile — Custom paper manifests
 *
 * A teacher uploads a school question paper and its answer key; the backend
 * extracts a reviewable question map, and confirming it freezes exactly the
 * revision the teacher reviewed.
 */

import apiClient from './client'

export type ManifestStatus = 'draft' | 'confirmed'
export type ManifestValidationStatus = 'pending' | 'valid' | 'invalid'
export type ManifestResolutionStatus = 'resolved' | 'ambiguous' | 'unresolved'

export interface PaperManifestIssue {
  code: string
  message: string
  severity: 'error' | 'warning'
  occurrence_id?: string | null
}

export interface PaperManifestOccurrence {
  id: string
  occurrence_id: string
  parent_occurrence_id?: string | null
  ordinal: number
  display_label: string
  section_label?: string | null
  max_marks?: number | string | null
  question_content: {
    question_text?: string | null
    question_type?: string | null
    instructions?: string | null
    options?: unknown
  }
  answer_key_content?: unknown
  resolution_status: ManifestResolutionStatus
  issues: PaperManifestIssue[]
}

export interface PaperManifestVersion {
  id: string
  paper_id: string
  revision: number
  status: ManifestStatus
  total_marks?: number | string | null
  validation_status: ManifestValidationStatus
  validation_report: {
    valid?: boolean
    calculated_total_marks?: number | string | null
    errors?: PaperManifestIssue[]
    warnings?: PaperManifestIssue[]
  }
  unresolved_items: PaperManifestIssue[]
  manifest_sha256?: string | null
  source_set_sha256: string
  extraction_metadata: Record<string, unknown>
  occurrences: PaperManifestOccurrence[]
  source_artifacts: Array<{
    id: string
    artifact_role: string
    original_filename: string
    page_count: number
  }>
}

export interface CustomPaperFile {
  uri: string
  name: string
  type: string
  file?: File
}

export interface CustomPaperDraftPayload {
  subjectId: string
  titleLine1: string
  idempotencyKey: string
  questionPaper: CustomPaperFile
  answerKey: CustomPaperFile
  titleLine2?: string | null
  course?: string | null
  category?: string | null
  standard?: string | null
  division?: string | null
  timerMinutes?: number | null
  instructions?: string | null
  autoCreateExam?: boolean
}

function appendOptional(formData: FormData, key: string, value?: string | null) {
  if (value) formData.append(key, value)
}

function appendFile(formData: FormData, key: string, file: CustomPaperFile) {
  if (file.file) {
    formData.append(key, file.file, file.name)
    return
  }
  formData.append(key, {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob)
}

export const paperManifestsApi = {
  createDraft: async (
    payload: CustomPaperDraftPayload,
  ): Promise<PaperManifestVersion> => {
    const formData = new FormData()
    formData.append('subject_id', payload.subjectId)
    formData.append('title_line_1', payload.titleLine1)
    formData.append('idempotency_key', payload.idempotencyKey)
    appendOptional(formData, 'title_line_2', payload.titleLine2)
    appendOptional(formData, 'course', payload.course)
    appendOptional(formData, 'category', payload.category)
    appendOptional(formData, 'standard', payload.standard)
    appendOptional(formData, 'division', payload.division)
    appendOptional(formData, 'instructions', payload.instructions)
    if (payload.timerMinutes) {
      formData.append('timer_minutes', String(payload.timerMinutes))
    }
    formData.append(
      'auto_create_exam',
      payload.autoCreateExam === false ? 'false' : 'true',
    )
    appendFile(formData, 'question_paper_pdf', payload.questionPaper)
    appendFile(formData, 'answer_key_pdf', payload.answerKey)

    const response = await apiClient.post<PaperManifestVersion>(
      '/papers/custom/manifest-drafts',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 180000,
      },
    )
    return response.data
  },

  get: async (paperId: string): Promise<PaperManifestVersion> => {
    const response = await apiClient.get<PaperManifestVersion>(
      `/papers/${paperId}/manifest`,
    )
    return response.data
  },

  retryExtraction: async (paperId: string): Promise<PaperManifestVersion> => {
    const response = await apiClient.post<PaperManifestVersion>(
      `/papers/${paperId}/manifest/extract`,
    )
    return response.data
  },

  confirm: async (
    manifest: PaperManifestVersion,
    idempotencyKey: string,
  ): Promise<PaperManifestVersion> => {
    if (!manifest.manifest_sha256) {
      throw new Error('The extracted question map has no review hash yet.')
    }
    const response = await apiClient.post<PaperManifestVersion>(
      `/papers/${manifest.paper_id}/manifest/confirm`,
      {
        expected_revision: manifest.revision,
        expected_manifest_sha256: manifest.manifest_sha256,
        idempotency_key: idempotencyKey,
      },
    )
    return response.data
  },
}
