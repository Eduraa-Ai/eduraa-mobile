/**
 * Eduraa Mobile - Axios API Client
 * Platform-aware API client with bearer-token authentication.
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { Platform } from 'react-native'
import { readStoredAccessToken } from '../auth/authStorage'

type ApiTarget = 'local' | 'prod'

const PROD_API_BASE_URL =
  'https://eduraa-ai-dev-cin-api.gentleforest-0ad6efdc.centralindia.azurecontainerapps.io'
const LOCAL_API_PORT = '8000'

const normalizeApiTarget = (value?: string): ApiTarget => {
  return value?.trim().toLowerCase() === 'prod' ? 'prod' : 'local'
}

const getWebLocalApiUrl = () => {
  if (typeof window === 'undefined' || !window.location?.hostname) {
    return `http://localhost:${LOCAL_API_PORT}`
  }

  return `${window.location.protocol}//${window.location.hostname}:${LOCAL_API_PORT}`
}

const normalizeUrl = (value?: string) => value?.trim().replace(/\/$/, '') || undefined

const isLoopbackUrl = (value: string) => {
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

const resolveApiBaseUrl = () => {
  const target = normalizeApiTarget(process.env.EXPO_PUBLIC_API_TARGET)
  const platformUrl = normalizeUrl(
    Platform.OS === 'web'
      ? process.env.EXPO_PUBLIC_WEB_API_URL
      : process.env.EXPO_PUBLIC_NATIVE_API_URL
  )
  const legacyUniversalUrl = normalizeUrl(process.env.EXPO_PUBLIC_API_URL)
  const explicitUrl = platformUrl ?? legacyUniversalUrl

  if (explicitUrl) {
    // A loopback URL in a shared .env points at the phone itself in Expo Go.
    // Ignore it for production-native runs so a web-only bridge cannot break
    // physical devices or emulators.
    if (!(Platform.OS !== 'web' && target === 'prod' && isLoopbackUrl(explicitUrl))) {
      return explicitUrl
    }
  }

  if (target === 'prod') return PROD_API_BASE_URL

  if (Platform.OS === 'web') return getWebLocalApiUrl()

  // Android emulators expose the host machine through 10.0.2.2. Using
  // localhost here points back to the emulator and makes every local API
  // request fail even when the backend is healthy on Windows.
  if (Platform.OS === 'android') return `http://10.0.2.2:${LOCAL_API_PORT}`

  return `http://localhost:${LOCAL_API_PORT}`
}

export const API_TARGET = normalizeApiTarget(process.env.EXPO_PUBLIC_API_TARGET)
export const API_BASE_URL = resolveApiBaseUrl()

var inMemoryAccessToken: string | null = null

export function setAccessToken(token: string | null) {
  inMemoryAccessToken = token
}

export async function getAccessToken() {
  if (inMemoryAccessToken) return inMemoryAccessToken
  return readStoredAccessToken()
}

const sharedClientConfig = {
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 60000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
}

const apiClient = axios.create(sharedClientConfig)

if (__DEV__) {
  console.info(`[Eduraa API] target=${API_TARGET} base=${API_BASE_URL}`)
}

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = inMemoryAccessToken ?? (await readStoredAccessToken())
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch {
      if (inMemoryAccessToken && config.headers) {
        config.headers.Authorization = `Bearer ${inMemoryAccessToken}`
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

let logoutCallback: (() => void) | null = null

export function registerLogoutCallback(cb: () => void) {
  logoutCallback = cb
}

function isAuthEndpoint(url?: string) {
  return Boolean(url?.includes('/auth/login') || url?.includes('/auth/refresh') || url?.includes('/auth/logout'))
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config

    // The backend currently issues access tokens only; it has no refresh
    // endpoint. Do not call a nonexistent route or preserve a proven-expired
    // session. Network failures have no status and intentionally keep auth.
    if (error.response?.status === 401 && !isAuthEndpoint(originalRequest?.url)) {
      setAccessToken(null)
      logoutCallback?.()
    }

    return Promise.reject(error)
  }
)

export default apiClient
