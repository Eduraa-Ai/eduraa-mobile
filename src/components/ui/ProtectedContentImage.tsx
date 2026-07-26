import React, { useEffect, useMemo, useState } from 'react'
import { Image, Platform, StyleSheet, Text, View, type ImageStyle, type StyleProp } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import apiClient, { API_BASE_URL, getAccessToken } from '../../api/client'
import { colors, radius, spacing, typography } from '../../theme'
import { requiresApiAuthorization, resolveDocumentUrl } from '../../utils/protectedDocumentModel'

function resolveAssetUrl(url?: string | null) {
  const value = String(url || '').trim()
  if (!value) return null
  return resolveDocumentUrl(value, API_BASE_URL)
}

export function ProtectedContentImage({
  uri,
  accessibilityLabel,
  style,
}: {
  uri?: string | null
  accessibilityLabel: string
  style?: StyleProp<ImageStyle>
}) {
  const normalizedUri = useMemo(() => resolveAssetUrl(uri), [uri])
  const needsAuth = Boolean(normalizedUri && requiresApiAuthorization(normalizedUri, API_BASE_URL))
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
        if (active) setFailed(true)
      })

    return () => {
      active = false
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl)
    }
  }, [needsAuth, normalizedUri])

  const source = !normalizedUri || failed
    ? null
    : Platform.OS === 'web' && needsAuth
      ? objectUrl ? { uri: objectUrl } : null
      : { uri: normalizedUri, headers: needsAuth && token ? { Authorization: `Bearer ${token}` } : undefined }

  if (!source) {
    return (
      <View accessibilityLabel={accessibilityLabel} style={styles.fallback}>
        <Ionicons name={failed ? 'image-outline' : 'hourglass-outline'} size={18} color={colors.textMuted} />
        <Text style={styles.fallbackText}>{failed ? 'Image unavailable' : 'Loading image'}</Text>
      </View>
    )
  }

  return <Image source={source} accessibilityLabel={accessibilityLabel} onError={() => setFailed(true)} resizeMode="contain" style={[styles.image, style]} />
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: 150,
    borderRadius: radius.md,
    backgroundColor: colors.backgroundMuted,
  },
  fallback: {
    minHeight: 72,
    width: '100%',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[1],
    backgroundColor: colors.backgroundMuted,
  },
  fallbackText: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
  },
})
