export function resolveDocumentUrl(value: string, apiBaseUrl: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('The checked paper does not include an original file URL.')
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `${apiBaseUrl.replace(/\/$/, '')}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`
}

export function documentFileExtension(url: string) {
  try {
    const match = new URL(url).pathname.match(/\.(pdf|png|jpe?g|webp)$/i)
    return match ? `.${match[1].toLowerCase().replace('jpeg', 'jpg')}` : '.pdf'
  } catch {
    return '.pdf'
  }
}

export function requiresApiAuthorization(url: string, apiBaseUrl: string) {
  try {
    return new URL(url).origin === new URL(apiBaseUrl).origin
  } catch {
    return false
  }
}

export function resolveSchoolQuestionPaperFileUrl(value: string, apiBaseUrl: string) {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('This school paper does not include a file URL.')

  const resolved = new URL(trimmed, `${apiBaseUrl.replace(/\/$/, '')}/`)
  const apiOrigin = new URL(apiBaseUrl).origin
  const isQuestionPaperFile = /^\/api\/v1\/question-papers\/[^/]+\/(view|download)$/.test(resolved.pathname)
  if (resolved.origin !== apiOrigin || !isQuestionPaperFile) {
    throw new Error('This school paper file URL is not trusted.')
  }
  return resolved.toString()
}

export function checkedPaperDownloadEndpoint(checkedPaperId: string) {
  const normalizedId = checkedPaperId.trim()
  if (!normalizedId) throw new Error('Choose a checked paper before downloading.')
  return `/checked-papers/${encodeURIComponent(normalizedId)}/download`
}

export function checkedPaperScanPath(checkedPaperId: string) {
  const normalizedId = checkedPaperId.trim()
  if (!normalizedId) throw new Error('Choose a checked paper before opening its scan.')
  return `/api/v1/checked-papers/${encodeURIComponent(normalizedId)}/scanned`
}

export function checkedPaperScanPagePath(checkedPaperId: string, pageNumber: number) {
  const normalizedId = checkedPaperId.trim()
  if (!normalizedId) throw new Error('Choose a checked paper before opening its scan.')
  if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error('Choose a valid scanned page.')
  return `/api/v1/checked-papers/${encodeURIComponent(normalizedId)}/scanned/pages/${pageNumber}`
}

export function safeDocumentFileStem(value: string, fallback = 'checked-paper') {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || fallback
}

/**
 * Names the on-device copy of a protected image. The hash keeps same-named crops
 * from different books apart, and the whole name is stable across launches so a
 * figure is downloaded once per device rather than once per mount.
 */
export function protectedImageCacheFileName(url: string) {
  const trimmed = url.trim()
  if (!trimmed) throw new Error('A cached image needs a source URL.')

  // FNV-1a: a stable 32-bit digest without pulling in a crypto dependency.
  let hash = 0x811c9dc5
  for (let index = 0; index < trimmed.length; index += 1) {
    hash ^= trimmed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  const path = trimmed.split(/[?#]/, 1)[0]
  const name = decodeUriPart(path.split('/').pop() || '')
  const extension = name.match(/\.(png|jpe?g|webp|gif|bmp)$/i)?.[0].toLowerCase() || '.img'
  const stem = safeDocumentFileStem(name.replace(/\.[^.]+$/, ''), 'image').slice(0, 40)
  return `visual-${stem}-${hash.toString(36)}${extension}`
}

function decodeUriPart(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
