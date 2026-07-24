/**
 * Eduraa Mobile - Axios API Client
 * Platform-aware API client with bearer-token authentication.
 */

import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'
import { Platform } from 'react-native'
import { clearStoredAccessToken, readStoredAccessToken, writeStoredAccessToken } from '../auth/authStorage'

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
const refreshClient = axios.create(sharedClientConfig)

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
let refreshTokenCallback: ((token: string) => void) | null = null
let refreshPromise: Promise<string> | null = null

type AuthRefreshPayload = {
  access_token: string
}

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
}

export function registerLogoutCallback(cb: () => void) {
  logoutCallback = cb
}

export function registerRefreshTokenCallback(cb: (token: string) => void) {
  refreshTokenCallback = cb
}

function isAuthEndpoint(url?: string) {
  return Boolean(url?.includes('/auth/login') || url?.includes('/auth/refresh') || url?.includes('/auth/logout'))
}

async function persistRefreshedAccessToken(token: string) {
  setAccessToken(token)
  try {
    await writeStoredAccessToken(token)
  } catch {
    // The live session remains valid if device storage is temporarily unavailable.
  }
  refreshTokenCallback?.(token)
}

async function clearExpiredAccessToken() {
  setAccessToken(null)
  await clearStoredAccessToken()
}

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post<AuthRefreshPayload>('/auth/refresh')
      .then(async (response) => {
        const token = response.data.access_token
        if (!token) throw new Error('Refresh response did not include an access token.')
        await persistRefreshedAccessToken(token)
        return token
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isAuthEndpoint(originalRequest.url)
    ) {
      originalRequest._retry = true
      try {
        const token = await refreshAccessToken()
        originalRequest.headers.Authorization = `Bearer ${token}`
        return apiClient.request(originalRequest as AxiosRequestConfig)
      } catch {
        await clearExpiredAccessToken()
        logoutCallback?.()
      }
    } else if (error.response?.status === 401 && !isAuthEndpoint(originalRequest?.url)) {
      await clearExpiredAccessToken()
      logoutCallback?.()
    }

    return Promise.reject(error)
  }
)

export default apiClient
