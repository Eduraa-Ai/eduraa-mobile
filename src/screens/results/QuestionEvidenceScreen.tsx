import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
import { LinearGradient } from 'expo-linear-gradient'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { checkedPapersApi } from '../../api/checkedPapers'
import { isLearnerRole } from '../../auth/roles'
import { AuthLogoMark, MathText, ProtectedContentImage } from '../../components/ui'
import type { ResultsStackParamList } from '../../navigation'
import { useAuthStore } from '../../stores/authStore'
import { colors, layout, radius, spacing, typography } from '../../theme'
import { openProtectedDocument } from '../../utils/openProtectedDocument'
import {
  buildQuestionReview,
  findEvidenceQuestion,
  findNextEvidenceQuestion,
  findPreviousEvidenceQuestion,
  questionStatus,
  questionTypeLabel,
  readableMathText,
  type DetailedExplanationSection,
  type QuestionEvidenceTab,
  type QuestionReviewFigure,
  type QuestionReviewOption,
} from './checkedPaperDetailModel'

type Route = RouteProp<ResultsStackParamList, 'QuestionEvidence'>
type Nav = NativeStackNavigationProp<ResultsStackParamList, 'QuestionEvidence'>

const TAB_CONFIG: Array<{ key: QuestionEvidenceTab; label: string }> = [
  { key: 'feedback', label: 'Feedback' },
  { key: 'details', label: 'Solution' },
  { key: 'review', label: 'Review' },
]

const STATUS_META = {
  correct: { label: 'Correct', tone: colors.success },
  wrong: { label: 'Wrong', tone: colors.warning },
  missed: { label: 'Missed', tone: colors.danger },
  pending: { label: 'Pending', tone: colors.textMuted },
} as const

