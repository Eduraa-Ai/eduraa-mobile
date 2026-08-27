import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import axios from 'axios'
import { Platform } from 'react-native'
import apiClient, { API_BASE_URL, getAccessToken } from '../api/client'
import {
  checkedPaperDownloadEndpoint,
  checkedPaperScanPath,
  documentFileExtension,
  requiresApiAuthorization,
  resolveDocumentUrl,
  safeDocumentFileStem,
} from './protectedDocumentModel'

type ApiErrorBody = {
  detail?: string
}

function mimeType(extension: string) {
  if (extension === '.png') return 'image/png'
  if (extension === '.jpg') return 'image/jpeg'
  if (extension === '.webp') return 'image/webp'
  return 'application/pdf'
}

export async function openProtectedDocument(value: string, fileStem: string) {
  const url = resolveDocumentUrl(value, API_BASE_URL)
  const extension = documentFileExtension(url)
  const needsAuth = requiresApiAuthorization(url, API_BASE_URL)
  const safeStem = safeDocumentFileStem(fileStem)

  if (Platform.OS === 'web') {
    const response = needsAuth
      ? await apiClient.get<Blob>(url, { responseType: 'blob' })
      : await axios.get<Blob>(url, { responseType: 'blob' })
    const objectUrl = URL.createObjectURL(response.data)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    return
  }

  const token = needsAuth ? await getAccessToken() : null
  const destination = new File(Paths.cache, `${safeStem}-${Date.now()}${extension}`)
  const downloaded = await File.downloadFileAsync(url, destination, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    idempotent: true,
  })

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('No document viewer is available on this device.')
  }

  await Sharing.shareAsync(downloaded.uri, {
    dialogTitle: 'Open original checked paper',
    mimeType: mimeType(extension),
    UTI: extension === '.pdf' ? 'com.adobe.pdf' : 'public.image',
  })
}

export function openCheckedPaperScan(checkedPaperId: string) {
  return openProtectedDocument(
    checkedPaperScanPath(checkedPaperId),
    `checked-paper-${checkedPaperId}`,
  )
}

export function protectedDocumentErrorMessage(error: unknown) {
  if (!axios.isAxiosError<ApiErrorBody>(error)) {
    return error instanceof Error && error.message
      ? error.message
      : 'This device could not open the scan. Try again.'
  }

  const status = error.response?.status
  if (status === 401) return 'Your session expired. Sign in again, then reopen the scan.'
  if (status === 403) return 'You do not have permission to view this scan.'
  if (status === 404) return 'The original scan is missing. Open the paper workspace to replace or re-upload it.'
  if (status && status >= 500) return 'The scan service is temporarily unavailable. Try again in a moment.'
  if (!error.response) return 'The scan service could not be reached. Check your connection and try again.'

  const detail = error.response.data?.detail?.trim()
  return detail || 'This device could not open the scan. Try again.'
}

export async function downloadCheckedPaperPdf(checkedPaperId: string, fileStem: string) {
  const endpoint = checkedPaperDownloadEndpoint(checkedPaperId)
  const safeStem = safeDocumentFileStem(fileStem)

  if (Platform.OS === 'web') {
    const response = await apiClient.get<Blob>(endpoint, { responseType: 'blob' })
    const objectUrl = URL.createObjectURL(response.data)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = `${safeStem}.pdf`
    anchor.rel = 'noopener noreferrer'
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    return
  }

  const token = await getAccessToken()
  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1${endpoint}`
  const destination = new File(Paths.cache, `${safeStem}-${Date.now()}.pdf`)
  const downloaded = await File.downloadFileAsync(url, destination, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    idempotent: true,
  })

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Saving is not available on this device.')
  }

  await Sharing.shareAsync(downloaded.uri, {
    dialogTitle: 'Save checked paper PDF',
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
  })
}
