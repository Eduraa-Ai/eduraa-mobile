import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useNavigation } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { AnimatedCard, AppScreen, ErrorState, SkeletonCard } from '../../components/ui'
import { learningResourcesApi, LearningResource } from '../../api/learningResources'
import { cheatSheetsApi, CheatSheet } from '../../api/cheatSheets'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'

type FilterKey = 'all' | 'formula_sheet' | 'reference_book' | 'revision_notes' | 'cheat_sheet'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'formula_sheet', label: 'Formula sheets' },
  { key: 'reference_book', label: 'Reference books' },
  { key: 'revision_notes', label: 'Revision notes' },
  { key: 'cheat_sheet', label: 'Cheat sheets' },
]

type LibraryItem =
  | { kind: 'resource'; id: string; sortKey: string; resource: LearningResource }
  | { kind: 'cheatSheet'; id: string; sortKey: string; sheet: CheatSheet }

type ResourceLook = {
  icon: keyof typeof Ionicons.glyphMap
  tint: string
  surface: string
  typeLabel: string
}

function resourceLook(type: string): ResourceLook {
  const key = type.toLowerCase()
  if (key.includes('formula')) {
    return {
      icon: 'reader-outline',
      tint: colors.accentStrong,
      surface: colors.accentSurface,
      typeLabel: 'Formula sheet',
    }
  }
  if (key.includes('reference') || key.includes('book')) {
    return {
      icon: 'book-outline',
      tint: colors.info,
      surface: colors.infoSurface,
      typeLabel: 'Reference book',
    }
  }
  if (key.includes('revision')) {
    return {
      icon: 'newspaper-outline',
      tint: colors.success,
      surface: colors.successSurface,
      typeLabel: 'Revision notes',
    }
  }
  return {
    icon: 'document-text-outline',
    tint: colors.slate[700],
    surface: colors.slate[100],
    typeLabel: type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  }
}

const cheatSheetLook: ResourceLook = {
  icon: 'sparkles',
  tint: colors.violet[600],
  surface: colors.violet[50],
  typeLabel: 'Cheat sheet',
}

function countCheatSheetItems(sheet: CheatSheet) {
  return sheet.payload.chapters.reduce(
    (total, chapter) =>
      total +
      chapter.topics.reduce((topicTotal, topic) => {
        const s = topic.sections
        return (
          topicTotal +
          s.definitions.length +
          s.must_know_concepts.length +
          s.formulas.length +
          s.process_steps.length +
          s.mini_examples.length +
          s.common_mistakes.length +
          s.memory_tips.length +
          s.last_minute_revision.length
        )
      }, 0),
    0,
  )
}

