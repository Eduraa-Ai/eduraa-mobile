import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import type { AccountMinimal } from '../types'

export const TOKEN_KEY = 'eduraa_access_token'
export const USER_KEY = 'eduraa_auth_user'

type PersistedAuth = {
  token: string | null
  user: AccountMinimal | null
}

const storage = {
  async getItem(key: string) {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key)
    return SecureStore.getItemAsync(key)
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') return AsyncStorage.setItem(key, value)
    return SecureStore.setItemAsync(key, value)
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') return AsyncStorage.removeItem(key)
    return SecureStore.deleteItemAsync(key)
  },
}

function parseStoredUser(value: string | null): AccountMinimal | null {
  if (!value) return null
  try {
    const candidate = JSON.parse(value) as Partial<AccountMinimal>
    if (
      typeof candidate.id === 'string' &&
      typeof candidate.display_name === 'string' &&
      typeof candidate.identifier === 'string' &&
      typeof candidate.role === 'string'
    ) {
      return candidate as AccountMinimal
    }
  } catch {
    // Corrupt storage is treated as missing and replaced on the next login.
  }
  return null
}

export async function readStoredAccessToken() {
  try {
    return await storage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export async function writeStoredAccessToken(token: string) {
  await storage.setItem(TOKEN_KEY, token)
}

export async function clearStoredAccessToken() {
  try {
    await storage.removeItem(TOKEN_KEY)
  } catch {
    // Storage cleanup is best-effort; the in-memory session is cleared too.
  }
}

export async function readPersistedAuth(): Promise<PersistedAuth> {
  try {
    const [token, rawUser] = await Promise.all([
      storage.getItem(TOKEN_KEY),
      storage.getItem(USER_KEY),
    ])
    return { token, user: parseStoredUser(rawUser) }
  } catch {
    return { token: null, user: null }
  }
}

export async function writePersistedAuth(token: string, user: AccountMinimal) {
  await Promise.all([
    storage.setItem(TOKEN_KEY, token),
    storage.setItem(USER_KEY, JSON.stringify(user)),
  ])
}

export async function clearPersistedAuth() {
  await Promise.allSettled([
    storage.removeItem(TOKEN_KEY),
    storage.removeItem(USER_KEY),
  ])
}