function QuestionFigure({
  figure,
  compact,
}: {
  figure: QuestionReviewFigure
  compact: boolean
}) {
  const { height } = useWindowDimensions()
  const [imageState, setImageState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [viewerVisible, setViewerVisible] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const scale = useSharedValue(1)
  const startingScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const startingX = useSharedValue(0)
  const startingY = useSharedValue(0)

  const resetZoom = useCallback(() => {
    scale.value = withTiming(1)
    translateX.value = withTiming(0)
    translateY.value = withTiming(0)
    setZoomLevel(1)
  }, [scale, translateX, translateY])

  const changeZoom = useCallback((next: number) => {
    const clamped = Math.max(1, Math.min(4, next))
    scale.value = withTiming(clamped)
    if (clamped === 1) {
      translateX.value = withTiming(0)
      translateY.value = withTiming(0)
    }
    setZoomLevel(clamped)
  }, [scale, translateX, translateY])

  const openViewer = () => {
    resetZoom()
    setViewerVisible(true)
  }

  const closeViewer = () => {
    setViewerVisible(false)
    resetZoom()
  }

  const pinchGesture = useMemo(() => Gesture.Pinch()
    .onBegin(() => {
      startingScale.value = scale.value
    })
    .onUpdate((event) => {
      scale.value = Math.max(1, Math.min(4, startingScale.value * event.scale))
    })
    .onEnd(() => {
      runOnJS(setZoomLevel)(Math.round(scale.value * 10) / 10)
      if (scale.value <= 1.01) {
        translateX.value = withTiming(0)
        translateY.value = withTiming(0)
      }
    }), [scale, startingScale, translateX, translateY])

  const panGesture = useMemo(() => Gesture.Pan()
    .onBegin(() => {
      startingX.value = translateX.value
      startingY.value = translateY.value
    })
    .onUpdate((event) => {
      if (scale.value <= 1) return
      const limit = (scale.value - 1) * 160
      translateX.value = Math.max(-limit, Math.min(limit, startingX.value + event.translationX))
      translateY.value = Math.max(-limit, Math.min(limit, startingY.value + event.translationY))
    }), [scale, startingX, startingY, translateX, translateY])

  const viewerGesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, panGesture),
    [panGesture, pinchGesture],
  )
  const animatedFigureStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }))
  const viewerImageHeight = Math.max(280, Math.min(580, height - 210))

  return (
    <View style={styles.questionFigure}>
      <View style={styles.questionFigureLabel}>
        <Ionicons name="image-outline" size={14} color={colors.accentStrong} />
        <Text style={styles.questionFigureLabelText}>Question figure</Text>
      </View>
      <View style={styles.questionFigureMedia}>
        <ProtectedContentImage
          uri={figure.imageUrl}
          accessibilityLabel={figure.altText}
          contentHeight={compact ? 180 : 220}
          errorHeight={126}
          onLoadStateChange={setImageState}
          style={styles.questionImage}
        />
        {imageState === 'loaded' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${figure.altText} full screen`}
            accessibilityHint="Opens a viewer where you can zoom and move around the figure."
            onPress={openViewer}
            style={styles.expandFigureButton}
          >
            <Ionicons name="expand-outline" size={19} color={colors.white} />
          </Pressable>
        ) : null}
      </View>

      <Modal
        visible={viewerVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeViewer}
      >
        <GestureHandlerRootView style={styles.viewerBackdrop}>
          <View style={styles.viewerHeader}>
            <View style={styles.viewerTitleGroup}>
              <Text style={styles.viewerKicker}>Question figure</Text>
              <Text style={styles.viewerTitle}>Pinch or use the controls to inspect details.</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close figure viewer" onPress={closeViewer} style={styles.viewerClose}>
              <Ionicons name="close" size={22} color={colors.white} />
            </Pressable>
          </View>

          <View style={styles.viewerCanvas}>
            <GestureDetector gesture={viewerGesture}>
              <Animated.View style={[styles.viewerFigure, animatedFigureStyle]}>
                <ProtectedContentImage
                  uri={figure.imageUrl}
                  accessibilityLabel={figure.altText}
                  contentHeight={viewerImageHeight}
                  errorHeight={126}
                  style={styles.viewerImage}
                />
              </Animated.View>
            </GestureDetector>
          </View>

          <View style={styles.viewerControls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zoom out"
              accessibilityState={{ disabled: zoomLevel <= 1 }}
              disabled={zoomLevel <= 1}
              onPress={() => changeZoom(zoomLevel - 0.5)}
              style={[styles.viewerControl, zoomLevel <= 1 && styles.disabled]}
            >
              <Ionicons name="remove" size={21} color={colors.white} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Reset zoom" onPress={resetZoom} style={styles.viewerReset}>
              <Text style={styles.viewerResetText}>{Math.round(zoomLevel * 100)}%</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zoom in"
              accessibilityState={{ disabled: zoomLevel >= 4 }}
              disabled={zoomLevel >= 4}
              onPress={() => changeZoom(zoomLevel + 0.5)}
              style={[styles.viewerControl, zoomLevel >= 4 && styles.disabled]}
            >
              <Ionicons name="add" size={21} color={colors.white} />
            </Pressable>
          </View>
        </GestureHandlerRootView>
      </Modal>
    </View>
  )
}

function OptionRow({ option }: { option: QuestionReviewOption }) {
  const stateLabel = option.selected && option.expected
    ? 'Your answer · Correct'
    : option.selected
      ? 'Your answer'
      : option.expected
        ? 'Correct answer'
        : ''
  return (
    <View
      accessible
      accessibilityLabel={`Option ${option.key}${option.text ? `, ${readableMathText(option.text)}` : ''}${stateLabel ? `, ${stateLabel}` : ''}`}
      style={[styles.optionRow, option.expected && styles.optionExpected, option.selected && !option.expected && styles.optionSelected]}
    >
      <View style={[styles.optionKey, option.expected && styles.optionKeyExpected, option.selected && !option.expected && styles.optionKeySelected]}>
        <Text style={[styles.optionKeyText, (option.expected || option.selected) && styles.optionKeyTextActive]}>{option.key}</Text>
      </View>
      <View style={styles.optionCopy}>
        {option.text ? <MathText style={styles.optionText} value={option.text} /> : null}
        {option.imageUrl ? <ProtectedContentImage uri={option.imageUrl} accessibilityLabel={`Image for option ${option.key}`} contentHeight={130} /> : null}
        {stateLabel ? (
          <View style={styles.optionState}>
            <Ionicons name={option.expected ? 'checkmark-circle' : 'person-circle-outline'} size={13} color={option.expected ? colors.success : colors.accentStrong} />
            <Text style={[styles.optionStateText, { color: option.expected ? colors.success : colors.accentStrong }]}>{stateLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

function ExplanationSection({ section }: { section: DetailedExplanationSection }) {
  return (
    <View style={styles.explanationSection}>
      <Text style={styles.explanationTitle}>{section.title}</Text>
      <View style={styles.explanationBody}>
        {section.content.map((line, index) => (
          <View key={`${section.key}-${index}`} style={section.list ? styles.explanationLine : undefined}>
            {section.list ? <View style={styles.bullet} /> : null}
            <MathText style={styles.explanationText} value={line} />
          </View>
        ))}
      </View>
    </View>
  )
}

export default function QuestionEvidenceScreen() {
  const { params } = useRoute<Route>()
  const navigation = useNavigation<Nav>()
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const user = useAuthStore((state) => state.user)
  const isStaff = Boolean(user && !isLearnerRole(user.role))
  const compact = width < 380
  const scrollRef = useRef<ScrollView>(null)
  const [activeTab, setActiveTab] = useState<QuestionEvidenceTab>('feedback')
  const [reviewNote, setReviewNote] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const [isOpeningScan, setIsOpeningScan] = useState(false)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['checked-paper', params.checkedPaperId],
    queryFn: () => checkedPapersApi.getById(params.checkedPaperId),
    enabled: Boolean(params.checkedPaperId),
  })
  const evidence = useMemo(
    () => data ? findEvidenceQuestion(data, params.questionId, params.questionIndex) : null,
    [data, params.questionId, params.questionIndex],
  )
  const review = useMemo(() => evidence ? buildQuestionReview(evidence.item) : null, [evidence])

  const reviewMutation = useMutation({
    mutationFn: () => {
      if (isStaff) throw new Error('Issue reports are available to learners only.')
      const questionNumber = evidence?.item.question_number ?? (evidence ? evidence.index + 1 : null)
      const context = questionNumber ? `Question ${questionNumber}: ` : ''
      return checkedPapersApi.requestManualReview(params.checkedPaperId, {
        note: `${context}${reviewNote.trim()}`,
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['checked-paper', params.checkedPaperId] }),
        queryClient.invalidateQueries({ queryKey: ['checked-papers'] }),
      ])
    },
  })

  useEffect(() => {
    setActiveTab('feedback')
    setReviewNote('')
    setScanError(null)
    reviewMutation.reset()
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }))
  }, [params.questionId, params.questionIndex])

  if (!data || !evidence || !review) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing[2] }]}>
        <View style={styles.stateSurface}>
          {isLoading ? (
            <>
              <ActivityIndicator color={colors.accent} size="large" />
              <Text style={styles.stateMessage}>Loading question evidence…</Text>
            </>
          ) : (
            <>
              <Ionicons name="alert-circle-outline" size={30} color={colors.danger} />
              <Text style={styles.stateTitle}>{isError ? 'Question evidence unavailable' : 'Question not found'}</Text>
              <Text style={styles.stateMessage}>Return to the report or retry without changing the checked paper.</Text>
              <View style={styles.stateActions}>
                <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} style={styles.stateSecondary}>
                  <Text style={styles.stateSecondaryText}>Back</Text>
                </Pressable>
                {isError ? (
                  <Pressable accessibilityRole="button" onPress={() => void refetch()} style={styles.statePrimary}>
                    <Text style={styles.statePrimaryText}>Retry</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          )}
        </View>
      </View>
    )
  }

  const item = evidence.item
  const questionNumber = item.question_number ?? evidence.index + 1
  const totalQuestions = data.grading_results?.length ?? 0
  const nextEvidence = findNextEvidenceQuestion(data, params.questionId, params.questionIndex)
  const previousEvidence = findPreviousEvidenceQuestion(data, params.questionId, params.questionIndex)
  const status = questionStatus(item)
  const statusMeta = STATUS_META[status]
  const isStrong = status === 'correct'
  const response = review.unanswered ? '' : review.studentAnswer
  const expected = review.expectedAnswer
  const feedback = item.feedback || ''
  const recommendation = item.recommendation || ''
  const reviewSent = Boolean(data.manual_review_requested || reviewMutation.isSuccess)
  const canSubmitReview = reviewNote.trim().length >= 10 && !reviewMutation.isPending && !reviewSent
  const tabs = isStaff ? TAB_CONFIG.filter((tab) => tab.key !== 'review') : TAB_CONFIG
  const hasScan = Boolean(String(data.scanned_pdf_url || '').trim())

  const goToEvidence = (target: NonNullable<typeof nextEvidence>) => {
    navigation.setParams({
      checkedPaperId: params.checkedPaperId,
      questionId: target.item.question_id || undefined,
      questionIndex: target.index,
    })
  }

  const openPaperWorkspace = () => {
    if (isStaff) navigation.getParent()?.navigate('StaffPapers')
    else if (item.topic_id) navigation.getParent()?.navigate('Learning', {
      screen: 'AgenticTopic',
      params: {
        topicId: item.topic_id,
        topicName: item.topic_name || undefined,
        subjectName: item.subject_name || data.subject_name || undefined,
        origin: 'checked-paper',
        checkedPaperId: data.id,
      },
    })
    else navigation.getParent()?.navigate('Learning', {
      screen: 'AgenticLearning',
      params: { origin: 'checked-paper', checkedPaperId: data.id },
    })
  }

  const openScan = async () => {
    if (!hasScan) return
    setScanError(null)
    setIsOpeningScan(true)
    try {
      await openProtectedDocument(String(data.scanned_pdf_url), `checked-paper-${data.id}`)
    } catch {
      setScanError('The scan evidence could not be opened on this device. Try again when the connection is stable.')
    } finally {
      setIsOpeningScan(false)
    }
  }

  const reportMissingContext = () => {
    setReviewNote((current) => current || 'The question text is missing from this reviewed answer.')
    setActiveTab('review')
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { paddingTop: insets.top + spacing[2] }]}
    >
      <View style={styles.detailSurface}>
        <LinearGradient colors={['#07152d', '#0b1932']} style={styles.navyHeader}>
          <View style={styles.identityRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to performance report" onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={18} color={colors.white} />
            </Pressable>
            <AuthLogoMark size={38} />
            <View style={styles.identityCopy}>
              <Text style={styles.identityTitle}>Question {String(questionNumber).padStart(2, '0')} of {String(totalQuestions).padStart(2, '0')}</Text>
              <Text style={styles.identityMeta}>{questionTypeLabel(item)} · {item.score ?? '-'}/{item.max_score ?? '-'}</Text>
            </View>
            <View key={`status-${evidence.index}`} accessible accessibilityLabel={`Question status: ${statusMeta.label}`} style={styles.statusPill}>
              <View style={[styles.statusDot, { backgroundColor: statusMeta.tone }]} />
              <Text style={[styles.statusPillText, { color: statusMeta.tone }]}>{statusMeta.label}</Text>
            </View>
          </View>
          <View style={styles.hero}>
            <Text style={styles.heroKicker}>{isStrong ? 'Evidence-led reinforcement' : 'Evidence-led feedback'}</Text>
            <Text style={styles.heroTitle}>{isStrong ? <>See exactly what{`\n`}you did well.</> : <>See exactly where{`\n`}the marks slipped.</>}</Text>
            <Text style={styles.heroSubtitle}>{isStrong ? 'Your response and evaluator evidence show what is worth repeating.' : 'Question context, answers, and evaluator evidence stay connected.'}</Text>
          </View>
        </LinearGradient>

        <View style={styles.detailSheet}>
          <View style={styles.grabber} />
          <View accessibilityRole="tablist" style={styles.tabs}>
            {tabs.map((tab) => {
              const selected = activeTab === tab.key
              return (
                <Pressable
                  key={`${evidence.index}-${tab.key}`}
                  accessibilityRole="tab"
                  accessibilityLabel={tab.label}
                  accessibilityState={{ selected }}
                  onPress={() => setActiveTab(tab.key)}
                  style={styles.tab}
                >
                  <Text numberOfLines={2} style={[styles.tabText, selected && styles.tabTextActive]}>{tab.label}</Text>
                  {selected ? <View style={styles.tabIndicator} /> : null}
                </Pressable>
              )
            })}
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.sheetScroll}
            contentContainerStyle={[styles.sheetContent, { paddingBottom: layout.bottomTabHeight + insets.bottom + spacing[10] }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View key={`question-navigation-${evidence.index}`} style={styles.questionNavigation}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={previousEvidence
                  ? `Previous, Question ${previousEvidence.index + 1} of ${totalQuestions}`
                  : 'Previous unavailable, first question'}
                accessibilityState={{ disabled: !previousEvidence }}
                disabled={!previousEvidence}
                onPress={() => previousEvidence && goToEvidence(previousEvidence)}
                style={({ pressed }) => [
                  styles.questionNavigationAction,
                  !previousEvidence && styles.questionNavigationDisabled,
                  pressed && styles.questionNavigationPressed,
                ]}
              >
                <Ionicons name="arrow-back" size={17} color={colors.accentStrong} />
                <Text style={styles.questionNavigationLabel}>Previous</Text>
              </Pressable>
              <Text style={styles.questionNavigationProgress}>
                {evidence.index + 1} of {totalQuestions}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={nextEvidence
                  ? `Next, Question ${nextEvidence.index + 1} of ${totalQuestions}`
                  : 'Next unavailable, last question'}
                accessibilityState={{ disabled: !nextEvidence }}
                disabled={!nextEvidence}
                onPress={() => nextEvidence && goToEvidence(nextEvidence)}
                style={({ pressed }) => [
                  styles.questionNavigationAction,
                  styles.questionNavigationActionEnd,
                  !nextEvidence && styles.questionNavigationDisabled,
                  pressed && styles.questionNavigationPressed,
                ]}
              >
                <Text style={styles.questionNavigationLabel}>Next</Text>
                <Ionicons name="arrow-forward" size={17} color={colors.accentStrong} />
              </Pressable>
            </View>

            {activeTab === 'feedback' ? (
              <View style={[styles.panel, compact && styles.panelCompact]}>
                <View style={styles.questionBlock}>
                  <View style={styles.questionMetaRow}>
                    <Text style={styles.tinyLabel}>{questionTypeLabel(item)}</Text>
                    <Text style={styles.marksLabel}>{item.score ?? '-'}/{item.max_score ?? '-'} marks</Text>
                  </View>
                  {review.contextAvailable ? (
                    <MathText style={[styles.questionText, compact && styles.questionTextCompact]} value={review.questionText} />
                  ) : (
                    <View accessibilityRole="alert" style={styles.missingContext}>
                      <Ionicons name="document-text-outline" size={22} color={colors.danger} />
                      <View style={styles.missingContextCopy}>
                        <Text style={styles.missingContextTitle}>Question text is unavailable for this reviewed answer.</Text>
                        <Text style={styles.missingContextText}>Available answer and grading evidence are still shown below. No question content has been inferred.</Text>
                      </View>
                      {!isStaff ? (
                        <Pressable accessibilityRole="button" onPress={reportMissingContext} style={styles.inlineAction}>
                          <Text style={styles.inlineActionText}>Report incomplete record</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  )}
                  {review.questionFigure ? (
                    <QuestionFigure figure={review.questionFigure} compact={compact} />
                  ) : null}
                  <Text style={styles.chapterText}>{data.subject_name || 'Checked paper'}</Text>
                  {review.optionBased && review.options.length ? (
                    <View
                      accessibilityLabel={`${review.options.length} answer options`}
                      style={styles.questionOptions}
                    >
                      {review.options.map((option) => <OptionRow key={option.key} option={option} />)}
                    </View>
                  ) : null}
                </View>

                {review.unanswered ? (
                  <View accessible accessibilityLabel="You did not answer this question" style={styles.unansweredState}>
                    <Ionicons name="remove-circle-outline" size={18} color={colors.danger} />
                    <Text style={styles.unansweredText}>You did not answer this question.</Text>
                  </View>
                ) : (
                  <View style={[styles.answerCompare, styles.responseBlock]}>
                    <Text style={styles.compareTitle}>Your answer</Text>
                    <MathText style={styles.compareText} value={response} />
                  </View>
                )}

                <View style={[styles.answerCompare, styles.expectedBlock]}>
                  <Text style={styles.compareTitle}>Expected answer</Text>
                  <MathText style={styles.compareText} value={expected || 'The expected answer was not included in this result.'} />
                </View>

                {feedback || recommendation ? (
                  <View style={styles.coachNote}>
                    <View style={styles.coachMark}><Text style={styles.coachMarkText}>AI</Text></View>
                    <View style={styles.coachCopy}>
                      <MathText style={styles.coachTitle} value={recommendation || 'Evaluator feedback'} />
                      {feedback ? <MathText style={styles.coachText} value={feedback} /> : null}
                    </View>
                  </View>
                ) : (
                  <View style={styles.unavailableCard}>
                    <Text style={styles.unavailableTitle}>Evaluator feedback is not available.</Text>
                    <Text style={styles.unavailableText}>Your recorded answer and marks are unchanged.</Text>
                  </View>
                )}

                {hasScan ? (
                  <>
                    {scanError ? <Text accessibilityRole="alert" style={styles.errorText}>{scanError}</Text> : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="View scan evidence"
                      accessibilityState={{ disabled: isOpeningScan }}
                      disabled={isOpeningScan}
                      onPress={() => void openScan()}
                      style={[styles.secondaryAction, isOpeningScan && styles.disabled]}
                    >
                      {isOpeningScan ? <ActivityIndicator color={colors.nav} /> : <Ionicons name="document-attach-outline" size={16} color={colors.nav} />}
                      <Text style={styles.secondaryActionText}>{isOpeningScan ? 'Preparing scan evidence' : 'View scan evidence'}</Text>
                    </Pressable>
                  </>
                ) : null}

                <Pressable accessibilityRole="button" onPress={openPaperWorkspace} style={styles.primaryAction}>
                  <Ionicons name={isStaff ? 'documents-outline' : 'play-outline'} size={16} color={colors.white} />
                  <Text style={styles.primaryActionText}>{isStaff ? 'Open paper workspace' : 'Practice this concept'}</Text>
                </Pressable>
              </View>
            ) : null}

            {activeTab === 'details' ? (
              <View style={styles.panel}>
                <View style={styles.detailsIntro}>
                  <Text style={styles.detailsIntroTitle}>Answer key, step by step</Text>
                  <Text style={styles.detailsIntroText}>Only explanation supplied with this reviewed answer is shown.</Text>
                </View>
                {review.detailedExplanation.length ? review.detailedExplanation.map((section) => (
                  <ExplanationSection key={section.key} section={section} />
                )) : (
                  <View style={styles.unavailableCard}>
                    <Text style={styles.unavailableTitle}>A solution is not available for this question.</Text>
                    <Text style={styles.unavailableText}>No solving steps or learning guidance were included in this record.</Text>
                  </View>
                )}
                {hasScan ? (
                  <>
                    {scanError ? <Text accessibilityRole="alert" style={styles.errorText}>{scanError}</Text> : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isOpeningScan }}
                      disabled={isOpeningScan}
                      onPress={() => void openScan()}
                      style={[styles.secondaryAction, isOpeningScan && styles.disabled]}
                    >
                      {isOpeningScan ? <ActivityIndicator color={colors.nav} /> : <Ionicons name="document-attach-outline" size={16} color={colors.nav} />}
                      <Text style={styles.secondaryActionText}>{isOpeningScan ? 'Preparing scan evidence' : 'View scan evidence'}</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : null}

            {activeTab === 'review' && !isStaff ? (
              <View style={styles.panel}>
                <View style={styles.reviewState}>
                  <Ionicons name={reviewSent ? 'checkmark-circle' : 'shield-checkmark-outline'} size={25} color={reviewSent ? colors.success : colors.accentStrong} />
                  <View style={styles.reviewCopy}>
                    <Text style={styles.reviewTitle}>{reviewSent ? 'Issue reported' : 'Report an issue'}</Text>
                    <Text style={styles.reviewText}>{reviewSent ? 'This checked paper is now in the review queue for admin follow-up.' : 'Question context, answer evidence, and AI feedback stay attached to your report.'}</Text>
                  </View>
                </View>
                {!reviewSent ? (
                  <>
                    <Text style={styles.reviewLabel}>What should the admin review?</Text>
                    <TextInput
                      accessibilityLabel="Issue report reason"
                      accessibilityHint="Enter at least 10 characters"
                      value={reviewNote}
                      onChangeText={setReviewNote}
                      placeholder="Explain the grading or content issue"
                      placeholderTextColor={colors.textSoft}
                      multiline
                      maxLength={2000}
                      style={styles.reviewInput}
                    />
                    <Text style={styles.helperText}>Enter at least 10 characters. Your score remains visible while the report is reviewed.</Text>
                    {reviewNote.length > 0 && reviewNote.trim().length < 10 ? <Text accessibilityRole="alert" style={styles.errorText}>Add a little more detail before sending.</Text> : null}
                    {reviewMutation.isError ? <Text accessibilityRole="alert" style={styles.errorText}>The report could not be sent. Your text is saved here—check the connection and try again.</Text> : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Send issue report"
                      accessibilityState={{ disabled: !canSubmitReview }}
                      disabled={!canSubmitReview}
                      onPress={() => reviewMutation.mutate()}
                      style={[styles.primaryAction, !canSubmitReview && styles.disabled]}
                    >
                      {reviewMutation.isPending ? <ActivityIndicator color={colors.white} /> : <Ionicons name="send-outline" size={16} color={colors.white} />}
                      <Text style={styles.primaryActionText}>{reviewMutation.isPending ? 'Sending report' : 'Send issue report'}</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07152d' },
  detailSurface: { flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: '#07152d' },
  navyHeader: { backgroundColor: '#07152d' },
  identityRow: { minHeight: 58, paddingHorizontal: spacing[3], flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  backButton: { width: 44, height: 44, borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  identityCopy: { flex: 1, minWidth: 0 },
  identityTitle: { color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 13 },
  identityMeta: { color: 'rgba(255,255,255,0.62)', fontFamily: typography.fonts.bodyMedium, fontSize: 9, marginTop: 2 },
  statusPill: { minHeight: 28, maxWidth: 78, borderRadius: radius.full, paddingHorizontal: spacing[2], flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(241,100,35,0.12)' },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusPillText: { fontFamily: typography.fonts.bodyBold, fontSize: 8, textTransform: 'uppercase', flexShrink: 1 },
  hero: { paddingHorizontal: spacing[4], paddingTop: spacing[2], paddingBottom: spacing[3] },
  heroKicker: { color: '#ff8543', fontFamily: typography.fonts.bodyBold, fontSize: 9, letterSpacing: 1.25, textTransform: 'uppercase' },
  heroTitle: { color: colors.white, fontFamily: typography.fonts.heading, fontSize: 22, lineHeight: 22, marginTop: spacing[1] },
  heroSubtitle: { maxWidth: 320, color: 'rgba(255,255,255,0.66)', fontFamily: typography.fonts.bodyMedium, fontSize: 9, lineHeight: 13, marginTop: spacing[1] },
  detailSheet: { flex: 1, minHeight: 0, marginTop: -8, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#fffaf2', overflow: 'hidden' },
  grabber: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: spacing[2], backgroundColor: '#cdbda9' },
  tabs: { minHeight: 56, paddingHorizontal: spacing[3], flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: '#eadfd1' },
  tab: { flex: 1, minHeight: 54, paddingHorizontal: spacing[1], alignItems: 'center', justifyContent: 'center', position: 'relative' },
  tabText: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 9, lineHeight: 12, textAlign: 'center' },
  tabTextActive: { color: colors.text },
  tabIndicator: { position: 'absolute', bottom: -1, left: spacing[1], right: spacing[1], height: 3, borderRadius: 2, backgroundColor: colors.accent },
  sheetScroll: { flex: 1 },
  sheetContent: { paddingHorizontal: spacing[4], paddingTop: spacing[3] },
  questionNavigation: { width: '100%', maxWidth: 760, minHeight: 48, alignSelf: 'center', marginBottom: spacing[3], borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#dfd2c2', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  questionNavigationAction: { minWidth: 96, minHeight: 46, paddingHorizontal: spacing[2], flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  questionNavigationActionEnd: { justifyContent: 'flex-end' },
  questionNavigationPressed: { backgroundColor: colors.accentSurface },
  questionNavigationDisabled: { opacity: 0.34 },
  questionNavigationLabel: { color: colors.nav, fontFamily: typography.fonts.headingSemibold, fontSize: 12, lineHeight: 17 },
  questionNavigationProgress: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 10, lineHeight: 14, textAlign: 'center' },
  panel: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: spacing[3] },
  panelCompact: { gap: spacing[2] },
  questionBlock: { paddingBottom: spacing[4], borderBottomWidth: 1, borderBottomColor: '#eadfd1' },
  questionMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] },
  tinyLabel: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 8, letterSpacing: 1, textTransform: 'uppercase', flexShrink: 1 },
  marksLabel: { color: colors.textMuted, fontFamily: typography.fonts.bodyBold, fontSize: 9, textAlign: 'right' },
  questionText: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 17, lineHeight: 23, marginTop: spacing[2] },
  questionTextCompact: { fontSize: 15, lineHeight: 21 },
  questionFigure: { width: '100%', marginTop: spacing[3], gap: spacing[2] },
  questionFigureLabel: { minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  questionFigureLabelText: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 9, letterSpacing: 0.45, textTransform: 'uppercase' },
  questionFigureMedia: { width: '100%', position: 'relative' },
  questionImage: { borderWidth: 1, borderColor: '#eadfd1', backgroundColor: colors.backgroundElevated },
  expandFigureButton: { position: 'absolute', top: spacing[2], right: spacing[2], width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7,21,45,0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  viewerBackdrop: { flex: 1, paddingTop: spacing[6], paddingBottom: spacing[4], paddingHorizontal: spacing[3], backgroundColor: 'rgba(3,12,28,0.98)' },
  viewerHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  viewerTitleGroup: { flex: 1, minWidth: 0 },
  viewerKicker: { color: '#ff8543', fontFamily: typography.fonts.bodyBold, fontSize: 9, letterSpacing: 1.1, textTransform: 'uppercase' },
  viewerTitle: { color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 13, lineHeight: 18, marginTop: 3 },
  viewerClose: { width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.08)' },
  viewerCanvas: { flex: 1, minHeight: 0, marginVertical: spacing[3], borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fffaf2' },
  viewerFigure: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { borderRadius: 0, backgroundColor: '#fffaf2' },
  viewerControls: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[3] },
  viewerControl: { width: 48, height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', backgroundColor: 'rgba(255,255,255,0.09)' },
  viewerReset: { minWidth: 82, height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  viewerResetText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  chapterText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 9, marginTop: spacing[2] },
  questionOptions: { marginTop: spacing[3], paddingTop: spacing[1], borderTopWidth: 1, borderTopColor: '#eadfd1' },
  missingContext: { marginTop: spacing[2], borderRadius: 16, padding: spacing[3], gap: spacing[2], backgroundColor: colors.dangerSurface, borderWidth: 1, borderColor: colors.border },
  missingContextCopy: { gap: spacing[1] },
  missingContextTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 13, lineHeight: 18 },
  missingContextText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 10, lineHeight: 15 },
  inlineAction: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: spacing[2] },
  inlineActionText: { color: colors.accentStrong, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  optionRow: { width: '100%', minHeight: 54, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing[2], flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], backgroundColor: 'transparent' },
  optionExpected: { borderLeftWidth: 3, borderLeftColor: colors.success, paddingLeft: spacing[2], backgroundColor: colors.successSurface },
  optionSelected: { borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: spacing[2], backgroundColor: colors.accentSurface },
  optionKey: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundElevated },
  optionKeyExpected: { borderColor: colors.success, backgroundColor: colors.success },
  optionKeySelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  optionKeyText: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 10 },
  optionKeyTextActive: { color: colors.white },
  optionCopy: { flex: 1, minWidth: 0, gap: spacing[2] },
  optionText: { color: colors.text, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 17, flexShrink: 1 },
  optionState: { alignSelf: 'flex-start', minHeight: 22, flexDirection: 'row', alignItems: 'center', gap: 4 },
  optionStateText: { fontFamily: typography.fonts.bodyBold, fontSize: 9 },
  unansweredState: { minHeight: 48, borderRadius: 14, paddingHorizontal: spacing[3], flexDirection: 'row', alignItems: 'center', gap: spacing[2], backgroundColor: colors.dangerSurface },
  unansweredText: { flex: 1, color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 11, lineHeight: 16 },
  answerCompare: { width: '100%', borderLeftWidth: 3, paddingLeft: spacing[3], paddingVertical: spacing[2], borderBottomWidth: 1, borderBottomColor: '#eadfd1' },
  responseBlock: { borderLeftColor: colors.accent },
  expectedBlock: { borderLeftColor: colors.success },
  compareTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 12 },
  compareText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 17, marginTop: spacing[1], flexShrink: 1 },
  coachNote: { width: '100%', borderRadius: 16, padding: spacing[3], flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2], backgroundColor: '#07152d' },
  coachMark: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  coachMarkText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 9 },
  coachCopy: { flex: 1, minWidth: 0 },
  coachTitle: { color: colors.white, fontFamily: typography.fonts.headingSemibold, fontSize: 12, lineHeight: 17 },
  coachText: { color: 'rgba(255,255,255,0.72)', fontFamily: typography.fonts.bodyMedium, fontSize: 10, lineHeight: 16, marginTop: spacing[1] },
  unavailableCard: { width: '100%', borderRadius: 16, padding: spacing[3], backgroundColor: colors.backgroundElevated, borderWidth: 1, borderColor: colors.border },
  unavailableTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 12, lineHeight: 17 },
  unavailableText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 10, lineHeight: 15, marginTop: spacing[1] },
  detailsIntro: { paddingBottom: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.border },
  detailsIntroTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 16, lineHeight: 21 },
  detailsIntroText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 10, lineHeight: 15, marginTop: spacing[1] },
  explanationSection: { width: '100%', paddingBottom: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.border },
  explanationTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 13, lineHeight: 18 },
  explanationBody: { marginTop: spacing[2], gap: spacing[2] },
  explanationLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  bullet: { width: 5, height: 5, borderRadius: 3, marginTop: 6, backgroundColor: colors.accent },
  explanationText: { flex: 1, minWidth: 0, color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 11, lineHeight: 18 },
  primaryAction: { width: '100%', minHeight: 48, borderRadius: 14, backgroundColor: '#07152d', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], paddingHorizontal: spacing[3] },
  primaryActionText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  secondaryAction: { width: '100%', minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing[2], backgroundColor: colors.backgroundElevated },
  secondaryActionText: { color: colors.nav, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  reviewState: { width: '100%', borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated, padding: spacing[4], flexDirection: 'row', gap: spacing[3] },
  reviewCopy: { flex: 1, minWidth: 0 },
  reviewTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 15 },
  reviewText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 10, lineHeight: 15, marginTop: 3 },
  reviewLabel: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  reviewInput: { width: '100%', minHeight: 120, maxHeight: 260, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated, color: colors.text, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18, padding: spacing[3], textAlignVertical: 'top' },
  helperText: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 9, lineHeight: 14 },
  errorText: { color: colors.danger, fontFamily: typography.fonts.bodyBold, fontSize: 10, lineHeight: 15 },
  disabled: { opacity: 0.58 },
  stateSurface: { flex: 1, marginHorizontal: spacing[3], borderTopLeftRadius: 28, borderTopRightRadius: 28, alignItems: 'center', justifyContent: 'center', gap: spacing[3], backgroundColor: '#fffaf2', padding: spacing[5] },
  stateTitle: { color: colors.text, fontFamily: typography.fonts.headingSemibold, fontSize: 20, textAlign: 'center' },
  stateMessage: { color: colors.textMuted, fontFamily: typography.fonts.bodyMedium, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  stateActions: { flexDirection: 'row', gap: spacing[2] },
  stateSecondary: { minHeight: 44, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing[4], alignItems: 'center', justifyContent: 'center' },
  stateSecondaryText: { color: colors.text, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
  statePrimary: { minHeight: 44, borderRadius: radius.full, backgroundColor: '#07152d', paddingHorizontal: spacing[4], alignItems: 'center', justifyContent: 'center' },
  statePrimaryText: { color: colors.white, fontFamily: typography.fonts.bodyBold, fontSize: 11 },
})
