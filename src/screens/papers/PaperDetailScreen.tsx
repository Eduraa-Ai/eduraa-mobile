import React, { useRef, useEffect, useLayoutEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  TextInput,
  useWindowDimensions,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  useIsFocused,
  useRoute,
  useNavigation,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PapersStackParamList } from "../../navigation";
import { navigateToCheckedPapers } from "../../navigation/paperResultsNavigation";
import { papersApi, type PaperInstructMessage, type PaperQuestionVisualFile } from "../../api/papers";
import { SCAN_UPLOAD_OPTIONS_QUERY_KEY } from "../../api/scanUpload";
import { presentPdf } from "../../utils/pdfDownload";
import { useAuthStore } from "../../stores/authStore";
import { LatexText, QuestionVisual } from "../../components/ui";
import { colors } from "../../theme/colors";
import { spacing, radius, shadows, layout } from "../../theme/spacing";
import { shouldShowQuestionStemText } from "../../utils/questionVisual";
import {
  buildMatchColumnsRows,
  isMatchColumnsOptions,
} from "../../utils/matchColumns";
import {
  isAttemptCheckDelayed,
  isAttemptChecking,
  buildPaperInstructionContext,
  paperEditableContentFingerprint,
  paperChatStorageKey,
  paperPendingInstructionStorageKey,
  paperPrimaryAction,
  sanitizePendingPaperInstruction,
  sanitizePaperChatMessages,
  selectNewestSubmittedAttempt,
  visibleScore,
  type PaperQuestionUpdatePayload,
} from "./paperDetailModel";
import PaperQuestionEditor from "./PaperQuestionEditor";

type Nav = NativeStackNavigationProp<PapersStackParamList, "PaperDetail">;
type Route = RouteProp<PapersStackParamList, "PaperDetail">;

class PaperInstructionNoChangeError extends Error {}

const Q_TYPE_LABELS: Record<string, string> = {
  mcq: "MCQ",
  short_answer: "Short Ans",
  long_answer: "Long Ans",
  fill_blank: "Fill Blank",
  match_columns: "Match Col",
  true_false: "True/False",
};

