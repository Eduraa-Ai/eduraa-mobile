/**
 * Eduraa Mobile - Axios API Client
 * Platform-aware API client with bearer-token authentication.
 */

import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'
import { fetch as expoFetch, type FetchRequestInit } from 'expo/fetch'
import { Platform } from 'react-native'
import {
  clearStoredAccessToken,
  readStoredAccessToken,
  readStoredRefreshToken,
  writeStoredAccessToken,
  writeStoredRefreshToken,
} from '../auth/authStorage'
import { resolveApiConfig } from './apiConfig'

const resolvedApiConfig = resolveApiConfig({
  platform: Platform.OS,
  isDevelopment: __DEV__,
  universalUrl: process.env.EXPO_PUBLIC_API_URL,
  webUrl: process.env.EXPO_PUBLIC_WEB_API_URL,
  nativeUrl: process.env.EXPO_PUBLIC_NATIVE_API_URL,
  webHostname: typeof window === 'undefined' ? undefined : window.location?.hostname,
  webProtocol: typeof window === 'undefined' ? undefined : window.location?.protocol,
})

const API_TARGET = resolvedApiConfig.target
export const API_BASE_URL = resolvedApiConfig.baseUrl

var inMemoryAccessToken: string | null = null
let accessTokenInitialized = false
let accessTokenRevision = 0

export function setAccessToken(token: string | null) {
  accessTokenInitialized = true
  accessTokenRevision += 1
  inMemoryAccessToken = token
}

export async function getAccessToken() {
  if (accessTokenInitialized) return inMemoryAccessToken
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
      const token = accessTokenInitialized ? inMemoryAccessToken : await readStoredAccessToken()
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
let refreshState: { revision: number; promise: Promise<string> } | null = null

type AuthRefreshPayload = {
  access_token: string
  refresh_token?: string | null
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

async function persistRefreshedAccessToken(token: string, refreshToken?: string | null) {
  setAccessToken(token)
  try {
    await Promise.all([
      writeStoredAccessToken(token),
      refreshToken ? writeStoredRefreshToken(refreshToken) : Promise.resolve(),
    ])
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
  const activeToken = await getAccessToken()
  if (!activeToken) throw new Error('The signed-out session cannot be refreshed.')

  const revision = accessTokenRevision
  if (!refreshState || refreshState.revision !== revision) {
    const refreshToken = await readStoredRefreshToken()
    const promise = refreshClient
      .post<AuthRefreshPayload>('/auth/refresh', refreshToken ? { refresh_token: refreshToken } : undefined)
      .then(async (response) => {
        if (revision !== accessTokenRevision) {
          throw new Error('The account changed while the session was refreshing.')
        }
        const token = response.data.access_token
        if (!token) throw new Error('Refresh response did not include an access token.')
        await persistRefreshedAccessToken(token, response.data.refresh_token)
        return token
      })
      .finally(() => {
        if (refreshState?.revision === revision) refreshState = null
      })
    refreshState = { revision, promise }
  }

  return refreshState.promise
}

/**
 * Authenticated fetch for native transports that need Expo's file/blob support.
 * It mirrors the Axios client's single-refresh behavior so file uploads do not
 * silently lose session recovery just because they use the native fetch stack.
 */
export async function authenticatedFetch(url: string, init: FetchRequestInit = {}) {
  const request = async (token: string | null) => {
    const headers = new Headers(init.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return expoFetch(url, { ...init, headers })
  }

  const response = await request(await getAccessToken())
  if (response.status !== 401 || isAuthEndpoint(url)) return response

  const requestRevision = accessTokenRevision
  try {
    return await request(await refreshAccessToken())
  } catch (error) {
    if (requestRevision === accessTokenRevision) {
      await clearExpiredAccessToken()
      logoutCallback?.()
    }
    throw error
  }
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
      const requestRevision = accessTokenRevision
      try {
        const token = await refreshAccessToken()
        originalRequest.headers.Authorization = `Bearer ${token}`
        return apiClient.request(originalRequest as AxiosRequestConfig)
      } catch {
        if (requestRevision !== accessTokenRevision) return Promise.reject(error)
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
