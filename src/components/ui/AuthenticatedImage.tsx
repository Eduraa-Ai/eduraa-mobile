import React, { useEffect, useMemo, useState } from 'react'
import { Image, ImageStyle, Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { File, Paths } from 'expo-file-system'
import apiClient, { API_BASE_URL, getAccessToken } from '../../api/client'
import { colors, spacing, typography } from '../../theme'
import { requiresApiAuthorization } from '../../utils/protectedDocumentModel'

type AuthenticatedImageProps = {
  uri: string
  accessibilityLabel: string
  imageStyle?: StyleProp<ImageStyle>
  containerStyle?: StyleProp<ViewStyle>
}

function resolveAssetUrl(uri: string) {
  if (/^https?:\/\//i.test(uri)) return uri
  return `${API_BASE_URL}${uri.startsWith('/') ? uri : `/${uri}`}`
}

// Stable-ish, filesystem-safe stem for cache filenames. Includes a short URL
// signature so distinct pages don't collide.
function cacheFilename(uri: string, label: string) {
  const cleanLabel =
    label
      .replace(/[^A-Za-z0-9_.-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'asset'
  let hash = 0
  for (let i = 0; i < uri.length; i += 1) {
    hash = (hash * 31 + uri.charCodeAt(i)) | 0
  }
  return `${cleanLabel}-${Math.abs(hash).toString(36)}.png`
}

/**
 * Fetch an API-protected asset the same way the download path does:
 * pull a token first, then hit the endpoint with `Authorization: Bearer`.
 *
 * Web: axios blob → `blob:` object URL for `<Image>`.
 * Native: `File.downloadFileAsync` writes to cache dir; we render the local
 *   `file://` URI so the underlying image loader never has to send auth
 *   itself. This mirrors `openProtectedDocument` and eliminates the token
 *   race that broke B2B previews.
 */
export function AuthenticatedImage({
  uri,
  accessibilityLabel,
  imageStyle,
  containerStyle,
}: AuthenticatedImageProps) {
  const normalizedUri = useMemo(() => resolveAssetUrl(uri), [uri])
  const authorizedAsset = useMemo(
    () => requiresApiAuthorization(normalizedUri, API_BASE_URL),
    [normalizedUri],
  )
  const [localUri, setLocalUri] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // External assets (non-API) render directly.
    if (!authorizedAsset) {
      setLocalUri(null)
      setFailed(false)
      return
    }

    let active = true
    let objectUrlToRevoke: string | null = null
    setFailed(false)
    setLocalUri(null)

    void (async () => {
      try {
        if (Platform.OS === 'web') {
          const response = await apiClient.get<Blob>(normalizedUri, { responseType: 'blob' })
          if (!active) return
          objectUrlToRevoke = URL.createObjectURL(response.data)
          setLocalUri(objectUrlToRevoke)
        } else {
          const token = await getAccessToken()
          if (!active) return
          const destination = new File(Paths.cache, cacheFilename(normalizedUri, accessibilityLabel))
          const downloaded = await File.downloadFileAsync(normalizedUri, destination, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            idempotent: true,
          })
          if (!active) return
          setLocalUri(downloaded.uri)
        }
      } catch {
        if (active) setFailed(true)
      }
    })()

    return () => {
      active = false
      if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke)
    }
  }, [authorizedAsset, normalizedUri, accessibilityLabel])

  // For unauthorized (external) assets, render directly with no auth needed.
  const externalSource = !authorizedAsset ? { uri: normalizedUri } : null

  if (failed) {
    return (
      <View
        style={[styles.fallback, containerStyle]}
        accessibilityLabel={`${accessibilityLabel}. Image unavailable.`}
      >
        <Ionicons name="image-outline" size={18} color={colors.textMuted} />
        <Text style={styles.fallbackText}>Figure unavailable</Text>
      </View>
    )
  }

  if (!externalSource && !localUri) {
    return (
      <View
        style={[styles.fallback, containerStyle]}
        accessibilityLabel={`${accessibilityLabel}. Loading.`}
      >
        <Ionicons name="hourglass-outline" size={17} color={colors.textMuted} />
        <Text style={styles.fallbackText}>Loading figure</Text>
      </View>
    )
  }

  return (
    <View style={containerStyle}>
      <Image
        source={externalSource ?? { uri: localUri as string }}
        accessibilityLabel={accessibilityLabel}
        resizeMode="contain"
        style={imageStyle}
        onError={() => setFailed(true)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  fallback: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    backgroundColor: colors.backgroundMuted,
  },
  fallbackText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
})

export default AuthenticatedImage
