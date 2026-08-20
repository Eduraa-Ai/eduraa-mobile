import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_PREFIX = '@eduraa/review-response-seen/v1'
const MAX_SEEN_KEYS = 500

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}/${userId}`
}

export async function loadSeenReviewResponseKeys(userId?: string | null) {
  if (!userId) return new Set<string>()
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId))
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

export async function markReviewResponseSeen(userId: string, responseKey: string) {
  const seen = await loadSeenReviewResponseKeys(userId)
  seen.add(responseKey)
  const values = Array.from(seen).slice(-MAX_SEEN_KEYS)
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(values))
  } catch {
    // Keep the current session consistent even if persistent storage is unavailable.
  }
  return new Set(values)
}
