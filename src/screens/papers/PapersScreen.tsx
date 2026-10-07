import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import type { PapersStackParamList } from "../../navigation";
import { papersApi } from "../../api/papers";
import { examsApi } from "../../api/exams";
import { useAuthStore } from "../../stores/authStore";
import type { PaperListItem, StudentExamRead } from "../../types";
import { colors, radius, spacing, typography } from "../../theme";
import {
  AnimatedButton,
  EmptyState,
  ErrorState,
  SectionHeading,
  SegmentedTabs,
  SkeletonCard,
  StatusPill,
} from "../../components/ui";
import { Screen } from "../../components/ui/Screen";

type Nav = NativeStackNavigationProp<PapersStackParamList, "PapersList">;
type PaperScopeTab = "assigned" | "mine";

const subjectKeys = [
  { label: "Mathematics", keys: ["math", "mathematics", "algebra", "geometry", "calculus"] },
  { label: "Physics", keys: ["physics", "science"] },
  { label: "Chemistry", keys: ["chemistry", "chemical"] },
  { label: "Biology", keys: ["biology", "bio", "zoology", "botany", "anatomy"] },
  { label: "Computer Science", keys: ["computer", "coding", "programming", "technology", "ict"] },
  { label: "English", keys: ["english", "language", "literature", "grammar"] },
];

function hasSpecificSubject(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return Boolean(normalized && normalized !== "subject");
}

function resolvePaperSubject(item: PaperListItem) {
  if (hasSpecificSubject(item.subject_name)) return item.subject_name!.trim();
  const context = [item.subject_name, item.title, item.category].filter(Boolean).join(" ").toLowerCase();
  return subjectKeys.find((subject) => subject.keys.some((key) => context.includes(key)))?.label ?? "Subject";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PaperRow({ item, first, onPress }: { item: PaperListItem; first: boolean; onPress: () => void }) {
  const meta = [
    resolvePaperSubject(item),
    `${item.total_marks} marks`,
    item.duration_minutes ? `${item.duration_minutes} min` : null,
    formatDate(item.created_at),
  ].filter(Boolean).join(" · ");
  const attempted = item.is_submitted_by_me;
  const status = item.is_submitted_by_me ? "Attempted" : item.status.charAt(0).toUpperCase() + item.status.slice(1);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${meta}. ${status}`}
      style={({ pressed }) => [styles.row, !first && styles.rowDivider, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}>
        <Ionicons name="document-text-outline" size={19} color={colors.iconInk} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>{meta}</Text>
        <StatusPill
          label={status}
          tone={attempted || item.status === "published" ? "success" : "neutral"}
          style={styles.rowPill}
        />
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.textSoft} />
    </Pressable>
  );
}

function ExamCard({ exam, onOpenPaper }: { exam: StudentExamRead; onOpenPaper: (paperId: string) => void }) {
  const scheduled = exam.exam_date ? formatDate(exam.exam_date) : "Date pending";

  return (
    <View style={styles.listCard}>
      <View style={styles.examHeader}>
        <View style={styles.rowIcon}>
          <Ionicons name="school-outline" size={19} color={colors.iconInk} />
        </View>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle} numberOfLines={2}>{exam.name}</Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {[exam.subject_name, exam.teacher_name, scheduled].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>
      {exam.papers.map((paper) => (
        <Pressable
          key={paper.id}
          onPress={() => onOpenPaper(paper.id)}
          accessibilityRole="button"
          accessibilityLabel={`Attempt ${paper.title}`}
          style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.rowPressed]}
        >
          <View style={styles.rowCopy}>
            <Text style={styles.examPaperTitle} numberOfLines={2}>{paper.title}</Text>
            <Text style={styles.rowMeta}>{paper.total_marks} marks</Text>
          </View>
          {paper.is_submitted_by_me ? (
            <StatusPill label="Attempted" tone="success" icon="checkmark" />
          ) : (
            <Ionicons name="chevron-forward" size={17} color={colors.textSoft} />
          )}
        </Pressable>
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
      <Screen contentStyle={styles.screenContent}>
        <AnimatedButton
          label="Create paper"
          icon={<Ionicons name="sparkles-outline" size={18} color={colors.white} />}
          onPress={openGenerate}
        />

        {hasExams ? (
          <SegmentedTabs
            accessibilityLabel="Paper sections"
            tabs={[
              { id: "assigned", label: "Exams" },
              { id: "mine", label: "My practice" },
            ]}
            value={scopeTab}
            onChange={setScopeTab}
          />
        ) : null}

        {activeQuery.isLoading ? (
          <View style={styles.listBlock}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : activeQuery.isError ? (
          <ErrorState
            title={showingExams ? "Could not load exams" : "Could not load papers"}
            message="Check your connection and try again."
            actionLabel="Try again"
            onAction={() => void activeQuery.refetch()}
          />
        ) : showingExams ? (
          <View style={styles.listBlock}>
            {exams.length > 0 ? (
              <>
                <SectionHeading title="Assigned exams" meta={`${exams.length} exam${exams.length === 1 ? "" : "s"}`} />
                {exams.map((exam) => (
                  <ExamCard
                    key={exam.id}
                    exam={exam}
                    onOpenPaper={(paperId) => navigation.navigate("AttemptPaper", { paperId, examId: exam.id })}
                  />
                ))}
              </>
            ) : (
              <EmptyState
                icon="school-outline"
                title="No exams yet"
                body="When your teacher schedules an exam it appears here. Until then, build your own under My practice."
              />
            )}
          </View>
        ) : (
          <View style={styles.listBlock}>
            {papers.length > 0 ? (
              <>
                <SectionHeading title="Library" meta={`${papers.length} saved`} />
                <View style={styles.listCard}>
                  {papers.map((item, index) => (
                    <PaperRow
                      key={item.id}
                      item={item}
                      first={index === 0}
                      onPress={() => navigation.navigate("PaperDetail", { paperId: item.id })}
                    />
                  ))}
                </View>
              </>
            ) : (
              <EmptyState
                icon="document-text-outline"
                title="No papers yet"
                body="Create your first paper and it will appear here."
              />
            )}
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
    gap: spacing[5],
  },
  listBlock: {
    gap: spacing[3],
  },
  listCard: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    paddingHorizontal: spacing[4],
    overflow: "hidden",
  },
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.iconSurface,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    ...typography.roles.rowTitle,
    color: colors.nav,
  },
  rowMeta: {
    ...typography.roles.caption,
    color: colors.textMuted,
  },
  rowPill: {
    marginTop: spacing[1],
  },
  examHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
  },
  examPaperTitle: {
    ...typography.roles.body,
    fontFamily: typography.fonts.bodySemibold,
    color: colors.text,
  },
});
