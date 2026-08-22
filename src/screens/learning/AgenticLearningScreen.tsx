import React, { useEffect } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import Svg, { Circle } from 'react-native-svg'
import { agenticLearningApi, AgenticLearningSubjectBucket, warmTopicLessons } from '../../api/agenticLearning'
import { AppScreen, ErrorState } from '../../components/ui'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import { AgenticHeader, AgenticIntro, AgenticSectionHeader, AgenticSurface } from './AgenticLearningFrame'
import { useLearnerTrack } from '../../hooks/useLearnerTrack'
import { clampPercent, priorityAction, totalOpenConcepts, weakestSubject } from './agenticLearningModel'

function masteryTone(value: number) {
  if (value >= 75) return colors.success
  if (value >= 45) return colors.warning
  return colors.danger
}

function ReadinessRing({ value }: { value: number }) {
  const size = 74
  const stroke = 7
  const ringRadius = (size - stroke) / 2
  const circumference = 2 * Math.PI * ringRadius
  const progress = clampPercent(value)

  return (
    <View style={styles.ringWrap} accessibilityLabel={`${progress} percent ready`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={ringRadius} stroke="rgba(255,255,255,0.14)" strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={ringRadius}
          stroke="#FBBF24"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference - (progress / 100) * circumference}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.ringCopy}>
        <Text style={styles.ringValue}>{progress}</Text>
        <Text style={styles.ringLabel}>ready</Text>
      </View>
    </View>
  )
}

function SubjectCard({ subject, onPress }: { subject: AgenticLearningSubjectBucket; onPress: () => void }) {
  const mastery = clampPercent(subject.average_mastery)
  const tone = masteryTone(mastery)
  const active = subject.unresolved_count > 0

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${subject.subject_name}, ${mastery} percent mastery, ${subject.unresolved_count} open concepts`}
      accessibilityHint="Opens ranked subtopics for this subject."
      onPress={onPress}
      style={({ pressed }) => [styles.subjectCard, active && styles.subjectCardActive, pressed && styles.pressed]}
    >
      <View style={styles.subjectTop}>
        <Text style={styles.subjectName}>{subject.subject_name}</Text>
        <Text style={[styles.subjectMastery, { color: tone }]}>{mastery}%</Text>
      </View>
      <Text style={styles.subjectMeta}>{subject.unresolved_count} open · {subject.total_subtopics} tracked</Text>
      {subject.top_weak_topic ? (
        <View style={styles.weakRow}>
          <Ionicons name="warning" size={12} color={colors.warning} />
          <Text style={styles.weakText} numberOfLines={1}>{subject.top_weak_topic}</Text>
        </View>
      ) : null}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${mastery}%`, backgroundColor: tone }]} />
      </View>
    </Pressable>
  )
}

function HubSkeleton() {
  return (
    <View style={styles.skeletonStack}>
      <View style={styles.skeletonHero} />
      {[0, 1, 2].map((item) => <View key={item} style={styles.skeletonRow} />)}
    </View>
  )
}

