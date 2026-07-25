import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { Platform } from 'react-native'

export interface DownloadedPdf {
  bytes: ArrayBuffer
  filename: string
}

function safeFilename(filename: string) {
  const normalized = filename.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim()
  return normalized.toLowerCase().endsWith('.pdf') ? normalized : `${normalized || 'eduraa-paper'}.pdf`
}

export async function presentPdf({ bytes, filename }: DownloadedPdf) {
  const resolvedFilename = safeFilename(filename)

  if (Platform.OS === 'web') {
    const blob = new Blob([bytes], { type: 'application/pdf' })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = resolvedFilename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    return
  }

  const file = new File(Paths.cache, `${Date.now()}-${resolvedFilename}`)
  file.create({ overwrite: true })
  file.write(new Uint8Array(bytes))

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is not available on this device.')
  }

  await Sharing.shareAsync(file.uri, {
    dialogTitle: 'Save or share PDF',
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
  })
}
