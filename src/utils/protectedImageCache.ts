import { File, Paths } from 'expo-file-system'
import { Platform } from 'react-native'
import apiClient, { getAccessToken } from '../api/client'
import { protectedImageCacheFileName } from './protectedDocumentModel'

/**
 * One shared copy per authorized image URL.
 *
 * Book-derived question crops are read over and over during an attempt: the
 * inline card, the zoom viewer, and every remount of a virtualized cell all want
 * the same file. Without a shared entry each of those was its own download, so
 * scrolling back re-fetched figures the learner had already seen. Entries are
 * kept alive here instead of being released per mount, and prefetching warms the
 * next few figures with a short queue so the visible one is never stuck behind
 * them.
 */
const MAX_ENTRIES = 48
const MAX_QUEUED_PREFETCHES = 12
const MAX_PREFETCH_CONCURRENCY = 2

const cached = new Map<string, string>()
const inFlight = new Map<string, Promise<string>>()
const prefetchQueue: string[] = []
let activePrefetches = 0
let tokenRequest: Promise<string | null> | null = null

/**
 * One credential read per burst: every figure in the prefetch window shares it,
 * and the next burst reads again so a refreshed token is picked up.
 */
export function resolveProtectedImageToken() {
  if (!tokenRequest) {
    tokenRequest = getAccessToken()
      .catch(() => null)
      .finally(() => {
        tokenRequest = null
      })
  }
  return tokenRequest
}

/** The local uri for an already-warmed image, or null when it still needs a fetch. */
export function peekProtectedImage(url: string) {
  const hit = cached.get(url)
  if (!hit) return null
  // Re-insert so the figures a learner keeps returning to outlive the ones they
  // scrolled past.
  cached.delete(url)
  cached.set(url, hit)
  return hit
}

export function loadProtectedImage(url: string) {
  const ready = peekProtectedImage(url)
  if (ready) return Promise.resolve(ready)

  const pending = inFlight.get(url)
  if (pending) return pending

  const request: Promise<string> = (Platform.OS === 'web' ? readObjectUrl(url) : downloadToCache(url))
    .then((uri) => {
      // A retry elsewhere can invalidate this url mid-flight, and on native that
      // deletes the file: publishing it now would hand out a dead copy.
      if (inFlight.get(url) === request) store(url, uri)
      return uri
    })
    .finally(() => {
      if (inFlight.get(url) === request) inFlight.delete(url)
    })
  inFlight.set(url, request)
  return request
}

export function prefetchProtectedImages(urls: readonly string[]) {
  for (const url of urls) {
    if (!url || cached.has(url) || inFlight.has(url) || prefetchQueue.includes(url)) continue
    // A fast scroll can outrun the queue, and the stalest entry is the figure the
    // learner has already gone past.
    if (prefetchQueue.length >= MAX_QUEUED_PREFETCHES) prefetchQueue.shift()
    prefetchQueue.push(url)
  }
  drainPrefetchQueue()
}

/** Drops a cached copy so a retry re-downloads instead of re-reading a bad file. */
export function invalidateProtectedImage(url: string) {
  const uri = cached.get(url)
  cached.delete(url)
  inFlight.delete(url)

  if (Platform.OS === 'web') {
    if (uri) URL.revokeObjectURL(uri)
    return
  }
  try {
    const file = new File(Paths.cache, protectedImageCacheFileName(url))
    if (file.exists) file.delete()
  } catch {
    // A cache file the system already reclaimed needs no cleanup.
  }
}

function store(url: string, uri: string) {
  cached.set(url, uri)
  while (cached.size > MAX_ENTRIES) {
    const oldest = cached.keys().next()
    if (oldest.done) break
    const staleUri = cached.get(oldest.value)
    cached.delete(oldest.value)
    // Native copies stay on disk so a later mount reuses them; only web object
    // URLs have to be released to keep blob memory bounded.
    if (staleUri && Platform.OS === 'web') URL.revokeObjectURL(staleUri)
  }
}

function drainPrefetchQueue() {
  while (activePrefetches < MAX_PREFETCH_CONCURRENCY && prefetchQueue.length) {
    const url = prefetchQueue.shift() as string
    if (cached.has(url) || inFlight.has(url)) continue
    activePrefetches += 1
    loadProtectedImage(url)
      .catch(() => undefined)
      .finally(() => {
        activePrefetches -= 1
        drainPrefetchQueue()
      })
  }
}

async function readObjectUrl(url: string) {
  const response = await apiClient.get<Blob>(url, { responseType: 'blob' })
  return URL.createObjectURL(response.data)
}

async function downloadToCache(url: string) {
  const destination = new File(Paths.cache, protectedImageCacheFileName(url))
  if (destination.exists && destination.size > 0) return destination.uri

  const token = await resolveProtectedImageToken()
  try {
    const downloaded = await File.downloadFileAsync(url, destination, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      idempotent: true,
    })
    return downloaded.uri
  } catch (error) {
    // Android streams straight into the destination, so a download that fails
    // partway can leave a truncated file that would never decode.
    try {
      if (destination.exists) destination.delete()
    } catch {
      // Nothing to clean up.
    }
    throw error
  }
}
