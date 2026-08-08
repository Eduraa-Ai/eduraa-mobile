import apiClient, { API_BASE_URL } from './client'

export interface LearningResourceScope {
  id: string
  syllabus_node_id: string
  node_type: string
  node_name: string
  start_page?: number | null
  end_page?: number | null
  display_order: number
}

export interface LearningResourceAsset {
  id: string
  asset_role: string
  mime_type: string
  original_filename: string
  byte_size: number
  content_hash: string
  page_count?: number | null
  metadata: Record<string, unknown>
  view_url: string
}

export interface LearningResource {
  id: string
  resource_type: string
  title: string
  provider_label: string
  description?: string | null
  subject_id?: string | null
  subject_name?: string | null
  target_exam?: string | null
  board?: string | null
  standard?: string | null
  visibility: string
  status: string
  version: number
  metadata: Record<string, unknown>
  page_count?: number | null
  original_asset_id?: string | null
  view_url?: string | null
  download_url?: string | null
  scopes: LearningResourceScope[]
  assets: LearningResourceAsset[]
  published_at?: string | null
  created_at: string
  updated_at: string
}

export interface LearningResourceList {
  items: LearningResource[]
  total: number
}

export function resolveResourceUrl(url?: string | null) {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`
}

export function learningResourcePageImagePath(
  resourceId: string,
  assetId: string,
  pageNumber: number,
) {
  return `/api/v1/learning-resources/${resourceId}/assets/${assetId}/pages/${pageNumber}.png`
}

export const learningResourcesApi = {
  async list(params?: {
    type?: string
    subject_id?: string
    chapter_name?: string
    target_exam?: string
    board?: string
    standard?: string
    provider_label?: string
  }) {
    const response = await apiClient.get<LearningResourceList>('/learning-resources', { params })
    return response.data
  },

  async get(resourceId: string) {
    const response = await apiClient.get<LearningResource>(`/learning-resources/${resourceId}`)
    return response.data
  },
}
