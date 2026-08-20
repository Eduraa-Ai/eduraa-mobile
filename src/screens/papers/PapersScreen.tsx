import React, { useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PapersStackParamList } from "../../navigation";
import { papersApi } from "../../api/papers";
import { examsApi } from "../../api/exams";
import { useAuthStore } from "../../stores/authStore";
import type { PaperListItem, StudentExamRead } from "../../types";
import { colors } from "../../theme/colors";
import { fonts } from "../../theme/fonts";
import { gradients } from "../../theme/gradients";
import { radius, shadows, spacing } from "../../theme/spacing";
import { Screen } from "../../components/ui/Screen";

type Nav = NativeStackNavigationProp<PapersStackParamList, "PapersList">;
type PaperScopeTab = "assigned" | "mine";
const papersHeaderImage = require("../../../assets/papers-header-bg.png");

const subjectVisuals = [
  {
    label: "Mathematics",
    keys: ["math", "mathematics", "algebra", "geometry", "calculus"],
    uri: "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Physics",
    keys: ["physics", "science"],
    uri: "https://images.unsplash.com/photo-1581093450021-4a7360e9a6b5?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Chemistry",
    keys: ["chemistry", "chemical"],
    uri: "https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Biology",
    keys: ["biology", "bio", "zoology", "botany", "anatomy"],
    uri: "https://images.unsplash.com/photo-1530026405186-ed1f139313f8?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "Computer Science",
    keys: ["computer", "coding", "programming", "technology", "ict"],
    uri: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
  },
  {
    label: "English",
    keys: ["english", "language", "literature", "grammar"],
    uri: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=900&q=80",
  },
];

const fallbackSubjectPhoto =
  "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=900&q=80";

function matchSubjectVisual(value: string) {
  const normalized = value.trim().toLowerCase();
  return subjectVisuals.find((visual) =>
    visual.keys.some((key) => normalized.includes(key)),
  );
}

function hasSpecificSubject(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return Boolean(normalized && normalized !== "subject");
}

function resolvePaperSubject(item: PaperListItem) {
  const subjectContext = [item.subject_name, item.title, item.category]
    .filter(Boolean)
    .join(" ");
  const matchedVisual = matchSubjectVisual(subjectContext);
  const label = hasSpecificSubject(item.subject_name)
    ? item.subject_name!.trim()
    : (matchedVisual?.label ?? "Subject");

  return {
    label,
    photoUri: matchedVisual?.uri ?? fallbackSubjectPhoto,
  };
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PapersHeaderTitle() {
  return (
    <View style={styles.navTitleWrap}>
      <Text style={styles.navTitle}>Papers</Text>
      <Text style={styles.navSubtitle}>Practice library</Text>
    </View>
  );
}

function PapersPhotoHeader() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.photoHeaderWrap, { paddingTop: insets.top }]}>
      <View style={styles.headerImage}>
        <Image
          source={papersHeaderImage}
          resizeMode="stretch"
          style={styles.headerPhoto}
        />
        <LinearGradient
          colors={[
            "rgba(2,6,23,0.88)",
            "rgba(15,23,42,0.28)",
            "rgba(194,65,12,0)",
          ]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.headerWarmVeil} />
        <View style={styles.photoHeaderContent}>
          <PapersHeaderTitle />
          <View style={styles.photoHeaderIcon}>
            <Ionicons
              name="document-text-outline"
              size={20}
              color={colors.white}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function GeneratePanel({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.generateCard}>
      <Text style={styles.generateTitle}>Generate your next paper</Text>
      <Text style={styles.generateBody}>
        Use the guided mobile flow to build a paper tuned to your current prep.
      </Text>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        style={styles.generateButtonWrap}
      >
        <LinearGradient
          colors={[...gradients.hero]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.generateButton}
        >
          <Ionicons name="sparkles-outline" size={18} color={colors.white} />
          <Text style={styles.generateButtonText}>Create paper</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

function PaperTile({
  item,
  onPress,
}: {
  item: PaperListItem;
  onPress: () => void;
}) {
  const questionCount = item.question_count
    ? `${item.question_count}Q`
    : "Paper";
  const duration = item.duration_minutes
    ? `${item.duration_minutes} min`
    : "Practice";
  const subject = resolvePaperSubject(item);
  const meta = `${subject.label} - ${item.total_marks} marks - ${duration}`;
  const attemptLabel = item.is_submitted_by_me ? "Attempted" : item.status;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={styles.paperTile}
    >
      <View style={styles.tileVisual}>
        <Image
          source={{ uri: subject.photoUri }}
          resizeMode="cover"
          style={styles.tilePhoto}
        />
        <LinearGradient
          colors={[
            "rgba(15,23,42,0.76)",
            "rgba(15,23,42,0.28)",
            "rgba(194,65,12,0.24)",
          ]}
          start={{ x: 0, y: 0.45 }}
          end={{ x: 1, y: 0.45 }}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.28)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
        <View style={styles.tileIcon}>
          <Ionicons
            name="document-text-outline"
            size={22}
            color={colors.white}
          />
        </View>
        <View style={styles.tileMetric}>
          <Text style={styles.tileMetricValue}>{questionCount}</Text>
          <Text style={styles.tileMetricLabel}>
            {formatDate(item.created_at)}
          </Text>
        </View>
      </View>

      <View style={styles.tileBody}>
        <View style={styles.tileBodyTop}>
          <View style={styles.tileCopy}>
            <Text style={styles.tileTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.tileSubtitle} numberOfLines={1}>
              {meta}
            </Text>
          </View>
          <View style={styles.tileChevron}>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={colors.textSecondary}
            />
          </View>
        </View>
        <View style={styles.tileFooter}>
          <View style={styles.tileChip}>
            <Ionicons
              name="albums-outline"
              size={14}
              color={colors.accentStrong}
            />
            <Text style={styles.tileChipText}>{subject.label}</Text>
          </View>
          <View style={[styles.tileChip, styles.tileStatusChip]}>
            <Ionicons
              name="checkmark-circle-outline"
              size={14}
              color={colors.success}
            />
            <Text style={[styles.tileChipText, styles.tileStatusText]}>
              {attemptLabel}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function PaperEmpty({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Ionicons
          name="document-text-outline"
          size={22}
          color={colors.accentStrong}
        />
      </View>
      <Text style={styles.emptyTitle}>No papers yet</Text>
      <Text style={styles.emptyBody}>
        Create your first Eduraa paper and it will appear here ready for
        practice.
      </Text>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        style={styles.emptyButton}
      >
        <Text style={styles.emptyButtonText}>Create first paper</Text>
      </TouchableOpacity>
    </View>
  );
}

function ExamEmpty() {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Ionicons name="school-outline" size={22} color={colors.accentStrong} />
      </View>
      <Text style={styles.emptyTitle}>No exams yet</Text>
      <Text style={styles.emptyBody}>
        When your teacher schedules an exam it appears here with the papers to
        attempt. Until then, build your own under My practice.
      </Text>
    </View>
  );
}

