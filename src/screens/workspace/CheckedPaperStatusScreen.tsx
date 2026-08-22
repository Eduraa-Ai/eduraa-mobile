import React, { useMemo, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { checkedPapersApi } from '../../api/checkedPapers'
import { AnimatedButton, AnimatedCard, AppScreen, ErrorState, GradientHeroCard } from '../../components/ui'
import type { StaffWorkspaceStackParamList } from '../../navigation'
import { colors, radius, spacing, typography } from '../../theme'
import type { CheckedPaperProcessingBlocker } from '../../types'
import {
  CHECKED_PAPER_STATUS_POLL_INTERVAL_MS,
  CHECKED_PAPER_EXPERIENCE_LABELS,
  canContinueAsException,
  checkedPaperExperienceStatus,
  generateIdempotencyKey,
  isCheckedPaperStatusActive,
} from './checkedPaperPipelineModel'

type Route = RouteProp<StaffWorkspaceStackParamList, 'CheckedPaperStatus'>
type Nav = NativeStackNavigationProp<StaffWorkspaceStackParamList, 'CheckedPaperStatus'>

function extractDetail(error: unknown, fallback: string) {
  return (error as { response?: { data?: { detail?: string; current_revision?: number } } }).response?.data?.detail || fallback
}

function extractStatusCode(error: unknown) {
  return (error as { response?: { status?: number } }).response?.status
}

function BlockerRow({ blocker }: { blocker: CheckedPaperProcessingBlocker }) {
  const scope = blocker.page_numbers?.length
    ? `Check ${blocker.page_numbers.map((page) => `page ${page}`).join(', ')}.`
    : blocker.occurrence_ids?.length
      ? `Check ${blocker.occurrence_ids.length === 1 ? 'the highlighted question' : `${blocker.occurrence_ids.length} highlighted questions`}.`
      : null
  return (
    <View style={styles.blockerRow}>
      <View style={styles.blockerIcon}>
        <Ionicons name="alert-circle-outline" size={17} color={colors.danger} />
      </View>
      <View style={styles.blockerCopy}>
        <Text style={styles.blockerMessage}>{blocker.message}</Text>
        {scope ? <Text style={styles.blockerMeta}>{scope}</Text> : null}
      </View>
    </View>
  )
}

export default function CheckedPaperStatusScreen() {
  const { params } = useRoute<Route>()
  const navigation = useNavigation<Nav>()
  const queryClient = useQueryClient()
  const id = params.checkedPaperId
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const [showRevokeInput, setShowRevokeInput] = useState(false)

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['checked-paper', id],
    queryFn: () => checkedPapersApi.getById(id),
    enabled: Boolean(id),
    refetchInterval: (activeQuery) => {
      const paper = activeQuery.state.data
      return paper && isCheckedPaperStatusActive(paper.status) ? CHECKED_PAPER_STATUS_POLL_INTERVAL_MS : false
    },
    refetchIntervalInBackground: false,
    refetchOnMount: 'always',
  })

  const status = data?.status ?? ''
  const experienceStatus = data ? checkedPaperExperienceStatus(data) : 'checking'
  const blocked = experienceStatus === 'needs_input'
  const completed = experienceStatus === 'ready_for_review' || experienceStatus === 'published'
  const active = experienceStatus === 'checking'
  const experienceLabel = CHECKED_PAPER_EXPERIENCE_LABELS[experienceStatus]

  const integrityQuery = useQuery({
    queryKey: ['checked-paper', id, 'integrity'],
    queryFn: () => checkedPapersApi.getIntegrity(id),
    enabled: Boolean(id) && blocked && status.startsWith('integrity'),
  })

  const blockers = data?.processing_blockers ?? []
  const orderedPageIds = useMemo(
    () => (integrityQuery.data?.pages ?? []).map((page) => page.id),
    [integrityQuery.data?.pages],
  )

  const canAct = typeof data?.row_version === 'number'
  const showContinueAsException = blocked && status.startsWith('integrity') && canContinueAsException(blockers) && canAct
  const confirmableResults = useMemo(
    () => (data?.grading_results ?? []).flatMap((result) => {
      const resultId = String(result.result_id ?? '').trim()
      const questionId = String(result.question_id ?? '').trim()
      if ((!resultId && !questionId) || typeof result.score !== 'number' || !Number.isFinite(result.score)) return []
      return [{
        result_id: resultId || null,
        question_id: questionId || null,
        score: result.score,
        feedback: result.feedback ?? null,
        selected: result.selected !== false,
      }]
    }),
    [data?.grading_results],
  )
  const canConfirmReviewedMarks = Boolean(
    blocked
    && data?.can_save_review
    && data.grading_results?.length
    && confirmableResults.length === data.grading_results.length
    && !data.manual_review_requested,
  )

  const runAction = async (name: string, action: () => Promise<unknown>) => {
    setPendingAction(name)
    setActionError(null)
    try {
      await action()
      await refetch()
      setConfirmChecked(false)
      setShowRevokeInput(false)
      setRevokeReason('')
    } catch (thrown) {
      if (extractStatusCode(thrown) === 409) {
        await refetch()
        setActionError('This checked paper changed since you last viewed it. Refreshed — please try again.')
      } else {
        setActionError(extractDetail(thrown, 'That action could not be completed.'))
      }
    } finally {
      setPendingAction(null)
    }
  }

  const continueAsException = () => {
    if (!data || data.row_version == null) return
    void runAction('continue', () =>
      checkedPapersApi.integrityResolve(id, {
        expected_revision: data.row_version as number,
        idempotency_key: generateIdempotencyKey(),
        ordered_page_ids: orderedPageIds,
        complete_script_confirmed: true,
        identity_confirmed: true,
        acknowledged_issue_ids: blockers.map((blocker) => blocker.issue_id),
      }),
    )
  }

  const approve = () => {
    if (!data || data.row_version == null) return
    void runAction('approve', () =>
      checkedPapersApi.approve(id, { expected_revision: data.row_version as number, idempotency_key: generateIdempotencyKey() }),
    )
  }

  const confirmReviewedMarks = () => {
    if (!data || !canConfirmReviewedMarks) return
    void runAction('confirm-review', () =>
      checkedPapersApi.updateTeacherReview(id, {
        grading_feedback: data.grading_feedback ?? null,
        results: confirmableResults,
      }),
    )
  }

  const publish = () => {
    if (!data || data.row_version == null) return
    void runAction('publish', () =>
      checkedPapersApi.publish(id, { expected_revision: data.row_version as number, idempotency_key: generateIdempotencyKey() }),
    )
  }

  const revoke = () => {
    if (!data || data.row_version == null) return
    const reason = revokeReason.trim()
    if (reason.length < 3 || reason.length > 500) {
      setActionError('Give a reason between 3 and 500 characters.')
      return
    }
    void runAction('revoke', () =>
      checkedPapersApi.revoke(id, {
        expected_revision: data.row_version as number,
        idempotency_key: generateIdempotencyKey(),
        reason,
      }),
    )
  }

  const routeNames = (nav: any): string[] => nav?.getState?.().routeNames ?? []

  const reUpload = () => {
    if (routeNames(navigation).includes('ScanUpload')) {
      navigation.navigate('ScanUpload', {
        initialPaperId: data?.paper_id ?? undefined,
        initialExamId: data?.exam_id ?? undefined,
        initialStudentId: data?.student_id ?? undefined,
        initialSubjectId: data?.subject_id ?? undefined,
      })
      return
    }
    navigation.goBack()
  }

  const openFullReport = () => {
    const parent = navigation.getParent?.()
    if (routeNames(navigation).includes('ResultDetail')) {
      navigation.navigate('ResultDetail', { checkedPaperId: id })
      return
    }
    if (parent && routeNames(parent).includes('StaffResults')) {
      parent.navigate('StaffResults', { screen: 'ResultDetail', params: { checkedPaperId: id } })
      return
    }
    Alert.alert('Report unavailable', 'Open Checked papers to view the full report.')
  }

  if (!id) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ErrorState title="No checked paper selected" message="Upload a scan to see its status here." />
      </AppScreen>
    )
  }

  if (isLoading) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading checked paper status</Text>
      </AppScreen>
    )
  }

  if (isError || !data) {
    return (
      <AppScreen scroll={false} contentStyle={styles.center}>
        <ErrorState title="Status unavailable" message={extractDetail(error, 'Unable to load this checked paper.')} onAction={() => void refetch()} />
      </AppScreen>
    )
  }

  return (
    <AppScreen contentStyle={styles.screen}>
      <GradientHeroCard
        eyebrow="SCAN STATUS"
        title={data.student_name || 'Checked paper'}
        subtitle={[data.exam_name || data.subject_name, experienceLabel].filter(Boolean).join(' · ')}
      />

      {active ? (
        <AnimatedCard style={styles.statusCard}>
          <ActivityIndicator color={colors.accent} />
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>{experienceLabel}</Text>
            <Text style={styles.statusMeta}>This updates automatically. You can leave and come back.</Text>
          </View>
        </AnimatedCard>
      ) : null}

      {blocked ? (
        <AnimatedCard style={styles.blockedCard}>
          <View style={styles.blockedHeader}>
            <Ionicons name="warning-outline" size={19} color={colors.danger} />
            <Text style={styles.blockedTitle}>Needs your input</Text>
          </View>
          {blockers.length ? (
            blockers.map((blocker) => <BlockerRow key={blocker.issue_id} blocker={blocker} />)
          ) : (
            <Text style={styles.statusMeta}>Eduraa checked everything it could. Review only the item shown here.</Text>
          )}

          {data.grading_results?.length ? (
            <View style={styles.confirmBlock}>
              <Text style={styles.statusMeta}>Provisional score</Text>
              <Text style={styles.completedScore}>{data.total_score ?? '-'} / {data.max_score ?? '-'}</Text>
              <AnimatedButton label="Review highlighted items" onPress={openFullReport} />
              {canConfirmReviewedMarks ? (
                <>
                  <Text style={styles.statusMeta}>If the current marks are correct, confirm them here. You can still open any question to change its marks first.</Text>
                  <AnimatedButton
                    label="Confirm reviewed marks"
                    variant="secondary"
                    loading={pendingAction === 'confirm-review'}
                    disabled={Boolean(pendingAction)}
                    onPress={confirmReviewedMarks}
                  />
                </>
              ) : null}
            </View>
          ) : null}

          {showContinueAsException ? (
            <View style={styles.confirmBlock}>
              <AnimatedButton
                label={confirmChecked ? 'Confirmed' : 'Confirm complete & correctly identified script'}
                icon={<Ionicons name={confirmChecked ? 'checkbox' : 'square-outline'} size={16} color={confirmChecked ? colors.textOnBrand : colors.text} />}
                variant={confirmChecked ? 'primary' : 'ghost'}
                onPress={() => setConfirmChecked((value) => !value)}
              />
              <AnimatedButton
                label="Continue as exception"
                loading={pendingAction === 'continue'}
                disabled={!confirmChecked || Boolean(pendingAction)}
                onPress={continueAsException}
              />
            </View>
          ) : null}

          {status.startsWith('integrity') ? <AnimatedButton label="Replace paper" variant="ghost" onPress={reUpload} /> : null}
        </AnimatedCard>
      ) : null}

      {completed ? (
        <AnimatedCard style={styles.completedCard}>
          <Text style={styles.statusMeta}>{data.needs_review ? 'Provisional score' : 'Score'}</Text>
          <Text style={styles.completedScore}>
            {data.total_score ?? '-'} / {data.max_score ?? '-'}
          </Text>
          <Text style={styles.statusMeta}>{experienceLabel}</Text>
          <AnimatedButton label="View full report" onPress={openFullReport} />

          {data.can_approve ? (
            <AnimatedButton
              label="Approve"
              variant="secondary"
              loading={pendingAction === 'approve'}
              disabled={Boolean(pendingAction)}
              onPress={approve}
            />
          ) : null}
          {data.can_publish ? (
            <AnimatedButton
              label="Publish to student"
              variant="secondary"
              loading={pendingAction === 'publish'}
              disabled={Boolean(pendingAction)}
              onPress={publish}
            />
          ) : null}
          {data.results_published ? (
            showRevokeInput ? (
              <View style={styles.revokeBlock}>
                <TextInput
                  style={styles.revokeInput}
                  placeholder="Reason for revoking (3-500 characters)"
                  placeholderTextColor={colors.textSoft}
                  value={revokeReason}
                  onChangeText={setRevokeReason}
                  multiline
                />
                <AnimatedButton
                  label="Confirm revoke"
                  variant="ghost"
                  loading={pendingAction === 'revoke'}
                  disabled={Boolean(pendingAction)}
                  onPress={revoke}
                />
              </View>
            ) : (
              <AnimatedButton label="Revoke published result" variant="ghost" onPress={() => setShowRevokeInput(true)} />
            )
          ) : null}
        </AnimatedCard>
      ) : null}

      {!active && !blocked && !completed ? (
        <AnimatedCard style={styles.statusCard}>
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>{experienceLabel}</Text>
            <Text style={styles.statusMeta}>Open this paper again if you need to review its latest state.</Text>
          </View>
        </AnimatedCard>
      ) : null}

      {actionError ? (
        <AnimatedCard style={styles.errorCard}>
          <Text style={styles.errorText}>{actionError}</Text>
        </AnimatedCard>
      ) : null}

      <AnimatedButton label="Refresh status" variant="ghost" loading={isRefetching} onPress={() => void refetch()} />
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing[4],
    paddingBottom: spacing[20],
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
  },
  loadingText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  statusCopy: {
    flex: 1,
    gap: spacing[1],
  },
  statusTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
  },
  statusMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
  },
  blockedCard: {
    gap: spacing[3],
  },
  blockedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  blockedTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
  },
  blockerRow: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  blockerIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSurface,
  },
  blockerCopy: {
    flex: 1,
  },
  blockerMessage: {
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
  },
  blockerMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  confirmBlock: {
    gap: spacing[2],
  },
  completedCard: {
    gap: spacing[2],
    alignItems: 'flex-start',
  },
  completedScore: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 24,
  },
  revokeBlock: {
    width: '100%',
    gap: spacing[2],
  },
  revokeInput: {
    minHeight: 60,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    textAlignVertical: 'top',
  },
  errorCard: {
    backgroundColor: colors.dangerSurface,
  },
  errorText: {
    color: colors.danger,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
  },
})
