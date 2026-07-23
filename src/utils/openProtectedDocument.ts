import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import axios from 'axios'
import { Platform } from 'react-native'
import apiClient, { API_BASE_URL, getAccessToken } from '../api/client'
import { documentFileExtension, requiresApiAuthorization, resolveDocumentUrl } from './protectedDocumentModel'

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
  const safeStem = fileStem.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'checked-paper'

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
