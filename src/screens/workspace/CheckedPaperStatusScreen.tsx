import React, { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { checkedPapersApi } from '../../api/checkedPapers'
import { AnimatedButton, AnimatedCard, AppScreen, ErrorState } from '../../components/ui'
import type { StaffWorkspaceStackParamList } from '../../navigation'
import { colors, radius, spacing, typography } from '../../theme'
import type { CheckedPaperProcessingBlocker, GradingResultItem } from '../../types'
import { openCheckedPaperScan, protectedDocumentErrorMessage } from '../../utils/openProtectedDocument'
import {
  CHECKED_PAPER_STATUS_POLL_INTERVAL_MS,
  CHECKED_PAPER_EXPERIENCE_LABELS,
  canContinueAsException,
  checkedPaperBlockerMessage,
  isReleaseConfidenceBlocker,
  checkedPaperReviewExperienceStatus,
  buildTeacherPaperDecision,
  generateIdempotencyKey,
  studentResponseSummaryFromFeedback,
  uniqueCheckedPaperBlockers,
} from './checkedPaperPipelineModel'

type Route = RouteProp<StaffWorkspaceStackParamList, 'CheckedPaperStatus'>
type Nav = NativeStackNavigationProp<StaffWorkspaceStackParamList, 'CheckedPaperStatus'>

function extractDetail(error: unknown, fallback: string) {
  return (error as { response?: { data?: { detail?: string; current_revision?: number } } }).response?.data?.detail || fallback
}

function extractStatusCode(error: unknown) {
  return (error as { response?: { status?: number } }).response?.status
}

function reviewAnswer(value: unknown): string {
  if (value == null || value === '') return 'Not detected'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(reviewAnswer).join(', ')
  return 'Available in scan evidence'
}

function detectedStudentAnswer(result: GradingResultItem) {
  const direct = reviewAnswer(
    result.student_answer_summary
      ?? result.student_answer
      ?? result.selected_answer
      ?? result.response
      ?? studentResponseSummaryFromFeedback(result.feedback),
  )
  if (direct !== 'Not detected') return direct
  const feedback = String(result.feedback ?? '')
  const selected = feedback.match(/selected option\s*\(?([a-z0-9]+)\)?/i)?.[1]
    ?? feedback.match(/student response\*{0,2}\s*[-:]\s*\(?([a-z0-9]+)\)?/i)?.[1]
  return selected ? selected.toUpperCase() : 'Not detected — verify the scan'
}

function conciseAiReason(result: GradingResultItem) {
  const feedback = String(result.feedback ?? '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!feedback) return null
  const selectedReason = feedback.match(/The student selected[^.]*\./i)?.[0]
  if (selectedReason) return selectedReason
  const noAnswer = feedback.match(/No answer provided\.?/i)?.[0]
  if (noAnswer) return noAnswer
  return feedback.replace(/Student response\s*-\s*[^ ]+\s*/i, '').replace(/Rubric evaluation\s*\d+\.\s*/i, '').slice(0, 180)
}

function BlockerRow({ blocker }: { blocker: CheckedPaperProcessingBlocker }) {
  const isConfirmation = isReleaseConfidenceBlocker(blocker)
  const scope = blocker.page_numbers?.length
    ? `Check ${blocker.page_numbers.map((page) => `page ${page}`).join(', ')}.`
    : blocker.question_ids?.length
      ? `Review ${blocker.question_ids.length} affected question${blocker.question_ids.length === 1 ? '' : 's'}.`
    : blocker.occurrence_ids?.length
      ? `Check ${blocker.occurrence_ids.length === 1 ? 'the highlighted question' : `${blocker.occurrence_ids.length} highlighted questions`}.`
      : null
  return (
    <View style={styles.blockerRow}>
      <View style={[styles.blockerIcon, isConfirmation && styles.confirmationIcon]}>
        <Ionicons
          name={isConfirmation ? "shield-checkmark-outline" : "alert-circle-outline"}
          size={17}
          color={isConfirmation ? colors.warning : colors.danger}
        />
      </View>
      <View style={styles.blockerCopy}>
        <Text style={styles.blockerMessage}>{blocker.title?.trim() || checkedPaperBlockerMessage(blocker)}</Text>
        {blocker.title?.trim() && blocker.message?.trim() ? <Text style={styles.blockerMeta}>{blocker.message.trim()}</Text> : null}
        {scope ? <Text style={styles.blockerMeta}>{scope}</Text> : null}
        {blocker.recommended_action?.trim() ? <Text style={styles.blockerMeta}>{blocker.recommended_action.trim()}</Text> : null}
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
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewComplete, setReviewComplete] = useState(false)
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({})
  const [reviewedKeys, setReviewedKeys] = useState<Set<string>>(new Set())
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const [showRevokeInput, setShowRevokeInput] = useState(false)

  useEffect(() => {
    const tabNavigator = navigation.getParent?.()
    if (!tabNavigator) return undefined
    tabNavigator.setOptions({ tabBarStyle: reviewOpen || reviewComplete ? { display: 'none' } : undefined })
    return () => tabNavigator.setOptions({ tabBarStyle: undefined })
  }, [navigation, reviewComplete, reviewOpen])

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['checked-paper', id],
    queryFn: () => checkedPapersApi.getById(id),
    enabled: Boolean(id),
    refetchInterval: (activeQuery) => {
      const paper = activeQuery.state.data
      return paper && checkedPaperReviewExperienceStatus(paper) === 'checking'
        ? CHECKED_PAPER_STATUS_POLL_INTERVAL_MS
        : false
    },
    refetchIntervalInBackground: false,
    refetchOnMount: 'always',
  })

  const status = data?.status ?? ''
  const experienceStatus = data ? checkedPaperReviewExperienceStatus(data) : 'checking'
  const blocked = experienceStatus === 'needs_input'
  const completed = experienceStatus === 'ready_for_review' || experienceStatus === 'published'
  const active = experienceStatus === 'checking'
  const experienceLabel = CHECKED_PAPER_EXPERIENCE_LABELS[experienceStatus]

  const integrityQuery = useQuery({
    queryKey: ['checked-paper', id, 'integrity'],
    queryFn: () => checkedPapersApi.getIntegrity(id),
    enabled: Boolean(id) && blocked && status.startsWith('integrity'),
  })

  const blockers = data?.processing_blockers?.length
    ? data.processing_blockers
    : integrityQuery.data?.integrity_run?.blockers ?? []
  const visibleBlockers = useMemo(() => {
    return uniqueCheckedPaperBlockers(blockers)
  }, [blockers])
  const teacherDecision = useMemo(
    () => data ? buildTeacherPaperDecision(data) : null,
    [data],
  )
  const displayedExperienceLabel = blocked && teacherDecision
    ? teacherDecision.statusLabel
    : experienceLabel
  const orderedPageIds = useMemo(
    () => (integrityQuery.data?.pages ?? []).map((page) => page.id),
    [integrityQuery.data?.pages],
  )
  const reviewResults = useMemo(
    () => (data?.grading_results ?? []).map((result, index) => ({
      result,
      index,
      key: String(result.result_id || result.question_id || index),
    })),
    [data?.grading_results],
  )

  useEffect(() => {
    setScoreDrafts(Object.fromEntries(reviewResults.map(({ key, result }) => [key, result.score == null ? '' : String(result.score)])))
    setReviewOpen(false)
    setReviewComplete(false)
    setReviewedKeys(new Set())
  }, [data?.id])

  const canAct = typeof data?.row_version === 'number'
  const showContinueAsException = blocked
    && status.startsWith('integrity')
    && canContinueAsException(blockers)
    && orderedPageIds.length > 0
    && blockers.every((blocker) => Boolean(blocker.issue_id))
    && canAct
  const confirmableResults = useMemo(
    () => reviewResults.flatMap(({ result, key }) => {
      const resultId = String(result.result_id ?? '').trim()
      const questionId = String(result.question_id ?? '').trim()
      const score = Number(scoreDrafts[key])
      const maxScore = typeof result.max_score === 'number' ? result.max_score : null
      if ((!resultId && !questionId) || scoreDrafts[key]?.trim() === '' || !Number.isFinite(score) || score < 0 || (maxScore != null && score > maxScore)) return []
      return [{
        result_id: resultId || null,
        question_id: questionId || null,
        score,
        feedback: result.feedback ?? null,
        selected: result.selected !== false,
      }]
    }),
    [reviewResults, scoreDrafts],
  )
  const canConfirmReviewedMarks = Boolean(
    blocked
    && data?.can_save_review
    && data.grading_results?.length
    && confirmableResults.length === data.grading_results.length
    && !data.manual_review_requested,
  )
  const proposedTeacherScore = confirmableResults.reduce((sum, result) => sum + result.score, 0)
  const changedMarkCount = reviewResults.filter(({ result, key }) => Number(scoreDrafts[key]) !== result.score).length
  const changedQuestionLabel = reviewResults
    .filter(({ result, key }) => Number(scoreDrafts[key]) !== result.score)
    .map(({ result, index }) => `Q${result.question_number ?? index + 1}`)
    .join(', ')

  const runAction = async (name: string, action: () => Promise<unknown>) => {
    setPendingAction(name)
    setActionError(null)
    try {
      await action()
      await refetch()
      setConfirmChecked(false)
      setReviewComplete(false)
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

  const viewScanEvidence = async () => {
    if (pendingAction) return
    setPendingAction('scan')
    setActionError(null)
    try {
      await openCheckedPaperScan(id)
    } catch (thrown) {
      setActionError(protectedDocumentErrorMessage(thrown))
    } finally {
      setPendingAction(null)
    }
  }

  const acceptAllSuggestedMarks = () => {
    setReviewedKeys(new Set(reviewResults.map(({ key }) => key)))
    setReviewComplete(true)
    setReviewOpen(false)
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

  const openDetailedWorkspace = () => {
    if (routeNames(navigation).includes('CheckedPaperWorkspace')) {
      navigation.navigate('CheckedPaperWorkspace', { checkedPaperId: id })
      return
    }
    Alert.alert('Workspace unavailable', 'Open Checked papers, then choose Open paper workspace.')
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
    <AppScreen protectedChrome contentStyle={styles.screen}>
      {reviewOpen ? (
        <View style={styles.focusedHeader}>
          <Text style={styles.decisionStep}>TEACHER MARK REVIEW</Text>
          <Text style={styles.focusedTitle}>{data.student_name || 'Checked paper'} · {data.exam_name || data.subject_name}</Text>
          <Text style={styles.statusMeta}>AI score {data.total_score ?? '-'} / {data.max_score ?? '-'} · {reviewResults.length} questions</Text>
        </View>
      ) : (
        <View style={styles.scanStatusHeader}>
          <Text style={styles.scanStatusTitle}>{data.student_name || 'Checked paper'}</Text>
          <Text style={styles.scanStatusSubtitle}>{[data.exam_name || data.subject_name, displayedExperienceLabel].filter(Boolean).join(' · ')}</Text>
        </View>
      )}

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
        <AnimatedCard style={reviewOpen ? { ...styles.blockedCard, ...styles.focusedReviewCard } : styles.blockedCard}>
          {!reviewOpen ? (
            <>
              <View style={styles.blockedHeader}>
                <Ionicons name="warning-outline" size={19} color={colors.danger} />
                <Text style={styles.blockedTitle}>{teacherDecision?.title ?? 'Check the uploaded script'}</Text>
              </View>
              <Text style={styles.reviewGuidance}>{teacherDecision?.body}</Text>
              {blockers.length ? (
                visibleBlockers.map((blocker) => <BlockerRow key={blocker.issue_id} blocker={blocker} />)
              ) : (
                <Text style={styles.statusMeta}>Eduraa checked everything it could. Review only the item shown here.</Text>
              )}
            </>
          ) : null}

          {data.grading_results?.length ? (
            <View style={styles.confirmBlock}>
              {!reviewOpen ? (
                <>
                  <Text style={styles.decisionStep}>AI RESULT</Text>
                  <Text style={styles.statusMeta}>Provisional score</Text>
                  <Text style={styles.completedScore}>{data.total_score ?? '-'} / {data.max_score ?? '-'}</Text>
                  <Text style={styles.decisionStep}>TEACHER REVIEW</Text>
                  <Text style={styles.reviewGuidance}>The AI score is a suggestion. Your confirmation makes the marks final; publication remains a separate action.</Text>
                  <AnimatedButton
                    label="View scan evidence"
                    variant="ghost"
                    loading={pendingAction === 'scan'}
                    disabled={Boolean(pendingAction)}
                    onPress={() => void viewScanEvidence()}
                  />
                  <AnimatedButton
                    label="Open detailed paper workspace"
                    variant="secondary"
                    disabled={Boolean(pendingAction)}
                    onPress={openDetailedWorkspace}
                  />
                </>
              ) : null}
              {reviewOpen ? (
                <AnimatedButton
                  label="Close mark inspection"
                  variant="ghost"
                  onPress={() => setReviewOpen(false)}
                />
              ) : (
                <>
                  {!reviewComplete ? (
                    <AnimatedButton
                      label={`Use suggested ${data.total_score ?? '-'} / ${data.max_score ?? '-'}`}
                      variant="primary"
                      disabled={confirmableResults.length !== reviewResults.length}
                      onPress={acceptAllSuggestedMarks}
                    />
                  ) : null}
                  <AnimatedButton
                    label={`Inspect or edit ${reviewResults.length} marks`}
                    variant="ghost"
                    onPress={() => {
                      setReviewOpen(true)
                      setReviewComplete(false)
                    }}
                  />
                </>
              )}
              {reviewOpen ? (
                <View style={styles.focusedReview}>
                  <Text style={styles.reviewProgress}>{reviewedKeys.size} of {reviewResults.length} reviewed</Text>
                  <Text style={styles.statusMeta}>This is optional. Inspect only the question marks you want to verify or change.</Text>
                  <AnimatedButton
                    label="Use all suggested marks"
                    variant="secondary"
                    disabled={confirmableResults.length !== reviewResults.length}
                    onPress={acceptAllSuggestedMarks}
                  />
                  {reviewResults.map(({ result, index, key }) => {
                    const parsedScore = Number(scoreDrafts[key])
                    const maxScore = typeof result.max_score === 'number' ? result.max_score : null
                    const scoreValid = scoreDrafts[key]?.trim() !== '' && Number.isFinite(parsedScore) && parsedScore >= 0 && (maxScore == null || parsedScore <= maxScore)
                    const reviewed = reviewedKeys.has(key)
                    const changed = parsedScore !== result.score
                    return (
                      <View key={key} style={styles.reviewQuestion}>
                        <View style={styles.reviewQuestionHeader}>
                          <Text style={styles.reviewQuestionNumber}>QUESTION {result.question_number ?? index + 1}</Text>
                          <View style={styles.reviewStateRow}>
                            <Text style={[styles.reviewedChip, reviewed && styles.reviewedChipComplete]}>
                              {reviewed ? (changed ? 'EDITED' : 'AI MARK ACCEPTED') : 'NOT REVIEWED'}
                            </Text>
                            <Text style={styles.aiMark}>AI mark {result.score ?? '-'} / {result.max_score ?? '-'}</Text>
                          </View>
                        </View>
                        <Text style={styles.reviewQuestionText}>{result.question_text || 'Question text unavailable. Check the scan evidence.'}</Text>
                        <View style={styles.answerComparison}>
                          <View style={styles.answerColumn}>
                            <Text style={styles.answerLabel}>STUDENT ANSWER</Text>
                            <Text style={styles.answerValue}>{detectedStudentAnswer(result)}</Text>
                          </View>
                          <View style={styles.answerColumn}>
                            <Text style={styles.answerLabel}>EXPECTED</Text>
                            <Text style={styles.answerValue}>{reviewAnswer(result.expected_answer)}</Text>
                          </View>
                        </View>
                        {conciseAiReason(result) ? <Text style={styles.aiReason}>AI reason: {conciseAiReason(result)}</Text> : null}
                        <View style={styles.markEditor}>
                          <View>
                            <Text style={styles.answerLabel}>TEACHER MARK</Text>
                            <Text style={styles.markHint}>Your value becomes final</Text>
                          </View>
                          <View style={styles.markInputRow}>
                            <TextInput
                              accessibilityLabel={`Teacher mark for question ${result.question_number ?? index + 1}`}
                              value={scoreDrafts[key] ?? ''}
                              onChangeText={(value) => {
                                setScoreDrafts((current) => ({ ...current, [key]: value }))
                                const next = Number(value)
                                const valid = value.trim() !== '' && Number.isFinite(next) && next >= 0 && (maxScore == null || next <= maxScore)
                                setReviewedKeys((current) => {
                                  const updated = new Set(current)
                                  if (valid) updated.add(key)
                                  else updated.delete(key)
                                  return updated
                                })
                                setReviewComplete(false)
                              }}
                              keyboardType="decimal-pad"
                              selectTextOnFocus
                              style={[styles.markInput, !scoreValid && styles.markInputInvalid]}
                            />
                            <Text style={styles.markMax}>/ {result.max_score ?? '-'}</Text>
                          </View>
                        </View>
                        {!scoreValid ? <Text accessibilityRole="alert" style={styles.inlineError}>Enter a mark from 0 to {result.max_score ?? 'the question maximum'}.</Text> : null}
                        {!reviewed && scoreValid ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Accept AI mark for question ${result.question_number ?? index + 1}`}
                            onPress={() => setReviewedKeys((current) => new Set(current).add(key))}
                            style={styles.acceptMarkButton}
                          >
                            <Ionicons name="checkmark-circle-outline" size={17} color={colors.accentStrong} />
                            <Text style={styles.acceptMarkText}>Accept AI mark</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    )
                  })}
                  <AnimatedButton
                    label="Finish question review"
                    disabled={confirmableResults.length !== reviewResults.length || reviewedKeys.size !== reviewResults.length}
                    onPress={() => {
                      setReviewComplete(true)
                      setReviewOpen(false)
                    }}
                  />
                </View>
              ) : null}
              {canConfirmReviewedMarks && !reviewOpen ? (
                <>
                  <Text style={styles.decisionStep}>FINAL DECISION</Text>
                  <Text style={styles.statusMeta}>
                    {reviewComplete
                      ? `Suggested marks selected for all ${reviewResults.length} questions. Confirm only when they reflect your decision.`
                      : 'Review the checks or use the complete suggested result before confirming.'}
                  </Text>
                  {reviewComplete ? (
                    <>
                      <Text style={styles.proposedScore}>Your decision: {proposedTeacherScore} / {data.max_score ?? '-'}</Text>
                      <Text style={styles.statusMeta}>
                        {changedMarkCount
                          ? `${changedMarkCount} mark${changedMarkCount === 1 ? '' : 's'} changed from the AI result: ${changedQuestionLabel}.`
                          : 'All AI marks accepted without changes.'}
                      </Text>
                    </>
                  ) : null}
                  <AnimatedButton
                    label="Confirm reviewed marks"
                    loading={pendingAction === 'confirm-review'}
                    disabled={!reviewComplete || Boolean(pendingAction)}
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
        <View style={styles.completedCard}>
          <View style={styles.completedSummary}>
            <View style={styles.completedScoreBlock}>
              <Text style={styles.completedSummaryLabel}>{data.needs_review ? 'Provisional score' : 'Final score'}</Text>
              <Text style={styles.completedScore}>{data.total_score ?? '-'} <Text style={styles.completedScoreMax}>/ {data.max_score ?? '-'}</Text></Text>
            </View>
            <View style={styles.completedOutcome}>
              <View style={styles.completedOutcomeIcon}><Ionicons name={data.needs_review ? 'eye-outline' : 'document-text-outline'} size={18} color={colors.accentStrong} /></View>
              <Text style={styles.completedOutcomeText}>{experienceLabel}</Text>
            </View>
          </View>
          <View style={styles.scanJourney}>
            <View style={styles.scanJourneyRail}><View style={styles.scanJourneyRailComplete} /></View>
            <View style={styles.scanJourneyRow}><View style={styles.scanJourneyDot}><Ionicons name="checkmark" size={13} color={colors.textOnBrand} /></View><Text style={styles.scanJourneyTitle}>Uploaded</Text></View>
            <View style={styles.scanJourneyRow}><View style={styles.scanJourneyDot}><Ionicons name="checkmark" size={13} color={colors.textOnBrand} /></View><Text style={styles.scanJourneyTitle}>Checked</Text></View>
            <View style={styles.scanJourneyRow}><View style={[styles.scanJourneyDot, styles.scanJourneyDotCurrent]}><Ionicons name="arrow-forward" size={13} color={colors.accentStrong} /></View><Text style={styles.scanJourneyTitle}>Review</Text></View>
          </View>
          <Text style={styles.completedNext}>Your scan is secure. Open the report for question-level evidence and the next teacher action.</Text>
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
        </View>
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

      {!blocked ? <AnimatedButton label="Refresh status" variant="ghost" loading={isRefetching} onPress={() => void refetch()} /> : null}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing[4],
    paddingBottom: spacing[20],
  },
  scanStatusHeader: {
    gap: spacing[1],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing[3],
  },
  scanStatusTitle: {
    color: colors.text,
    fontFamily: typography.fonts.heading,
    fontSize: 28,
    lineHeight: 33,
  },
  scanStatusSubtitle: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
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
  decisionStep: {
    color: colors.textSoft,
    fontSize: 11,
    fontFamily: typography.fonts.bodyBold,
    letterSpacing: 1.2,
    marginTop: spacing[2],
  },
  reviewGuidance: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: typography.fonts.bodyMedium,
  },
  focusedHeader: {
    gap: spacing[1],
    paddingHorizontal: spacing[1],
  },
  focusedTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 19,
    lineHeight: 24,
  },
  proposedScore: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
  },
  blockedCard: {
    gap: spacing[3],
  },
  focusedReviewCard: {
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    padding: 0,
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
  confirmationIcon: {
    backgroundColor: colors.warningSurface,
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
  focusedReview: {
    gap: spacing[3],
    paddingTop: spacing[2],
  },
  reviewProgress: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
  },
  reviewQuestion: {
    gap: spacing[3],
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[4],
  },
  reviewQuestionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  reviewStateRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing[2],
  },
  reviewedChip: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  reviewedChipComplete: {
    color: colors.success,
  },
  reviewQuestionNumber: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.1,
  },
  aiMark: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  reviewQuestionText: {
    color: colors.text,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 15,
    lineHeight: 21,
  },
  answerComparison: {
    flexDirection: 'row',
    gap: spacing[3],
  },
  answerColumn: {
    flex: 1,
    gap: spacing[1],
  },
  answerLabel: {
    color: colors.textSoft,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  answerValue: {
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  aiReason: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  markEditor: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  markHint: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    marginTop: spacing[1],
  },
  markInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
  },
  markInput: {
    width: 76,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 16,
    paddingHorizontal: spacing[3],
    textAlign: 'center',
  },
  markInputInvalid: {
    borderColor: colors.danger,
  },
  markMax: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  inlineError: {
    color: colors.danger,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  acceptMarkButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  acceptMarkText: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 13,
  },
  completedCard: {
    gap: spacing[4],
    alignItems: 'stretch',
    paddingBottom: spacing[3],
  },
  completedSummary: {
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing[4],
  },
  completedScoreBlock: {
    flex: 1,
    gap: spacing[1],
  },
  completedSummaryLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 12,
  },
  completedScore: {
    color: colors.text,
    fontFamily: typography.fonts.heading,
    fontSize: 40,
    lineHeight: 44,
  },
  completedScoreMax: {
    color: colors.textMuted,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
  },
  completedOutcome: {
    width: 124,
    gap: spacing[2],
    borderLeftWidth: 1,
    borderLeftColor: colors.borderBrand,
    paddingLeft: spacing[4],
  },
  completedOutcomeIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSurfaceStrong,
  },
  completedOutcomeText: {
    color: colors.text,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 12,
    lineHeight: 17,
  },
  scanJourney: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'relative',
    paddingHorizontal: spacing[2],
    paddingTop: spacing[2],
  },
  scanJourneyRow: {
    alignItems: 'center',
    gap: spacing[2],
    width: 76,
    zIndex: 1,
  },
  scanJourneyDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
  },
  scanJourneyDotCurrent: {
    backgroundColor: colors.accentSurfaceStrong,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  scanJourneyRail: {
    position: 'absolute',
    top: 23,
    left: 42,
    right: 42,
    height: 3,
    backgroundColor: colors.border,
  },
  scanJourneyRailComplete: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.success,
  },
  scanJourneyTitle: {
    color: colors.text,
    fontFamily: typography.fonts.bodySemibold,
    fontSize: 11,
  },
  completedNext: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 19,
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
