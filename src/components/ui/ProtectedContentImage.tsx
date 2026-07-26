import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View, type ImageStyle, type StyleProp } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import apiClient, { API_BASE_URL, getAccessToken } from '../../api/client'
import { colors, radius, spacing, typography } from '../../theme'
import { requiresApiAuthorization, resolveDocumentUrl } from '../../utils/protectedDocumentModel'

function resolveAssetUrl(url?: string | null) {
  const value = String(url || '').trim()
  if (!value) return null
  return resolveDocumentUrl(value, API_BASE_URL)
}

export type ProtectedContentImageState = 'loading' | 'loaded' | 'error'

export function ProtectedContentImage({
  uri,
  accessibilityLabel,
  style,
  contentHeight = 150,
  errorHeight = 112,
  onLoadStateChange,
}: {
  uri?: string | null
  accessibilityLabel: string
  style?: StyleProp<ImageStyle>
  contentHeight?: number
  errorHeight?: number
  onLoadStateChange?: (state: ProtectedContentImageState) => void
}) {
  const normalizedUri = useMemo(() => resolveAssetUrl(uri), [uri])
  const needsAuth = Boolean(normalizedUri && requiresApiAuthorization(normalizedUri, API_BASE_URL))
  const [token, setToken] = useState<string | null>(null)
  const [tokenResolved, setTokenResolved] = useState(false)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [retryKey, setRetryKey] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const markLoading = useCallback(() => {
    setIsLoading(true)
    onLoadStateChange?.('loading')
  }, [onLoadStateChange])
  const failImage = useCallback(() => {
    setIsLoading(false)
    setFailed(true)
    onLoadStateChange?.('error')
  }, [onLoadStateChange])

  useEffect(() => {
    markLoading()
  }, [markLoading, normalizedUri])

  useEffect(() => {
    let active = true
    getAccessToken()
      .then((value) => {
        if (active) {
          setToken(value)
          setTokenResolved(true)
        }
      })
      .catch(() => {
        if (active) {
          setToken(null)
          setTokenResolved(true)
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'web' || !normalizedUri || !needsAuth) {
      setObjectUrl(null)
      setFailed(false)
      return
    }

    let active = true
    let nextObjectUrl: string | null = null
    setObjectUrl(null)
    setFailed(false)
    apiClient
      .get<Blob>(normalizedUri, { responseType: 'blob' })
      .then((response) => {
        if (!active) return
        nextObjectUrl = URL.createObjectURL(response.data)
        setObjectUrl(nextObjectUrl)
      })
      .catch(() => {
        if (active) failImage()
      })

    return () => {
      active = false
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl)
    }
  }, [failImage, needsAuth, normalizedUri, retryKey])

  const waitingForCredentials = Platform.OS !== 'web' && needsAuth && !tokenResolved
  const source = !normalizedUri || failed || waitingForCredentials
    ? null
    : Platform.OS === 'web' && needsAuth
      ? objectUrl ? { uri: objectUrl } : null
      : { uri: normalizedUri, headers: needsAuth && token ? { Authorization: `Bearer ${token}` } : undefined }

  if (failed) {
    return (
      <View accessibilityRole="alert" accessibilityLabel={`${accessibilityLabel}. Image unavailable.`} style={[styles.errorPanel, { minHeight: errorHeight }]}>
        <View style={styles.errorCopy}>
          <View style={styles.errorIcon}>
            <Ionicons name="image-outline" size={18} color={colors.accentStrong} />
          </View>
          <View style={styles.errorTextGroup}>
            <Text style={styles.errorTitle}>Image unavailable</Text>
            <Text style={styles.errorMessage}>Check your connection and try once more.</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Retry ${accessibilityLabel}`}
          onPress={() => {
            markLoading()
            setFailed(false)
            setRetryKey((current) => current + 1)
          }}
          style={styles.retryButton}
        >
          <Ionicons name="refresh-outline" size={17} color={colors.white} />
          <Text style={styles.retryText}>Retry image</Text>
        </Pressable>
      </View>
    )
  }

  if (!source) {
    return (
      <View accessibilityRole="progressbar" accessibilityLabel="Loading question figure" style={[styles.loadingSurface, { height: contentHeight }]}>
        <View style={styles.loadingArtwork} importantForAccessibility="no-hide-descendants">
          <View style={styles.loadingImageMark}><Ionicons name="image-outline" size={21} color={colors.accentStrong} /></View>
          <View style={styles.loadingLines}>
            <View style={styles.loadingLineLong} />
            <View style={styles.loadingLineShort} />
          </View>
        </View>
        <View style={styles.loadingStatus}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.loadingText}>Loading question figure</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.imageShell, { height: contentHeight }]}>
      <Image
        key={retryKey}
        source={source}
        accessibilityLabel={accessibilityLabel}
        onLoadStart={markLoading}
        onLoad={() => {
          setIsLoading(false)
          onLoadStateChange?.('loaded')
        }}
        onError={failImage}
        resizeMode="contain"
        style={[styles.image, style]}
      />
      {isLoading ? (
        <View accessibilityRole="progressbar" accessibilityLabel="Loading question figure" style={styles.loadingOverlay}>
          <View style={styles.loadingArtwork} importantForAccessibility="no-hide-descendants">
            <View style={styles.loadingImageMark}><Ionicons name="image-outline" size={21} color={colors.accentStrong} /></View>
            <View style={styles.loadingLines}>
              <View style={styles.loadingLineLong} />
              <View style={styles.loadingLineShort} />
            </View>
          </View>
          <View style={styles.loadingStatus}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingText}>Loading question figure</Text>
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  imageShell: {
    width: '100%',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.backgroundMuted,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
  },
  loadingSurface: {
    width: '100%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[4],
    backgroundColor: '#f6efe4',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[4],
    backgroundColor: '#f6efe4',
  },
  loadingArtwork: {
    width: '72%',
    maxWidth: 230,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    opacity: 0.9,
  },
  loadingImageMark: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: 'rgba(243,108,33,0.18)',
  },
  loadingLines: {
    flex: 1,
    gap: spacing[2],
  },
  loadingLineLong: {
    width: '100%',
    height: 10,
    borderRadius: radius.full,
    backgroundColor: '#e6d9c8',
  },
  loadingLineShort: {
    width: '68%',
    height: 10,
    borderRadius: radius.full,
    backgroundColor: '#eadfd1',
  },
  loadingStatus: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  loadingText: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  errorPanel: {
    width: '100%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[3],
    backgroundColor: colors.backgroundElevated,
    gap: spacing[3],
  },
  errorCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  errorIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  errorTextGroup: {
    flex: 1,
    minWidth: 0,
  },
  errorTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 12,
  },
  errorMessage: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },
  retryButton: {
    minHeight: 44,
    borderRadius: radius.md,
    paddingHorizontal: spacing[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    backgroundColor: colors.nav,
  },
  retryText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
})
