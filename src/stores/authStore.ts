/**
 * Eduraa Mobile - Auth Store (Zustand)
 * Cross-platform persisted authentication and session restoration state.
 */

import { create } from 'zustand'
import { authApi } from '../api/auth'
import { registerLogoutCallback, registerRefreshTokenCallback, setAccessToken } from '../api/client'
import {
  clearPersistedAuth,
  readPersistedAuth,
  readStoredRefreshToken,
  writePersistedAuth,
} from '../auth/authStorage'
import { accountCacheScope, clearRegisteredPrivateQueryCache } from '../auth/queryCacheScope'
import type { AccountMinimal, AuthToken } from '../types'

interface AuthState {
  user: AccountMinimal | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  sessionRestoreError: string | null
  setAuth: (authToken: AuthToken) => Promise<void>
  logout: () => Promise<void>
  loadFromStorage: () => Promise<{ token: string | null; user: AccountMinimal | null }>
  beginSessionRestore: () => void
  finishSessionRestore: (error?: string | null) => void
}

export const useAuthStore = create<AuthState>((set, get) => {
  let pendingServerLogout: Promise<void> | null = null

  registerLogoutCallback(() => {
    void get().logout()
  })
  registerRefreshTokenCallback((token) => {
    set((state) => ({
      token,
      isAuthenticated: Boolean(token && state.user),
    }))
  })

  return {
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
    sessionRestoreError: null,

    setAuth: async (authToken: AuthToken) => {
      if (pendingServerLogout) await pendingServerLogout
      try {
        await writePersistedAuth(
          authToken.access_token,
          authToken.user,
          authToken.refresh_token,
        )
      } catch {
        // Keep the live session usable even if device storage is unavailable.
      }

      if (accountCacheScope(get().user) !== accountCacheScope(authToken.user)) {
        clearRegisteredPrivateQueryCache()
      }
      setAccessToken(authToken.access_token)
      set({
        user: authToken.user,
        token: authToken.access_token,
        isAuthenticated: true,
        isLoading: false,
        sessionRestoreError: null,
      })
    },

    logout: async () => {
      const refreshToken = await readStoredRefreshToken()
      const serverLogout = authApi.logout(refreshToken).catch(() => undefined)
      pendingServerLogout = serverLogout
      const storageCleanup = clearPersistedAuth()
      clearRegisteredPrivateQueryCache()
      setAccessToken(null)
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        sessionRestoreError: null,
      })
      await Promise.all([storageCleanup, serverLogout])
      if (pendingServerLogout === serverLogout) pendingServerLogout = null
    },

    loadFromStorage: async () => {
      const persisted = await readPersistedAuth()
      setAccessToken(persisted.token)

      if (persisted.token) {
        // Keep the navigation gate closed while /auth/me validates the token.
        // A cached user is retained so a temporary outage can safely restore
        // the correct role-based shell instead of showing the login template.
        set({
          token: persisted.token,
          user: persisted.user,
          isAuthenticated: Boolean(persisted.user),
          isLoading: true,
          sessionRestoreError: null,
        })
      } else {
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          isLoading: false,
          sessionRestoreError: null,
        })
      }

      return persisted
    },

    beginSessionRestore: () => {
      set({ isLoading: true, sessionRestoreError: null })
    },

    finishSessionRestore: (error = null) => {
      set((state) => ({
        isAuthenticated: Boolean(state.token && state.user),
        isLoading: false,
        sessionRestoreError: error,
      }))
    },
  }
})
