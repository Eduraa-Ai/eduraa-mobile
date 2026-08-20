/**
 * Eduraa Mobile — Root App
 */

import React, { useCallback, useEffect, useRef } from 'react'
import { StatusBar } from 'expo-status-bar'
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NetInfo from '@react-native-community/netinfo'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AppState, StyleSheet, View, ActivityIndicator, Platform } from 'react-native'
import { useFonts, Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope'
import { SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk'
import RootNavigator from './src/navigation'
import { useAuthStore } from './src/stores/authStore'
import { authApi } from './src/api/auth'
import { isDefinitiveAuthFailure, queryRetryDelay, shouldRetryQuery } from './src/api/queryReliability'
import {
  accountCacheScope,
  registerPrivateQueryCacheClearer,
  shouldClearQueryCache,
} from './src/auth/queryCacheScope'

onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((state) => {
  setOnline(state.isConnected !== false && state.isInternetReachable !== false)
}))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'online',
      retry: shouldRetryQuery,
      retryDelay: queryRetryDelay,
      refetchOnReconnect: 'always',
      refetchOnWindowFocus: true,
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
    mutations: {
      networkMode: 'online',
      retry: false,
    },
  },
})

registerPrivateQueryCacheClearer(() => queryClient.clear())

function AppContent() {
  const { setAuth, logout, finishSessionRestore } = useAuthStore()
  const activeAccountScope = useAuthStore((state) => accountCacheScope(state.user))
  const previousAccountScope = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (Platform.OS === 'web') return
    const subscription = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active')
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (shouldClearQueryCache(previousAccountScope.current, activeAccountScope)) {
      queryClient.clear()
    }
    previousAccountScope.current = activeAccountScope
  }, [activeAccountScope])

  const restoreSession = useCallback(async () => {
    const store = useAuthStore.getState()
    store.beginSessionRestore()
    const { token, user: cachedUser } = await store.loadFromStorage()
    if (!token) return

    try {
      const user = await authApi.me()
      const latestToken = useAuthStore.getState().token || token
      await setAuth({ access_token: latestToken, token_type: 'bearer', user })
    } catch (error) {
      if (isDefinitiveAuthFailure(error)) {
        await logout()
        return
      }

      // Cached identity is enough to restore the correct role-aware shell
      // during a temporary outage. Legacy sessions without cached identity
      // get a clear retry state instead of a misleading login page.
      finishSessionRestore(
        cachedUser
          ? null
          : 'We found your saved session, but Eduraa could not verify it yet.'
      )
    }
  }, [finishSessionRestore, logout, setAuth])

  useEffect(() => {
    void restoreSession()
  }, [restoreSession])

  return (
    <>
      <StatusBar style="auto" />
      <WebPreviewShell>
        <RootNavigator onRetrySession={() => void restoreSession()} />
      </WebPreviewShell>
    </>
  )
}

function WebPreviewShell({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') {
    return <>{children}</>
  }

  return (
    <View style={styles.webStage}>
      <View style={styles.webPhone}>{children}</View>
    </View>
  )
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  })

  if (!fontsLoaded) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' }]}>
        <ActivityIndicator color="#0f766e" />
      </View>
    )
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppContent />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  webStage: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#e9eef2',
  },
  webPhone: {
    width: '100%',
    maxWidth: 430,
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#fffaf2',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.18,
    shadowRadius: 50,
  },
})
