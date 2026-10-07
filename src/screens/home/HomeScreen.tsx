import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { analyticsApi } from "../../api/analytics";
import { warmPriorityLesson } from "../../api/agenticLearning";
import { resolveMobileLanding } from "../../auth/landing";
import { SectionHeading, SummaryStrip } from "../../components/ui";
import { useAuthStore } from "../../stores/authStore";
import { colors, radius, spacing, typography } from "../../theme";
import type { DashboardSubmission, StudentDashboardLab } from "../../types";
import { subjectSymbol, subjectTone } from "../learning/competitiveExamUtils";
import WorkspaceScreen from "../workspace/WorkspaceScreen";

const safePercent = (score?: number | null, max?: number | null) => {
  if (score == null || max == null || max <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((score / max) * 100)));
};

const formatDate = (value?: string | null) => {
  if (!value) return "Date pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date pending";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const latestFirst = (items: DashboardSubmission[]) =>
  items.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

const masteryTone = (mastery?: number | null) => {
  if (mastery == null) return colors.textMuted;
  if (mastery >= 80) return colors.success;
  if (mastery >= 58) return colors.warning;
  return colors.danger;
};

const JEE_SUBJECTS = ["Physics", "Chemistry", "Mathematics"] as const;

/** Per-subject readiness for JEE learners, from chapter mastery. */
function useSubjectReadiness(analytics?: StudentDashboardLab) {
  return useMemo(() => {
    const subjects = JEE_SUBJECTS.map((name) => {
      const chapters = (analytics?.chapter_mastery ?? []).filter((chapter) =>
        (chapter.subject ?? "").toLowerCase().includes(name.toLowerCase()),
      );
      const avg = chapters.length
        ? Math.round(chapters.reduce((sum, chapter) => sum + (chapter.mastery ?? 0), 0) / chapters.length)
        : 0;
      return { name, avg, count: chapters.length, tone: subjectTone(name), symbol: subjectSymbol(name) };
    });
    const withData = subjects.filter((subject) => subject.count > 0);
    const overall = withData.length
      ? Math.round(withData.reduce((sum, subject) => sum + subject.avg, 0) / withData.length)
      : null;
    return { subjects, overall };
  }, [analytics?.chapter_mastery]);
}

/**
 * Learner Home. Students get the same grouped Home as staff (header, Learn /
 * School / Progress / More, tool rows) with their Continue row and stats on
 * top, and recent activity (plus JEE subject readiness) below the tools.
 */
export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const competitive = user ? resolveMobileLanding(user) === "competitive_learner" : false;

  // Start building the learner's most likely concept lesson while they read
  // Home, so tapping Continue does not wait on generation. No-ops once cached.
  const warmClient = useQueryClient();
  const isLearner = user?.role === "student" || user?.role === "b2c_student";
  useEffect(() => {
    if (!isLearner) return;
    void warmPriorityLesson(warmClient);
  }, [isLearner, warmClient]);

  const { data: analytics, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["analytics", "student-dashboard"],
    queryFn: analyticsApi.getStudentDashboard,
    retry: 0,
  });

  // Refresh when the learner returns to Home, but not on first mount.
  const hasFocusedHome = useRef(false);
  useFocusEffect(useCallback(() => {
    if (hasFocusedHome.current) void refetch();
    hasFocusedHome.current = true;
  }, [refetch]));

  const focusChapter = useMemo(
    () => (analytics?.chapter_mastery ?? []).slice().sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0))[0],
    [analytics],
  );
  const readiness = useSubjectReadiness(analytics);
  const generatedPapers = analytics?.summary?.generated_papers ?? 0;
  const attempts = analytics?.summary?.total_submissions ?? 0;
  const checked = analytics?.summary?.total_checked ?? 0;

  const activity = useMemo(() => {
    const exams = (analytics?.upcoming_exams ?? [])
      .slice()
      .sort((a, b) => new Date(a.date ?? "").getTime() - new Date(b.date ?? "").getTime())
      .slice(0, 2)
      .map((exam) => ({
        id: `exam-${exam.id}`,
        icon: "calendar-clear-outline" as keyof typeof Ionicons.glyphMap,
        title: exam.name,
        meta: `${formatDate(exam.date)} · ${exam.subject || exam.cat || "Exam"}`,
        tone: colors.info,
        accessibilityLabel: `Open exam ${exam.name}`,
        onPress: () => navigation.navigate("Exams"),
        disabled: false,
        trailing: "View",
      }));
    const results = latestFirst(analytics?.submissions ?? []).slice(0, 3).map((submission, index) => {
      const pct = safePercent(submission.score, submission.max_score);
      const canOpen = Boolean(submission.id);
      return {
        id: `sub-${submission.id ?? index}`,
        icon: "checkmark-done-outline" as keyof typeof Ionicons.glyphMap,
        title: submission.paper,
        meta: `${submission.subject || "Subject"} · ${pct != null ? `${pct}%` : "Pending review"}`,
        tone: masteryTone(pct),
        accessibilityLabel: canOpen ? `Open result for ${submission.paper}` : `${submission.paper} result is not available yet`,
        onPress: () => {
          if (submission.id) navigation.navigate("Results", { screen: "ResultDetail", params: { checkedPaperId: submission.id } });
        },
        disabled: !canOpen,
        trailing: canOpen ? "View" : "Pending",
      };
    });
    return [...exams, ...results].slice(0, 4);
  }, [analytics, navigation]);

  const hasActivity = generatedPapers + attempts + checked > 0;

  const lead = isLoading ? null : (
    <View style={styles.leadStack}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={focusChapter ? `Open learning plan for ${focusChapter.chapter}` : "Create a practice paper"}
        onPress={() => focusChapter
          ? navigation.navigate("AgenticLearning")
          : navigation.navigate("Papers", { screen: "GeneratePaper" })}
        style={({ pressed }) => [styles.continueRow, pressed && styles.pressed]}
      >
        <View style={styles.continueIcon}>
          <Ionicons name={focusChapter ? "sparkles-outline" : "flash-outline"} size={18} color={colors.iconInk} />
        </View>
        <View style={styles.continueCopy}>
          <Text style={styles.continueLabel}>{focusChapter ? "Continue learning" : "Start here"}</Text>
          <Text style={styles.continueTitle} numberOfLines={1}>
            {focusChapter ? focusChapter.chapter : "Create a practice paper"}
          </Text>
        </View>
        {focusChapter?.mastery != null ? (
          <Text style={styles.continueMeta}>{Math.round(focusChapter.mastery)}%</Text>
        ) : null}
        <Ionicons name="arrow-forward" size={18} color={colors.accent} />
      </Pressable>
      {hasActivity || competitive ? (
        <SummaryStrip
          stats={[
            ...(competitive ? [{ label: "Readiness", value: readiness.overall != null ? `${readiness.overall}%` : "—" }] : []),
            { label: "Papers", value: String(generatedPapers) },
            { label: "Attempts", value: String(attempts) },
            { label: "Results", value: String(checked) },
          ]}
        />
      ) : null}
    </View>
  );

  const footer = isLoading ? null : (
    <View style={styles.footer}>
      {competitive ? (
        <View style={styles.section}>
          <SectionHeading title="Subject readiness" meta={readiness.overall != null ? `${readiness.overall}% overall` : "No data yet"} />
          <View style={styles.subjectRow}>
            {readiness.subjects.map((subject) => (
              <Pressable
                key={subject.name}
                accessibilityRole="button"
                accessibilityLabel={`Open ${subject.name} learning resources`}
                onPress={() => navigation.navigate("CompetitiveSubject", { subjectName: subject.name })}
                style={({ pressed }) => [styles.subjectCard, pressed && styles.pressed]}
              >
                <View style={[styles.subjectBadge, { backgroundColor: `${subject.tone}1A` }]}>
                  <Text style={[styles.subjectBadgeText, { color: subject.tone }]}>{subject.symbol}</Text>
                </View>
                <Text style={styles.subjectName} numberOfLines={1}>{subject.name}</Text>
                <View style={styles.subjectTrack}>
                  <View style={[styles.subjectFill, { width: `${Math.max(6, subject.avg)}%`, backgroundColor: subject.tone }]} />
                </View>
                <Text style={styles.subjectMeta}>{subject.count > 0 ? `${subject.avg}% · ${subject.count} ch` : "Not started"}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeading title="Recent activity" meta={activity.length ? "Exams and results" : "No activity yet"} />
        {activity.length ? (
          <View style={styles.activityList}>
            {activity.map((row, index) => (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                accessibilityLabel={row.accessibilityLabel}
                accessibilityState={{ disabled: row.disabled }}
                disabled={row.disabled}
                onPress={row.onPress}
                style={({ pressed }) => [styles.activityRow, index > 0 && styles.activityDivider, pressed && styles.pressed]}
              >
                <View style={[styles.activityIcon, { backgroundColor: `${row.tone}16` }]}>
                  <Ionicons name={row.icon} size={17} color={row.tone} />
                </View>
                <View style={styles.activityCopy}>
                  <Text style={styles.activityTitle} numberOfLines={1}>{row.title}</Text>
                  <Text style={styles.activityMeta} numberOfLines={1}>{row.meta}</Text>
                </View>
                <Text style={[styles.activityAction, row.disabled && styles.activityActionPending]}>{row.trailing}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyLine}>Assigned exams, checked papers and recent attempts will appear here.</Text>
        )}
      </View>
    </View>
  );

  return (
    <WorkspaceScreen
      lead={lead}
      footer={footer}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.8 },
  leadStack: { gap: spacing[2] },
  continueRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    backgroundColor: colors.backgroundElevated,
  },
  continueIcon: { width: 38, height: 38, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.iconSurface },
  continueCopy: { flex: 1, minWidth: 0, gap: 1 },
  continueLabel: { ...typography.roles.caption, fontSize: 11.5, color: colors.textMuted },
  continueTitle: { ...typography.roles.rowTitle, color: colors.nav },
  continueMeta: { ...typography.roles.caption, fontFamily: typography.fonts.bodyBold, color: colors.textSecondary },
  footer: { gap: spacing[4] },
  section: { gap: spacing[2] },
  subjectRow: { flexDirection: "row", gap: spacing[2] },
  subjectCard: {
    flex: 1,
    minWidth: 0,
    gap: 6,
    padding: spacing[3],
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  subjectBadge: { width: 32, height: 32, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  subjectBadgeText: { fontFamily: typography.fonts.bodyBold, fontSize: 14 },
  subjectName: { ...typography.roles.caption, fontFamily: typography.fonts.bodyBold, fontSize: 13, color: colors.nav },
  subjectTrack: { height: 4, borderRadius: radius.full, backgroundColor: colors.backgroundMuted, overflow: "hidden" },
  subjectFill: { height: "100%", borderRadius: radius.full },
  subjectMeta: { ...typography.roles.caption, fontSize: 11, color: colors.textMuted },
  activityList: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundElevated, paddingHorizontal: spacing[3] },
  activityRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: spacing[3], paddingVertical: spacing[2] },
  activityDivider: { borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  activityIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  activityCopy: { flex: 1, minWidth: 0, gap: 1 },
  activityTitle: { ...typography.roles.body, fontFamily: typography.fonts.bodyBold, color: colors.nav },
  activityMeta: { ...typography.roles.caption, fontSize: 11.5, color: colors.textMuted },
  activityAction: { ...typography.roles.caption, fontFamily: typography.fonts.bodyBold, color: colors.accentStrong },
  activityActionPending: { color: colors.textMuted },
  emptyLine: { ...typography.roles.caption, fontSize: 13, color: colors.textMuted },
});
