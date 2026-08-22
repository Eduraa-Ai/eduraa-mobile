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
import type { PapersStackParamList } from "../../navigation";
import { navigateToCheckedPapers } from "../../navigation/paperResultsNavigation";
import { papersApi } from "../../api/papers";
import { presentPdf } from "../../utils/pdfDownload";
import { useAuthStore } from "../../stores/authStore";
import { LatexText, QuestionVisual } from "../../components/ui";
import { colors } from "../../theme/colors";
import { spacing, radius, shadows, layout } from "../../theme/spacing";
import { shouldShowQuestionStemText } from "../../utils/questionVisual";
import {
  isAttemptCheckDelayed,
  isAttemptChecking,
  paperPrimaryAction,
  selectNewestSubmittedAttempt,
  visibleScore,
} from "./paperDetailModel";

type Nav = NativeStackNavigationProp<PapersStackParamList, "PaperDetail">;
type Route = RouteProp<PapersStackParamList, "PaperDetail">;

const Q_TYPE_LABELS: Record<string, string> = {
  mcq: "MCQ",
  short_answer: "Short Ans",
  long_answer: "Long Ans",
  fill_blank: "Fill Blank",
  match_columns: "Match Col",
  true_false: "True/False",
};

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
  const resultOpeningRef = useRef(false);

  const paperQuery = useQuery({
    queryKey: ["paper", params.paperId],
    queryFn: () => papersApi.getById(params.paperId),
  });
  const paper = paperQuery.data;

  const isTeacherReference = params.presentation === 'teacher_reference'

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
    queryKey: ['papers', 'mine', user?.id],
    queryFn: () => papersApi.list({ skip: 0, limit: 100, scope: 'mine' }),
    enabled: Boolean(paper && user?.role === 'student'),
  })
  const canDelete = !isTeacherReference && (
    user?.role === 'b2c_student'
    || Boolean(ownedPapersQuery.data?.items.some((item) => item.id === params.paperId))
    || Boolean(paper?.created_by && paper.created_by === user?.id)
  )
  const isTeacher = user?.role === "teacher";
  const isPublished = paper?.status === "published";
  const canPublish = isTeacher && Boolean(paper) && !isPublished;
  const canRename = isTeacher || canDelete;

  const downloadMutation = useMutation({
    mutationFn: async () => {
      const pdf = await papersApi.downloadPdf(params.paperId);
      await presentPdf(pdf);
    },
    onMutate: () => setActionError(null),
    onError: () =>
      setActionError(
        "Could not download this paper. Check your connection and try again.",
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
      await queryClient.invalidateQueries({ queryKey: ["papers"] });
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

  const deleteMutation = useMutation({
    mutationFn: () => papersApi.delete(params.paperId),
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      setDeleteConfirmationOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["papers"] }),
        queryClient.invalidateQueries({ queryKey: ["exams", "practice"] }),
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
    if (!isFocused) return
    resultOpeningRef.current = false
    setIsOpeningResult(false)
    void paperQuery.refetch()
    if (paper && !isTeacherReference) void attemptsQuery.refetch()
  }, [isFocused, isTeacherReference, params.paperId])

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderAction
          label={isTeacherReference ? 'Download paper PDF' : 'Paper actions'}
          icon={isTeacherReference ? 'download-outline' : 'ellipsis-horizontal'}
          busy={downloadMutation.isPending || retestMutation.isPending || deleteMutation.isPending}
          onPress={isTeacherReference ? () => downloadMutation.mutate() : () => setActionMenuOpen(true)}
        />
      ),
    });
  }, [
    canDelete,
    deleteMutation.isPending,
    downloadMutation.isPending,
    isTeacherReference,
    navigation,
    params.paperId,
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
        style={styles.root}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: hPad,
            paddingBottom: layout.bottomTabHeight + insets.bottom + spacing[10],
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Paper info card */}
        <View style={styles.infoCard}>
          <Text style={styles.paperTitle}>{paper.title}</Text>
          {paper.subtitle ? (
            <Text style={styles.paperSub}>{paper.subtitle}</Text>
          ) : null}

          <View style={styles.chipRow}>
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
            <TouchableOpacity
              style={[styles.downloadBtn, downloadMutation.isPending && styles.primaryBtnDisabled]}
              onPress={() => downloadMutation.mutate()}
              activeOpacity={0.82}
              disabled={downloadMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Download teacher reference PDF"
            >
              {downloadMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="download-outline" size={24} color={colors.accent} />
              )}
              <View style={styles.downloadCopy}>
                <Text style={styles.downloadTitle}>Download teacher reference PDF</Text>
                <Text style={styles.downloadMeta}>Save the question paper without answers.</Text>
              </View>
            </TouchableOpacity>
          ) : canPublish ? (
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                publishMutation.isPending && styles.primaryBtnDisabled,
              ]}
              onPress={() => publishMutation.mutate()}
              activeOpacity={0.82}
              disabled={publishMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Publish paper to your class"
              accessibilityState={{
                busy: publishMutation.isPending,
                disabled: publishMutation.isPending,
              }}
            >
              {publishMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="send" size={16} color={colors.white} />
              )}
              <Text style={styles.primaryBtnText}>
                {publishMutation.isPending ? "Publishing…" : "Publish to Class"}
              </Text>
            </TouchableOpacity>
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

        {/* Questions */}
        <Text style={styles.sectionLabel}>
          Questions · {paper.questions.length}
        </Text>
        {paper.questions.map((q, index) => (
          <View key={q.id} style={[styles.questionCard, shadows.xs]}>
            <View style={styles.questionHeader}>
              <View style={styles.questionNum}>
                <Text style={styles.questionNumText}>
                  Q{q.question_number || index + 1}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.questionMeta}>
                  <View style={styles.qtypeBadge}>
                    <Text style={styles.qtypeText}>
                      {Q_TYPE_LABELS[q.question_type] ?? q.question_type}
                    </Text>
                  </View>
                  <View style={styles.marksBadge}>
                    <Text style={styles.marksText}>
                      {q.marks} {q.marks === 1 ? "mark" : "marks"}
                    </Text>
                  </View>
                  {q.difficulty ? (
                    <View
                      style={[
                        styles.diffBadge,
                        q.difficulty === "hard" && {
                          backgroundColor: colors.dangerBg,
                        },
                        q.difficulty === "medium" && {
                          backgroundColor: colors.warningBg,
                        },
                        q.difficulty === "easy" && {
                          backgroundColor: colors.successBg,
                        },
                      ]}
                    >
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
                  ) : null}
                </View>
              </View>
            </View>
            {q.visual_payload ? (
              <QuestionVisual visual={q.visual_payload} />
            ) : null}
            {shouldShowQuestionStemText(q.visual_payload, "interactive") ? (
              <LatexText value={q.question_text} style={styles.questionText} />
            ) : null}
            {q.options && Array.isArray(q.options) && (
              <View style={styles.optionsList}>
                {(q.options as Array<{ id: string; text: string }>).map(
                  (opt, i) => (
                    <View key={opt.id} style={styles.optionRow}>
                      <View style={styles.optionLetter}>
                        <Text style={styles.optionLetterText}>
                          {String.fromCharCode(65 + i)}
                        </Text>
                      </View>
                      <LatexText
                        value={opt.text}
                        style={styles.optionText}
                        containerStyle={styles.optionTextContainer}
                      />
                    </View>
                  ),
                )}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

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
                downloadMutation.mutate();
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
  root: { flex: 1, backgroundColor: colors.surface1 },
  content: { paddingTop: spacing[4], gap: spacing[3] },
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

  infoCard: {
    paddingHorizontal: 0,
    paddingVertical: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
    gap: spacing[3],
  },
  paperTitle: {
    fontSize: 23,
    lineHeight: 29,
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

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.subtle,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: spacing[2],
  },
  questionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing[4],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing[3],
  },
  questionHeader: {
    flexDirection: "row",
    gap: spacing[3],
    alignItems: "flex-start",
  },
  questionNum: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.accentLight,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  questionNumText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.accentStrong,
  },
  questionMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  qtypeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.surface2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  qtypeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
  },
  marksBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.accentLight,
  },
  marksText: { fontSize: 10, fontWeight: "700", color: colors.accentStrong },
  diffBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  diffText: { fontSize: 10, fontWeight: "700", textTransform: "capitalize" },
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
