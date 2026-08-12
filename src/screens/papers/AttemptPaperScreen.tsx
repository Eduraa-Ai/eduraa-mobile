import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useLayoutEffect,
} from "react";
import {
  View,
  Text,
  BackHandler,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  KeyboardAvoidingView,
  TextInput,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  useIsFocused,
  useRoute,
  useNavigation,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PapersStackParamList } from "../../navigation";
import { navigateToCheckedPapers } from "../../navigation/paperResultsNavigation";
import { API_BASE_URL } from "../../api/client";
import { papersApi } from "../../api/papers";
import { useAuthStore } from "../../stores/authStore";
import { colors } from "../../theme/colors";
import { spacing, radius, shadows } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type {
  AnswerEntry,
  MatchColumnsOptions,
  MCQOption,
  QuestionInPaper,
} from "../../types";
import { ErrorState, LatexText, QuestionVisual } from "../../components/ui";
import { latexToPlainText } from "../../utils/latex";
import { prefetchProtectedImages } from "../../utils/protectedImageCache";
import {
  planQuestionVisualPrefetch,
  shouldShowQuestionStemText,
} from "../../utils/questionVisual";
import {
  buildPaperAnswerEntries,
  clampCheckingProgress,
  selectNewestInProgressAttempt,
} from "./paperAttemptModel";
import { usePaperAttemptSession } from "./usePaperAttemptSession";

const MemoLatexText = React.memo(LatexText)
const MemoQuestionVisual = React.memo(QuestionVisual)

type Nav = NativeStackNavigationProp<PapersStackParamList, "AttemptPaper">;
type Route = RouteProp<PapersStackParamList, "AttemptPaper">;
type SubmitOutcome = {
  kind: 'submitted' | 'existing' | 'saved' | 'error'
  title: string
  message: string
  submissionId?: string
  scoreText?: string
  checkingProgressPercent?: number
  // Set when the server accepted the paper for checking, so the sheet copy can
  // settle once polling reports the marks instead of still inviting a wait.
  submittedWhileChecking?: boolean
}

function isMCQOptions(
  options: QuestionInPaper["options"],
): options is MCQOption[] {
  return Array.isArray(options);
}

const HOLD_DURATION_MS = 3000;
const HOLD_TICK_MS = 50;
// Book papers replace the stem with a photo of the question, so the figures a
// learner is about to reach are warmed ahead of their virtualized cells. The
// window stays small so the visible figure keeps the bandwidth.
const VISUAL_PREFETCH_AHEAD = 3;
const VISUAL_PREFETCH_LIMIT = 4;
const visualPrefetchViewability = { itemVisiblePercentThreshold: 10 };
const checkingStatuses = new Set(['submitted', 'checking', 'processing', 'uploaded'])
const failedCheckingStatuses = new Set(['failed', 'error', 'grading_failed', 'checking_failed'])

function formatQuestionType(value: QuestionInPaper["question_type"]) {
  if (value === "mcq") return "MCQ";
  if (value === "true_false") return "True / False";
  if (value === "fill_blank") return "Fill blank";
  if (value === "short_answer") return "Short answer";
  if (value === "long_answer") return "Long answer";
  return "Match columns";
}

function isMatchColumnsOptions(
  options: QuestionInPaper["options"],
): options is MatchColumnsOptions {
  return Boolean(
    options &&
      !Array.isArray(options) &&
      "left" in options &&
      "right" in options,
  );
}

