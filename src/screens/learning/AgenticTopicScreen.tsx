import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNetInfo } from '@react-native-community/netinfo'
import { agenticFailureKind, agenticLearningApi } from '../../api/agenticLearning'
import { getHttpStatus } from '../../api/queryReliability'
import { AppScreen, ErrorState, MathText } from '../../components/ui'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import { AgenticHeader, AgenticIntro, AgenticSectionHeader, AgenticSurface } from './AgenticLearningFrame'
import { clampPercent, nextOpenTopic, topicStatusLabel } from './agenticLearningModel'

type RouteParams = {
  topicId: string
  topicName?: string
  subjectName?: string
  origin?: 'checked-paper'
  checkedPaperId?: string
}

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statTile} accessibilityLabel={`${label}, ${value}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function RouteStep({ index, title, body, tone, last }: { index: number; title: string; body: string; tone: string; last?: boolean }) {
  return (
    <View style={styles.routeStep}>
      <View style={styles.routeRail}>
        <View style={[styles.routeNumber, { backgroundColor: tone }]}><Text style={styles.routeNumberText}>{index}</Text></View>
        {!last ? <View style={styles.routeLine} /> : null}
      </View>
      <View style={styles.routeCopy}>
        <Text style={styles.routeTitle}>{title}</Text>
        <Text style={styles.routeBody}>{body}</Text>
      </View>
    </View>
  )
}

function PrimaryAction({ label, onPress, loading, success = false }: { label: string; onPress: () => void; loading?: boolean; success?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryAction, success && styles.primaryActionSuccess, pressed && styles.actionPressed, loading && styles.actionDisabled]}
    >
      {loading ? <ActivityIndicator color={colors.white} /> : <Ionicons name={success ? 'arrow-forward' : 'checkmark'} size={18} color={colors.white} />}
      <Text style={styles.primaryActionText}>{label}</Text>
    </Pressable>
  )
}

function LessonConnectionStatus({ failed, offline, loading, onRetry }: { failed: boolean; offline: boolean; loading: boolean; onRetry: () => void }) {
  const title = failed ? offline ? 'Lesson saved offline' : 'Saved lesson · refresh paused' : 'Lesson synced'
  const detail = failed ? 'Progress unchanged' : 'Evidence and progress saved'

  return (
    <View style={styles.connectionStatus} accessibilityRole={failed ? 'alert' : undefined} accessibilityLabel={`${title}. ${detail}.`}>
      <View style={[styles.connectionDot, { backgroundColor: failed ? colors.warning : colors.success }]} />
      <View style={styles.connectionCopy}>
        <Text style={styles.connectionTitle} numberOfLines={1} maxFontSizeMultiplier={1.5}>{title}</Text>
        <Text style={styles.connectionDetail} numberOfLines={1} maxFontSizeMultiplier={1.5}>{detail}</Text>
      </View>
      {failed && !offline ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={loading ? 'Refreshing lesson' : 'Refresh lesson'}
          accessibilityState={{ disabled: loading, busy: loading }}
          disabled={loading}
          onPress={onRetry}
          style={({ pressed }) => [styles.connectionAction, pressed && styles.actionPressed, loading && styles.actionDisabled]}
        >
          {loading ? <ActivityIndicator size="small" color={colors.accentStrong} /> : null}
          <Text style={styles.connectionActionText} maxFontSizeMultiplier={1.5}>{loading ? 'Refreshing…' : 'Refresh'}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function AgenticTopicContent() {
  const navigation = useNavigation<any>()
  const route = useRoute()
  const { topicId, topicName, subjectName, origin, checkedPaperId } = route.params as RouteParams
  const netInfo = useNetInfo()
  const queryClient = useQueryClient()
  const topicQuery = useQuery({
    queryKey: ['agentic-topic', topicId],
    queryFn: ({ signal }) => agenticLearningApi.getTopic(topicId, signal),
    staleTime: 30 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  })
  const topic = topicQuery.data
  const subtopicsQuery = useQuery({
    queryKey: ['agentic-subtopics', topic?.subject_id],
    queryFn: () => agenticLearningApi.getSubtopics(topic!.subject_id),
    enabled: Boolean(topic?.subject_id),
  })
  const resolveMutation = useMutation({
    mutationFn: (resolved: boolean) => agenticLearningApi.setTopicResolved(topicId, topic!.subject_id, resolved),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['agentic-topic', topicId] }),
        queryClient.invalidateQueries({ queryKey: ['agentic-subjects'] }),
        queryClient.invalidateQueries({ queryKey: ['agentic-subtopics'] }),
        queryClient.invalidateQueries({ queryKey: ['agentic-quick-actions'] }),
      ])
    },
  })
  const goBack = () => {
    if (origin === 'checked-paper' && checkedPaperId) {
      navigation.getParent()?.navigate('Results', {
        screen: 'ResultDetail',
        params: { checkedPaperId },
      })
      return
    }
    navigation.goBack()
  }

  if (topicQuery.isLoading) {
    return (
      <AppScreen protectedChrome contentStyle={styles.screen}>
        <AgenticHeader meta="Building concept lesson" pill="Repair" onBack={goBack} />
        <AgenticIntro kicker="Concept repair" title="Preparing your lesson" subtitle="Connecting attempts, checked work, and repeated mistake evidence." />
        <View style={styles.loadingState}><ActivityIndicator color={colors.accent} /><View style={styles.skeletonHero} /><View style={styles.skeletonBody} /></View>
      </AppScreen>
    )
  }

  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false
  const status = getHttpStatus(topicQuery.error)
  const isGone = status === 404 || status === 410
  const failureKind = agenticFailureKind(topicQuery.error)

  if (!topic) {
    const title = isOffline
      ? 'Waiting for connection'
      : isGone
        ? 'Lesson no longer available'
        : failureKind === 'content'
          ? 'Lesson content needs repair'
          : 'Lesson service unavailable'
    const message = isOffline
      ? 'Your learning evidence is safe. This lesson will refresh automatically when you are back online.'
      : isGone
        ? 'This concept may have moved as your learning map changed. Return and choose the latest lesson.'
        : failureKind === 'content'
          ? 'The lesson response was incomplete. Retry to rebuild it from your saved evidence.'
          : 'Eduraa could not reach the lesson service. Your learning evidence and progress remain safely stored.'

    return (
      <AppScreen protectedChrome key={`concept-error-${topicId}`} contentStyle={styles.screen}>
        <AgenticHeader meta={subjectName || 'Concept lesson'} pill={isOffline ? 'Offline' : 'Progress safe'} onBack={goBack} />
        <AgenticIntro kicker="Concept repair" title={topicName || 'Your concept lesson'} subtitle="Your place in this learning route is preserved." />
        <ErrorState
          kind={isOffline ? 'offline' : 'error'}
          title={title}
          message={message}
          actionLabel={isGone ? 'Back to learning map' : 'Refresh lesson'}
          loading={topicQuery.isFetching}
          onAction={isOffline ? undefined : isGone ? () => navigation.goBack() : () => void topicQuery.refetch()}
        />
      </AppScreen>
    )
  }

  const isResolved = topic.status.toLowerCase() === 'resolved'
  const mastery = clampPercent(topic.mastery_score)
  const confidence = clampPercent(topic.confidence)
  const nextTopic = nextOpenTopic(subtopicsQuery.data ?? [], topic.topic_id)
  const curriculumMeta = [topic.curriculum_label, topic.chapter_title].filter(Boolean).join(' · ')
  const updateError = resolveMutation.isError ? 'The update did not reach Eduraa. Your current status is unchanged; try again.' : null
  const showRefreshFailure = topicQuery.isError || topicQuery.isRefetchError

  if (isResolved) {
    return (
      <AppScreen protectedChrome key={`resolved-concept-${topicId}-${showRefreshFailure ? 'recovery' : 'ready'}`} contentStyle={styles.screen}>
        <AgenticHeader meta={curriculumMeta || topic.subject_name} pill="Resolved" onBack={goBack} />
        <AgenticIntro kicker="Loop closed" title="Concept resolved" />
        <LessonConnectionStatus failed={showRefreshFailure} offline={isOffline} loading={topicQuery.isFetching} onRetry={() => void topicQuery.refetch()} />

        <View style={styles.resolvedHero}>
          <View style={styles.resolvedIcon}><Ionicons name="checkmark" size={28} color={colors.white} /></View>
          <Text style={styles.resolvedTitle}>Concept closed</Text>
          <Text style={styles.resolvedTopic}>{topic.topic_name} marked resolved</Text>
          <Text style={styles.resolvedMastery}>{mastery}% <Text style={styles.resolvedMasteryLabel}>mastery</Text></Text>
          <Text style={styles.resolvedNote}>{topic.improvement_trend || 'New attempt evidence will keep this signal honest.'}</Text>
        </View>

        <AgenticSectionHeader title="What changed" meta="Summary" />
        <AgenticSurface style={styles.changedCard}>
          {[
            `${topic.topic_name} is marked resolved.`,
            topic.improvement_trend || `Mastery remains ${mastery}% until a new attempt updates it.`,
            'You can reopen this concept if the same mistake returns.',
          ].map((item, index) => (
            <View key={`${index}-${item}`} style={styles.changedRow}>
              <View style={styles.changedCheck}><Ionicons name="checkmark" size={13} color={colors.success} /></View>
              <Text style={styles.changedText}>{item}</Text>
            </View>
          ))}
        </AgenticSurface>

        <AgenticSectionHeader title="Up next" meta={nextTopic ? 'Keep the momentum' : 'Learning map clear'} />
        {nextTopic ? (
          <AgenticSurface style={styles.nextCard}>
            <View style={styles.nextTop}>
              <View style={styles.nextCopy}>
                <Text style={styles.nextKicker}>{nextTopic.chapter_title || nextTopic.branch || 'Next concept'}</Text>
                <Text style={styles.nextTitle}>{nextTopic.topic_name}</Text>
              </View>
              <View style={styles.nextPill}><Text style={styles.nextPillText}>{topicStatusLabel(nextTopic)}</Text></View>
            </View>
            <Text style={styles.nextBody}>{nextTopic.summary}</Text>
            <Text style={styles.nextMeta}>{clampPercent(nextTopic.mastery_score)}% mastery{nextTopic.pyq_frequency != null ? ` · ${nextTopic.pyq_frequency} PYQs` : ''}</Text>
          </AgenticSurface>
        ) : (
          <AgenticSurface><Text style={styles.nextBody}>No other open concept is waiting in this subject.</Text></AgenticSurface>
        )}

        {updateError ? <Text style={styles.inlineError}>{updateError}</Text> : null}
        <PrimaryAction
          success
          label={nextTopic ? 'Start next concept' : 'Back to learning map'}
          onPress={() => nextTopic ? navigation.replace('AgenticTopic', { topicId: nextTopic.topic_id, topicName: nextTopic.topic_name, subjectName: topic.subject_name }) : navigation.navigate('AgenticLearning')}
        />
        <Pressable
          accessibilityRole="button"
          disabled={resolveMutation.isPending}
          onPress={() => resolveMutation.mutate(false)}
          style={({ pressed }) => [styles.reopenAction, pressed && styles.actionPressed]}
        >
          <Text style={styles.reopenText}>{resolveMutation.isPending ? 'Reopening…' : 'Reopen this concept'}</Text>
        </Pressable>
      </AppScreen>
    )
  }

  return (
    <AppScreen protectedChrome key={`concept-lesson-${topicId}-${showRefreshFailure ? 'recovery' : 'ready'}`} contentStyle={styles.screen}>
      <AgenticHeader meta={curriculumMeta || topic.subject_name} pill={topicStatusLabel({ status: topic.status, mastery_score: topic.mastery_score })} onBack={goBack} />
      <AgenticIntro kicker="Concept repair" title={topic.topic_name} subtitle={topic.summary} />
      <LessonConnectionStatus failed={showRefreshFailure} offline={isOffline} loading={topicQuery.isFetching} onRetry={() => void topicQuery.refetch()} />

      <View style={styles.statGrid}>
        <StatTile value={`${mastery}%`} label="Mastery" />
        <StatTile value={`${confidence}%`} label="Confidence" />
        <StatTile value={`${topic.attempt_count}`} label="Attempts" />
      </View>

      <AgenticSectionHeader title="Lesson route" meta="3 steps" />
      <AgenticSurface style={styles.routeCard}>
        <RouteStep index={1} title="Concept repair" body="Rebuild the core idea from the ground up." tone={colors.accent} />
        <RouteStep index={2} title="Recall anchors" body={`${topic.memory_tips.length || topic.easy_ways_to_learn.length} memory hooks for exam pressure.`} tone={colors.info} />
        <RouteStep index={3} title="Exam transfer" body={`${topic.practice_questions.length} prompts for a fast self-check.`} tone={colors.violet[600]} last />
      </AgenticSurface>

      <AgenticSurface style={styles.coreCard}>
        <Text style={styles.cardKicker}>Core idea</Text>
        <MathText style={styles.coreText} value={topic.concept_explanation || topic.summary} />
        {topic.text_diagram ? <View style={styles.diagram}><MathText style={styles.diagramText} value={topic.text_diagram} /></View> : null}
      </AgenticSurface>

      {(topic.memory_tips.length > 0 || topic.easy_ways_to_learn.length > 0) ? (
        <AgenticSurface style={styles.anchorCard}>
          <Text style={[styles.cardKicker, { color: colors.info }]}>Memory anchors</Text>
          {(topic.memory_tips.length ? topic.memory_tips : topic.easy_ways_to_learn).slice(0, 3).map((tip, index) => (
            <View key={`${index}-${tip}`} style={styles.anchorRow}>
              <View style={styles.anchorIcon}><Ionicons name="diamond" size={9} color={colors.info} /></View>
              <MathText style={styles.anchorText} value={tip} />
            </View>
          ))}
        </AgenticSurface>
      ) : null}

      {topic.practice_questions.length > 0 ? (
        <AgenticSurface dark style={styles.practiceCard}>
          <View style={styles.practiceHeader}>
            <View><Text style={styles.practiceKicker}>Practice burst</Text><Text style={styles.practiceTitle}>Transfer it to exam language</Text></View>
            <View style={styles.practiceCount}><Text style={styles.practiceCountText}>{topic.practice_questions.length}</Text></View>
          </View>
          {topic.practice_questions.slice(0, 4).map((prompt, index) => (
            <View key={`${index}-${prompt}`} style={styles.practiceRow}>
              <View style={styles.practiceNumber}><Text style={styles.practiceNumberText}>{index + 1}</Text></View>
              <MathText style={styles.practiceText} value={prompt} />
            </View>
          ))}
        </AgenticSurface>
      ) : null}

      {topic.coach_note ? (
        <View style={styles.coachCard}>
          <View style={styles.coachIcon}><Ionicons name="school" size={17} color={colors.accentStrong} /></View>
          <View style={styles.coachCopy}><Text style={styles.coachTitle}>Coach note</Text><MathText style={styles.coachText} value={topic.coach_note} /></View>
        </View>
      ) : null}

      {updateError ? <Text style={styles.inlineError}>{updateError}</Text> : null}
      <PrimaryAction label={resolveMutation.isPending ? 'Updating concept…' : 'Mark resolved'} loading={resolveMutation.isPending} onPress={() => resolveMutation.mutate(true)} />
    </AppScreen>
  )
}

class AgenticLessonBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.warn('[AgenticLearning][rendering]', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <AppScreen protectedChrome contentStyle={styles.screen}>
        <AgenticIntro
          kicker="Concept repair"
          title="Lesson display paused"
          subtitle="Your lesson is saved. Reload this view to render it again."
        />
        <ErrorState
          title="Lesson rendering failed"
          message="The lesson data is safe. Retry the display without creating another lesson request."
          actionLabel="Retry display"
          onAction={() => this.setState({ failed: false })}
        />
      </AppScreen>
    )
  }
}

export default function AgenticTopicScreen() {
  return (
    <AgenticLessonBoundary>
      <AgenticTopicContent />
    </AgenticLessonBoundary>
  )
}

const styles = StyleSheet.create({
  screen: { gap: spacing[3], paddingBottom: spacing[6], backgroundColor: '#FBF6EC' },
  statGrid: { flexDirection: 'row', gap: spacing[2] },
  statTile: { flex: 1, minHeight: 70, justifyContent: 'space-between', borderRadius: radius.md, backgroundColor: '#FFFCF6', borderWidth: 1, borderColor: '#E9DFD2', padding: spacing[3] },
  statValue: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 21, lineHeight: 25 },
  statLabel: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
  routeCard: { paddingVertical: spacing[3] },
  routeStep: { flexDirection: 'row', gap: spacing[3], minHeight: 52 },
  routeRail: { width: 28, alignItems: 'center' },
  routeNumber: { width: 28, height: 28, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  routeNumberText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  routeLine: { flex: 1, width: 2, backgroundColor: '#E4D8CA', marginVertical: 2 },
  routeCopy: { flex: 1, paddingBottom: spacing[2] },
  routeTitle: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 13, lineHeight: 17 },
  routeBody: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 16, marginTop: 2 },
  coreCard: { gap: spacing[3] },
  cardKicker: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase' },
  coreText: { color: colors.textSecondary, fontFamily: typography.fonts.bodyMedium, fontSize: 13, lineHeight: 20 },
  diagram: { borderRadius: radius.md, backgroundColor: '#EEF4FF', borderWidth: 1, borderColor: '#C7DBF6', padding: spacing[3] },
  diagramText: { color: '#28457E', fontFamily: typography.fonts.bodyBold, fontSize: 12, lineHeight: 19 },
  anchorCard: { gap: spacing[3] },
  anchorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  anchorIcon: { width: 24, height: 24, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6EFFD' },
  anchorText: { flex: 1, color: colors.textSecondary, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  practiceCard: { gap: spacing[3] },
  practiceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3] },
  practiceKicker: { color: colors.orangeScale[300], fontFamily: typography.fonts.bodyBold, fontSize: 9, letterSpacing: 1, textTransform: 'uppercase' },
  practiceTitle: { color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 17, lineHeight: 22, marginTop: 2 },
  practiceCount: { width: 38, height: 38, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  practiceCountText: { color: colors.white, fontFamily: typography.fonts.heading, fontSize: 17 },
  practiceRow: { flexDirection: 'row', gap: spacing[2], paddingTop: spacing[2], borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)' },
  practiceNumber: { width: 24, height: 24, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(249,115,22,0.22)' },
  practiceNumberText: { color: colors.orangeScale[200], fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  practiceText: { flex: 1, color: '#D7DEEA', fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  coachCard: { flexDirection: 'row', gap: spacing[3], borderRadius: radius.lg, backgroundColor: colors.warningSurface, borderWidth: 1, borderColor: colors.warningBorder, padding: spacing[3] },
  coachIcon: { width: 38, height: 38, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSurfaceStrong },
  coachCopy: { flex: 1, gap: spacing[1] },
  coachTitle: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  coachText: { color: colors.textSecondary, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  primaryAction: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], borderRadius: radius.lg, backgroundColor: '#07152D', paddingHorizontal: spacing[4], ...shadows.sm },
  primaryActionSuccess: { backgroundColor: '#16834B' },
  primaryActionText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 14 },
  actionPressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  actionDisabled: { opacity: 0.66 },
  inlineError: { color: colors.danger, fontFamily: typography.fonts.bodySemibold, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  resolvedHero: { alignItems: 'center', gap: spacing[2], borderRadius: radius.xl, backgroundColor: '#177A43', paddingHorizontal: spacing[5], paddingVertical: spacing[5], ...shadows.md },
  resolvedIcon: { width: 52, height: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  resolvedTitle: { color: colors.white, fontFamily: typography.fonts.heading, fontSize: 23, lineHeight: 28, marginTop: spacing[2] },
  resolvedTopic: { color: '#D8F4E4', fontFamily: typography.fonts.bodyMedium, fontSize: 12, textAlign: 'center' },
  resolvedMastery: { color: colors.white, fontFamily: typography.fonts.heading, fontSize: 36, lineHeight: 40, marginTop: spacing[2] },
  resolvedMasteryLabel: { fontFamily: typography.fonts.headingSemibold, fontSize: 16 },
  resolvedNote: { color: '#D8F4E4', fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  changedCard: { gap: spacing[3] },
  changedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  changedCheck: { width: 24, height: 24, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.successSurface },
  changedText: { flex: 1, color: colors.textSecondary, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  nextCard: { gap: spacing[2] },
  nextTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  nextCopy: { flex: 1, minWidth: 0 },
  nextKicker: { color: '#927C69', fontFamily: typography.fonts.bodyBold, fontSize: 9, textTransform: 'uppercase' },
  nextTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 18, lineHeight: 22, marginTop: 2 },
  nextPill: { borderRadius: radius.full, backgroundColor: colors.warningSurface, paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  nextPillText: { color: colors.warning, fontFamily: typography.fonts.bodyBold, fontSize: 9 },
  nextBody: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  nextMeta: { color: colors.textSecondary, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  reopenAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  reopenText: { color: colors.textMuted, fontFamily: typography.fonts.bodySemibold, fontSize: 12 },
  loadingState: { gap: spacing[4], alignItems: 'center' },
  connectionStatus: { height: 48, flexDirection: 'row', alignItems: 'center', gap: spacing[2], borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E7DCCD' },
  connectionDot: { width: 8, height: 8, borderRadius: radius.full },
  connectionCopy: { flex: 1, minWidth: 0 },
  connectionTitle: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 11, lineHeight: 15 },
  connectionDetail: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 9, lineHeight: 13 },
  connectionAction: { minWidth: 76, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1], paddingHorizontal: spacing[2] },
  connectionActionText: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  skeletonHero: { width: '100%', height: 160, borderRadius: radius.xl, backgroundColor: colors.slate[200] },
  skeletonBody: { width: '100%', height: 260, borderRadius: radius.xl, backgroundColor: colors.slate[100] },
})