function ExamTile({
  exam,
  onOpenPaper,
}: {
  exam: StudentExamRead;
  onOpenPaper: (paperId: string) => void;
}) {
  const scheduled = exam.exam_date
    ? formatDate(exam.exam_date)
    : "Date pending";

  return (
    <View style={styles.examCard}>
      <View style={styles.examHeader}>
        <View style={styles.examIcon}>
          <Ionicons name="school" size={18} color={colors.accentStrong} />
        </View>
        <View style={styles.examHeaderCopy}>
          <Text style={styles.examTitle} numberOfLines={2}>
            {exam.name}
          </Text>
          <Text style={styles.examMeta} numberOfLines={1}>
            {[exam.subject_name, exam.teacher_name, scheduled]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      </View>
      {exam.papers.map((paper) => (
        <TouchableOpacity
          key={paper.id}
          activeOpacity={0.88}
          onPress={() => onOpenPaper(paper.id)}
          style={styles.examPaperRow}
          accessibilityRole="button"
          accessibilityLabel={`Attempt ${paper.title}`}
        >
          <View style={styles.examPaperCopy}>
            <Text style={styles.examPaperTitle} numberOfLines={2}>
              {paper.title}
            </Text>
            <Text style={styles.examPaperMeta}>
              {paper.total_marks} marks
              {paper.is_submitted_by_me ? " · Attempted" : ""}
            </Text>
          </View>
          <Ionicons
            name={
              paper.is_submitted_by_me
                ? "checkmark-circle"
                : "arrow-forward-circle"
            }
            size={22}
            color={
              paper.is_submitted_by_me ? colors.success : colors.accentStrong
            }
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function PapersScreen() {
  const navigation = useNavigation<Nav>();
  const role = useAuthStore((state) => state.user?.role);
  // A published paper is not yet assigned work: it only reaches a class once the
  // teacher rolls it into an exam. School students therefore see exams here,
  // never the raw published-paper feed, which would leak unreleased papers.
  const hasExams = role === "student";
  const [scopeTab, setScopeTab] = useState<PaperScopeTab>("assigned");
  const showingExams = hasExams && scopeTab === "assigned";

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const papersQuery = useQuery({
    queryKey: ["papers", hasExams ? "mine" : "default"],
    queryFn: () =>
      papersApi.list({
        skip: 0,
        limit: 50,
        scope: hasExams ? "mine" : undefined,
      }),
    enabled: !showingExams,
  });

  const examsQuery = useQuery({
    queryKey: ["exams", "student"],
    queryFn: examsApi.listStudentExams,
    enabled: showingExams,
  });

  const activeQuery = showingExams ? examsQuery : papersQuery;
  const papers = papersQuery.data?.items ?? [];
  const exams = examsQuery.data ?? [];
  const openGenerate = () => navigation.navigate("GeneratePaper");

  return (
    <View style={styles.root}>
      <PapersPhotoHeader />
      <Screen contentStyle={styles.screenContent}>
        <GeneratePanel onPress={openGenerate} />

        {hasExams ? (
          <View style={styles.scopeTabs}>
            {(
              [
                { key: "assigned", label: "Exams" },
                { key: "mine", label: "My practice" },
              ] as const
            ).map((tab) => {
              const active = scopeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  activeOpacity={0.88}
                  onPress={() => setScopeTab(tab.key)}
                  style={[styles.scopeTab, active && styles.scopeTabActive]}
                >
                  <Text
                    style={[
                      styles.scopeTabText,
                      active && styles.scopeTabTextActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {activeQuery.isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accentStrong} />
            <Text style={styles.loadingText}>
              {showingExams ? "Loading exams" : "Loading papers"}
            </Text>
          </View>
        ) : activeQuery.isError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>
              {showingExams ? "Could not load exams" : "Could not load papers"}
            </Text>
            <Text style={styles.errorBody}>
              Refresh the library and try again.
            </Text>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => activeQuery.refetch()}
              style={styles.retryButton}
            >
              <Text style={styles.retry}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : showingExams ? (
          <View style={styles.listBlock}>
            {exams.length > 0 ? (
              <View style={styles.listHeader}>
                <Text style={styles.listEyebrow}>Assigned exams</Text>
                <Text style={styles.listCount}>
                  {exams.length} exam{exams.length === 1 ? "" : "s"}
                </Text>
              </View>
            ) : null}
            <FlatList
              data={exams}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ExamTile
                  exam={item}
                  onOpenPaper={(paperId) =>
                    navigation.navigate("AttemptPaper", {
                      paperId,
                      examId: item.id,
                    })
                  }
                />
              )}
              ItemSeparatorComponent={() => (
                <View style={{ height: spacing[4] }} />
              )}
              scrollEnabled={false}
              ListEmptyComponent={<ExamEmpty />}
            />
          </View>
        ) : (
          <View style={styles.listBlock}>
            {papers.length > 0 ? (
              <View style={styles.listHeader}>
                <Text style={styles.listEyebrow}>Library</Text>
                <Text style={styles.listCount}>{papers.length} saved</Text>
              </View>
            ) : null}
            <FlatList
              data={papers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <PaperTile
                  item={item}
                  onPress={() =>
                    navigation.navigate("PaperDetail", { paperId: item.id })
                  }
                />
              )}
              ItemSeparatorComponent={() => (
                <View style={{ height: spacing[4] }} />
              )}
              scrollEnabled={false}
              ListEmptyComponent={<PaperEmpty onPress={openGenerate} />}
            />
          </View>
        )}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenContent: {
    paddingTop: spacing[4],
    paddingBottom: 112,
  },
  scopeTabs: {
    flexDirection: "row",
    gap: spacing[2],
    marginTop: spacing[5],
  },
  scopeTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing[3],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  scopeTabActive: {
    borderColor: colors.accentStrong,
    backgroundColor: colors.accentSoft,
  },
  scopeTabText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.textMuted,
  },
  scopeTabTextActive: {
    fontFamily: fonts.displaySemibold,
    color: colors.accentStrong,
  },
  examCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    padding: spacing[4],
    gap: spacing[3],
    ...shadows.sm,
  },
  examHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  examIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSoft,
  },
  examHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  examTitle: {
    fontFamily: fonts.displaySemibold,
    fontSize: 16,
    color: colors.text,
  },
  examMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  examPaperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  examPaperCopy: {
    flex: 1,
    gap: 2,
  },
  examPaperTitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.text,
  },
  examPaperMeta: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  navTitleWrap: {
    gap: 1,
  },
  photoHeaderWrap: {
    height: 112,
    overflow: "hidden",
    backgroundColor: colors.slate[950],
  },
  headerImage: {
    flex: 1,
    justifyContent: "flex-end",
  },
  headerPhoto: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    opacity: 0.98,
  },
  headerWarmVeil: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: "rgba(249,115,22,0.72)",
  },
  photoHeaderContent: {
    minHeight: 76,
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[3],
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  photoHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
  },
  navTitle: {
    color: colors.white,
    fontFamily: fonts.displayBold,
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: 0,
  },
  navSubtitle: {
    color: "rgba(255,255,255,0.76)",
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.2,
    lineHeight: 12,
    textTransform: "uppercase",
  },
  generateCard: {
    borderRadius: radius["2xl"],
    borderWidth: 1,
    borderColor: colors.borderBrand,
    backgroundColor: colors.backgroundElevated,
    padding: spacing[6],
    gap: spacing[3],
    ...shadows.sm,
  },
  generateTitle: {
    color: colors.text,
    fontFamily: fonts.displayBold,
    fontSize: 27,
    lineHeight: 32,
    letterSpacing: 0,
  },
  generateBody: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  generateButtonWrap: {
    marginTop: spacing[3],
    borderRadius: radius.full,
  },
  generateButton: {
    minHeight: 68,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing[2],
    paddingHorizontal: spacing[6],
  },
  generateButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 18,
    letterSpacing: 0,
  },
  loading: {
    minHeight: 150,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[3],
  },
  loadingText: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  errorCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    padding: spacing[5],
    gap: spacing[2],
  },
  errorTitle: {
    color: colors.danger,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  errorBody: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  retryButton: {
    alignSelf: "flex-start",
    marginTop: spacing[2],
    borderRadius: radius.full,
    backgroundColor: colors.accentSurfaceStrong,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  retry: {
    color: colors.accentStrong,
    fontFamily: fonts.semibold,
    fontSize: 13,
  },
  listBlock: {
    gap: spacing[3],
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[1],
  },
  listEyebrow: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  listCount: {
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 12,
  },
  paperTile: {
    borderRadius: radius["2xl"],
    borderWidth: 1,
    borderColor: colors.borderBrand,
    backgroundColor: colors.backgroundElevated,
    overflow: "hidden",
    ...shadows.sm,
  },
  tileVisual: {
    minHeight: 128,
    padding: spacing[5],
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  tilePhoto: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  tileGlowOne: {
    position: "absolute",
    right: -26,
    top: -20,
    width: 120,
    height: 96,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  tileGlowTwo: {
    position: "absolute",
    left: 48,
    bottom: -42,
    width: 170,
    height: 112,
    borderRadius: 86,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  tileMetric: {
    alignItems: "flex-end",
  },
  tileMetricValue: {
    color: colors.white,
    fontFamily: fonts.displayBold,
    fontSize: 24,
    letterSpacing: 0,
  },
  tileMetricLabel: {
    color: "rgba(255,255,255,0.82)",
    fontFamily: fonts.semibold,
    fontSize: 11,
    textTransform: "uppercase",
  },
  tileBody: {
    padding: spacing[5],
    gap: spacing[4],
  },
  tileBodyTop: {
    flexDirection: "row",
    gap: spacing[3],
    alignItems: "center",
  },
  tileCopy: {
    flex: 1,
    gap: spacing[1],
  },
  tileTitle: {
    color: colors.text,
    fontFamily: fonts.displaySemibold,
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: 0,
  },
  tileSubtitle: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  tileChevron: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.backgroundTint,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  tileFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  tileChip: {
    minHeight: 32,
    maxWidth: "100%",
    borderRadius: radius.full,
    backgroundColor: colors.accentSurface,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    paddingHorizontal: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
  },
  tileStatusChip: {
    backgroundColor: colors.successSurface,
    borderColor: colors.successSurface,
  },
  tileChipText: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 11,
    textTransform: "capitalize",
  },
  tileStatusText: {
    color: colors.success,
  },
  emptyCard: {
    borderRadius: radius["2xl"],
    borderWidth: 1,
    borderColor: colors.borderBrand,
    backgroundColor: colors.backgroundElevated,
    padding: spacing[6],
    alignItems: "flex-start",
    gap: spacing[3],
    ...shadows.sm,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentSurfaceStrong,
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: fonts.displayBold,
    fontSize: 22,
    letterSpacing: 0,
  },
  emptyBody: {
    color: colors.textSecondary,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
  },
  emptyButton: {
    marginTop: spacing[1],
    borderRadius: radius.full,
    backgroundColor: colors.slate[950],
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
  },
  emptyButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
});