const StandardQuestionCard = React.memo(function StandardQuestionCard({
  question,
  index,
  answer,
  flagged,
  disabled,
  onSelectAnswer,
  onTextAnswer,
  onToggleFlag,
}: {
  question: QuestionInPaper
  index: number
  answer?: string
  flagged: boolean
  disabled: boolean
  onSelectAnswer: (questionId: string, value: string) => void
  onTextAnswer: (questionId: string, value: string) => void
  onToggleFlag: (questionId: string) => void
}) {
  const [optimisticAnswer, setOptimisticAnswer] = useState(answer)
  const pressInSelectionRef = useRef<string | null>(null)
  const selectable =
    question.question_type === "mcq" ||
    question.question_type === "true_false"
  const visibleAnswer = selectable ? optimisticAnswer : answer

  useEffect(() => {
    setOptimisticAnswer(answer)
  }, [answer])

  const showImmediateSelection = useCallback((value: string) => {
    setOptimisticAnswer((current) => (current === value ? undefined : value))
  }, [])

  const commitImmediateSelection = useCallback((value: string) => {
    pressInSelectionRef.current = value
    showImmediateSelection(value)
    onSelectAnswer(question.id, value)
  }, [onSelectAnswer, question.id, showImmediateSelection])

  const finishSelection = useCallback((value: string) => {
    if (pressInSelectionRef.current === value) {
      pressInSelectionRef.current = null
      return
    }
    showImmediateSelection(value)
    onSelectAnswer(question.id, value)
  }, [onSelectAnswer, question.id, showImmediateSelection])

  return (
    <View
      style={[
        styles.questionCard,
        visibleAnswer && styles.questionCardAnswered,
      ]}
    >
      <View style={styles.questionHeader}>
        <View style={styles.questionTitleRow}>
          <View
            style={[
              styles.questionNumBadge,
              visibleAnswer && styles.questionNumBadgeAnswered,
            ]}
          >
            <Text
              style={[
                styles.questionNum,
                visibleAnswer && styles.questionNumAnswered,
              ]}
            >
              {String(index + 1).padStart(2, "0")}
            </Text>
          </View>
          <View style={styles.questionHeaderCopy}>
            <Text style={styles.questionType}>
              {formatQuestionType(question.question_type)}
            </Text>
            <Text style={styles.questionMarks}>
              {question.marks} {question.marks === 1 ? "mark" : "marks"}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          activeOpacity={0.85}
          disabled={disabled}
          onPress={() => onToggleFlag(question.id)}
          style={[styles.flagButton, flagged && styles.flagButtonActive]}
          accessibilityRole="button"
          accessibilityLabel={`${flagged ? 'Remove' : 'Flag'} question ${index + 1} for review`}
          accessibilityState={{ selected: flagged, disabled }}
        >
          <Ionicons
            name={flagged ? "flag" : "flag-outline"}
            size={15}
            color={flagged ? colors.warning : colors.textMuted}
          />
        </TouchableOpacity>
      </View>
      {question.visual_payload ? (
        <MemoQuestionVisual
          visual={question.visual_payload}
          containerStyle={styles.questionVisual}
        />
      ) : null}
      {shouldShowQuestionStemText(question.visual_payload, "interactive") ? (
        <MemoLatexText
          value={question.question_text}
          style={styles.questionText}
          containerStyle={styles.questionTextContainer}
        />
      ) : null}

      {question.question_type === "mcq" && isMCQOptions(question.options) && (
        <View style={styles.mcqOptions}>
          {question.options.map((option, optionIndex) => {
            const selected = visibleAnswer === option.id
            return (
              <Pressable
                key={option.id}
                disabled={disabled}
                style={[styles.mcqOption, selected && styles.mcqOptionSelected]}
                onPressIn={() => commitImmediateSelection(option.id)}
                onPress={() => finishSelection(option.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled }}
                accessibilityLabel={`Question ${index + 1}, option ${String.fromCharCode(65 + optionIndex)}: ${latexToPlainText(option.text)}`}
                accessibilityHint={selected ? 'Tap again to clear this answer.' : 'Tap to select this answer.'}
              >
                <Text
                  style={[
                    styles.mcqLabel,
                    selected && styles.mcqLabelSelected,
                  ]}
                >
                  {String.fromCharCode(65 + optionIndex)}
                </Text>
                <View pointerEvents="none" style={styles.mcqTextContainer}>
                  <MemoLatexText
                    value={option.text}
                    style={styles.mcqText}
                  />
                </View>
                {selected ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={colors.accent}
                  />
                ) : null}
              </Pressable>
            )
          })}
        </View>
      )}

      {question.question_type === "true_false" && (
        <View style={styles.tfRow}>
          {["True", "False"].map((value) => {
            const selected = visibleAnswer === value
            return (
              <Pressable
                key={value}
                disabled={disabled}
                style={[styles.tfBtn, selected && styles.tfBtnSelected]}
                onPressIn={() => commitImmediateSelection(value)}
                onPress={() => finishSelection(value)}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled }}
                accessibilityLabel={`Question ${index + 1}, ${value}`}
                accessibilityHint={selected ? 'Tap again to clear this answer.' : 'Tap to select this answer.'}
              >
                <Text
                  style={[
                    styles.tfText,
                    selected && styles.tfTextSelected,
                  ]}
                >
                  {value}
                </Text>
              </Pressable>
            )
          })}
        </View>
      )}

      {["short_answer", "long_answer", "fill_blank"].includes(
        question.question_type,
      ) && (
        <TextInput
          style={[
            styles.textInput,
            question.question_type === "long_answer" && styles.textInputLong,
          ]}
          placeholder={
            question.question_type === "long_answer"
              ? "Write your structured answer here..."
              : "Type your answer here..."
          }
          placeholderTextColor={colors.subtle}
          multiline
          editable={!disabled}
          value={answer || ''}
          onChangeText={(text) => onTextAnswer(question.id, text)}
          accessibilityLabel={`Answer for question ${index + 1}`}
        />
      )}

      {question.question_type === "match_columns" &&
      isMatchColumnsOptions(question.options) ? (
        <View style={styles.matchBox}>
          <View style={styles.matchColumn}>
            <Text style={styles.matchLabel}>Column A</Text>
            {question.options.left.map((item, itemIndex) => (
              <MemoLatexText
                key={`${item}-${itemIndex}`}
                value={`${itemIndex + 1}. ${item}`}
                style={styles.matchItem}
              />
            ))}
          </View>
          <View style={styles.matchColumn}>
            <Text style={styles.matchLabel}>Column B</Text>
            {question.options.right.map((item, itemIndex) => (
              <MemoLatexText
                key={`${item}-${itemIndex}`}
                value={`${String.fromCharCode(65 + itemIndex)}. ${item}`}
                style={styles.matchItem}
              />
            ))}
          </View>
          <TextInput
            style={styles.textInput}
            placeholder="Enter matches, e.g. 1-A, 2-C"
            placeholderTextColor={colors.subtle}
            editable={!disabled}
            value={answer || ''}
            onChangeText={(text) => onTextAnswer(question.id, text)}
            accessibilityLabel={`Matches for question ${index + 1}`}
          />
        </View>
      ) : null}
    </View>
  )
})

