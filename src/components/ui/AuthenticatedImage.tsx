import React, { useEffect, useMemo, useState } from 'react'
import { Image, ImageStyle, Platform, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
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
  const [token, setToken] = useState<string | null>(null)
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    getAccessToken()
      .then((value) => {
        if (active) setToken(value)
      })
      .catch(() => {
        if (active) setToken(null)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'web' || !authorizedAsset) {
      setObjectUrl(null)
      setFailed(false)
      return
    }

    let active = true
    let nextObjectUrl: string | null = null
    setFailed(false)
    setObjectUrl(null)

    apiClient
      .get<Blob>(normalizedUri, { responseType: 'blob' })
      .then((response) => {
        if (!active) return
        nextObjectUrl = URL.createObjectURL(response.data)
        setObjectUrl(nextObjectUrl)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl)
    }
  }, [authorizedAsset, normalizedUri])

  const source =
    Platform.OS === 'web' && authorizedAsset
      ? objectUrl
        ? { uri: objectUrl }
        : null
      : {
          uri: normalizedUri,
          headers: authorizedAsset && token ? { Authorization: `Bearer ${token}` } : undefined,
        }

  if (failed) {
    return (
      <View style={[styles.fallback, containerStyle]} accessibilityLabel={`${accessibilityLabel}. Image unavailable.`}>
        <Ionicons name="image-outline" size={18} color={colors.textMuted} />
        <Text style={styles.fallbackText}>Figure unavailable</Text>
      </View>
    )
  }

  if (!source) {
    return (
      <View style={[styles.fallback, containerStyle]} accessibilityLabel={`${accessibilityLabel}. Loading.`}>
        <Ionicons name="hourglass-outline" size={17} color={colors.textMuted} />
        <Text style={styles.fallbackText}>Loading figure</Text>
      </View>
    )
  }

  return (
    <View style={containerStyle}>
      <Image
        source={source}
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
