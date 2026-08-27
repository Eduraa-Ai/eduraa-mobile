import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import axios from 'axios'
import { checkedPapersApi } from '../../api/checkedPapers'
import { isLearnerRole } from '../../auth/roles'
import { AuthLogoMark, MathText, ProtectedContentImage } from '../../components/ui'
import type { ResultsStackParamList } from '../../navigation'
import { returnToCheckedPapers } from '../../navigation/paperResultsNavigation'
import { useAuthStore } from '../../stores/authStore'
import { colors, radius, shadows, spacing, typography } from '../../theme'
import { checkedPaperScanPagePath } from '../../utils/protectedDocumentModel'
import { answerDisplay, buildQuestionReview, questionStatus } from './checkedPaperDetailModel'
import {
  clampReviewScore,
  formatCheckedPaperDuration,
  initialQuestionIndex,
  isLearningSupportInProgress,
  questionReviewHighlight,
  questionWorkspaceLabel,
} from './checkedPaperWorkspaceModel'
import { buildTeacherPaperDecision, generateIdempotencyKey } from '../workspace/checkedPaperPipelineModel'

type Route = RouteProp<ResultsStackParamList, 'CheckedPaperWorkspace'>
type Nav = NativeStackNavigationProp<ResultsStackParamList, 'CheckedPaperWorkspace'>
type Pane = 'scan' | 'evaluation'

function errorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError<{ detail?: string }>(error)) return error instanceof Error ? error.message : fallback
  if (!error.response) return 'Could not reach Eduraa. Check your connection and try again.'
  if (error.response.status === 401) return 'Your session expired. Sign in again to continue.'
  if (error.response.status === 403) return 'You do not have permission to review this paper.'
  if (error.response.status === 404) return 'The original scan is missing. Replace or re-upload this paper.'
  if (error.response.status === 409) return 'This paper changed elsewhere. Refresh it before saving again.'
  return error.response.data?.detail || fallback
}

function scoreTone(item: ReturnType<typeof questionStatus>) {
  if (item === 'correct') return colors.success
  if (item === 'wrong') return colors.warning
  if (item === 'missed') return colors.danger
  return colors.textMuted
}