export default function AttemptPaperScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const userId = useAuthStore((state) => state.user?.id);

  const [submitReviewOpen, setSubmitReviewOpen] = useState(false);
  const [submitHoldProgress, setSubmitHoldProgress] = useState(0);
  const [submitOutcome, setSubmitOutcome] = useState<SubmitOutcome | null>(
    null,
  );
  const [attemptAgainError, setAttemptAgainError] = useState<string | null>(
    null,
  );
  const [isOpeningSubmittedResult, setIsOpeningSubmittedResult] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submitHoldTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const didAutoSubmitRef = useRef(false);
  const submittedResultOpeningRef = useRef(false)
  const attemptScrollRef = useRef<FlatList<QuestionInPaper>>(null);
  const didHandleInitialFocusRef = useRef(false);

  useLayoutEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ tabBarStyle: { display: "none" } });
    return () => {
      parent?.setOptions({ tabBarStyle: undefined });
    };
  }, [navigation]);

  const clearSubmitHoldTimer = useCallback(() => {
    if (submitHoldTimerRef.current) {
      clearInterval(submitHoldTimerRef.current);
      submitHoldTimerRef.current = null;
    }
  }, []);

  const resetSubmitHold = useCallback(() => {
    clearSubmitHoldTimer();
    setSubmitHoldProgress(0);
  }, [clearSubmitHoldTimer]);

  useEffect(() => {
    if (!submitReviewOpen) resetSubmitHold();
  }, [resetSubmitHold, submitReviewOpen]);

  useEffect(() => resetSubmitHold, [resetSubmitHold]);

  const paperQuery = useQuery({
    queryKey: ['paper', params.paperId, params.launchKey],
    queryFn: () => papersApi.getById(params.paperId),
  })
  const paper = paperQuery.data

  const attemptQueryKey = ['paper-attempt', userId, params.paperId, params.examId, 'standard'] as const
  const attemptQuery = useQuery({
    queryKey: attemptQueryKey,
    enabled: Boolean(userId),
    staleTime: Infinity,
    queryFn: async () => {
      const attempts = await papersApi.listAttempts(params.paperId, { exam_id: params.examId })
      const inProgress = selectNewestInProgressAttempt(attempts.items)
      return inProgress ?? papersApi.createAttempt(params.paperId, { exam_id: params.examId, reason: 'student_attempt' })
    },
  })
  const activeAttempt = attemptQuery.data
  const visualPrefetchRef = useRef<{
    questions: QuestionInPaper[]
    lastIndex: number
  }>({ questions: [], lastIndex: -1 })

  // The first figures start downloading as soon as the paper resolves, instead of
  // waiting for their cells to mount.
  useEffect(() => {
    const questions = paper?.questions ?? []
    visualPrefetchRef.current = { questions, lastIndex: questions.length ? 0 : -1 }
    if (!questions.length) return
    prefetchProtectedImages(
      planQuestionVisualPrefetch(questions, {
        apiBaseUrl: API_BASE_URL,
        ahead: VISUAL_PREFETCH_AHEAD,
        limit: VISUAL_PREFETCH_LIMIT,
      }),
    )
  }, [paper?.questions])

  const prefetchVisualsAhead = useCallback(
    (info: { viewableItems: Array<{ index: number | null }> }) => {
      const state = visualPrefetchRef.current
      let firstVisible = -1
      for (const item of info.viewableItems) {
        if (item.index == null) continue
        if (firstVisible < 0 || item.index < firstVisible) firstVisible = item.index
      }
      if (firstVisible < 0 || firstVisible === state.lastIndex) return
      state.lastIndex = firstVisible
      prefetchProtectedImages(
        planQuestionVisualPrefetch(state.questions, {
          apiBaseUrl: API_BASE_URL,
          startIndex: firstVisible,
          ahead: VISUAL_PREFETCH_AHEAD,
          limit: VISUAL_PREFETCH_LIMIT,
        }),
      )
    },
    [],
  )

  const checkingSubmissionQuery = useQuery({
    queryKey: ['paper-submission-checking', params.paperId, submitOutcome?.submissionId],
    queryFn: () => papersApi.getSubmission(params.paperId, {
      exam_id: params.examId,
      attempt_id: submitOutcome?.submissionId,
    }),
    enabled: Boolean(
      submitOutcome?.submissionId
      && submitOutcome.kind !== 'error'
      && !submitOutcome.scoreText,
    ),
    refetchInterval: (query) => {
      const status = String(query.state.data?.grading_status || '').toLowerCase()
      return checkingStatuses.has(status) ? 2000 : false
    },
    // Polling pauses while the app is backgrounded, and the shared five-minute
    // staleTime would otherwise skip the focus refetch on the way back in.
    refetchOnWindowFocus: 'always',
  })

  useEffect(() => {
    if (!isFocused) return
    if (!didHandleInitialFocusRef.current) {
      didHandleInitialFocusRef.current = true
      return
    }
    void paperQuery.refetch()
    void attemptQuery.refetch()
  }, [isFocused, params.launchKey])

  const serverAnswers = useMemo(
    () => (activeAttempt?.answers ?? []).reduce<Record<string, string>>((result, answer) => {
      result[answer.question_id] = answer.response
      return result
    }, {}),
    [activeAttempt],
  )
  const attemptIdentity = useMemo(
    () => userId && activeAttempt?.id
      ? {
          userId,
          paperId: params.paperId,
          examId: params.examId,
          attemptId: activeAttempt.id,
          mode: 'standard' as const,
        }
      : null,
    [activeAttempt?.id, params.examId, params.paperId, userId],
  )
  const attemptSession = usePaperAttemptSession({
    identity: attemptIdentity,
    serverAnswers,
  })
  const {
    answers,
    flagged,
    selectAnswer,
    setTextAnswer,
    toggleFlag,
    getAnswerSnapshot,
    flushDraft,
    clearDraft,
  } = attemptSession
  const attemptStartedAt = useMemo(() => {
    const parsed = Date.parse(activeAttempt?.started_at || activeAttempt?.created_at || '')
    return Number.isFinite(parsed) ? parsed : null
  }, [activeAttempt?.created_at, activeAttempt?.started_at])
  const attemptDeadline = useMemo(
    () => paper?.duration_minutes && attemptStartedAt ? attemptStartedAt + paper.duration_minutes * 60_000 : null,
    [attemptStartedAt, paper?.duration_minutes],
  )

  useEffect(() => {
    didAutoSubmitRef.current = false
  }, [activeAttempt?.id])

  const attemptAgainMutation = useMutation({
    mutationFn: async () => {
      const nextAttempt = await papersApi.createAttempt(params.paperId, {
        exam_id: params.examId,
        reason: 'student_retest',
      })
      await clearDraft()
      return nextAttempt
    },
    onMutate: () => setAttemptAgainError(null),
    onSuccess: (nextAttempt) => {
      // Reset every visible attempt surface with the query swap so the sticky
      // progress dock cannot retain the submitted attempt for a render.
      setTimeLeft(null)
      didAutoSubmitRef.current = false
      queryClient.setQueryData(
        attemptQueryKey,
        nextAttempt,
      )
      setSubmitOutcome(null)
      setSubmitReviewOpen(false)
      requestAnimationFrame(() => {
        attemptScrollRef.current?.scrollToOffset({ offset: 0, animated: false })
      })
    },
    onError: () => {
      setAttemptAgainError('A fresh attempt could not be started. Check your connection and try again.')
    },
  })

  const submitMutation = useMutation({
    mutationFn: (answerList: AnswerEntry[]) =>
      papersApi.submit(params.paperId, {
        answers: answerList,
        attempt_id: activeAttempt?.id,
        exam_id: params.examId,
        time_taken_seconds: attemptStartedAt ? Math.max(0, Math.floor((Date.now() - attemptStartedAt) / 1000)) : undefined,
        mode: 'standard',
    }),
    onSuccess: (data) => {
      void clearDraft()
      const isExistingSubmission = Boolean(activeAttempt?.id && data.id !== activeAttempt.id)
      const gradingStatus = String((data as { grading_status?: string }).grading_status || '').toLowerCase()
      const isChecking = checkingStatuses.has(gradingStatus)
      const resultIsReady = !isChecking
        && !failedCheckingStatuses.has(gradingStatus)
        && data.results_visible_to_student !== false
      const scoreText = resultIsReady && data.total_score != null && data.max_score
        ? `${data.total_score} / ${data.max_score}`
        : undefined
      setAttemptAgainError(null)
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['papers'] }),
        queryClient.invalidateQueries({ queryKey: ['paper-attempts-detail', params.paperId] }),
        queryClient.invalidateQueries({ queryKey: ['paper-submission', params.paperId] }),
        queryClient.invalidateQueries({ queryKey: ['checked-papers'] }),
        queryClient.invalidateQueries({ queryKey: ['exams', 'practice'] }),
        queryClient.invalidateQueries({ queryKey: ['exams', 'teacher'] }),
      ])

      if (isExistingSubmission) {
        setSubmitOutcome({
          kind: 'existing',
          title: 'Already submitted',
          message: isChecking
            ? 'This attempt was already submitted and is being checked. You can leave now — checking keeps running until the marks are ready.'
            : 'This attempt was already submitted from another session. Its recorded result is ready to view.',
          submissionId: data.id,
          scoreText,
          checkingProgressPercent: clampCheckingProgress(data.checking_progress_percent) ?? undefined,
          submittedWhileChecking: isChecking,
        })
        return
      }

      setSubmitOutcome({
        kind: "submitted",
        title: "Paper submitted",
        message: isChecking
          ? "Your paper is being checked. You can leave now — checking keeps running, and your marks appear in results when they are ready."
          : "Your answers have been recorded and graded.",
        submissionId: data.id,
        scoreText,
        checkingProgressPercent: clampCheckingProgress(data.checking_progress_percent) ?? undefined,
        submittedWhileChecking: isChecking,
      })
    },
    onError: async (err: any) => {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      const errData = err?.response?.data;

      // On 500, check if submission was actually saved (backend may fail during grading but save answers)
      if (status === 500) {
        try {
          const existing = await papersApi.getSubmission(params.paperId, {
            exam_id: params.examId,
            attempt_id: activeAttempt?.id,
          })
          if (existing?.id && existing.id === activeAttempt?.id) {
            void clearDraft()
            const existingStatus = String(existing.grading_status || '').toLowerCase()
            const existingResultReady = !checkingStatuses.has(existingStatus)
              && !failedCheckingStatuses.has(existingStatus)
              && existing.results_visible_to_student !== false
            setSubmitOutcome({
              kind: "saved",
              title: "Paper submitted",
              message:
                "Your answers were saved and checking is continuing. Select View results to follow the status and see your marks when ready.",
              submissionId: existing.id,
              scoreText: existingResultReady && existing.total_score != null && existing.max_score
                ? `${existing.total_score} / ${existing.max_score}`
                : undefined,
              checkingProgressPercent: clampCheckingProgress(existing.checking_progress_percent) ?? undefined,
              submittedWhileChecking: checkingStatuses.has(existingStatus),
            })
            return
          }
        } catch (_) {
          // submission not found, show generic error
        }
      }

      // Build a useful message
      let msg: string;
      if (typeof detail === "string") {
        msg = detail;
      } else if (Array.isArray(detail)) {
        msg = detail.map((d: any) => d.msg || JSON.stringify(d)).join("\n");
      } else if (typeof errData === "string") {
        msg = errData;
      } else if (status === 500) {
        msg = "The server encountered an error. Please try again.";
      } else if (status === 422) {
        msg = "Invalid submission data. Please try again.";
      } else {
        msg = "Submission failed. Please try again.";
      }

      setSubmitOutcome({
        kind: "error",
        title: "Submission failed",
        message: msg,
      });
    },
  });

  const doSubmit = useCallback(() => {
    if (!paper || !activeAttempt?.id || submitMutation.isPending) return
    // An accepted submission is final for this attempt: repeated taps, a late
    // hold tick, and the expiry auto-submit must not send it twice.
    if (submitOutcome && submitOutcome.kind !== 'error') return
    clearSubmitHoldTimer()
    setSubmitHoldProgress(0)
    setSubmitReviewOpen(false)
    try {
      const answerList = buildPaperAnswerEntries(
        paper.questions.map((question) => question.id),
        getAnswerSnapshot(),
      )
      submitMutation.mutate(answerList)
    } catch (error) {
      setSubmitOutcome({
        kind: 'error',
        title: 'Paper cannot be submitted',
        message: error instanceof Error ? error.message : 'This paper contains invalid questions.',
      })
    }
  }, [activeAttempt?.id, clearSubmitHoldTimer, getAnswerSnapshot, paper, submitMutation, submitOutcome])

  useEffect(() => {
    if (!attemptDeadline) {
      setTimeLeft(null)
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    if (submitMutation.isPending || submitOutcome) return
    const updateTimeLeft = () => setTimeLeft(Math.max(0, Math.ceil((attemptDeadline - Date.now()) / 1000)))
    updateTimeLeft()
    timerRef.current = setInterval(updateTimeLeft, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [attemptDeadline, submitMutation.isPending, submitOutcome])

  useEffect(() => {
    if (timeLeft === null || timeLeft > 0 || submitMutation.isPending || submitOutcome) return
    if (!didAutoSubmitRef.current) {
      didAutoSubmitRef.current = true
      doSubmit()
    }
  }, [doSubmit, submitMutation.isPending, submitOutcome, timeLeft])

  const handleSubmit = useCallback(() => setSubmitReviewOpen(true), [])

  const returnsToPreviousPapers = params.returnTo === 'PreviousPapers'

  const leaveAttempt = useCallback(() => {
    if (returnsToPreviousPapers) {
      navigation.reset({
        index: 0,
        routes: [{ name: 'PapersList' }],
      })
      navigation.getParent()?.navigate('PreviousPapers' as never)
      return
    }
    navigation.goBack()
  }, [navigation, returnsToPreviousPapers])

  const handleExit = useCallback(() => {
    void flushDraft().finally(leaveAttempt)
  }, [flushDraft, leaveAttempt])

  const leaveLabel = returnsToPreviousPapers
    ? 'Back to previous papers'
    : 'Back to papers'
  const isSubmissionAccepted = Boolean(submitOutcome && submitOutcome.kind !== 'error')

  // Checking runs on the server, so an accepted submission never has to be
  // watched from here. Android's back gesture leaves through the sheet's door
  // instead of popping to a papers list the learner never came from.
  useEffect(() => {
    if (Platform.OS !== 'android' || !isFocused || !isSubmissionAccepted) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      leaveAttempt()
      return true
    })
    return () => subscription.remove()
  }, [isFocused, isSubmissionAccepted, leaveAttempt])

  const startSubmitHold = () => {
    if (
      !submitReviewOpen ||
      submitMutation.isPending ||
      submitHoldTimerRef.current
    )
      return;

    const startedAt = Date.now();
    submitHoldTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const nextProgress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100);
      setSubmitHoldProgress(nextProgress);

      if (nextProgress >= 100) {
        doSubmit();
      }
    }, HOLD_TICK_MS);
  };

  const stopSubmitHold = () => {
    if (!submitHoldTimerRef.current) return;
    resetSubmitHold();
  };

  useEffect(() => {
    if (!isFocused) return
    submittedResultOpeningRef.current = false
    setIsOpeningSubmittedResult(false)
  }, [isFocused, submitOutcome?.submissionId])

  const openSubmittedResult = () => {
    if (!submitOutcome?.submissionId || submittedResultOpeningRef.current) return
    const didNavigate = navigateToCheckedPapers(navigation, submitOutcome.submissionId)
    if (!didNavigate) {
      setAttemptAgainError('Checked papers could not open. Please return to Papers and try again.')
      return
    }
    submittedResultOpeningRef.current = true
    setIsOpeningSubmittedResult(true)
    if (returnsToPreviousPapers) {
      // Results own the checking status from here. Clearing the papers stack
      // keeps a submitted previous-year attempt from waiting behind the Papers
      // tab for a learner whose way back is the library.
      navigation.reset({ index: 0, routes: [{ name: 'PapersList' }] })
    }
  }

  const openCheckedPapers = () => {
    if (!navigateToCheckedPapers(navigation)) {
      setAttemptAgainError('Checked papers could not open. Please return to Papers and try again.')
    }
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const renderQuestion = useCallback(({
    item,
    index,
  }: {
    item: QuestionInPaper
    index: number
  }) => (
    <StandardQuestionCard
      question={item}
      index={index}
      answer={answers[item.id]}
      flagged={Boolean(flagged[item.id])}
      disabled={submitMutation.isPending}
      onSelectAnswer={selectAnswer}
      onTextAnswer={setTextAnswer}
      onToggleFlag={toggleFlag}
    />
  ), [
    answers,
    flagged,
    selectAnswer,
    setTextAnswer,
    submitMutation.isPending,
    toggleFlag,
  ])

  if (
    paperQuery.isLoading
    || attemptQuery.isLoading
    || Boolean(activeAttempt && !attemptSession.isReady)
  ) {
    return (
      <View style={styles.center}>
        <View style={styles.loadingMark}>
          <Ionicons
            name="document-text-outline"
            size={22}
            color={colors.accent}
          />
        </View>
        <Text style={styles.loadingText}>Preparing your attempt</Text>
      </View>
    )
  }

  if (paperQuery.isError || attemptQuery.isError || !paper || !activeAttempt) {
    return (
      <View style={styles.center}>
        <ErrorState
          title="Could not open this attempt"
          message="Your saved answers are safe. Check your connection, then try again."
          onAction={() => {
            void paperQuery.refetch()
            void attemptQuery.refetch()
          }}
          style={styles.loadError}
        />
      </View>
    );
  }

  const answeredCount = paper.questions.filter((q) => (answers[q.id] || '').trim()).length
  const totalQuestions = paper.questions.length
  const progress = totalQuestions ? Math.round((answeredCount / totalQuestions) * 100) : 0
  const totalMarks = paper.questions.reduce((sum, question) => sum + (question.marks || 0), 0) || paper.total_marks
  const flaggedCount = Object.values(flagged).filter(Boolean).length
  const holdSecondsLeft = Math.max(0, Math.ceil(((100 - submitHoldProgress) / 100) * (HOLD_DURATION_MS / 1000)))
  const checkingSubmission = checkingSubmissionQuery.data
  const checkingProgress = clampCheckingProgress(
    checkingSubmission?.checking_progress_percent ?? submitOutcome?.checkingProgressPercent,
  )
  const checkingStatus = String(checkingSubmission?.grading_status || '').toLowerCase()
  const checkingResultReady = checkingSubmission
    && !checkingStatuses.has(checkingStatus)
    && !failedCheckingStatuses.has(checkingStatus)
    && checkingSubmission.results_visible_to_student !== false
  const checkedScoreText = checkingResultReady
    && checkingSubmission.total_score != null
    && checkingSubmission.max_score
    ? `${checkingSubmission.total_score} / ${checkingSubmission.max_score}`
    : submitOutcome?.scoreText
  const checkingFailed = failedCheckingStatuses.has(checkingStatus)

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient
        colors={[colors.slate[950], colors.slate[900], "#1d130f"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + spacing[3] }]}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleExit}
            style={styles.exitButton}
            accessibilityRole="button"
            accessibilityLabel="Save progress and leave attempt"
            accessibilityHint="Your unfinished answers will be restored when you return."
          >
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.78)" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {paper.title}
            </Text>
            <Text style={styles.headerMeta} numberOfLines={1}>
              {[
                paper.subject_id ? "Assessment" : "Practice",
                `${totalMarks} marks`,
                `${totalQuestions} questions`,
              ].join(" / ")}
            </Text>
          </View>
          {timeLeft !== null ? (
            <View style={[styles.timer, timeLeft < 300 && styles.timerWarning]}>
              <Ionicons name="time-outline" size={14} color={timeLeft < 300 ? colors.white : colors.accent} />
              <Text accessibilityLiveRegion="polite" style={styles.timerText}>{formatTime(timeLeft)}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.progressPanel}>
          <View style={styles.progressCopy}>
            <Text style={styles.progressEyebrow}>Exam progress</Text>
            <Text style={styles.progressTitle}>
              {answeredCount}/{totalQuestions} answered
            </Text>
          </View>
          <View style={styles.progressBadge}>
            <Text style={styles.progressBadgeText}>{progress}%</Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.max(4, progress)}%` },
            ]}
          />
        </View>
      </LinearGradient>

      <FlatList
        ref={attemptScrollRef}
        data={paper.questions}
        keyExtractor={(question) => question.id}
        renderItem={renderQuestion}
        ListHeaderComponent={(
          <View style={styles.examSummary}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{totalMarks}</Text>
              <Text style={styles.summaryLabel}>Marks</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{flaggedCount}</Text>
              <Text style={styles.summaryLabel}>Flagged</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>
                {Math.max(0, totalQuestions - answeredCount)}
              </Text>
              <Text style={styles.summaryLabel}>Left</Text>
            </View>
          </View>
        )}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 112 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        updateCellsBatchingPeriod={40}
        windowSize={3}
        removeClippedSubviews={Platform.OS === 'android'}
        onViewableItemsChanged={prefetchVisualsAhead}
        viewabilityConfig={visualPrefetchViewability}
      />

      <View
        style={[
          styles.submitDock,
          { paddingBottom: insets.bottom + spacing[3] },
        ]}
      >
        <View style={styles.dockCopy}>
          <Text style={styles.dockTitle}>
            {answeredCount}/{totalQuestions} complete
          </Text>
          <Text style={styles.dockMeta}>
            {flaggedCount
              ? `${flaggedCount} flagged for review`
              : "Review once before submitting"}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.submitBtn, submitMutation.isPending && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel="Review and submit paper"
        >
          <Text style={styles.submitBtnText}>
            {submitMutation.isPending ? "Submitting" : "Submit"}
          </Text>
          <Ionicons name="send" size={15} color={colors.white} />
        </TouchableOpacity>
      </View>

      {submitReviewOpen ? (
        <View style={styles.submitBackdrop}>
          <View
            style={[
              styles.submitSheet,
              { marginBottom: insets.bottom + spacing[4] },
            ]}
          >
            <View style={styles.submitSheetIcon}>
              <Ionicons
                name="checkmark-done-outline"
                size={24}
                color={colors.accent}
              />
            </View>
            <Text style={styles.submitSheetTitle}>Ready to submit?</Text>
            <Text style={styles.submitSheetBody}>
              {answeredCount}/{totalQuestions} answered.{" "}
              {Math.max(0, totalQuestions - answeredCount)
                ? `${Math.max(0, totalQuestions - answeredCount)} unanswered question${Math.max(0, totalQuestions - answeredCount) === 1 ? "" : "s"} will be submitted blank.`
                : "All questions are answered."}
            </Text>
            <View style={styles.submitStatsRow}>
              <View style={styles.submitStat}>
                <Text style={styles.submitStatValue}>{answeredCount}</Text>
                <Text style={styles.submitStatLabel}>Answered</Text>
              </View>
              <View style={styles.submitStat}>
                <Text style={styles.submitStatValue}>
                  {Math.max(0, totalQuestions - answeredCount)}
                </Text>
                <Text style={styles.submitStatLabel}>Left</Text>
              </View>
              <View style={styles.submitStat}>
                <Text style={styles.submitStatValue}>{flaggedCount}</Text>
                <Text style={styles.submitStatLabel}>Flagged</Text>
              </View>
            </View>
            <View style={styles.submitActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSubmitReviewOpen(false)}
                style={styles.submitCancelButton}
                accessibilityRole="button"
                accessibilityLabel="Continue attempting paper"
              >
                <Text style={styles.submitCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.9}
                onPressIn={startSubmitHold}
                onPressOut={stopSubmitHold}
                onLongPress={startSubmitHold}
                delayLongPress={80}
                disabled={submitMutation.isPending}
                style={[styles.submitConfirmButton, submitMutation.isPending && styles.submitBtnDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Submit paper"
                accessibilityHint="Hold for three seconds to submit. Screen-reader users can activate this button normally."
                accessibilityActions={[{ name: 'activate', label: 'Submit paper' }]}
                onAccessibilityAction={({ nativeEvent }) => {
                  if (nativeEvent.actionName === 'activate') doSubmit()
                }}
              >
                <View
                  pointerEvents="none"
                  style={[
                    styles.submitHoldFill,
                    { width: `${submitHoldProgress}%` },
                  ]}
                />
                <Text style={styles.submitConfirmText}>
                  {submitMutation.isPending
                    ? "Submitting"
                    : submitHoldProgress > 0
                      ? `Hold... ${holdSecondsLeft}s`
                      : "Hold to submit"}
                </Text>
                <Ionicons name="send" size={15} color={colors.white} />
              </TouchableOpacity>
            </View>
            <Text style={styles.submitHoldHint}>
              Hold the submit button for 3 seconds to confirm.
            </Text>
          </View>
        </View>
      ) : null}

      {submitOutcome ? (
        <View style={styles.submitBackdrop}>
          <View
            style={[
              styles.submitSheet,
              { marginBottom: insets.bottom + spacing[4] },
            ]}
          >
            <View
              style={[
                styles.submitSheetIcon,
                submitOutcome.kind === "error"
                  ? styles.submitSheetIconError
                  : styles.submitSheetIconSuccess,
              ]}
            >
              <Ionicons
                name={
                  submitOutcome.kind === "error"
                    ? "alert-circle-outline"
                    : submitOutcome.kind === "existing"
                      ? "checkmark-done-outline"
                      : "checkmark-circle-outline"
                }
                size={25}
                color={
                  submitOutcome.kind === "error"
                    ? colors.danger
                    : colors.success
                }
              />
            </View>
            <Text style={styles.submitSheetTitle}>{submitOutcome.title}</Text>
            <Text style={styles.submitSheetBody}>
              {submitOutcome.submittedWhileChecking && checkingResultReady
                ? 'Checking finished while you waited. Your marks are ready below.'
                : submitOutcome.message}
            </Text>
            {checkedScoreText ? (
              <View style={styles.submittedScoreBox}>
                <Text style={styles.submittedScoreLabel}>Score</Text>
                <Text style={styles.submittedScoreValue}>{checkedScoreText}</Text>
              </View>
            ) : submitOutcome.kind !== "error" ? (
              <View style={styles.submittedStatusBox}>
                <Ionicons name={checkingFailed ? 'alert-circle-outline' : 'sync-outline'} size={16} color={checkingFailed ? colors.danger : colors.success} />
                <View style={styles.submittedStatusCopy} accessibilityLiveRegion="polite">
                  <View style={styles.checkingStatusRow}>
                    <Text style={[styles.submittedStatusText, checkingFailed && styles.submittedStatusTextFailed]}>
                      {checkingFailed ? 'Checking delayed' : 'Checking in progress'}
                    </Text>
                    {checkingProgress !== null ? (
                      <Text style={[styles.checkingPercent, checkingFailed && styles.submittedStatusTextFailed]}>
                        {checkingProgress}%
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.checkingTrack}>
                    {checkingProgress !== null ? (
                      <View style={[
                        styles.checkingFill,
                        checkingFailed && styles.checkingFillFailed,
                        { width: `${checkingProgress}%` },
                      ]} />
                    ) : (
                      <View style={styles.checkingIndeterminate} />
                    )}
                  </View>
                  <Text style={styles.submittedStatusHint}>
                    {checkingFailed
                      ? 'Your attempt is saved. Open View results for a recoverable status and retry option.'
                      : 'Checking continues in the background. View results will update automatically when marks are ready.'}
                  </Text>
                </View>
              </View>
            ) : null}
            {attemptAgainError ? (
              <View accessibilityLiveRegion="polite" style={styles.attemptAgainError}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
                <Text style={styles.attemptAgainErrorText}>{attemptAgainError}</Text>
              </View>
            ) : null}
            <View style={styles.submitActions}>
              {submitOutcome.kind === "error" ? (
                <>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => setSubmitOutcome(null)} style={styles.submitCancelButton} accessibilityRole="button" accessibilityLabel="Close submission error">
                    <Text style={styles.submitCancelText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => {
                      setSubmitOutcome(null);
                      setSubmitReviewOpen(true);
                    }}
                    style={styles.submitConfirmButton}
                    accessibilityRole="button"
                    accessibilityLabel="Try submitting again"
                  >
                    <Text style={styles.submitConfirmText}>Try again</Text>
                    <Ionicons name="refresh" size={15} color={colors.white} />
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {checkedScoreText ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => attemptAgainMutation.mutate()}
                      disabled={attemptAgainMutation.isPending}
                      style={[styles.submitCancelButton, attemptAgainMutation.isPending && styles.submitBtnDisabled]}
                      accessibilityRole="button"
                      accessibilityLabel="Retest this paper"
                    >
                      <Text style={styles.submitCancelText}>
                        {attemptAgainMutation.isPending ? 'Starting' : 'Retest'}
                      </Text>
                      <Ionicons name="refresh" size={15} color={colors.nav} />
                    </TouchableOpacity>
                  ) : null}
                  {submitOutcome.submissionId ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={openSubmittedResult}
                      disabled={isOpeningSubmittedResult}
                      style={[styles.submitConfirmButton, isOpeningSubmittedResult && styles.submitBtnDisabled]}
                      accessibilityRole="button"
                      accessibilityLabel="View results"
                      accessibilityState={{ busy: isOpeningSubmittedResult, disabled: isOpeningSubmittedResult }}
                    >
                      <Text style={styles.submitConfirmText}>{isOpeningSubmittedResult ? 'Opening' : 'View results'}</Text>
                      <Ionicons name="bar-chart" size={15} color={colors.white} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('PapersList')} style={styles.submitConfirmButton} accessibilityRole="button" accessibilityLabel="Return to papers">
                      <Text style={styles.submitConfirmText}>Return to papers</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
            {isSubmissionAccepted ? (
              <>
                <Pressable
                  onPress={leaveAttempt}
                  style={({ pressed }) => [
                    styles.checkedPapersLink,
                    pressed && styles.checkedPapersLinkPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={leaveLabel}
                  accessibilityHint={checkedScoreText
                    ? 'Leaves this attempt. Your marks stay saved.'
                    : 'Leaves this attempt. Checking continues in the background.'}
                >
                  <View style={styles.checkedPapersLinkLabel}>
                    <Ionicons name="arrow-back" size={18} color={colors.nav} />
                    <Text style={styles.checkedPapersLinkText}>{leaveLabel}</Text>
                  </View>
                  {checkedScoreText ? null : (
                    <Text style={styles.leaveLinkNote}>Checking continues</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={openCheckedPapers}
                  style={({ pressed }) => [
                    styles.checkedPapersLink,
                    pressed && styles.checkedPapersLinkPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Open checked papers"
                >
                  <View style={styles.checkedPapersLinkLabel}>
                    <Ionicons name="library-outline" size={18} color={colors.nav} />
                    <Text style={styles.checkedPapersLinkText}>Open checked papers</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[3], backgroundColor: colors.background },
  loadError: { alignSelf: 'stretch', marginHorizontal: spacing[5] },
  loadingMark: {
    width: 52,
    height: 52,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  loadingText: {
    ...typography.roles.body,
    color: colors.textMuted,
  },
  header: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
    gap: spacing[3],
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  exitButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: colors.white,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 17,
    lineHeight: 21,
  },
  headerMeta: {
    color: "rgba(255,255,255,0.52)",
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    marginTop: 2,
  },
  timer: {
    minHeight: 38,
    borderRadius: 14,
    paddingHorizontal: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  timerWarning: {
    backgroundColor: "rgba(225,29,72,0.24)",
    borderColor: "rgba(225,29,72,0.36)",
  },
  timerText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  progressPanel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing[4],
    borderRadius: radius.xl,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  progressCopy: {
    gap: 2,
  },
  progressEyebrow: {
    color: "rgba(255,255,255,0.46)",
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  progressTitle: {
    color: colors.white,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 18,
    lineHeight: 22,
  },
  progressBadge: {
    minWidth: 58,
    height: 38,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  progressBadgeText: {
    color: colors.slate[950],
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  progressTrack: {
    height: 7,
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  submitBtn: {
    minHeight: 48,
    borderRadius: 18,
    paddingHorizontal: spacing[5],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    backgroundColor: colors.slate[950],
  },
  submitBtnDisabled: {
    opacity: 0.62,
  },
  submitBtnText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  content: { padding: spacing[4], gap: spacing[4] },
  examSummary: {
    minHeight: 82,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    flexDirection: "row",
    alignItems: "center",
    padding: spacing[3],
    ...shadows.sm,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[1],
  },
  summaryValue: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 21,
    lineHeight: 24,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  summaryDivider: {
    width: 1,
    height: 38,
    backgroundColor: colors.borderSubtle,
  },
  questionCard: {
    backgroundColor: colors.card,
    borderRadius: radius["2xl"],
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  questionCardAnswered: {
    borderColor: "rgba(5,150,105,0.22)",
  },
  questionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing[4],
  },
  questionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    flex: 1,
  },
  questionNumBadge: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  questionNumBadgeAnswered: {
    backgroundColor: colors.successSurface,
    borderColor: "rgba(5,150,105,0.22)",
  },
  questionNum: {
    color: colors.accent,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
  },
  questionNumAnswered: {
    color: colors.success,
  },
  questionHeaderCopy: {
    gap: 2,
  },
  questionType: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
  },
  questionMarks: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },
  flagButton: {
    width: 36,
    height: 36,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.backgroundMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  flagButtonActive: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
  },
  questionText: {
    color: colors.ink,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 24,
  },
  questionTextContainer: { marginBottom: spacing[4] },
  questionVisual: { marginBottom: spacing[3] },
  mcqOptions: { gap: spacing[2] },
  mcqOption: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  mcqOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSurface,
  },
  mcqLabel: {
    width: 28,
    height: 28,
    borderRadius: 14,
    textAlign: "center",
    lineHeight: 28,
    fontFamily: typography.fonts.bodyBold,
    backgroundColor: colors.slate[200],
    color: colors.muted,
    fontSize: 12,
  },
  mcqLabelSelected: { backgroundColor: colors.accent, color: colors.white },
  mcqText: {
    color: colors.ink,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  mcqTextContainer: { flex: 1 },
  mcqTextSelected: {
    color: colors.accentStrong,
    fontFamily: typography.fonts.bodyBold,
  },
  tfRow: { flexDirection: "row", gap: spacing[3] },
  tfBtn: {
    flex: 1,
    height: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  tfBtnSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  tfText: {
    color: colors.muted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 14,
  },
  tfTextSelected: { color: colors.white },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing[3],
    color: colors.ink,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 14,
    minHeight: 60,
    backgroundColor: colors.surface2,
    textAlignVertical: "top",
  },
  textInputLong: { minHeight: 120 },
  matchBox: {
    gap: spacing[3],
  },
  matchColumn: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.backgroundMuted,
    padding: spacing[3],
    gap: spacing[2],
  },
  matchLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  matchItem: {
    color: colors.text,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  submitDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    backgroundColor: "rgba(248,250,252,0.96)",
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  dockCopy: {
    flex: 1,
  },
  dockTitle: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
  },
  dockMeta: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    marginTop: 2,
  },
  submitBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 40,
    backgroundColor: "rgba(2,6,23,0.48)",
    justifyContent: "flex-end",
    paddingHorizontal: spacing[4],
  },
  submitSheet: {
    borderRadius: radius["2xl"],
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing[5],
    gap: spacing[3],
    ...shadows.lg,
  },
  submitSheetIcon: {
    width: 52,
    height: 52,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  submitSheetIconSuccess: {
    backgroundColor: colors.successSurface,
    borderColor: colors.successBorder,
  },
  submitSheetIconError: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
  },
  submitSheetTitle: {
    color: colors.text,
    fontFamily: typography.fonts.heading,
    fontSize: 23,
    lineHeight: 28,
  },
  submitSheetBody: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 20,
  },
  submitStatsRow: {
    flexDirection: "row",
    gap: spacing[2],
  },
  submittedScoreBox: {
    minHeight: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.successSurface,
    borderWidth: 1,
    borderColor: colors.successBorder,
    justifyContent: "center",
    paddingHorizontal: spacing[4],
  },
  submittedScoreLabel: {
    color: colors.success,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  submittedScoreValue: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 23,
    lineHeight: 28,
    marginTop: spacing[1],
  },
  submittedStatusBox: {
    minHeight: 68,
    borderRadius: radius.lg,
    backgroundColor: colors.successSurface,
    borderWidth: 1,
    borderColor: colors.successBorder,
    paddingHorizontal: spacing[4],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  submittedStatusCopy: {
    flex: 1,
    paddingVertical: spacing[3],
  },
  submittedStatusText: {
    color: colors.success,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  submittedStatusTextFailed: {
    color: colors.danger,
  },
  checkingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing[3],
  },
  checkingPercent: {
    color: colors.success,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 15,
  },
  checkingTrack: {
    height: 6,
    marginTop: spacing[2],
    borderRadius: radius.full,
    backgroundColor: 'rgba(5,150,105,0.14)',
    overflow: 'hidden',
  },
  checkingFill: {
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.success,
  },
  checkingFillFailed: {
    backgroundColor: colors.danger,
  },
  checkingIndeterminate: {
    width: '34%',
    height: '100%',
    borderRadius: radius.full,
    backgroundColor: colors.success,
    opacity: 0.68,
  },
  submittedStatusHint: {
    marginTop: 3,
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 15,
  },
  attemptAgainError: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerSurface,
  },
  attemptAgainErrorText: {
    flex: 1,
    color: colors.danger,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
  },
  submitStat: {
    flex: 1,
    minHeight: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    justifyContent: "center",
    paddingHorizontal: spacing[3],
  },
  submitStatValue: {
    color: colors.text,
    fontFamily: typography.fonts.headingSemibold,
    fontSize: 19,
    lineHeight: 22,
  },
  submitStatLabel: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: spacing[1],
  },
  submitActions: {
    flexDirection: "row",
    gap: spacing[3],
    marginTop: spacing[2],
  },
  checkedPapersLink: {
    minHeight: 52,
    marginTop: spacing[3],
    paddingHorizontal: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
  },
  checkedPapersLinkPressed: {
    backgroundColor: colors.backgroundMuted,
  },
  checkedPapersLinkLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  checkedPapersLinkText: {
    color: colors.nav,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  leaveLinkNote: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
  },
  submitCancelButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.backgroundMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  submitCancelText: {
    color: colors.text,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
  },
  submitConfirmButton: {
    position: "relative",
    flex: 1.25,
    minHeight: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing[2],
    backgroundColor: colors.slate[950],
    overflow: "hidden",
  },
  submitHoldFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(249,115,22,0.42)",
  },
  submitConfirmText: {
    color: colors.white,
    fontFamily: typography.fonts.bodyBold,
    fontSize: 13,
    zIndex: 1,
  },
  submitHoldHint: {
    color: colors.textMuted,
    fontFamily: typography.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
});