export default function AgenticLearningScreen() {
  const navigation = useNavigation<any>()
  const route = useRoute()
  // The header used to be the literal string "JEE Mains + Advanced" for every
  // learner, which told B2B school students they were on a JEE track. Show the
  // learner's own curriculum instead, and fall back to neutral wording rather
  // than naming a board the account does not claim (issue #63).
  const { isJee, curriculum } = useLearnerTrack()
  const headerMeta = isJee
    ? 'JEE Mains + Advanced'
    : curriculum.label ?? 'Your learning path'
  const params = route.params as { origin?: 'checked-paper'; checkedPaperId?: string } | undefined
  const subjectsQuery = useQuery({
    queryKey: ['agentic-subjects'],
    queryFn: agenticLearningApi.getSubjects,
    staleTime: 30 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  })
  const quickActionsQuery = useQuery({
    queryKey: ['agentic-quick-actions'],
    queryFn: agenticLearningApi.getQuickActions,
    staleTime: 30 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  })

  const subjects = subjectsQuery.data ?? []
  const quickAction = priorityAction(quickActionsQuery.data ?? [])
  const prioritySubject = subjects.find((subject) => subject.subject_id === quickAction?.target_subject_id) ?? weakestSubject(subjects)
  const openCount = totalOpenConcepts(subjects)
  const priorityTitle = quickAction?.label || prioritySubject?.top_weak_topic || 'Your next repair will appear here'
  const priorityDescription = quickAction?.description || (prioritySubject ? `Weakest current signal in ${prioritySubject.subject_name}.` : 'Complete an attempt to unlock a focused repair.')
  const priorityReady = clampPercent(prioritySubject?.average_mastery)

  // The highlighted repair is the most likely first tap, so build its lesson
  // while the learner is still reading the hub.
  const warmQueryClient = useQueryClient()
  const priorityTopicId = quickAction?.target_topic_id ?? null
  useEffect(() => {
    if (!priorityTopicId) return
    void warmTopicLessons(warmQueryClient, [priorityTopicId], 1)
  }, [priorityTopicId, warmQueryClient])

  const openPriority = () => {
    if (quickAction?.target_topic_id) {
      navigation.navigate('AgenticTopic', {
        topicId: quickAction.target_topic_id,
        topicName: priorityTitle,
        subjectName: prioritySubject?.subject_name,
        origin: params?.origin,
        checkedPaperId: params?.checkedPaperId,
      })
      return
    }
    if (prioritySubject) navigation.navigate('AgenticSubject', { subjectId: prioritySubject.subject_id })
  }
  const goBack = () => {
    if (params?.origin === 'checked-paper' && params.checkedPaperId) {
      navigation.getParent()?.navigate('Results', {
        screen: 'ResultDetail',
        params: { checkedPaperId: params.checkedPaperId },
      })
      return
    }
    navigation.navigate('LearningHome')
  }
  const hasCachedSubjects = subjects.length > 0

  return (
    <AppScreen protectedChrome contentStyle={styles.screen} refreshControl={undefined}>
      <AgenticHeader meta={headerMeta} pill="Learn" onBack={goBack} />
      <AgenticIntro
        kicker="Agentic learning"
        title={subjectsQuery.isLoading ? 'Building your learning map' : openCount > 0 ? `${openCount} concepts need work` : 'Your concept map is steady'}
        subtitle="Topic cards built from your attempts, checked papers, and repeated mistakes."
      />

      {subjectsQuery.isLoading && !hasCachedSubjects ? <HubSkeleton /> : null}

      {subjectsQuery.isError && !hasCachedSubjects ? (
        <ErrorState
          title="Learning map unavailable"
          message="Your existing progress is safe. Retry when the learning signal is available."
          loading={subjectsQuery.isFetching || quickActionsQuery.isFetching}
          onAction={() => void Promise.all([subjectsQuery.refetch(), quickActionsQuery.refetch()])}
        />
      ) : null}

      {subjectsQuery.isRefetchError && hasCachedSubjects ? (
        <View accessibilityRole="alert" style={styles.refreshNotice}>
          <Ionicons name="cloud-offline-outline" size={15} color={colors.warning} />
          <Text style={styles.refreshNoticeText}>Showing your saved learning map. Refresh will resume automatically.</Text>
        </View>
      ) : null}

      {!subjectsQuery.isLoading && !subjectsQuery.isError && subjects.length === 0 ? (
        <AgenticSurface style={styles.emptySurface}>
          <View style={styles.emptyIcon}><Ionicons name="sparkles-outline" size={22} color={colors.accentStrong} /></View>
          <Text style={styles.emptyTitle}>Your first concept card is taking shape.</Text>
          <Text style={styles.emptyBody}>Complete a paper or checked attempt and Agentic Learning will turn the evidence into a focused lesson.</Text>
        </AgenticSurface>
      ) : null}

      {hasCachedSubjects ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Priority repair, ${priorityTitle}, ${priorityReady} percent ready`}
            accessibilityHint="Opens the most urgent concept repair."
            disabled={!quickAction?.target_topic_id && !prioritySubject}
            onPress={openPriority}
            style={({ pressed }) => [styles.priorityCard, pressed && styles.priorityPressed]}
          >
            <View style={styles.priorityCopy}>
              <Text style={styles.priorityKicker}>Priority repair</Text>
              <Text style={styles.priorityTitle}>{priorityTitle}</Text>
              <Text style={styles.priorityBody} numberOfLines={2}>{priorityDescription}</Text>
            </View>
            <ReadinessRing value={priorityReady} />
          </Pressable>

          <AgenticSectionHeader title="Subjects" meta="Pick a bucket" />
          <View style={styles.subjectList}>
            {subjects.map((subject) => (
              <SubjectCard
                key={subject.subject_id}
                subject={subject}
                onPress={() => navigation.navigate('AgenticSubject', { subjectId: subject.subject_id })}
              />
            ))}
          </View>
        </>
      ) : null}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing[3],
    paddingBottom: spacing[6],
    backgroundColor: '#FBF6EC',
  },
  priorityCard: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    borderRadius: radius.xl,
    backgroundColor: '#07152D',
    padding: spacing[3],
    ...shadows.md,
  },
  priorityPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  priorityCopy: { flex: 1, minWidth: 0, gap: spacing[1] },
  priorityKicker: {
    color: colors.orangeScale[300],
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  priorityTitle: {
    color: colors.white,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 19,
    lineHeight: 23,
  },
  priorityBody: {
    color: '#B7C2D3',
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
  },
  ringWrap: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center' },
  ringCopy: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ringValue: { color: colors.white, fontFamily: typography.fonts.heading, fontSize: 20, lineHeight: 23 },
  ringLabel: { color: '#B7C2D3', fontFamily: typography.fonts.bodyBold, fontSize: 8, textTransform: 'uppercase' },
  subjectList: { gap: spacing[2] },
  subjectCard: {
    minHeight: 86,
    borderRadius: radius.lg,
    backgroundColor: '#FFFCF6',
    borderWidth: 1,
    borderColor: '#E6D7C5',
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: spacing[1],
  },
  subjectCardActive: { borderColor: colors.borderBrand },
  subjectTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
  subjectName: { flex: 1, color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 16, lineHeight: 20 },
  subjectMastery: { fontFamily: typography.fonts.bodyBold, fontSize: 14 },
  subjectMeta: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 15 },
  weakRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], minHeight: 16 },
  weakText: { flex: 1, color: colors.warning, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  progressTrack: { height: 6, borderRadius: radius.full, backgroundColor: '#E9E1D6', overflow: 'hidden', marginTop: spacing[1] },
  progressFill: { height: '100%', borderRadius: radius.full },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  skeletonStack: { gap: spacing[3] },
  skeletonHero: { height: 112, borderRadius: radius.xl, backgroundColor: colors.slate[200] },
  skeletonRow: { height: 86, borderRadius: radius.lg, backgroundColor: colors.slate[100], borderWidth: 1, borderColor: colors.borderSubtle },
  refreshNotice: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    borderRadius: radius.md,
    backgroundColor: colors.warningSurface,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    paddingHorizontal: spacing[3],
  },
  refreshNoticeText: {
    flex: 1,
    color: colors.textSecondary,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
  },
  emptySurface: { alignItems: 'center', gap: spacing[3], paddingVertical: spacing[8] },
  emptyIcon: { width: 48, height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSurface },
  emptyTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 19, textAlign: 'center' },
  emptyBody: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 13, lineHeight: 20, textAlign: 'center' },
})