export default function LearningResourcesScreen() {
  const navigation = useNavigation<any>()
  const user = useAuthStore((state) => state.user)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')

  const resourcesQuery = useQuery({
    queryKey: ['learning-resources-library', user?.id],
    queryFn: () =>
      learningResourcesApi.list({
        target_exam: user?.b2c_target_exam || undefined,
        standard: user?.b2c_standard || undefined,
      }),
  })

  const cheatSheetsQuery = useQuery({
    queryKey: ['cheat-sheets-library', user?.id],
    queryFn: () => cheatSheetsApi.list(),
  })

  const resources = resourcesQuery.data?.items ?? []
  const cheatSheets = cheatSheetsQuery.data?.items ?? []

  const merged = useMemo<LibraryItem[]>(() => {
    const resourceItems: LibraryItem[] = resources.map((resource) => ({
      kind: 'resource' as const,
      id: `res_${resource.id}`,
      sortKey: resource.updated_at || resource.created_at || resource.title,
      resource,
    }))
    const sheetItems: LibraryItem[] = cheatSheets.map((sheet) => ({
      kind: 'cheatSheet' as const,
      id: `cs_${sheet.id}`,
      sortKey: sheet.updated_at || sheet.created_at || sheet.title,
      sheet,
    }))
    return [...resourceItems, ...sheetItems].sort((a, b) => b.sortKey.localeCompare(a.sortKey))
  }, [resources, cheatSheets])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return merged.filter((item) => {
      if (filter === 'cheat_sheet' && item.kind !== 'cheatSheet') return false
      if (filter !== 'all' && filter !== 'cheat_sheet') {
        if (item.kind !== 'resource') return false
        const type = item.resource.resource_type.toLowerCase()
        if (filter === 'formula_sheet' && !type.includes('formula')) return false
        if (filter === 'reference_book' && !(type.includes('reference') || type.includes('book'))) return false
        if (filter === 'revision_notes' && !type.includes('revision')) return false
      }
      if (!query) return true
      if (item.kind === 'resource') {
        const r = item.resource
        return (
          r.title.toLowerCase().includes(query) ||
          (r.description || '').toLowerCase().includes(query) ||
          (r.provider_label || '').toLowerCase().includes(query) ||
          (r.subject_name || '').toLowerCase().includes(query)
        )
      }
      const s = item.sheet
      return (
        s.title.toLowerCase().includes(query) ||
        s.payload.scope_summary.toLowerCase().includes(query) ||
        s.payload.chapters.some((c) => c.chapter_title.toLowerCase().includes(query))
      )
    })
  }, [merged, filter, search])

  const trackLabel = user?.b2c_target_exam || user?.b2c_standard || user?.b2c_board || 'Your library'
  const isLoading = resourcesQuery.isLoading || cheatSheetsQuery.isLoading
  const anyError = resourcesQuery.isError && cheatSheetsQuery.isError

  return (
    <AppScreen contentStyle={styles.screen}>
      <LinearGradient
        colors={[colors.slate[950], colors.slate[900], '#221512']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}>
            <Ionicons name="library-outline" size={22} color={colors.accentLight} />
          </View>
          <View style={styles.trackPill}>
            <Text style={styles.trackPillText}>{trackLabel}</Text>
          </View>
        </View>
        <Text style={styles.heroKicker}>Learning resources</Text>
        <Text style={styles.heroTitle}>Your study library</Text>
        <Text style={styles.heroBody}>
          Formula sheets, reference books, AI cheat sheets and chapter study packs in one place.
        </Text>
      </LinearGradient>

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={colors.textSoft} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search formula sheets, notes…"
          placeholderTextColor={colors.textSoft}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textSoft} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.chipRow}>
        {FILTERS.map((chip) => (
          <Pressable
            key={chip.key}
            onPress={() => setFilter(chip.key)}
            style={({ pressed }) => [
              styles.chip,
              filter === chip.key && styles.chipActive,
              pressed && styles.chipPressed,
            ]}
          >
            <Text style={[styles.chipLabel, filter === chip.key && styles.chipLabelActive]}>{chip.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.countRow}>
        <Text style={styles.countTitle}>Resources</Text>
        <Text style={styles.countMeta}>
          {isLoading ? 'loading…' : `${filtered.length} ${filtered.length === 1 ? 'item' : 'items'}`}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.skeletonList}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : null}

      {!isLoading && anyError ? (
        <ErrorState
          title="Could not load your library"
          message="Refresh and try again."
          onAction={() => {
            void resourcesQuery.refetch()
            void cheatSheetsQuery.refetch()
          }}
        />
      ) : null}

      {!isLoading && !anyError && filtered.length === 0 ? (
        <AnimatedCard style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons name="sparkles-outline" size={20} color={colors.accentStrong} />
          </View>
          <Text style={styles.emptyTitle}>
            {search
              ? 'No matches for that search'
              : filter === 'cheat_sheet'
                ? 'No cheat sheets yet'
                : 'Your library is opening up'}
          </Text>
          <Text style={styles.emptyBody}>
            {search
              ? 'Try a different keyword or clear the search.'
              : 'Published sheets, reference books, and AI cheat sheets will appear here as they land.'}
          </Text>
        </AnimatedCard>
      ) : null}

      {!isLoading && !anyError ? (
        <View style={styles.list}>
          {filtered.map((item) => {
            if (item.kind === 'resource') {
              return (
                <ResourceRow
                  key={item.id}
                  resource={item.resource}
                  onPress={() =>
                    navigation.navigate('LearningResourceDetail', { resourceId: item.resource.id })
                  }
                />
              )
            }
            return (
              <CheatSheetRow
                key={item.id}
                sheet={item.sheet}
                onPress={() =>
                  navigation.navigate('CheatSheetDetail', { cheatSheetId: item.sheet.id })
                }
              />
            )
          })}
        </View>
      ) : null}
    </AppScreen>
  )
}

