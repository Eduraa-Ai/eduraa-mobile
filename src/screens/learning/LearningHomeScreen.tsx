import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { AnimatedCard, AppScreen } from '../../components/ui'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'

type LearningDestination = 'AgenticLearning' | 'CompetitiveExam' | 'PreviousPapers' | 'AllControls'

interface LearningTile {
  title: string
  meta: string
  body: string
  icon: keyof typeof Ionicons.glyphMap
  color: string
  destination: LearningDestination
}

const tiles: LearningTile[] = [
  {
    title: 'Agentic Learning',
    meta: 'B2B + B2C students',
    body: 'Open weak concepts, study the lesson, and mark the pattern resolved.',
    icon: 'sparkles',
    color: colors.accent,
    destination: 'AgenticLearning',
  },
  {
    title: 'JEE resources',
    meta: 'B2C JEE track',
    body: 'Open chapter maps, revision PDFs, and formula resources.',
    icon: 'book',
    color: colors.warning,
    destination: 'CompetitiveExam',
  },
  {
    title: 'JEE previous papers',
    meta: 'B2C JEE track',
    body: 'Browse structured PYQs, review solutions, and start timed paper practice.',
    icon: 'library',
    color: colors.paperStudio.jee,
    destination: 'PreviousPapers',
  },
  {
    title: 'All website controls',
    meta: 'Role map',
    body: 'See every website sidebar control available to this account.',
    icon: 'grid',
    color: colors.info,
    destination: 'AllControls',
  },
]

export default function LearningHomeScreen() {
  const navigation = useNavigation<any>()
  const role = useAuthStore((state) => state.user?.role)

  return (
    <AppScreen contentStyle={styles.screen}>
      <View style={styles.introPanel}>
        <View style={styles.introIcon}>
          <Ionicons name="school-outline" size={20} color={colors.accentStrong} />
        </View>
        <View style={styles.introCopy}>
          <Text style={styles.introKicker}>Learning</Text>
          <Text style={styles.introTitle}>{role === 'b2c_student' ? 'JEE workspace' : 'Student workspace'}</Text>
          <Text style={styles.introBody} numberOfLines={2}>
            Agentic lessons, JEE resources, and previous-year practice in one place.
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.title}
            onPress={() => navigation.navigate(tile.destination)}
            style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
          >
            <View style={styles.tileTop}>
              <View style={[styles.iconWrap, { backgroundColor: `${tile.color}14` }]}>
                <Ionicons name={tile.icon} size={20} color={tile.color} />
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSoft} />
            </View>
            <Text style={styles.tileMeta}>{tile.meta}</Text>
            <Text style={styles.tileTitle}>{tile.title}</Text>
            <Text style={styles.tileBody}>{tile.body}</Text>
          </Pressable>
        ))}
      </View>

      <AnimatedCard style={styles.noteCard}>
        <Text style={styles.noteKicker}>Routing check</Text>
        <Text style={styles.noteTitle}>B2B students are still students here.</Text>
        <Text style={styles.noteBody}>
          A school student account can open Agentic Learning from this tab. B2B staff roles remain outside this student shell.
        </Text>
      </AnimatedCard>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing[4],
    paddingBottom: spacing[16],
  },
  introPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    ...shadows.xs,
  },
  introIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurface,
  },
  introCopy: {
    flex: 1,
    minWidth: 0,
  },
  introKicker: {
    ...typography.roles.eyebrow,
    color: colors.accent,
  },
  introTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 22,
    lineHeight: 27,
    marginTop: 2,
  },
  introBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing[1],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  tile: {
    width: '48.5%',
    minHeight: 138,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing[3],
    justifyContent: 'space-between',
    ...shadows.xs,
  },
  tilePressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileMeta: {
    ...typography.roles.eyebrow,
    color: colors.textSoft,
    letterSpacing: 0.4,
    fontSize: 9,
  },
  tileTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
    lineHeight: 19,
  },
  tileBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 15,
  },
  noteCard: {
    gap: spacing[2],
  },
  noteKicker: {
    ...typography.roles.eyebrow,
    color: colors.accent,
  },
  noteTitle: {
    ...typography.roles.title,
    color: colors.text,
  },
  noteBody: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
})