function cleanReviewText(value?: string | null) {
  return String(value || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

export default function CheckedPaperWorkspaceScreen() {
  const { params } = useRoute<Route>()
  const navigation = useNavigation<Nav>()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const user = useAuthStore((state) => state.user)
  const isStaff = Boolean(user && !isLearnerRole(user.role))
  const scanScrollRef = useRef<ScrollView>(null)
  const scanHorizontalRef = useRef<ScrollView>(null)
  const [pane, setPane] = useState<Pane>('scan')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [zoom, setZoom] = useState(1.5)
  const [naturalRatio, setNaturalRatio] = useState(1.414)
  const [paneWidth, setPaneWidth] = useState<number | null>(null)
  const [scoreDraft, setScoreDraft] = useState('')
  const [feedbackDraft, setFeedbackDraft] = useState('')
  const [timingExpanded, setTimingExpanded] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const goBack = () => returnToCheckedPapers(navigation)

  useEffect(() => {
    const tabNavigator = navigation.getParent?.()
    if (!tabNavigator) return undefined
    tabNavigator.setOptions({ tabBarStyle: { display: 'none' } })
    return () => tabNavigator.setOptions({ tabBarStyle: undefined })
  }, [navigation])

  const paperQuery = useQuery({
    queryKey: ['checked-paper', params.checkedPaperId],
    queryFn: () => checkedPapersApi.getById(params.checkedPaperId),
    enabled: Boolean(params.checkedPaperId),
    refetchInterval: (query) => isLearningSupportInProgress(query.state.data?.learning_support_status) ? 3000 : false,
  })
  const pageCountQuery = useQuery({
    queryKey: ['checked-paper', params.checkedPaperId, 'scan-pages'],
    queryFn: () => checkedPapersApi.getScannedPageCount(params.checkedPaperId),
    enabled: Boolean(params.checkedPaperId),
    retry: 1,
  })

  const questions = paperQuery.data?.grading_results ?? []
  const pendingReviewCount = questions.filter((question) => question.manual_review_requested && !question.manual_review_completed).length
  const teacherDecision = useMemo(() => paperQuery.data ? buildTeacherPaperDecision(paperQuery.data) : null, [paperQuery.data])
  const confirmationCount = pendingReviewCount || (paperQuery.data?.needs_review ? Math.max(1, teacherDecision?.issueCount ?? 0) : 0)
  const item = questions[questionIndex]
  const review = useMemo(() => item ? buildQuestionReview(item) : null, [item])
  const highlight = useMemo(() => questionReviewHighlight(item), [item])
  const pageCount = Math.max(1, pageCountQuery.data ?? 1)
  const canEdit = Boolean(isStaff && paperQuery.data?.can_save_review && !paperQuery.data.legacy_read_only)
  const processingTiming = paperQuery.data?.processing_timing
  const scanViewportWidth = Math.max(280, Math.min((paneWidth ?? width) - spacing[6], 620))
  const displayWidth = scanViewportWidth * zoom
  const imageHeight = displayWidth * naturalRatio

  const focusCurrentHighlight = useCallback(() => {
    if (!highlight || highlight.page !== pageNumber) return
    requestAnimationFrame(() => scanScrollRef.current?.scrollTo({
      y: Math.max(0, (highlight.bboxPercent.top / 100) * imageHeight - 120),
      animated: true,
    }))
    requestAnimationFrame(() => scanHorizontalRef.current?.scrollTo({
      x: Math.max(0, ((highlight.bboxPercent.left + highlight.bboxPercent.width / 2) / 100) * displayWidth - scanViewportWidth / 2),
      animated: true,
    }))
  }, [displayWidth, highlight, imageHeight, pageNumber, scanViewportWidth])

  const focusLoadedHighlight = useCallback((state: 'loading' | 'loaded' | 'error') => {
    if (state === 'loaded') focusCurrentHighlight()
  }, [focusCurrentHighlight])

  useEffect(() => {
    if (!highlight || highlight.page !== pageNumber) return undefined
    const focusTimer = setTimeout(focusCurrentHighlight, 120)
    return () => clearTimeout(focusTimer)
  }, [focusCurrentHighlight, highlight, pageNumber])

  useEffect(() => {
    if (!questions.length) return
    setQuestionIndex(initialQuestionIndex(questions, params.questionId, params.questionIndex))
  }, [params.questionId, params.questionIndex, paperQuery.data?.id, questions.length])

  useEffect(() => {
    if (!item) return
    setScoreDraft(item.score == null ? '' : String(item.score))
    setFeedbackDraft(cleanReviewText(item.feedback))
    setNotice(null)
    setNaturalRatio(1.414)
    setZoom(highlight
      ? Math.max(0.8, Math.min(1.6, 78 / highlight.bboxPercent.width))
      : 1)
    if (highlight?.page) setPageNumber(Math.min(pageCount, highlight.page))
  }, [highlight?.bboxPercent.width, highlight?.page, item?.result_id, item?.question_id, pageCount])

  const refreshPaper = async () => {
    setNotice(null)
    await Promise.all([paperQuery.refetch(), pageCountQuery.refetch()])
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!paperQuery.data || !item) throw new Error('No review question is selected.')
      const parsed = Number(scoreDraft)
      if (!scoreDraft.trim() || !Number.isFinite(parsed)) throw new Error('Enter a valid mark before saving.')
      if (parsed < 0 || (item.max_score != null && parsed > item.max_score)) {
        throw new Error(`Marks must be between 0 and ${item.max_score ?? 'the question maximum'}.`)
      }
      return checkedPapersApi.updateTeacherReview(paperQuery.data.id, {
        grading_feedback: paperQuery.data.grading_feedback ?? null,
        results: [{
          result_id: item.result_id || null,
          question_id: item.question_id || null,
          score: parsed,
          feedback: feedbackDraft.trim() || null,
          selected: true,
        }],
      })
    },
    onSuccess: async () => {
      setNotice({ tone: 'success', text: 'Mark confirmed. The result is still private.' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['checked-paper', params.checkedPaperId] }),
        queryClient.invalidateQueries({ queryKey: ['checked-papers'] }),
      ])
    },
    onError: (error) => setNotice({ tone: 'error', text: errorMessage(error, 'Could not save these marks.') }),
  })

  const releaseMutation = useMutation({
    mutationFn: async (action: 'approve' | 'publish') => {
      const paper = paperQuery.data
      if (paper?.row_version == null) throw new Error('Refresh this paper before changing its release status.')
      const payload = { expected_revision: paper.row_version, idempotency_key: generateIdempotencyKey() }
      return action === 'approve'
        ? checkedPapersApi.approve(paper.id, payload)
        : checkedPapersApi.publish(paper.id, payload)
    },
    onSuccess: async (_paper, action) => {
      setNotice({ tone: 'success', text: action === 'approve' ? 'Paper approved. Publish when you are ready.' : 'Marks published to the student.' })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['checked-paper', params.checkedPaperId] }),
        queryClient.invalidateQueries({ queryKey: ['checked-papers'] }),
      ])
    },
    onError: (error) => setNotice({ tone: 'error', text: errorMessage(error, 'Could not update the release status.') }),
  })

  if (paperQuery.isLoading || !paperQuery.data) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        {paperQuery.isError ? (
          <>
            <View style={styles.stateIcon}><Ionicons name="alert-circle-outline" size={24} color={colors.danger} /></View>
            <Text style={styles.stateTitle}>Review workspace unavailable</Text>
            <Text style={styles.stateBody}>{errorMessage(paperQuery.error, 'This paper could not be loaded.')}</Text>
            <Pressable accessibilityRole="button" onPress={() => void refreshPaper()} style={styles.stateButton}><Text style={styles.stateButtonText}>Try again</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to checked papers" onPress={goBack} style={styles.backLink}><Text style={styles.backLinkText}>Back to checked papers</Text></Pressable>
          </>
        ) : (
          <><ActivityIndicator size="large" color={colors.accent} /><Text style={styles.stateTitle}>Preparing review workspace</Text><Text style={styles.stateBody}>Loading the scan, answer evidence, and marks.</Text></>
        )}
      </View>
    )
  }

  const paper = paperQuery.data
  if (!questions.length || !item || !review) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <View style={styles.stateIcon}><Ionicons name="document-text-outline" size={24} color={colors.accentStrong} /></View>
        <Text style={styles.stateTitle}>Detailed grading is not ready</Text>
        <Text style={styles.stateBody}>This workspace opens when question-by-question grading is available. Your uploaded paper remains safe.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to checked papers" onPress={goBack} style={styles.stateButton}><Text style={styles.stateButtonText}>Back to checked papers</Text></Pressable>
      </View>
    )
  }

  const status = questionStatus(item)
  const score = Number(scoreDraft)
  const dirty = (Number.isFinite(score) ? score : null) !== item.score || feedbackDraft.trim() !== cleanReviewText(item.feedback)
  const validScore = scoreDraft.trim() !== '' && Number.isFinite(score) && score >= 0 && (item.max_score == null || score <= item.max_score)

  const selectQuestion = (next: number) => {
    if (next < 0 || next >= questions.length || saveMutation.isPending) return
    setQuestionIndex(next)
    setPane('scan')
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to checked papers" onPress={goBack} style={styles.iconButton}>
            <Ionicons name="arrow-back" size={19} color={colors.text} />
          </Pressable>
          <AuthLogoMark size={30} />
          <View style={styles.headerIdentity}>
            <Text style={styles.brand} numberOfLines={1}>{paper.student_name || 'Student'} · {item.score ?? '-'} / {item.max_score ?? '-'}</Text>
            <Text style={styles.brandMeta} numberOfLines={1}>{paper.exam_name || paper.subject_name || 'Checked paper'}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh paper workspace" onPress={() => void refreshPaper()} style={styles.iconButton}>
            {paperQuery.isFetching ? <ActivityIndicator size="small" color={colors.accent} /> : <Ionicons name="refresh-outline" size={19} color={colors.text} />}
          </Pressable>
        </View>
        <View style={styles.paperProgress}>
            <Text style={styles.progressText}>{confirmationCount > 0 ? `${confirmationCount} check${confirmationCount === 1 ? ' needs' : 's need'} confirmation` : `Question ${questionIndex + 1} of ${questions.length}`}</Text>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${((questionIndex + 1) / questions.length) * 100}%` }]} /></View>
          <Text style={styles.releaseText}>{paper.results_published ? 'Published' : paper.approval_status === 'approved' ? 'Approved' : 'Review in progress'}</Text>
        </View>
      </View>

      {isStaff && processingTiming?.stages.length ? (
        <View style={styles.timingPanel}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={timingExpanded ? 'Hide checking time breakdown' : 'View checking time breakdown'}
            accessibilityState={{ expanded: timingExpanded }}
            onPress={() => setTimingExpanded((value) => !value)}
            style={styles.timingSummary}
          >
            <View style={styles.timingTitleRow}>
              <Ionicons name="time-outline" size={17} color={colors.accentStrong} />
              <Text style={styles.timingTitle}>
                {processingTiming.total_seconds != null
                  ? `Checked in ${formatCheckedPaperDuration(processingTiming.total_seconds)}`
                  : 'Checking time in progress'}
              </Text>
            </View>
            <View style={styles.timingAction}>
              <Text style={styles.timingActionText}>{timingExpanded ? 'Hide' : 'Breakdown'}</Text>
              <Ionicons name={timingExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
            </View>
          </Pressable>
          {timingExpanded ? (
            <View style={styles.timingDetails}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timingStages}>
                {processingTiming.stages.map((stage) => (
                  <View key={stage.key} style={styles.timingStageCard}>
                    <View style={styles.timingStageHeading}>
                      <Text numberOfLines={1} style={styles.timingStageLabel}>{stage.label}</Text>
                      <Text style={styles.timingStageTotal}>{formatCheckedPaperDuration(stage.total_seconds)}</Text>
                    </View>
                    {stage.queue_seconds != null && stage.execution_seconds != null ? (
                      <Text numberOfLines={1} style={styles.timingStageMeta}>
                        Ready {formatCheckedPaperDuration(stage.queue_seconds)} / Work {formatCheckedPaperDuration(stage.execution_seconds)}
                      </Text>
                    ) : (
                      <Text style={styles.timingStageProgress}>In progress</Text>
                    )}
                  </View>
                ))}
              </ScrollView>
              {isLearningSupportInProgress(paper.learning_support_status) ? (
                <View style={styles.learningSupportNote}>
                  <ActivityIndicator size="small" color={colors.accentStrong} />
                  <Text style={styles.learningSupportText}>Optional learning insights are being prepared. Marks and feedback are already ready.</Text>
                </View>
              ) : paper.learning_support_status === 'failed' ? (
                <View style={styles.learningSupportNote}>
                  <Ionicons name="information-circle-outline" size={17} color={colors.textMuted} />
                  <Text style={styles.learningSupportText}>Marks and feedback are ready. Optional learning insights could not be prepared.</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.questionBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous question" accessibilityState={{ disabled: questionIndex === 0 }} disabled={questionIndex === 0} onPress={() => selectQuestion(questionIndex - 1)} style={[styles.navButton, questionIndex === 0 && styles.disabled]}>
          <Ionicons name="chevron-back" size={17} color={colors.text} />
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.questionChips}>
          {questions.map((question, index) => {
            const selected = index === questionIndex
            const tone = scoreTone(questionStatus(question))
            return (
              <Pressable key={question.result_id || `${question.question_id}-${index}`} accessibilityRole="button" accessibilityLabel={`Open ${questionWorkspaceLabel(question, index)}`} accessibilityState={{ selected }} onPress={() => selectQuestion(index)} style={[styles.questionChip, selected && styles.questionChipActive]}>
                <View style={[styles.questionDot, { backgroundColor: tone }]} />
                <Text style={[styles.questionChipText, selected && styles.questionChipTextActive]}>{questionWorkspaceLabel(question, index)}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
        <Pressable accessibilityRole="button" accessibilityLabel="Next question" accessibilityState={{ disabled: questionIndex === questions.length - 1 }} disabled={questionIndex === questions.length - 1} onPress={() => selectQuestion(questionIndex + 1)} style={[styles.navButton, questionIndex === questions.length - 1 && styles.disabled]}>
          <Ionicons name="chevron-forward" size={17} color={colors.text} />
        </Pressable>
      </View>

      {confirmationCount > 0 ? (
        <View style={styles.quickGuide}>
          <View style={styles.quickGuideStep}><Text style={styles.quickGuideNumber}>1</Text><Text style={styles.quickGuideText}>{pendingReviewCount > 0 ? 'Check the highlighted answer' : 'Scan the suggested answers'}</Text></View>
          <Ionicons name="arrow-forward" size={14} color={colors.textSoft} />
          <View style={styles.quickGuideStep}><Text style={styles.quickGuideNumber}>2</Text><Text style={styles.quickGuideText}>{pendingReviewCount > 0 ? 'Confirm or edit the mark' : 'Confirm the suggested result'}</Text></View>
        </View>
      ) : null}

      <View accessibilityRole="tablist" style={styles.tabs}>
        {([{ key: 'scan', label: '1  Scan answer', icon: 'document-text-outline' }, { key: 'evaluation', label: '2  Check mark', icon: 'checkmark-circle-outline' }] as const).map((tab) => (
          <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: pane === tab.key }} onPress={() => setPane(tab.key)} style={[styles.tab, pane === tab.key && styles.tabActive]}>
            <Ionicons name={tab.icon} size={16} color={pane === tab.key ? colors.white : colors.textMuted} />
            <Text style={[styles.tabText, pane === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      {notice ? <View accessibilityRole="alert" style={[styles.notice, notice.tone === 'error' ? styles.noticeError : styles.noticeSuccess]}><Ionicons name={notice.tone === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'} size={17} color={notice.tone === 'error' ? colors.danger : colors.success} /><Text style={styles.noticeText}>{notice.text}</Text><Pressable accessibilityRole="button" accessibilityLabel="Dismiss message" onPress={() => setNotice(null)}><Ionicons name="close" size={17} color={colors.textMuted} /></Pressable></View> : null}

      {pane === 'scan' ? (
        <View
          style={styles.pane}
          onLayout={(event) => {
            const nextWidth = event.nativeEvent.layout.width
            setPaneWidth((current) => current != null && Math.abs(current - nextWidth) < 1 ? current : nextWidth)
          }}
        >
          <View style={styles.scanToolbar}>
            <View style={styles.focusPill}><Ionicons name="locate-outline" size={14} color={highlight ? colors.accentStrong : colors.textMuted} /><Text style={styles.focusText}>{highlight ? `Fit to answer · Page ${highlight.page}` : 'Full page · No precise highlight'}</Text></View>
            <View style={styles.zoomTools}>
              <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" disabled={zoom <= 0.8} onPress={() => setZoom((value) => Math.max(0.8, value - 0.2))} style={styles.toolButton}><Ionicons name="remove" size={17} color={colors.text} /></Pressable>
              <Text style={styles.zoomText}>{Math.round(zoom * 100)}%</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" disabled={zoom >= 2.4} onPress={() => setZoom((value) => Math.min(2.4, value + 0.2))} style={styles.toolButton}><Ionicons name="add" size={17} color={colors.text} /></Pressable>
            </View>
          </View>
          {pageCountQuery.isError ? <View style={styles.scanError}><Ionicons name="alert-circle-outline" size={18} color={colors.danger} /><View style={styles.scanErrorCopy}><Text style={styles.scanErrorTitle}>Scanned paper unavailable</Text><Text style={styles.scanErrorText}>{errorMessage(pageCountQuery.error, 'The scan preview could not load.')}</Text></View><Pressable accessibilityRole="button" onPress={() => void pageCountQuery.refetch()} style={styles.retrySmall}><Text style={styles.retrySmallText}>Retry</Text></Pressable></View> : (
            <ScrollView ref={scanScrollRef} style={styles.scanScroll} contentContainerStyle={styles.scanScrollContent} showsVerticalScrollIndicator={false} nestedScrollEnabled>
              <ScrollView ref={scanHorizontalRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scanHorizontal}>
                <View style={[styles.pageFrame, { width: displayWidth, height: imageHeight }]}>
                  <ProtectedContentImage
                    key={`${pageNumber}-${item.result_id || item.question_id || questionIndex}`}
                    uri={checkedPaperScanPagePath(paper.id, pageNumber)}
                    accessibilityLabel={`Scanned answer sheet page ${pageNumber}`}
                    contentHeight={imageHeight}
                    style={{ width: displayWidth, height: imageHeight }}
                    onNaturalSizeChange={(imageWidth, imageHeightValue) => setNaturalRatio(imageHeightValue / imageWidth)}
                    onLoadStateChange={focusLoadedHighlight}
                  />
                  {highlight?.page === pageNumber ? <View pointerEvents="none" accessibilityLabel={`Answer highlight for ${questionWorkspaceLabel(item, questionIndex)}`} style={[styles.highlight, { left: `${highlight.bboxPercent.left}%`, top: `${highlight.bboxPercent.top}%`, width: `${highlight.bboxPercent.width}%`, height: `${highlight.bboxPercent.height}%` }, highlight.uncertain && styles.highlightUncertain]} /> : null}
                </View>
              </ScrollView>
            </ScrollView>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Check the suggested mark" onPress={() => setPane('evaluation')} style={styles.scanPrimaryAction}>
            <View><Text style={styles.scanPrimaryEyebrow}>{questionWorkspaceLabel(item, questionIndex)} · Suggested {item.score ?? '-'} / {item.max_score ?? '-'}</Text><Text style={styles.scanPrimaryText}>Check suggested mark</Text></View>
            <Ionicons name="arrow-forward" size={19} color={colors.white} />
          </Pressable>
          <View style={[styles.pageFooter, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Previous scanned page" disabled={pageNumber <= 1} onPress={() => setPageNumber((value) => Math.max(1, value - 1))} style={[styles.pageButton, pageNumber <= 1 && styles.disabled]}><Ionicons name="chevron-back" size={17} color={colors.text} /></Pressable>
            <Text style={styles.pageText}>Page {pageNumber} of {pageCountQuery.isLoading ? '…' : pageCount}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Next scanned page" disabled={pageNumber >= pageCount} onPress={() => setPageNumber((value) => Math.min(pageCount, value + 1))} style={[styles.pageButton, pageNumber >= pageCount && styles.disabled]}><Ionicons name="chevron-forward" size={17} color={colors.text} /></Pressable>
          </View>
        </View>
      ) : (
        <ScrollView style={styles.evaluationScroll} contentContainerStyle={[styles.evaluationContent, { paddingBottom: Math.max(insets.bottom, spacing[6]) }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.questionCard}>
            <View style={styles.cardHeading}><Text style={styles.cardKicker}>{questionWorkspaceLabel(item, questionIndex)}</Text><Text style={[styles.statusText, { color: scoreTone(status) }]}>{status}</Text></View>
            <MathText style={styles.questionText} value={review.questionText || 'Question text unavailable'} />
          </View>
          <View style={styles.evaluationNarrative}>
            <View style={styles.answerCard}><Text style={styles.sectionLabel}>Student answer</Text><MathText style={styles.answerText} value={review.studentAnswer || (review.answerEvaluatedFromScan ? 'Evaluated from the handwritten scan.' : 'No answer detected.')} /></View>
            <View style={styles.answerCard}><Text style={styles.sectionLabel}>Expected answer</Text><MathText style={styles.answerText} value={review.expectedAnswer || 'Expected answer unavailable.'} /></View>
            <View style={[styles.answerCard, styles.answerCardLast]}><Text style={styles.sectionLabel}>Rubric judgment</Text><MathText style={styles.answerText} value={cleanReviewText(item.feedback || item.recommendation) || 'No evaluator note was supplied.'} /></View>
          </View>
          {isStaff ? (
            <View style={styles.teacherCard}>
              <View style={styles.teacherHeading}><View><Text style={styles.sectionLabel}>Teacher decision</Text><Text style={styles.teacherHint}>AI marks are a suggestion. Your saved mark becomes the reviewed result.</Text></View><View style={styles.maxPill}><Text style={styles.maxPillText}>Max {item.max_score ?? '-'}</Text></View></View>
              <View style={styles.scoreEditor}>
                <Pressable accessibilityRole="button" accessibilityLabel="Decrease mark by 0.5" disabled={!canEdit} onPress={() => setScoreDraft(String(clampReviewScore((Number(scoreDraft) || 0) - 0.5, item.max_score)))} style={[styles.scoreStep, !canEdit && styles.disabled]}><Ionicons name="remove" size={19} color={colors.text} /></Pressable>
                <TextInput accessibilityLabel="Teacher mark" editable={canEdit} keyboardType="decimal-pad" value={scoreDraft} onChangeText={setScoreDraft} style={styles.scoreInput} />
                <Pressable accessibilityRole="button" accessibilityLabel="Increase mark by 0.5" disabled={!canEdit} onPress={() => setScoreDraft(String(clampReviewScore((Number(scoreDraft) || 0) + 0.5, item.max_score)))} style={[styles.scoreStep, !canEdit && styles.disabled]}><Ionicons name="add" size={19} color={colors.text} /></Pressable>
              </View>
              <TextInput accessibilityLabel="Teacher feedback" editable={canEdit} multiline value={feedbackDraft} onChangeText={setFeedbackDraft} placeholder="Add a short note for the student" placeholderTextColor={colors.textSoft} style={styles.feedbackInput} />
              {!canEdit ? <Text style={styles.readOnlyText}>{paper.legacy_read_only ? 'This legacy result is read-only.' : 'Resolve the paper issue before editing marks.'}</Text> : null}
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canEdit || !validScore, busy: saveMutation.isPending }} disabled={!canEdit || !validScore || saveMutation.isPending} onPress={() => saveMutation.mutate()} style={[styles.saveButton, (!canEdit || !validScore) && styles.saveButtonDisabled]}>{saveMutation.isPending ? <ActivityIndicator color={colors.white} /> : <><Ionicons name="checkmark" size={17} color={colors.white} /><Text style={styles.saveButtonText}>{dirty ? 'Confirm edited mark' : 'Confirm suggested mark'}</Text></>}</Pressable>
            </View>
          ) : null}
          {isStaff && (paper.can_approve || paper.can_publish) ? <View style={styles.releaseCard}><Text style={styles.sectionLabel}>Release result</Text><Text style={styles.teacherHint}>Approval confirms review. Publishing is the separate action that makes marks visible to the student.</Text>{paper.can_approve ? <Pressable accessibilityRole="button" disabled={releaseMutation.isPending} onPress={() => releaseMutation.mutate('approve')} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Approve checked paper</Text></Pressable> : null}{paper.can_publish ? <Pressable accessibilityRole="button" disabled={releaseMutation.isPending} onPress={() => releaseMutation.mutate('publish')} style={styles.publishButton}><Text style={styles.publishButtonText}>Publish marks to student</Text></Pressable> : null}</View> : null}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f6f3ee' },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing[6], gap: spacing[3] },
  stateIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  stateTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 18, textAlign: 'center' },
  stateBody: { maxWidth: 360, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  stateButton: { minHeight: 48, minWidth: 180, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.nav, marginTop: spacing[2] },
  stateButtonText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 13 },
  backLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing[5] },
  backLinkText: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  header: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: spacing[3], paddingVertical: spacing[1] },
  headerTop: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  iconButton: { width: 44, height: 44, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  headerIdentity: { flex: 1 },
  brand: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 13 },
  brandMeta: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 9, marginTop: 1 },
  paperProgress: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingBottom: spacing[1] },
  progressText: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  progressTrack: { flex: 1, height: 4, borderRadius: radius.full, overflow: 'hidden', backgroundColor: colors.backgroundMuted },
  progressFill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.accent },
  releaseText: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 9, textTransform: 'uppercase' },
  timingPanel: { borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#f8fafc' },
  timingSummary: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[3], paddingHorizontal: spacing[4] },
  timingTitleRow: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  timingTitle: { flexShrink: 1, color: colors.textSecondary, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  timingAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  timingActionText: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 9, textTransform: 'uppercase' },
  timingDetails: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing[3], gap: spacing[3] },
  timingStages: { gap: spacing[2], paddingHorizontal: spacing[4] },
  timingStageCard: { width: 148, paddingHorizontal: spacing[3], paddingVertical: spacing[2], borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  timingStageHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] },
  timingStageLabel: { flex: 1, color: colors.textSecondary, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  timingStageTotal: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 11 },
  timingStageMeta: { color: colors.textSoft, fontFamily: typography.fonts.bodyMedium, fontSize: 8, marginTop: spacing[1] },
  timingStageProgress: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 8, marginTop: spacing[1] },
  learningSupportNote: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[4] },
  learningSupportText: { flex: 1, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 9, lineHeight: 14 },
  questionBar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#fffdf9', paddingHorizontal: spacing[1] },
  navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.32 },
  questionChips: { alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[1] },
  questionChip: { minWidth: 46, minHeight: 36, borderRadius: radius.full, paddingHorizontal: spacing[2], flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[1], backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  questionChipActive: { backgroundColor: colors.nav, borderColor: colors.nav },
  questionDot: { width: 6, height: 6, borderRadius: 3 },
  questionChipText: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  questionChipTextActive: { color: colors.white },
  quickGuide: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingHorizontal: spacing[3], backgroundColor: colors.accentSurface, borderBottomWidth: 1, borderBottomColor: colors.borderBrand },
  quickGuideStep: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  quickGuideNumber: { width: 20, height: 20, borderRadius: 10, textAlign: 'center', lineHeight: 20, color: colors.white, backgroundColor: colors.accent, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  quickGuideText: { color: colors.textSecondary, fontFamily: typography.fonts.bodyBold, fontSize: 9 },
  tabs: { flexDirection: 'row', gap: spacing[2], paddingHorizontal: spacing[2], paddingVertical: spacing[1], backgroundColor: '#fffdf9', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, minHeight: 40, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2] },
  tabActive: { backgroundColor: colors.nav },
  tabText: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  tabTextActive: { color: colors.white },
  notice: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: spacing[2], paddingHorizontal: spacing[4], borderBottomWidth: 1 },
  noticeSuccess: { backgroundColor: colors.successSurface, borderBottomColor: colors.successBorder },
  noticeError: { backgroundColor: colors.dangerSurface, borderBottomColor: colors.dangerBorder },
  noticeText: { flex: 1, color: colors.text, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 16 },
  pane: { flex: 1 },
  scanToolbar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2], paddingHorizontal: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#f8fafc' },
  focusPill: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  focusText: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 9 },
  zoomTools: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  toolButton: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  zoomText: { minWidth: 38, color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 9, textAlign: 'center' },
  scanScroll: { flex: 1, backgroundColor: '#dce2e7' },
  scanScrollContent: { minHeight: '100%', paddingVertical: spacing[4] },
  scanHorizontal: { minWidth: '100%', paddingHorizontal: spacing[3], justifyContent: 'center' },
  pageFrame: { position: 'relative', backgroundColor: colors.white, borderRadius: radius.sm, overflow: 'hidden', ...shadows.md },
  highlight: { position: 'absolute', borderWidth: 2, borderColor: colors.accent, backgroundColor: 'rgba(249,115,22,0.13)', borderRadius: 5 },
  highlightUncertain: { borderColor: colors.danger, borderStyle: 'dashed', backgroundColor: 'rgba(225,29,72,0.10)' },
  scanError: { margin: spacing[4], padding: spacing[4], borderRadius: radius.lg, borderWidth: 1, borderColor: colors.dangerBorder, backgroundColor: colors.white, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  scanErrorCopy: { flex: 1 },
  scanErrorTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 12 },
  scanErrorText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 10, lineHeight: 15, marginTop: 2 },
  retrySmall: { minHeight: 40, borderRadius: radius.full, justifyContent: 'center', paddingHorizontal: spacing[3], backgroundColor: colors.accentSurface },
  retrySmallText: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  scanPrimaryAction: { minHeight: 58, marginHorizontal: spacing[3], marginTop: spacing[2], paddingHorizontal: spacing[4], borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.nav, ...shadows.sm },
  scanPrimaryEyebrow: { color: '#fdba74', fontFamily: typography.fonts.bodyBold, fontSize: 9, textTransform: 'uppercase' },
  scanPrimaryText: { color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 14, marginTop: 2 },
  pageFooter: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[4], paddingTop: spacing[2], borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white },
  pageButton: { width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  pageText: { minWidth: 92, textAlign: 'center', color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  evaluationScroll: { flex: 1 },
  evaluationContent: { padding: spacing[4], gap: spacing[3] },
  questionCard: { padding: spacing[4], borderRadius: radius.lg, backgroundColor: colors.nav, ...shadows.sm },
  cardHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[3] },
  cardKicker: { color: '#fdba74', fontFamily: typography.fonts.bodyBold, fontSize: 10, textTransform: 'uppercase' },
  statusText: { fontFamily: typography.fonts.bodyBold, fontSize: 10, textTransform: 'uppercase' },
  questionText: { color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 15, lineHeight: 22 },
  evaluationNarrative: { paddingHorizontal: spacing[4], borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  answerCard: { paddingVertical: spacing[4], borderBottomWidth: 1, borderBottomColor: colors.border },
  answerCardLast: { borderBottomWidth: 0 },
  sectionLabel: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 12 },
  answerText: { color: colors.textSecondary, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 19, marginTop: spacing[2] },
  teacherCard: { padding: spacing[4], borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderBrand, backgroundColor: '#fffaf4', gap: spacing[3] },
  teacherHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  teacherHint: { flexShrink: 1, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 10, lineHeight: 15, marginTop: 3 },
  maxPill: { borderRadius: radius.full, paddingHorizontal: spacing[3], paddingVertical: spacing[2], backgroundColor: colors.accentSurface },
  maxPillText: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 9 },
  scoreEditor: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[3] },
  scoreStep: { width: 48, height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  scoreInput: { width: 92, height: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.borderBrand, backgroundColor: colors.white, color: colors.text, fontFamily: typography.fonts.heading, fontSize: 20, textAlign: 'center' },
  feedbackInput: { minHeight: 88, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, padding: spacing[3], color: colors.text, fontFamily: typography.fonts.bodyMedium, fontSize: 12, textAlignVertical: 'top' },
  readOnlyText: { color: colors.warning, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  saveButton: { minHeight: 50, borderRadius: radius.full, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], backgroundColor: colors.nav },
  saveButtonDisabled: { opacity: 0.42 },
  saveButtonText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  releaseCard: { padding: spacing[4], borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, gap: spacing[3] },
  secondaryButton: { minHeight: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.white },
  secondaryButtonText: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
  publishButton: { minHeight: 50, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  publishButtonText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 12 },
})
