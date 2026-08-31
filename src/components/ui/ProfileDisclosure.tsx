import React, { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { typography } from '../../theme'

type ProfileDisclosureProps = {
  title: string
  summary: string
  icon: keyof typeof Ionicons.glyphMap
  children: ReactNode
  defaultExpanded?: boolean
}

export function ProfileDisclosure({
  title,
  summary,
  icon,
  children,
  defaultExpanded = false,
}: ProfileDisclosureProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <View style={[styles.container, expanded && styles.containerExpanded]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${summary}`}
        accessibilityHint={expanded ? 'Collapses this profile section' : 'Expands this profile section'}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
      >
        <View style={styles.icon}>
          <Ionicons name={icon} size={19} color="#C2410C" />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {!expanded ? <Text style={styles.summary} numberOfLines={2}>{summary}</Text> : null}
        </View>
        <View style={[styles.chevron, expanded && styles.chevronExpanded]}>
          <Ionicons name="chevron-down" size={17} color={expanded ? '#FFFFFF' : '#667085'} />
        </View>
      </Pressable>
      {expanded ? <View style={styles.content}>{children}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#D8CDBE',
  },
  containerExpanded: { borderBottomColor: '#C9BAA7' },
  trigger: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 10,
  },
  triggerPressed: { backgroundColor: '#F8F0E5' },
  icon: {
    width: 30,
    height: 30,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, minWidth: 0 },
  title: {
    color: '#101828',
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
    lineHeight: 18,
  },
  summary: {
    marginTop: 3,
    color: '#667085',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  chevron: {
    width: 30,
    height: 30,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
  },
  chevronExpanded: { backgroundColor: '#07152D' },
  content: {
    marginLeft: 15,
    paddingTop: 2,
    paddingLeft: 25,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0D6C8',
    borderLeftWidth: 2,
    borderLeftColor: '#F36C21',
  },
})