function ResourceRow({ resource, onPress }: { resource: LearningResource; onPress: () => void }) {
  const look = resourceLook(resource.resource_type)
  const meta = [
    resource.provider_label,
    resource.subject_name,
    resource.page_count ? `${resource.page_count} pages` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const scopePreview = resource.scopes
    .slice(0, 3)
    .map((s) => s.node_name)
    .join(', ')

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: look.surface }]}>
          <Ionicons name={look.icon} size={18} color={look.tint} />
        </View>
        <View style={styles.typePill}>
          <Text style={styles.typePillText}>{look.typeLabel}</Text>
        </View>
        <View style={styles.chevron}>
          <Ionicons name="chevron-forward" size={16} color={colors.textSoft} />
        </View>
      </View>
      <Text style={styles.cardTitle}>{resource.title}</Text>
      {meta ? <Text style={styles.cardMeta}>{meta}</Text> : null}
      {scopePreview ? (
        <Text style={styles.cardScope} numberOfLines={2}>
          {scopePreview}
        </Text>
      ) : resource.description ? (
        <Text style={styles.cardScope} numberOfLines={2}>
          {resource.description}
        </Text>
      ) : null}
    </Pressable>
  )
}

function CheatSheetRow({ sheet, onPress }: { sheet: CheatSheet; onPress: () => void }) {
  const points = countCheatSheetItems(sheet)
  const chapters = sheet.payload.chapters.length
  const meta = `AI generated · ${chapters} ${chapters === 1 ? 'chapter' : 'chapters'} · ${points} points`

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: cheatSheetLook.surface }]}>
          <Ionicons name={cheatSheetLook.icon} size={18} color={cheatSheetLook.tint} />
        </View>
        <View style={[styles.typePill, styles.typePillSheet]}>
          <Text style={[styles.typePillText, styles.typePillTextSheet]}>{cheatSheetLook.typeLabel}</Text>
        </View>
        <View style={styles.chevron}>
          <Ionicons name="chevron-forward" size={16} color={colors.textSoft} />
        </View>
      </View>
      <Text style={styles.cardTitle}>{sheet.title}</Text>
      <Text style={styles.cardMeta}>{meta}</Text>
      {sheet.payload.scope_summary ? (
        <Text style={styles.cardScope} numberOfLines={2}>
          {sheet.payload.scope_summary}
        </Text>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: spacing[20],
    gap: spacing[3],
  },
  hero: {
    borderRadius: radius['2xl'],
    padding: spacing[5],
    gap: spacing[2],
    ...shadows.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing[1],
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249, 115, 22, 0.16)',
  },
  trackPill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  trackPillText: {
    color: colors.textInverse,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  heroKicker: {
    color: colors.accentLight,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: colors.textInverse,
    fontFamily: typography.fonts.heading,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.4,
  },
  heroBody: {
    color: 'rgba(226, 232, 240, 0.86)',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing[1],
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 46,
    paddingHorizontal: spacing[4],
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadows.xs,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
    padding: 0,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  chip: {
    paddingHorizontal: spacing[3],
    height: 34,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.slate[900],
    borderColor: colors.slate[900],
  },
  chipPressed: {
    transform: [{ scale: 0.97 }],
  },
  chipLabel: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 12,
  },
  chipLabelActive: {
    color: colors.textInverse,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing[1],
    marginTop: spacing[1],
  },
  countTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  countMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  list: {
    gap: spacing[3],
  },
  skeletonList: {
    gap: spacing[3],
  },
  card: {
    padding: spacing[4],
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadows.xs,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typePill: {
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.slate[100],
  },
  typePillSheet: {
    backgroundColor: colors.violet[50],
  },
  typePillText: {
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  typePillTextSheet: {
    color: colors.violet[700],
  },
  chevron: {
    marginLeft: 'auto',
  },
  cardTitle: {
    marginTop: spacing[3],
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  cardMeta: {
    marginTop: spacing[1],
    color: colors.textMuted,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 11,
  },
  cardScope: {
    marginTop: spacing[2],
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11.5,
    lineHeight: 16,
  },
  emptyCard: {
    padding: spacing[5],
    gap: spacing[2],
    alignItems: 'flex-start',
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
  },
  emptyBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12.5,
    lineHeight: 17,
  },
})
