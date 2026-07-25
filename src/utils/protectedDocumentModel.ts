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

export function checkedPaperDownloadEndpoint(checkedPaperId: string) {
  const normalizedId = checkedPaperId.trim()
  if (!normalizedId) throw new Error('Choose a checked paper before downloading.')
  return `/checked-papers/${encodeURIComponent(normalizedId)}/download`
}

export function safeDocumentFileStem(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'checked-paper'
}
