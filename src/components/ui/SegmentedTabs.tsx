import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors, radius, spacing, typography } from '../../theme'

export type SegmentedTab<T extends string> = {
  id: T
  label: string
  count?: number
}

type Props<T extends string> = {
  tabs: readonly SegmentedTab<T>[]
  value: T
  onChange: (value: T) => void
  accessibilityLabel: string
}

export function SegmentedTabs<T extends string>({ tabs, value, onChange, accessibilityLabel }: Props<T>) {
  return (
    <View style={styles.track} accessibilityLabel={accessibilityLabel}>
      {tabs.map((tab) => {
        const selected = tab.id === value
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            aria-selected={selected}
            accessibilityLabel={`${tab.label}${tab.count === undefined ? '' : `, ${tab.count}`}`}
            onPress={() => onChange(tab.id)}
            style={({ pressed }) => [styles.tab, selected && styles.selected, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={[styles.label, selected && styles.selectedLabel]}>{tab.label}</Text>
            {tab.count !== undefined && tab.count > 0 ? (
              <View style={[styles.badge, selected && styles.selectedBadge]}>
                <Text style={[styles.badgeText, selected && styles.selectedBadgeText]}>{tab.count}</Text>
              </View>
            ) : null}
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    gap: 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundMuted,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingHorizontal: spacing[1],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radius.md,
  },
  selected: {
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  label: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 12,
  },
  selectedLabel: { color: colors.nav, fontFamily: typography.fonts.bodyBold },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundElevated,
  },
  selectedBadge: { backgroundColor: colors.accentSurface },
  badgeText: { color: colors.textSecondary, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  selectedBadgeText: { color: colors.accentStrong },
})