function MatchColumnsPreview({ options }: { options: unknown }) {
  const rows = buildMatchColumnsRows(options);
  if (!rows.left.length && !rows.right.length) return null;

  return (
    <View style={styles.matchColumns}>
      {(
        [
          { label: "Column A", items: rows.left },
          { label: "Column B", items: rows.right },
        ] as const
      ).map((column) => (
        <View key={column.label} style={styles.matchColumn}>
          <Text style={styles.matchColumnLabel}>{column.label}</Text>
          {column.items.map((row) => (
            <View key={row.key} style={styles.matchItemRow}>
              <View style={styles.matchKeyBadge}>
                <Text style={styles.matchKeyText}>{row.key}</Text>
              </View>
              <LatexText
                value={row.label}
                style={styles.matchItemText}
                containerStyle={styles.matchItemTextContainer}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function HeaderAction({
  label,
  icon,
  danger = false,
  busy = false,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  danger?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const color = danger ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.headerAction,
        danger && styles.headerActionDanger,
        pressed && styles.headerActionPressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Ionicons name={icon} size={18} color={color} />
      )}
    </Pressable>
  );
}

function HeaderPublishAction({
  busy,
  disabled,
  onPress,
}: {
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Publish paper to your class"
      accessibilityState={{ busy, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerPublish,
        pressed && styles.headerActionPressed,
        disabled && styles.headerPublishDisabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.white} />
      ) : (
        <Ionicons name="paper-plane" size={14} color={colors.white} />
      )}
      <Text style={styles.headerPublishText}>{busy ? "Publishing" : "Publish"}</Text>
    </Pressable>
  );
}

export default function PaperDetailScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isFocused = useIsFocused();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [isOpeningResult, setIsOpeningResult] = useState(false);
  const [editingQuestionNumber, setEditingQuestionNumber] = useState<number | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [paperInstruction, setPaperInstruction] = useState("");
  const [paperChatMessages, setPaperChatMessages] = useState<PaperInstructMessage[]>([]);
  const [pendingPaperInstruction, setPendingPaperInstruction] = useState<string | null>(null);
  const [paperChatError, setPaperChatError] = useState<string | null>(null);
  const resultOpeningRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const chatScrollRef = useRef<ScrollView>(null);
  const hydratedChatKeyRef = useRef<string | null>(null);

  const paperQuery = useQuery({
    queryKey: ["paper", params.paperId],
    queryFn: () => papersApi.getById(params.paperId),
  });
  const paper = paperQuery.data;

  const isTeacherReference = params.presentation === "teacher_reference";

  const attemptsQuery = useQuery({
    queryKey: ["paper-attempts-detail", params.paperId],
    queryFn: () => papersApi.listAttempts(params.paperId),
    enabled: Boolean(paper && !isTeacherReference),
    retry: false,
  });
  const attempts = attemptsQuery.data?.items ?? [];
  const submittedAttempt = selectNewestSubmittedAttempt(attempts);
  const primaryAction = paperPrimaryAction(attempts);
  const submittedScore = visibleScore(submittedAttempt);
  const checking = isAttemptChecking(submittedAttempt);
  const checkDelayed = isAttemptCheckDelayed(submittedAttempt);
  const canOpenSubmittedResult = Boolean(
    submittedAttempt &&
    (primaryAction === "view_results" ||
      primaryAction === "attempt_again" ||
      checking ||
      checkDelayed),
  );

  const ownedPapersQuery = useQuery({
    queryKey: ["papers", "mine", user?.id],
    queryFn: () => papersApi.list({ skip: 0, limit: 100, scope: "mine" }),
    enabled: Boolean(paper && user?.role === "student"),
  });
  const ownsPaper =
    user?.role === "b2c_student" ||
    Boolean(
      ownedPapersQuery.data?.items.some((item) => item.id === params.paperId),
    ) ||
    Boolean(paper?.created_by && paper.created_by === user?.id);
  const canDelete = !isTeacherReference && ownsPaper;
  const isTeacher = user?.role === "teacher";
  const isPublished = paper?.status === "published";
  const canPublish = isTeacher && Boolean(paper) && !isPublished;
  const canEditPaper = isTeacher && !isTeacherReference && Boolean(paper) && !isPublished;
  const chatStorageKey = user?.id ? paperChatStorageKey(user.id, params.paperId) : null;
  const pendingInstructionStorageKey = user?.id
    ? paperPendingInstructionStorageKey(user.id, params.paperId)
    : null;
  const canRename = isTeacher || canDelete;
  // The export endpoint only releases answers to the paper's creator; admins and
  // principals read across their school.
  const canDownloadAnswerKey =
    isTeacher ||
    user?.role === "admin" ||
    user?.role === "principal" ||
    ownsPaper;

  const downloadMutation = useMutation({
    mutationFn: async (includeAnswers: boolean) => {
      const pdf = await papersApi.downloadPdf(params.paperId, {
        includeAnswers,
      });
      await presentPdf(pdf);
    },
    onMutate: () => setActionError(null),
    onError: (_error, includeAnswers) =>
      setActionError(
        includeAnswers
          ? "Could not download the answer key. Check your connection and try again."
          : "Could not download this paper. Check your connection and try again.",
      ),
  });

  const retestMutation = useMutation({
    mutationFn: () =>
      papersApi.createAttempt(params.paperId, { reason: "retest" }),
    onMutate: () => setActionError(null),
    onSuccess: (attempt) => {
      const launchKey = `retest-${attempt.id}-${Date.now()}`;
      queryClient.setQueryData(
        ["paper-attempt", params.paperId, undefined],
        attempt,
      );
      void queryClient.invalidateQueries({
        queryKey: ["paper-attempts-detail", params.paperId],
      });
      navigation.navigate("AttemptPaper", {
        paperId: params.paperId,
        launchKey,
      });
    },
    onError: () =>
      setActionError(
        "A fresh attempt could not be started. Your previous result is unchanged.",
      ),
  });

  const publishMutation = useMutation({
    mutationFn: () => papersApi.publish(params.paperId),
    onMutate: () => setActionError(null),
    onSuccess: async (published) => {
      queryClient.setQueryData(["paper", params.paperId], published);
      // The exam picker keeps its own published-paper list, which a `papers`
      // prefix never reaches.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["papers"] }),
        queryClient.invalidateQueries({ queryKey: ["exams", "papers"] }),
        queryClient.invalidateQueries({
          queryKey: SCAN_UPLOAD_OPTIONS_QUERY_KEY,
        }),
      ]);
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail;
      setActionError(
        typeof detail === "string"
          ? detail
          : "This paper could not be published. Make sure it has a standard and division.",
      );
    },
  });

  const renameMutation = useMutation({
    mutationFn: (title: string) => papersApi.updateTitle(params.paperId, title),
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      setRenameOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["paper", params.paperId] }),
        queryClient.invalidateQueries({ queryKey: ["papers"] }),
        queryClient.invalidateQueries({ queryKey: ["exams", "papers"] }),
      ]);
    },
    onError: (error: any) => {
      setRenameOpen(false);
      const detail = error?.response?.data?.detail;
      setActionError(
        typeof detail === "string"
          ? detail
          : "This paper could not be renamed. Only papers you created can be edited.",
      );
    },
  });

  const updateQuestionMutation = useMutation({
    mutationFn: ({ questionNumber, payload }: { questionNumber: number; payload: PaperQuestionUpdatePayload }) =>
      papersApi.updateQuestion(params.paperId, questionNumber, payload),
    onMutate: () => {
      setActionError(null);
      setSavedMessage(null);
    },
    onSuccess: async (updatedPaper, variables) => {
      queryClient.setQueryData(["paper", params.paperId], updatedPaper);
      setEditingQuestionNumber(null);
      setSavedMessage(`Question ${variables.questionNumber} saved.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["papers"] }),
        queryClient.invalidateQueries({ queryKey: ["exams", "papers"] }),
      ]);
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail;
      setActionError(
        typeof detail === "string"
          ? detail
          : "Your question could not be saved. Your edits are still here—check your connection and try again.",
      );
    },
  });

  const visualMutation = useMutation({
    mutationFn: ({ questionNumber, file }: { questionNumber: number; file: PaperQuestionVisualFile }) =>
      papersApi.uploadQuestionVisual(params.paperId, questionNumber, file),
    onMutate: () => {
      setActionError(null);
      setSavedMessage(null);
    },
    onSuccess: (updatedPaper, variables) => {
      queryClient.setQueryData(["paper", params.paperId], updatedPaper);
      setSavedMessage(`Image attached to question ${variables.questionNumber}.`);
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail;
      setActionError(
        typeof detail === "string"
          ? detail
          : "The image could not be attached. Your text edits are unchanged.",
      );
    },
  });

  const removeVisualMutation = useMutation({
    mutationFn: (questionNumber: number) => papersApi.removeQuestionVisual(params.paperId, questionNumber),
    onMutate: () => {
      setActionError(null);
      setSavedMessage(null);
    },
    onSuccess: (updatedPaper, questionNumber) => {
      queryClient.setQueryData(["paper", params.paperId], updatedPaper);
      setSavedMessage(`Image removed from question ${questionNumber}.`);
    },
    onError: () => setActionError("The image could not be removed. Nothing else was changed."),
  });

  const runInstructionMutation = useMutation({
    mutationFn: ({
      instruction,
      paperContext,
      chatHistory,
      pendingInstruction,
      beforeFingerprint,
    }: {
      instruction: string;
      paperContext: string;
      chatHistory: PaperInstructMessage[];
      pendingInstruction?: string | null;
      beforeFingerprint: string;
    }) => papersApi.runPaperInstruction(params.paperId, {
      instruction,
      paperContext,
      chatHistory,
      pendingInstruction,
    }).then((updatedPaper) => ({
      updatedPaper,
      reply: updatedPaper.clarify?.questions?.[0]?.prompt?.trim()
        || "Done — I updated your paper.",
    })).then((result) => {
      if (
        !result.updatedPaper.clarify
        && paperEditableContentFingerprint(result.updatedPaper) === beforeFingerprint
      ) {
        throw new PaperInstructionNoChangeError(
          "I couldn't verify a change to the paper. Your message is still here — try again.",
        );
      }
      return result;
    }),
    onMutate: (variables) => {
      setActionError(null);
      setPaperChatError(null);
      setSavedMessage(null);
      setPaperInstruction("");
      setPaperChatMessages((current) => {
        const last = current.at(-1);
        if (last?.role === "user" && last.text === variables.instruction) return current;
        return [...current, { role: "user" as const, text: variables.instruction }].slice(-40);
      });
    },
    onSuccess: async ({ updatedPaper, reply }, variables) => {
      queryClient.setQueryData(["paper", params.paperId], updatedPaper);
      setPendingPaperInstruction(
        updatedPaper.clarify ? variables.pendingInstruction || variables.instruction : null,
      );
      setPaperChatMessages((current) => [
        ...current,
        { role: "ai" as const, text: reply },
      ].slice(-40));
      await queryClient.invalidateQueries({ queryKey: ["papers"] });
    },
    onError: (error: any, variables) => {
      const status = Number(error?.response?.status || 0);
      const detail = error?.response?.data?.detail;
      setPaperInstruction((current) => current || variables.instruction);
      setPaperChatError(
        error instanceof PaperInstructionNoChangeError
          ? error.message
          : status >= 400 && status < 500 && typeof detail === "string"
          ? detail
          : "I couldn't update the paper. Your message is still here — tap send to try again.",
      );
    },
  });

  useEffect(() => {
    let cancelled = false;
    hydratedChatKeyRef.current = null;
    setPaperChatMessages([]);
    setPendingPaperInstruction(null);
    setPaperChatError(null);
    if (!chatStorageKey || !pendingInstructionStorageKey) return () => { cancelled = true; };

    void Promise.all([
      AsyncStorage.getItem(chatStorageKey),
      AsyncStorage.getItem(pendingInstructionStorageKey),
    ])
      .then(([rawMessages, rawPendingInstruction]) => {
        if (cancelled) return;
        if (rawMessages) setPaperChatMessages(sanitizePaperChatMessages(JSON.parse(rawMessages)));
        setPendingPaperInstruction(sanitizePendingPaperInstruction(rawPendingInstruction));
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) hydratedChatKeyRef.current = chatStorageKey;
      });
    return () => { cancelled = true; };
  }, [chatStorageKey, pendingInstructionStorageKey]);

  useEffect(() => {
    if (!chatStorageKey || hydratedChatKeyRef.current !== chatStorageKey) return;
    void AsyncStorage.setItem(
      chatStorageKey,
      JSON.stringify(sanitizePaperChatMessages(paperChatMessages)),
    ).catch(() => undefined);
  }, [chatStorageKey, paperChatMessages]);

  useEffect(() => {
    if (
      !pendingInstructionStorageKey ||
      hydratedChatKeyRef.current !== chatStorageKey
    ) return;
    if (!pendingPaperInstruction) {
      void AsyncStorage.removeItem(pendingInstructionStorageKey).catch(() => undefined);
      return;
    }
    void AsyncStorage.setItem(pendingInstructionStorageKey, pendingPaperInstruction)
      .catch(() => undefined);
  }, [chatStorageKey, pendingInstructionStorageKey, pendingPaperInstruction]);

  const deleteMutation = useMutation({
    mutationFn: () => papersApi.delete(params.paperId),
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      setDeleteConfirmationOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["papers"] }),
        queryClient.invalidateQueries({ queryKey: ["exams", "practice"] }),
        queryClient.invalidateQueries({ queryKey: ["exams", "papers"] }),
      ]);
      queryClient.removeQueries({ queryKey: ["paper", params.paperId] });
      queryClient.removeQueries({
        queryKey: ["paper-attempts-detail", params.paperId],
      });
      navigation.navigate("PapersList");
    },
    onError: () => {
      setDeleteConfirmationOpen(false);
      setActionError(
        "This paper could not be deleted. Only papers you created can be removed.",
      );
    },
  });

  useEffect(() => {
    if (!isFocused) return;
    resultOpeningRef.current = false;
    setIsOpeningResult(false);
    void paperQuery.refetch();
    if (paper && !isTeacherReference) void attemptsQuery.refetch();
  }, [isFocused, isTeacherReference, params.paperId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          {canPublish ? (
            <HeaderPublishAction
              busy={publishMutation.isPending}
              disabled={publishMutation.isPending || editingQuestionNumber !== null}
              onPress={() => publishMutation.mutate()}
            />
          ) : null}
          <HeaderAction
            label={isTeacherReference ? "Download paper PDF" : "Paper actions"}
            icon={isTeacherReference ? "download-outline" : "ellipsis-horizontal"}
            busy={
              downloadMutation.isPending ||
              retestMutation.isPending ||
              deleteMutation.isPending
            }
            onPress={
              isTeacherReference
                ? () => downloadMutation.mutate(false)
                : () => setActionMenuOpen(true)
            }
          />
        </View>
      ),
    });
  }, [
    canDelete,
    canPublish,
    deleteMutation.isPending,
    downloadMutation.isPending,
    editingQuestionNumber,
    isTeacherReference,
    navigation,
    params.paperId,
    publishMutation.isPending,
    retestMutation.isPending,
    submittedAttempt?.id,
  ]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  if (paperQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!paper) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.subtle} />
        <Text style={styles.errorText}>Paper not found</Text>
      </View>
    );
  }

  const hPad = width < 380 ? spacing[4] : spacing[5];
  const openSubmittedResult = () => {
    if (!submittedAttempt?.id || resultOpeningRef.current) return;
    const didNavigate = navigateToCheckedPapers(
      navigation,
      submittedAttempt.id,
    );
    if (!didNavigate) {
      setActionError(
        "Checked papers could not open. Please return to Papers and try again.",
      );
      return;
    }
    resultOpeningRef.current = true;
    setIsOpeningResult(true);
  };

  return (
    <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.root}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: hPad,
            paddingBottom:
              layout.bottomTabHeight +
              insets.bottom +
              (canEditPaper
                ? paperChatMessages.length || paperChatError
                  ? 340
                  : 150
                : spacing[10]),
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl
            refreshing={paperQuery.isRefetching}
            onRefresh={() => void paperQuery.refetch()}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        <View style={styles.pageHeader}>
          <Text style={styles.paperEyebrow}>
            {canEditPaper ? "YOUR PAPER" : isTeacher ? "PAPER WORKSPACE" : "QUESTION PAPER"}
          </Text>
          <Text style={styles.paperTitle}>{paper.title}</Text>
          <Text style={styles.paperSub}>
            {paper.subtitle || (canEditPaper
              ? "Tap any question to rewrite it. Ask AI for changes whenever you want."
              : isPublished
                ? "Review the paper details and questions below."
                : "Review the paper before you continue.")}
          </Text>
        </View>

        <View style={styles.infoCard}>
          {!canEditPaper ? (
            <View style={styles.paperHeadingRow}>
              <Text style={styles.readOnlySectionLabel}>Paper details</Text>
              <View style={[styles.statusPill, isPublished && styles.statusPillPublished]}>
                <View style={[styles.statusDot, isPublished && styles.statusDotPublished]} />
                <Text style={[styles.statusPillText, isPublished && styles.statusPillTextPublished]}>
                  {isPublished ? "Published" : "Draft"}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.chipRow}>
            {canEditPaper ? (
              <View style={styles.draftLabel}>
                <View style={styles.statusDot} />
                <Text style={styles.draftLabelText}>Draft</Text>
              </View>
            ) : null}
            <View style={styles.chip}>
              <Ionicons name="star-outline" size={12} color={colors.accent} />
              <Text style={[styles.chipText, { color: colors.accent }]}>
                {paper.total_marks} marks
              </Text>
            </View>
            {paper.duration_minutes ? (
              <View style={styles.chip}>
                <Ionicons name="time-outline" size={12} color={colors.info} />
                <Text style={[styles.chipText, { color: colors.info }]}>
                  {paper.duration_minutes} min
                </Text>
              </View>
            ) : null}
            <View style={styles.chip}>
              <Ionicons
                name="help-circle-outline"
                size={12}
                color={colors.success}
              />
              <Text style={[styles.chipText, { color: colors.success }]}>
                {paper.questions.length} questions
              </Text>
            </View>
          </View>

          {paper.instructions ? (
            <View style={styles.instructions}>
              <Text style={styles.instructionsLabel}>Instructions</Text>
              <Text style={styles.instructionsText}>{paper.instructions}</Text>
            </View>
          ) : null}
        </View>

        {params.generationNotice ? (
          <View style={styles.generationNotice}>
            <Ionicons name="library-outline" size={18} color={colors.info} />
            <View style={styles.generationNoticeCopy}>
              <Text style={styles.generationNoticeTitle}>Book paper ready</Text>
              <Text style={styles.generationNoticeBody}>
                {params.generationNotice}
              </Text>
            </View>
          </View>
        ) : null}

        {submittedAttempt ? (
          <View style={styles.submittedBanner}>
            <Ionicons
              name={
                checking
                  ? "sync-outline"
                  : checkDelayed
                    ? "alert-circle-outline"
                    : "checkmark-circle"
              }
              size={18}
              color={checkDelayed ? colors.warning : colors.success}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.submittedText}>
                {checking
                  ? "Paper submitted · checking in progress"
                  : checkDelayed
                    ? "Paper submitted · checking delayed"
                    : "Your result is ready"}
              </Text>
              <Text style={styles.submittedScore}>
                {submittedScore
                  ? `Score: ${submittedScore}`
                  : checking
                    ? "Select View Results to follow checking and see marks when ready."
                    : checkDelayed
                      ? "Your attempt is safe. Open View Results for a retry option."
                      : "Open your result for the complete review."}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          {isTeacherReference ? (
            <View style={styles.downloadStack}>
              <TouchableOpacity
                style={[
                  styles.downloadBtn,
                  downloadMutation.isPending && styles.primaryBtnDisabled,
                ]}
                onPress={() => downloadMutation.mutate(false)}
                activeOpacity={0.82}
                disabled={downloadMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Download teacher reference PDF"
              >
                {downloadMutation.isPending && !downloadMutation.variables ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : (
                  <Ionicons
                    name="download-outline"
                    size={24}
                    color={colors.accent}
                  />
                )}
                <View style={styles.downloadCopy}>
                  <Text style={styles.downloadTitle}>
                    Download teacher reference PDF
                  </Text>
                  <Text style={styles.downloadMeta}>
                    Save the question paper without answers.
                  </Text>
                </View>
              </TouchableOpacity>
              {canDownloadAnswerKey ? (
                <TouchableOpacity
                  style={[
                    styles.downloadBtn,
                    downloadMutation.isPending && styles.primaryBtnDisabled,
                  ]}
                  onPress={() => downloadMutation.mutate(true)}
                  activeOpacity={0.82}
                  disabled={downloadMutation.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Download PDF with answer key"
                >
                  {downloadMutation.isPending && downloadMutation.variables ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Ionicons
                      name="key-outline"
                      size={24}
                      color={colors.accent}
                    />
                  )}
                  <View style={styles.downloadCopy}>
                    <Text style={styles.downloadTitle}>
                      Download PDF with answer key
                    </Text>
                    <Text style={styles.downloadMeta}>
                      Same paper with every answer printed after its question.
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          {isTeacher && isPublished ? (
            <View style={styles.publishedNotice}>
              <Ionicons
                name="checkmark-circle"
                size={18}
                color={colors.success}
              />
              <Text style={styles.publishedNoticeText}>
                {paper.standard && paper.division
                  ? `Published to ${paper.standard} ${paper.division}`
                  : "Published to your class"}
              </Text>
            </View>
          ) : null}
          {isTeacher ? null : canOpenSubmittedResult && submittedAttempt ? (
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                isOpeningResult && styles.primaryBtnDisabled,
              ]}
              onPress={openSubmittedResult}
              disabled={isOpeningResult}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel="View results"
              accessibilityState={{
                busy: isOpeningResult,
                disabled: isOpeningResult,
              }}
            >
              <Ionicons name="stats-chart" size={16} color={colors.white} />
              <Text style={styles.primaryBtnText}>
                {isOpeningResult ? "Opening…" : "View Results"}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                retestMutation.isPending && styles.primaryBtnDisabled,
              ]}
              onPress={() => {
                if (primaryAction === "attempt_again") {
                  retestMutation.mutate();
                  return;
                }
                navigation.navigate("AttemptPaper", { paperId: paper.id });
              }}
              activeOpacity={0.82}
              disabled={retestMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel={
                primaryAction === "attempt_again"
                  ? "Attempt paper again"
                  : primaryAction === "continue"
                    ? "Continue paper"
                    : "Attempt paper"
              }
            >
              {retestMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons
                  name={
                    primaryAction === "attempt_again" ? "refresh" : "pencil"
                  }
                  size={16}
                  color={colors.white}
                />
              )}
              <Text style={styles.primaryBtnText}>
                {retestMutation.isPending
                  ? "Starting…"
                  : primaryAction === "attempt_again"
                    ? "Attempt Again"
                    : primaryAction === "continue"
                      ? "Continue Paper"
                      : "Attempt Paper"}
              </Text>
            </TouchableOpacity>
          )}
          {isTeacher ? null : submittedAttempt ? (
            <TouchableOpacity
              style={[
                styles.secondaryBtn,
                retestMutation.isPending && styles.primaryBtnDisabled,
              ]}
              onPress={() => retestMutation.mutate()}
              activeOpacity={0.82}
              disabled={retestMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Retest this paper"
              accessibilityState={{
                busy: retestMutation.isPending,
                disabled: retestMutation.isPending,
              }}
            >
              {retestMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons
                  name="repeat-outline"
                  size={16}
                  color={colors.accent}
                />
              )}
              <Text style={styles.secondaryBtnText}>
                {retestMutation.isPending ? "Starting…" : "Retest"}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => navigation.navigate("Quiz", { paperId: paper.id })}
              activeOpacity={0.82}
            >
              <Ionicons name="flash-outline" size={16} color={colors.accent} />
              <Text style={styles.secondaryBtnText}>Interactive Quiz</Text>
            </TouchableOpacity>
          )}
        </View>
        {actionError ? (
          <View accessibilityLiveRegion="polite" style={styles.actionError}>
            <Ionicons
              name="alert-circle-outline"
              size={16}
              color={colors.danger}
            />
            <Text style={styles.actionErrorText}>{actionError}</Text>
          </View>
        ) : null}
        {savedMessage ? (
          <View accessibilityLiveRegion="polite" style={styles.savedBanner}>
            <Ionicons name="checkmark-circle" size={17} color={colors.success} />
            <Text style={styles.savedBannerText}>{savedMessage}</Text>
          </View>
        ) : null}

        {/* Questions */}
        <View style={styles.documentHeading}>
          <Text style={styles.sectionLabel}>Questions</Text>
          {canEditPaper ? (
            <View style={styles.editHint}>
              <Ionicons name="hand-left-outline" size={14} color={colors.accentStrong} />
              <Text style={styles.editHintText}>Tap to edit</Text>
            </View>
          ) : (
            <Text style={styles.questionCount}>{paper.questions.length}</Text>
          )}
        </View>
        {paper.questions.map((q, index) => (
          <View
            key={q.id}
            style={[
              styles.questionCard,
              editingQuestionNumber === q.question_number && styles.questionCardEditing,
            ]}
          >
            <View style={styles.questionHeader}>
              <View style={styles.questionNum}>
                <Text style={styles.questionNumText}>
                  Q{q.question_number || index + 1}
                </Text>
              </View>
              <View style={styles.questionMetaGroup}>
                <View style={styles.qtypeBadge}>
                  <Text style={styles.qtypeText} numberOfLines={1}>
                    {Q_TYPE_LABELS[q.question_type] ?? q.question_type}
                  </Text>
                </View>
                <View style={styles.questionMeta}>
                  <View style={styles.marksBadge}>
                    <Text style={styles.marksText}>
                      {q.marks} {q.marks === 1 ? "mark" : "marks"}
                    </Text>
                  </View>
                  {q.difficulty ? (
                    <>
                      <View style={styles.metaDivider} />
                      <View style={styles.diffBadge}>
                        <View
                          style={[
                            styles.diffDot,
                            q.difficulty === "hard" && styles.diffDotHard,
                            q.difficulty === "medium" && styles.diffDotMedium,
                            q.difficulty === "easy" && styles.diffDotEasy,
                          ]}
                        />
                        <Text
                          style={[
                            styles.diffText,
                            q.difficulty === "hard" && { color: colors.danger },
                            q.difficulty === "medium" && {
                              color: colors.warning,
                            },
                            q.difficulty === "easy" && { color: colors.success },
                          ]}
                        >
                          {q.difficulty}
                        </Text>
                      </View>
                    </>
                  ) : null}
                </View>
              </View>
              {canEditPaper ? (
                <View style={styles.questionEditIcon}>
                  <Ionicons
                    name={editingQuestionNumber === q.question_number ? "create" : "pencil"}
                    size={15}
                    color={editingQuestionNumber === q.question_number ? colors.accent : colors.textMuted}
                  />
                </View>
              ) : null}
            </View>
            {editingQuestionNumber === q.question_number ? (
              <PaperQuestionEditor
                key={`${q.id}-${q.question_text}-${q.marks}`}
                question={q}
                busy={updateQuestionMutation.isPending}
                visualBusy={visualMutation.isPending || removeVisualMutation.isPending}
                onCancel={() => {
                  setEditingQuestionNumber(null);
                  setActionError(null);
                }}
                onSave={(payload) => updateQuestionMutation.mutate({ questionNumber: q.question_number, payload })}
                onUploadVisual={(file) => visualMutation.mutate({ questionNumber: q.question_number, file })}
                onRemoveVisual={() => removeVisualMutation.mutate(q.question_number)}
              />
            ) : (
              <Pressable
                accessibilityRole={canEditPaper ? "button" : undefined}
                accessibilityLabel={canEditPaper ? `Edit question ${q.question_number}` : undefined}
                disabled={!canEditPaper || editingQuestionNumber !== null}
                onPress={() => {
                  setActionError(null);
                  setSavedMessage(null);
                  setEditingQuestionNumber(q.question_number);
                }}
                style={({ pressed }) => [styles.questionContent, pressed && canEditPaper && styles.questionContentPressed]}
              >
                {q.visual_payload ? <QuestionVisual visual={q.visual_payload} /> : null}
                {shouldShowQuestionStemText(q.visual_payload, "interactive") ? (
                  <LatexText value={q.question_text} style={styles.questionText} />
                ) : null}
                {q.options && Array.isArray(q.options) ? (
                  <View style={styles.optionsList}>
                    {(q.options as Array<{ id: string; text: string }>).map((opt, i) => (
                      <View key={opt.id} style={styles.optionRow}>
                        <View style={styles.optionLetter}>
                          <Text style={styles.optionLetterText}>{String.fromCharCode(65 + i)}</Text>
                        </View>
                        <LatexText value={opt.text} style={styles.optionText} containerStyle={styles.optionTextContainer} />
                      </View>
                    ))}
                  </View>
                ) : null}
                {isMatchColumnsOptions(q.options) ? <MatchColumnsPreview options={q.options} /> : null}
                {canEditPaper ? (
                  <View style={styles.questionEditCue}>
                    <Ionicons name="sparkles-outline" size={13} color={colors.accentStrong} />
                    <Text style={styles.questionEditCueText}>Edit text, answer, marks or image</Text>
                  </View>
                ) : null}
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>

      {canEditPaper && editingQuestionNumber === null ? (
        <View
          style={[
            styles.aiComposerDock,
            { bottom: layout.bottomTabHeight + insets.bottom },
          ]}
        >
          {paperChatMessages.length ? (
            <View style={styles.aiConversationPanel}>
              <ScrollView
                ref={chatScrollRef}
                style={styles.aiConversationScroll}
                contentContainerStyle={styles.aiConversationContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
              >
                {paperChatMessages.map((message, index) => (
                  <View
                    key={`${message.role}-${index}-${message.text.slice(0, 20)}`}
                    style={[
                      styles.aiMessageRow,
                      message.role === "user" && styles.aiMessageRowUser,
                    ]}
                  >
                    {message.role === "ai" ? (
                      <View style={styles.aiAvatarSmall}>
                        <Ionicons name="sparkles" size={13} color={colors.white} />
                      </View>
                    ) : null}
                    <View
                      style={[
                        styles.aiMessageBubble,
                        message.role === "user"
                          ? styles.aiMessageBubbleUser
                          : styles.aiMessageBubbleAssistant,
                      ]}
                    >
                      <Text
                        style={[
                          styles.aiMessageText,
                          message.role === "user" && styles.aiMessageTextUser,
                        ]}
                      >
                        {message.text}
                      </Text>
                    </View>
                  </View>
                ))}
                {runInstructionMutation.isPending ? (
                  <View style={styles.aiMessageRow}>
                    <View style={styles.aiAvatarSmall}>
                      <ActivityIndicator size="small" color={colors.white} />
                    </View>
                    <View style={[styles.aiMessageBubble, styles.aiMessageBubbleAssistant]}>
                      <Text style={styles.aiThinkingText}>Making that change…</Text>
                    </View>
                  </View>
                ) : null}
              </ScrollView>
            </View>
          ) : null}
          {paperChatError ? (
            <View accessibilityRole="alert" style={styles.aiErrorBubble}>
              <Ionicons name="refresh-outline" size={17} color={colors.danger} />
              <Text style={styles.aiErrorText}>{paperChatError}</Text>
            </View>
          ) : null}
          <View style={styles.aiComposer}>
            <View style={styles.aiAvatar}>
              <Ionicons name="sparkles" size={18} color={colors.white} />
            </View>
            <TextInput
              value={paperInstruction}
              onChangeText={(value) => {
                setPaperInstruction(value);
                setPaperChatError(null);
              }}
              editable={!runInstructionMutation.isPending}
              multiline
              maxLength={2000}
              placeholder="Ask AI to change anything…"
              placeholderTextColor={colors.placeholder}
              style={styles.aiComposerInput}
              accessibilityLabel="Ask AI to change this paper"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send paper change to AI"
              accessibilityState={{
                busy: runInstructionMutation.isPending,
                disabled: !paperInstruction.trim() || runInstructionMutation.isPending,
              }}
              disabled={!paperInstruction.trim() || runInstructionMutation.isPending}
              onPress={() => {
                const instruction = paperInstruction.trim();
                runInstructionMutation.mutate({
                  instruction,
                  paperContext: buildPaperInstructionContext(paper),
                  chatHistory: paperChatMessages,
                  pendingInstruction: pendingPaperInstruction,
                  beforeFingerprint: paperEditableContentFingerprint(paper),
                });
              }}
              style={({ pressed }) => [
                styles.aiSend,
                pressed && styles.headerActionPressed,
                !paperInstruction.trim() && styles.aiSendDisabled,
              ]}
            >
              {runInstructionMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="arrow-up" size={19} color={colors.white} />
              )}
            </Pressable>
          </View>
        </View>
      ) : null}

      <Modal
        transparent
        animationType="fade"
        visible={actionMenuOpen}
        onRequestClose={() => setActionMenuOpen(false)}
      >
        <View style={styles.actionMenuBackdrop}>
          <Pressable
            accessibilityLabel="Close paper actions"
            style={StyleSheet.absoluteFill}
            onPress={() => setActionMenuOpen(false)}
          />
          <View
            accessibilityRole="menu"
            style={[styles.actionMenu, { top: insets.top + 54 }]}
          >
            <Text style={styles.actionMenuEyebrow}>Paper actions</Text>
            {submittedAttempt && !isTeacher ? (
              <Pressable
                accessibilityRole="menuitem"
                accessibilityLabel="Start a fresh retest"
                onPress={() => {
                  setActionMenuOpen(false);
                  retestMutation.mutate();
                }}
                style={({ pressed }) => [
                  styles.actionMenuItem,
                  pressed && styles.headerActionPressed,
                ]}
              >
                <View style={styles.actionMenuIcon}>
                  <Ionicons
                    name="repeat-outline"
                    size={20}
                    color={colors.accentStrong}
                  />
                </View>
                <View style={styles.actionMenuCopy}>
                  <Text style={styles.actionMenuTitle}>
                    Start a fresh retest
                  </Text>
                  <Text style={styles.actionMenuBody}>
                    Keep every previous result and open a blank attempt.
                  </Text>
                </View>
              </Pressable>
            ) : null}
            {canRename ? (
              <Pressable
                accessibilityRole="menuitem"
                accessibilityLabel="Rename paper"
                onPress={() => {
                  setActionMenuOpen(false);
                  setRenameValue(paper.title);
                  setRenameOpen(true);
                }}
                style={({ pressed }) => [
                  styles.actionMenuItem,
                  pressed && styles.headerActionPressed,
                ]}
              >
                <View style={styles.actionMenuIcon}>
                  <Ionicons
                    name="create-outline"
                    size={20}
                    color={colors.accentStrong}
                  />
                </View>
                <View style={styles.actionMenuCopy}>
                  <Text style={styles.actionMenuTitle}>Rename paper</Text>
                  <Text style={styles.actionMenuBody}>
                    Change the title students and teachers see.
                  </Text>
                </View>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="menuitem"
              accessibilityLabel="Download paper PDF"
              onPress={() => {
                setActionMenuOpen(false);
                downloadMutation.mutate(false);
              }}
              style={({ pressed }) => [
                styles.actionMenuItem,
                pressed && styles.headerActionPressed,
              ]}
            >
              <View style={styles.actionMenuIcon}>
                <Ionicons
                  name="download-outline"
                  size={20}
                  color={colors.accentStrong}
                />
              </View>
              <View style={styles.actionMenuCopy}>
                <Text style={styles.actionMenuTitle}>Download paper PDF</Text>
                <Text style={styles.actionMenuBody}>
                  Save the question paper without answers.
                </Text>
              </View>
            </Pressable>
            {canDownloadAnswerKey ? (
              <Pressable
                accessibilityRole="menuitem"
                accessibilityLabel="Download PDF with answer key"
                onPress={() => {
                  setActionMenuOpen(false);
                  downloadMutation.mutate(true);
                }}
                style={({ pressed }) => [
                  styles.actionMenuItem,
                  pressed && styles.headerActionPressed,
                ]}
              >
                <View style={styles.actionMenuIcon}>
                  <Ionicons
                    name="key-outline"
                    size={20}
                    color={colors.accentStrong}
                  />
                </View>
                <View style={styles.actionMenuCopy}>
                  <Text style={styles.actionMenuTitle}>
                    Download PDF with answer key
                  </Text>
                  <Text style={styles.actionMenuBody}>
                    Same paper with every answer printed after its question.
                  </Text>
                </View>
              </Pressable>
            ) : null}
            {canDelete ? (
              <Pressable
                accessibilityRole="menuitem"
                accessibilityLabel="Delete paper"
                onPress={() => {
                  setActionMenuOpen(false);
                  setDeleteConfirmationOpen(true);
                }}
                style={({ pressed }) => [
                  styles.actionMenuItem,
                  styles.actionMenuItemDanger,
                  pressed && styles.headerActionPressed,
                ]}
              >
                <View
                  style={[styles.actionMenuIcon, styles.actionMenuIconDanger]}
                >
                  <Ionicons
                    name="trash-outline"
                    size={20}
                    color={colors.danger}
                  />
                </View>
                <View style={styles.actionMenuCopy}>
                  <Text
                    style={[
                      styles.actionMenuTitle,
                      styles.actionMenuTitleDanger,
                    ]}
                  >
                    Delete practice paper
                  </Text>
                  <Text style={styles.actionMenuBody}>
                    Permanently remove this owned paper and its attempts.
                  </Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={renameOpen}
        onRequestClose={() => {
          if (!renameMutation.isPending) setRenameOpen(false);
        }}
      >
        <View style={styles.confirmBackdrop}>
          <Pressable
            accessibilityLabel="Cancel rename"
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!renameMutation.isPending) setRenameOpen(false);
            }}
          />
          <View
            style={[
              styles.confirmSheet,
              { paddingBottom: insets.bottom + spacing[5] },
            ]}
          >
            <View style={styles.confirmHandle} />
            <View style={styles.confirmIcon}>
              <Ionicons
                name="create-outline"
                size={24}
                color={colors.accentStrong}
              />
            </View>
            <Text style={styles.confirmEyebrow}>Paper name</Text>
            <Text style={styles.confirmTitle}>Rename this paper</Text>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              maxLength={200}
              autoFocus
              selectTextOnFocus
              editable={!renameMutation.isPending}
              placeholder="Paper name"
              placeholderTextColor={colors.textMuted}
              style={styles.renameInput}
              accessibilityLabel="Paper name"
              returnKeyType="done"
              onSubmitEditing={() => {
                const next = renameValue.trim();
                if (next && next !== paper.title) renameMutation.mutate(next);
              }}
            />
            <View style={styles.confirmActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={renameMutation.isPending}
                onPress={() => setRenameOpen(false)}
                style={styles.confirmCancel}
                accessibilityRole="button"
                accessibilityLabel="Cancel rename"
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.9}
                disabled={
                  renameMutation.isPending ||
                  !renameValue.trim() ||
                  renameValue.trim() === paper.title
                }
                onPress={() => renameMutation.mutate(renameValue.trim())}
                style={[
                  styles.confirmSave,
                  (renameMutation.isPending ||
                    !renameValue.trim() ||
                    renameValue.trim() === paper.title) &&
                    styles.primaryBtnDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Save paper name"
              >
                {renameMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons name="checkmark" size={16} color={colors.white} />
                )}
                <Text style={styles.confirmDeleteText}>
                  {renameMutation.isPending ? "Saving…" : "Save name"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={deleteConfirmationOpen}
        onRequestClose={() => {
          if (!deleteMutation.isPending) setDeleteConfirmationOpen(false);
        }}
      >
        <View style={styles.confirmBackdrop}>
          <Pressable
            accessibilityLabel="Cancel paper deletion"
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!deleteMutation.isPending) setDeleteConfirmationOpen(false);
            }}
          />
          <View
            accessibilityRole="alert"
            style={[
              styles.confirmSheet,
              { paddingBottom: insets.bottom + spacing[5] },
            ]}
          >
            <View style={styles.confirmHandle} />
            <View style={styles.confirmIcon}>
              <Ionicons name="trash-outline" size={24} color={colors.danger} />
            </View>
            <Text style={styles.confirmEyebrow}>Remove practice paper</Text>
            <Text style={styles.confirmTitle}>Delete this paper?</Text>
            <Text style={styles.confirmBody}>
              “{paper.title}” and its linked attempts will be permanently
              removed. Teacher-assigned papers cannot be deleted.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={deleteMutation.isPending}
                onPress={() => setDeleteConfirmationOpen(false)}
                style={styles.confirmCancel}
                accessibilityRole="button"
                accessibilityLabel="Keep paper"
              >
                <Text style={styles.confirmCancelText}>Keep paper</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.9}
                disabled={deleteMutation.isPending}
                onPress={() => deleteMutation.mutate()}
                style={[
                  styles.confirmDelete,
                  deleteMutation.isPending && styles.primaryBtnDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Confirm delete paper"
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color={colors.white}
                  />
                )}
                <Text style={styles.confirmDeleteText}>
                  {deleteMutation.isPending ? "Deleting…" : "Delete paper"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paperStudio.paper },
  content: { paddingTop: spacing[4], gap: 0 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[3],
  },
  errorText: { fontSize: 14, color: colors.muted },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.backgroundTint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerActionDanger: {
    backgroundColor: colors.dangerSurface,
    borderColor: `${colors.danger}35`,
  },
  headerActionPressed: {
    opacity: 0.68,
    transform: [{ scale: 0.96 }],
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  headerPublish: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.full,
    backgroundColor: colors.nav,
    paddingHorizontal: spacing[3],
  },
  headerPublishDisabled: { opacity: 0.42 },
  headerPublishText: { color: colors.white, fontSize: 12, fontWeight: "800" },

  infoCard: {
    paddingHorizontal: 0,
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
    gap: spacing[3],
  },
  pageHeader: {
    gap: spacing[1],
    paddingHorizontal: spacing[1],
    paddingTop: spacing[1],
    paddingBottom: spacing[2],
  },
  paperHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
  },
  paperEyebrow: {
    color: colors.accentStrong,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  readOnlySectionLabel: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  draftLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingRight: spacing[2],
  },
  draftLabelText: { color: colors.warning, fontSize: 12, fontWeight: "700" },
  statusPill: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.full,
    backgroundColor: colors.warningSurface,
    paddingHorizontal: spacing[3],
  },
  statusPillPublished: { backgroundColor: colors.successSurface },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.warning },
  statusDotPublished: { backgroundColor: colors.success },
  statusPillText: { color: colors.warning, fontSize: 11, fontWeight: "700" },
  statusPillTextPublished: { color: colors.success },
  paperTitle: {
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  paperSub: { fontSize: 13, color: colors.muted },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2] },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingRight: spacing[2],
  },
  chipText: { fontSize: 12, fontWeight: "600" },
  instructions: {
    backgroundColor: colors.infoBg,
    borderRadius: radius.lg,
    padding: spacing[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.infoBorder,
    gap: 4,
  },
  instructionsLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.info,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  instructionsText: { fontSize: 13, color: colors.infoText, lineHeight: 19 },

  aiErrorBubble: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 20,
    backgroundColor: colors.dangerSurface,
    paddingHorizontal: spacing[3],
  },
  aiErrorText: { flex: 1, color: colors.danger, fontSize: 12, lineHeight: 18 },

  generationNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
    backgroundColor: colors.infoBg,
    borderRadius: radius.lg,
    padding: spacing[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.infoBorder,
  },
  generationNoticeCopy: { flex: 1, gap: 2 },
  generationNoticeTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.infoText,
  },
  generationNoticeBody: {
    fontSize: 12,
    color: colors.infoText,
    lineHeight: 18,
  },

  submittedBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
    backgroundColor: colors.successBg,
    borderRadius: radius.lg,
    padding: spacing[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.successBorder,
  },
  submittedText: { fontSize: 13, fontWeight: "700", color: colors.successText },
  submittedScore: { fontSize: 12, color: colors.success, marginTop: 2 },

  actions: { flexDirection: "row", gap: spacing[3] },
  publishedNotice: {
    flex: 1,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  publishedNoticeText: {
    color: colors.success,
    fontWeight: "700",
    fontSize: 14,
  },
  primaryBtn: {
    flex: 1,
    height: 50,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  primaryBtnText: { color: colors.white, fontWeight: "700", fontSize: 14 },
  primaryBtnDisabled: { opacity: 0.58 },
  secondaryBtn: {
    flex: 1,
    height: 50,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  secondaryBtnText: { color: colors.accent, fontWeight: "700", fontSize: 14 },
  downloadStack: {
    flex: 1,
    gap: spacing[3],
  },
  downloadBtn: {
    minHeight: 58,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  downloadCopy: {
    flex: 1,
    gap: 2,
  },
  downloadTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  downloadMeta: {
    color: colors.textSoft,
    fontSize: 11,
  },
  downloadError: {
    color: colors.danger,
    fontSize: 12,
    lineHeight: 17,
  },
  actionError: {
    minHeight: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: `${colors.danger}35`,
    backgroundColor: colors.dangerSurface,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  actionErrorText: {
    flex: 1,
    color: colors.danger,
    fontSize: 12,
    lineHeight: 17,
  },
  savedBanner: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: radius.lg,
    backgroundColor: colors.successSurface,
    paddingHorizontal: spacing[3],
  },
  savedBannerText: { flex: 1, color: colors.success, fontSize: 12, fontWeight: "700" },

  aiComposerDock: {
    position: "absolute",
    left: spacing[3],
    right: spacing[3],
    zIndex: 12,
    gap: spacing[2],
  },
  aiConversationPanel: {
    borderWidth: 1,
    borderColor: colors.borderBrand,
    borderRadius: 22,
    backgroundColor: colors.backgroundElevated,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
    shadowColor: colors.shadowStrong,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 20,
    elevation: 9,
  },
  aiConversationScroll: { maxHeight: 220 },
  aiConversationContent: { gap: spacing[2], padding: spacing[2] },
  aiMessageRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing[2],
  },
  aiMessageRowUser: { justifyContent: "flex-end", paddingLeft: spacing[8] },
  aiMessageBubble: {
    maxWidth: "86%",
    borderRadius: 17,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  aiMessageBubbleAssistant: {
    backgroundColor: colors.backgroundMuted,
    borderBottomLeftRadius: 6,
  },
  aiMessageBubbleUser: {
    backgroundColor: colors.nav,
    borderBottomRightRadius: 6,
  },
  aiMessageText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  aiMessageTextUser: { color: colors.white },
  aiThinkingText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  aiAvatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.nav,
  },
  aiComposer: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing[2],
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 28,
    backgroundColor: colors.backgroundElevated,
    padding: spacing[2],
    shadowColor: colors.shadowStrong,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 10,
  },
  aiAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.nav,
  },
  aiComposerInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 116,
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[3],
  },
  aiSend: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  aiSendDisabled: { backgroundColor: colors.textSoft },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.subtle,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 0,
  },
  documentHeading: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
    marginTop: spacing[3],
  },
  editHint: { flexDirection: "row", alignItems: "center", gap: 5 },
  editHintText: { color: colors.accentStrong, fontSize: 11, fontWeight: "700" },
  questionCount: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  questionCard: {
    backgroundColor: "transparent",
    borderRadius: 0,
    paddingHorizontal: spacing[1],
    paddingVertical: spacing[5],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing[3],
  },
  questionCardEditing: {
    marginHorizontal: -spacing[2],
    paddingHorizontal: spacing[3],
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: radius.lg,
    backgroundColor: colors.backgroundElevated,
  },
  questionHeader: {
    flexDirection: "row",
    gap: spacing[3],
    alignItems: "center",
  },
  questionNum: {
    minWidth: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[2],
    borderRadius: 14,
    backgroundColor: colors.nav,
    shadowColor: colors.shadowStrong,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 7,
    elevation: 3,
    flexShrink: 0,
  },
  questionNumText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.white,
    letterSpacing: -0.2,
  },
  questionMetaGroup: { flex: 1, minWidth: 0, justifyContent: "center", gap: 4 },
  questionMeta: { minHeight: 18, flexDirection: "row", alignItems: "center", gap: 7 },
  questionEditIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    backgroundColor: colors.backgroundElevated,
    flexShrink: 0,
  },
  questionContent: { gap: spacing[3] },
  questionContentPressed: { opacity: 0.62 },
  questionEditCue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: spacing[1],
  },
  questionEditCueText: { color: colors.accentStrong, fontSize: 11, fontWeight: "600" },
  qtypeBadge: {
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  qtypeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: colors.text,
    textTransform: "uppercase",
    letterSpacing: 0.75,
  },
  marksBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  marksText: { fontSize: 11, lineHeight: 15, fontWeight: "700", color: colors.textMuted },
  metaDivider: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.textSubtle,
  },
  diffBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  diffDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textSoft },
  diffDotHard: { backgroundColor: colors.danger },
  diffDotMedium: { backgroundColor: colors.warning },
  diffDotEasy: { backgroundColor: colors.success },
  diffText: { fontSize: 11, lineHeight: 15, fontWeight: "700", textTransform: "capitalize" },
  questionText: { fontSize: 14, color: colors.ink, lineHeight: 22 },
  optionsList: { gap: spacing[2] },
  optionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[2],
  },
  optionLetter: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  optionLetterText: { fontSize: 11, fontWeight: "700", color: colors.muted },
  optionTextContainer: { flex: 1 },
  optionText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    paddingTop: 3,
  },
  matchColumns: {
    flexDirection: "row",
    gap: spacing[2],
  },
  matchColumn: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface2,
    padding: spacing[3],
    gap: spacing[2],
  },
  matchColumnLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: colors.muted,
  },
  matchItemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[2],
  },
  matchKeyBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface1,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 4,
    flexShrink: 0,
  },
  matchKeyText: { fontSize: 10, fontWeight: "700", color: colors.muted },
  matchItemTextContainer: { flex: 1 },
  matchItemText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  actionMenuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(7,21,45,0.28)",
  },
  actionMenu: {
    position: "absolute",
    right: spacing[3],
    width: 304,
    maxWidth: "92%",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    padding: spacing[3],
    gap: spacing[1],
    ...shadows.lg,
  },
  actionMenuEyebrow: {
    color: colors.accentStrong,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    paddingHorizontal: spacing[2],
    paddingTop: spacing[1],
    paddingBottom: spacing[2],
  },
  actionMenuItem: {
    minHeight: 68,
    borderRadius: 17,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  actionMenuItemDanger: {
    marginTop: spacing[1],
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  actionMenuIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  actionMenuIconDanger: {
    backgroundColor: colors.dangerSurface,
    borderColor: `${colors.danger}35`,
  },
  actionMenuCopy: {
    flex: 1,
    gap: 2,
  },
  actionMenuTitle: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  actionMenuTitleDanger: {
    color: colors.danger,
  },
  actionMenuBody: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  confirmBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(7,21,45,0.58)",
    paddingHorizontal: spacing[3],
  },
  confirmSheet: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
    gap: spacing[3],
    ...shadows.lg,
  },
  confirmHandle: {
    width: 42,
    height: 4,
    borderRadius: radius.full,
    alignSelf: "center",
    backgroundColor: colors.borderStrong,
    marginBottom: spacing[2],
  },
  confirmIcon: {
    width: 52,
    height: 52,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.dangerSurface,
    borderWidth: 1,
    borderColor: `${colors.danger}35`,
  },
  confirmEyebrow: {
    color: colors.accentStrong,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  confirmTitle: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.35,
  },
  confirmBody: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  confirmActions: {
    flexDirection: "row",
    gap: spacing[3],
    marginTop: spacing[2],
  },
  confirmCancel: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  confirmCancelText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  confirmDelete: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing[2],
    backgroundColor: colors.danger,
  },
  confirmSave: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing[2],
    backgroundColor: colors.accent,
  },
  renameInput: {
    width: "100%",
    minHeight: 52,
    marginTop: spacing[4],
    paddingHorizontal: spacing[4],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    color: colors.text,
    fontSize: 15,
  },
  confirmDeleteText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "800",
  },
});
