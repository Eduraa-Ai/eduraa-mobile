import React, { useMemo } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { analyticsApi } from "../../api/analytics";
import {
  AnimatedButton,
  AnimatedCard,
  AppScreen,
  ErrorState,
  SkeletonCard,
} from "../../components/ui";
import { useAuthStore } from "../../stores/authStore";
import {
  colors,
  motion,
  radius,
  shadows,
  spacing,
  typography,
} from "../../theme";
import type {
  DashboardChapterMastery,
  DashboardSubmission,
  StudentDashboardLab,
} from "../../types";
import { subjectSymbol, subjectTone } from "../learning/competitiveExamUtils";

type Shortcut = {
  label: string;
  body: string;
  meta: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
  onPress: () => void;
};

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
  items
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

const masteryTone = (mastery?: number | null) => {
  if (mastery == null) return colors.textMuted;
  if (mastery >= 80) return colors.success;
  if (mastery >= 58) return colors.warning;
  return colors.danger;
};

const buildSubjectSnapshot = (analytics?: StudentDashboardLab) => {
  const names = new Set<string>();
  analytics?.subjects?.forEach((subject) => {
    if (subject.name) names.add(subject.name);
  });
  analytics?.exam_scores?.forEach((exam) => {
    Object.keys(exam.subject_scores ?? {}).forEach((subject) =>
      names.add(subject),
    );
  });

  return Array.from(names)
    .map((subject) => {
      const scores = (analytics?.exam_scores ?? [])
        .map((exam) => exam.subject_scores?.[subject])
        .filter((score): score is number => typeof score === "number");
      const average = scores.length
        ? Math.round(
            scores.reduce((sum, score) => sum + score, 0) / scores.length,
          )
        : 0;
      return { subject, average, count: scores.length };
    })
    .sort((a, b) => a.average - b.average);
};

const useHomeModel = (
  analytics?: StudentDashboardLab,
  displayName?: string,
) => {
  return useMemo(() => {
    const submissions = latestFirst(analytics?.submissions ?? []);
    const scored = submissions
      .map((item) => safePercent(item.score, item.max_score))
      .filter((value): value is number => value != null);
    const averageScore = scored.length
      ? Math.round(
          scored.reduce((sum, value) => sum + value, 0) / scored.length,
        )
      : null;
    const subjectSnapshot = buildSubjectSnapshot(analytics);
    const weakestSubject = subjectSnapshot.find((item) => item.count > 0);
    const focusChapter = (analytics?.chapter_mastery ?? [])
      .slice()
      .sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0))[0];
    const upcomingExams = (analytics?.upcoming_exams ?? [])
      .slice()
      .sort(
        (a, b) =>
          new Date(a.date ?? "").getTime() - new Date(b.date ?? "").getTime(),
      )
      .slice(0, 2);
    const recentSubmissions = submissions.slice(0, 3);
    const firstName =
      analytics?.student?.first_name || displayName?.split(" ")[0] || "Student";
    const detail = [
      analytics?.student?.standard,
      analytics?.student?.division,
      analytics?.student?.school_name,
    ]
      .filter(Boolean)
      .join(" - ");
    const totalAiMessages = (analytics?.ai_usage ?? []).reduce(
      (sum, row) => sum + row.messages,
      0,
    );
    const latestSubmission = recentSubmissions[0];

    return {
      firstName,
      detail,
      averageScore,
      weakestSubject,
      focusChapter,
      upcomingExams,
      recentSubmissions,
      latestSubmission,
      totalAiMessages,
      hasSignal:
        submissions.length > 0 ||
        (analytics?.exam_scores?.length ?? 0) > 0 ||
        (analytics?.chapter_mastery?.length ?? 0) > 0,
      generatedPapers: analytics?.summary?.generated_papers ?? 0,
      attempts: analytics?.summary?.total_submissions ?? 0,
      checked: analytics?.summary?.total_checked ?? 0,
      distinctPapers: analytics?.summary?.distinct_papers ?? 0,
    };
  }, [analytics, displayName]);
};

function Header({ name, detail }: { name: string; detail?: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.logoMark}>
        <Image
          source={require("../../../assets/eduraa-book-brain.png")}
          style={styles.logoImage}
          resizeMode="cover"
        />
      </View>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>Home</Text>
        {detail ? (
          <Text style={styles.headerDetail} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View style={styles.headerIcon}>
        <Ionicons name="help" size={18} color="#101828" />
      </View>
    </View>
  );
}

function Hero({
  focusChapter,
  onPractice,
  onAskAi,
}: {
  focusChapter?: DashboardChapterMastery;
  onPractice: () => void;
  onAskAi: () => void;
}) {
  const chapterLabel = focusChapter?.chapter ?? "your next weak chapter";
  const mastery = focusChapter?.mastery ?? null;

  return (
    <View style={styles.hero}>
      <View style={styles.heroCopy}>
        <Text style={styles.heroEyebrow}>Today's plan</Text>
        <Text style={styles.heroTitle}>
          {focusChapter
            ? "Continue your learning path."
            : "Build your learning path."}
        </Text>
        <Text style={styles.heroBody}>
          {focusChapter
            ? "Start with the chapter that can improve your next result most."
            : "Complete a paper and Eduraa will shape your first evidence-based route."}
        </Text>
      </View>
      <View style={styles.routeStage}>
        <Svg
          width="100%"
          height="68"
          viewBox="0 0 324 76"
          preserveAspectRatio="none"
          style={styles.routeSvg}
        >
          <Path
            d="M30 44 C82 7, 138 10, 170 35 C210 63, 256 59, 298 33"
            fill="none"
            stroke="#e5eaf0"
            strokeWidth={12}
            strokeLinecap="round"
          />
          <Path
            d="M30 44 C82 7, 138 10, 170 35"
            fill="none"
            stroke={colors.accent}
            strokeWidth={12}
            strokeLinecap="round"
          />
          <Path
            d="M30 44 C82 7, 138 10, 170 35 C210 63, 256 59, 298 33"
            fill="none"
            stroke="rgba(255,255,255,0.72)"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="7 12"
          />
        </Svg>
        <Pressable
          onPress={onAskAi}
          style={[styles.routeNode, styles.routeNodeReview]}
        >
          <Text style={[styles.routeNodeText, styles.routeNodeTextDark]}>
            Review
          </Text>
        </Pressable>
        <View style={[styles.routeNode, styles.routeNodeLearn]}>
          <Text style={styles.routeNodeText}>Learn</Text>
        </View>
        <Pressable
          onPress={onPractice}
          style={[styles.routeNode, styles.routeNodePractice]}
        >
          <Text style={styles.routeNodeText}>Practice</Text>
        </Pressable>
        <View style={styles.routeLabel}>
          <Text style={styles.routeTitle} numberOfLines={2}>
            {chapterLabel}
          </Text>
          <Text style={styles.routeMeta}>
            {mastery == null
              ? "Waiting for your first learning signal"
              : `${Math.round(mastery)}% mastery · ${focusChapter?.topics_count ?? 0} topics`}
          </Text>
        </View>
      </View>
    </View>
  );
}

function InsightCard({
  chapter,
  subject,
  onPress,
}: {
  chapter?: DashboardChapterMastery;
  subject?: { subject: string; average: number };
  onPress: () => void;
}) {
  const label = chapter?.chapter ?? subject?.subject ?? "No weak chapter yet";
  const value = chapter?.mastery ?? subject?.average ?? null;
  const tone = masteryTone(value);

  return (
    <AnimatedCard
      delay={motion.cardEntrance.stagger * 2}
      style={styles.insightCard}
    >
      <View style={styles.cardTitleRow}>
        <View style={styles.cardTitleCopy}>
          <Text style={styles.kicker}>Weak chapter insight</Text>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {label}
          </Text>
        </View>
        <View style={[styles.insightBadge, { backgroundColor: `${tone}18` }]}>
          <Text style={[styles.insightBadgeText, { color: tone }]}>
            {value == null ? "--" : `${Math.round(value)}%`}
          </Text>
        </View>
      </View>
      <Text style={styles.cardBody}>
        {value == null
          ? "Once you complete papers, Eduraa will identify the exact chapter to repair next."
          : "This is the highest leverage area for your next practice set."}
      </Text>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.max(6, value ?? 8)}%`, backgroundColor: tone },
          ]}
        />
      </View>
      <AnimatedButton
        label="Generate focus paper"
        variant="secondary"
        onPress={onPress}
        style={styles.fullWidthButton}
      />
    </AnimatedCard>
  );
}

function ActivityList({
  submissions,
  exams,
  onResult,
  onPapers,
}: {
  submissions: DashboardSubmission[];
  exams: StudentDashboardLab["upcoming_exams"];
  onResult: (submissionId: string) => void;
  onPapers: () => void;
}) {
  const rows = [
    ...exams.map((exam) => ({
      id: `exam-${exam.id}`,
      icon: "calendar-clear-outline" as keyof typeof Ionicons.glyphMap,
      title: exam.name,
      meta: `${formatDate(exam.date)} - ${exam.subject || exam.cat || "Exam"}`,
      color: colors.info,
      onPress: onPapers,
    })),
    ...submissions.map((submission) => {
      const pct = safePercent(submission.score, submission.max_score);
      return {
        id: `sub-${submission.id}`,
        icon: "checkmark-done-outline" as keyof typeof Ionicons.glyphMap,
        title: submission.paper,
        meta: `${submission.subject || "Subject"} - ${pct != null ? `${pct}%` : "Pending review"}`,
        color: masteryTone(pct),
        onPress: () => onResult(submission.id),
      };
    }),
  ].slice(0, 4);

  if (rows.length === 0) {
    return (
      <AnimatedCard
        delay={motion.cardEntrance.stagger * 5}
        style={styles.emptyActivity}
      >
        <Ionicons name="planet-outline" size={24} color={colors.accent} />
        <Text style={styles.emptyTitle}>Your activity stream is waiting</Text>
        <Text style={styles.emptyBody}>
          Assigned exams, checked papers, and recent attempts will appear here
          as soon as you start working.
        </Text>
      </AnimatedCard>
    );
  }

  return (
    <AnimatedCard
      delay={motion.cardEntrance.stagger * 5}
      style={styles.activityCard}
    >
      {rows.map((row, index) => (
        <View
          key={row.id}
          style={[
            styles.activityRow,
            index === rows.length - 1 && styles.activityRowLast,
          ]}
        >
          <View
            style={[styles.activityIcon, { backgroundColor: `${row.color}16` }]}
          >
            <Ionicons name={row.icon} size={18} color={row.color} />
          </View>
          <View style={styles.activityCopy}>
            <Text style={styles.activityTitle} numberOfLines={1}>
              {row.title}
            </Text>
            <Text style={styles.activityMeta} numberOfLines={1}>
              {row.meta}
            </Text>
          </View>
          <AnimatedButton
            label="View"
            variant="ghost"
            onPress={row.onPress}
            style={styles.smallButton}
          />
        </View>
      ))}
    </AnimatedCard>
  );
}

function NextActionStack({ items }: { items: Shortcut[] }) {
  return (
    <View style={styles.nextActionStack}>
      {items.map((item) => (
        <Pressable
          key={item.label}
          onPress={item.onPress}
          style={({ pressed }) => [
            styles.nextActionBox,
            pressed && styles.nextActionPressed,
          ]}
        >
          <View style={styles.nextActionTop}>
            <View
              style={[
                styles.nextActionIcon,
                { backgroundColor: `${item.tone}12` },
              ]}
            >
              <Ionicons name={item.icon} size={18} color={item.tone} />
            </View>
            <Ionicons
              name="chevron-forward"
              size={17}
              color={colors.textSoft}
            />
          </View>
          <View style={styles.nextActionCopy}>
            <Text style={[styles.nextActionMeta, { color: item.tone }]}>
              {item.meta}
            </Text>
            <Text style={styles.nextActionTitle} numberOfLines={2}>
              {item.label}
            </Text>
            <Text style={styles.nextActionBody} numberOfLines={2}>
              {item.body}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function MetricSummary({
  generated,
  attempts,
  checked,
}: {
  generated: number;
  attempts: number;
  checked: number;
}) {
  const items = [
    {
      label: "Created",
      value: `${generated}`,
      helper: "practice papers",
      tone: colors.accent,
    },
    {
      label: "Attempted",
      value: `${attempts}`,
      helper: "submissions",
      tone: colors.info,
    },
    {
      label: "Checked",
      value: `${checked}`,
      helper: "results ready",
      tone: colors.success,
    },
  ];

  return (
    <View style={styles.homeMetricGrid}>
      {items.map((item) => (
        <View key={item.label} style={styles.homeMetricCard}>
          <View style={styles.homeMetricTop}>
            <Text style={styles.homeMetricLabel}>{item.label}</Text>
            <View
              style={[styles.homeMetricDot, { backgroundColor: item.tone }]}
            />
          </View>
          <Text style={styles.homeMetricValue}>{item.value}</Text>
          <Text style={styles.homeMetricHelper} numberOfLines={1}>
            {item.helper}
          </Text>
        </View>
      ))}
    </View>
  );
}

function SectionRow({ title, meta }: { title: string; meta: string }) {
  return (
    <View style={styles.compactSectionRow}>
      <Text style={styles.compactSectionTitle}>{title}</Text>
      <Text style={styles.compactSectionMeta}>{meta}</Text>
    </View>
  );
}

function NextBestActionCard({
  focusChapter,
  onStart,
  onResult,
}: {
  focusChapter?: DashboardChapterMastery;
  onStart: () => void;
  onResult: () => void;
}) {
  const chapterLabel = focusChapter?.chapter ?? "your next weak chapter";
  const mastery = focusChapter?.mastery;
  const topics = focusChapter?.topics_count;

  return (
    <View style={styles.planCard}>
      <View style={styles.planIndex}>
        <Text style={styles.planIndexText}>01</Text>
      </View>
      <View style={styles.planCopy}>
        <Text style={styles.planTitle}>Repair weak concept</Text>
        <Text style={styles.planBody} numberOfLines={2}>
          {focusChapter
            ? `${chapterLabel} is the clearest repair signal from your recent work.`
            : "Complete your first paper so Eduraa can identify the most useful concept to repair."}
        </Text>
        <View style={styles.planPills}>
          <Text style={styles.planPill}>
            {mastery == null
              ? "No mastery signal yet"
              : `${Math.round(mastery)}% mastery`}
          </Text>
          {topics != null ? (
            <Text style={styles.planPill}>
              {topics} {topics === 1 ? "topic" : "topics"}
            </Text>
          ) : null}
        </View>
        <View style={styles.planActions}>
          <Pressable
            onPress={onStart}
            style={({ pressed }) => [
              styles.planPrimary,
              pressed && styles.nextActionPressed,
            ]}
          >
            <Text style={styles.planPrimaryText}>Start learning</Text>
          </Pressable>
          <Pressable
            onPress={onResult}
            style={({ pressed }) => [
              styles.planGhost,
              pressed && styles.nextActionPressed,
            ]}
          >
            <Text style={styles.planGhostText}>Result</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const timeGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

function CompetitiveHome({
  analytics,
  model,
  isLoading,
  isError,
  refetch,
  isRefetching,
}: {
  analytics?: StudentDashboardLab;
  model: ReturnType<typeof useHomeModel>;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  isRefetching: boolean;
}) {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const trackLabel =
    user?.b2c_board || user?.b2c_target_exam || "JEE Mains / Advanced";
  const initial = (model.firstName?.[0] || "S").toUpperCase();

  const subjectData = useMemo(() => {
    const subjects = ["Physics", "Chemistry", "Mathematics"] as const;
    const subjectColors: Record<string, { start: string; end: string }> = {
      Physics: { start: "#3b82f6", end: "#1d4ed8" },
      Chemistry: { start: "#10b981", end: "#047857" },
      Mathematics: { start: "#8b5cf6", end: "#6d28d9" },
    };
    return subjects.map((name) => {
      const chapters = (analytics?.chapter_mastery ?? []).filter((ch) =>
        (ch.subject ?? "").toLowerCase().includes(name.toLowerCase()),
      );
      const avg = chapters.length
        ? Math.round(
            chapters.reduce((s, c) => s + (c.mastery ?? 0), 0) /
              chapters.length,
          )
        : 0;
      return {
        name,
        avg,
        count: chapters.length,
        tone: subjectTone(name),
        symbol: subjectSymbol(name),
        gradient: subjectColors[name],
      };
    });
  }, [analytics?.chapter_mastery]);

  const overallReadiness = useMemo(() => {
    const withData = subjectData.filter((d) => d.count > 0);
    if (!withData.length) return null;
    return Math.round(
      withData.reduce((s, d) => s + d.avg, 0) / withData.length,
    );
  }, [subjectData]);

  if (isLoading) {
    return (
      <AppScreen tone="auth" ambient={false} contentStyle={styles.compScreen}>
        <View style={styles.loadingStack}>
          <SkeletonCard lines={1} style={styles.loadingHero} />
          <View style={styles.compSubjectRow}>
            <SkeletonCard lines={1} style={styles.loadingSubject} />
            <SkeletonCard lines={1} style={styles.loadingSubject} />
            <SkeletonCard lines={1} style={styles.loadingSubject} />
          </View>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </View>
      </AppScreen>
    );
  }

  if (isError) {
    return (
      <AppScreen tone="auth" ambient={false} contentStyle={styles.compScreen}>
        <ErrorState
          title="Dashboard could not load"
          message="Refresh and try again. Your JEE prep data is safe."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      </AppScreen>
    );
  }

  const focusChapter = model.focusChapter;
  const recentSubmissions = model.recentSubmissions;
  const upcomingExams = model.upcomingExams;
  const greeting = timeGreeting();

  return (
    <AppScreen
      tone="auth"
      ambient={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor="#f36c21"
          colors={["#f36c21"]}
        />
      }
      contentStyle={styles.compScreen}
    >
      {/* Premium Header */}
      <View style={styles.compHeader}>
        <View style={styles.compAvatar}>
          <Text style={styles.compAvatarText}>{initial}</Text>
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.compHeaderGreeting}>
            {greeting}, {model.firstName}
          </Text>
          <Text style={styles.headerDetail} numberOfLines={1}>
            {trackLabel}
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate("Profile")}
          style={styles.compHeaderBell}
        >
          <Ionicons name="notifications-outline" size={20} color="#101828" />
        </Pressable>
      </View>

      {/* Glassmorphism Hero */}
      <View style={styles.compHeroWrap}>
        {/* Ambient orbs */}
        <View style={styles.compOrb1} />
        <View style={styles.compOrb2} />

        <LinearGradient
          colors={["#020617", "#0f172a", "#1a2744"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.compHero}
        >
          <View style={styles.compHeroTop}>
            <View style={styles.compHeroStatusRow}>
              <View style={styles.compStatusDot} />
              <Text style={styles.compHeroStatusText}>AI tutor ready</Text>
            </View>
            <View style={styles.compHeroStat}>
              <Text style={styles.compHeroStatValue}>
                {overallReadiness != null ? `${overallReadiness}%` : "--"}
              </Text>
              <Text style={styles.compHeroStatLabel}>readiness</Text>
            </View>
          </View>

          <Text style={styles.compHeroTitle}>
            {focusChapter
              ? `Let's master\n${focusChapter.chapter}`
              : "Start your JEE\nprep journey"}
          </Text>

          {/* Glass card - next focus */}
          <View style={styles.compGlassCard}>
            <View style={styles.compGlassHeader}>
              <Text style={styles.compGlassLabel}>Next focus</Text>
              <View style={styles.compGlassBadge}>
                <Text style={styles.compGlassBadgeText}>Priority</Text>
              </View>
            </View>
            <Text style={styles.compGlassTitle}>
              {focusChapter
                ? focusChapter.chapter
                : "Complete your first paper"}
            </Text>
            <Text style={styles.compGlassSubtitle}>
              {focusChapter?.mastery != null
                ? `${Math.round(focusChapter.mastery)}% mastery · ${focusChapter.topics_count ?? 0} topics`
                : "Generate a paper to get personalized recommendations"}
            </Text>
            {focusChapter?.mastery != null ? (
              <View style={styles.compGlassProgress}>
                <View
                  style={[
                    styles.compGlassProgressFill,
                    { width: `${Math.max(8, focusChapter.mastery)}%` },
                  ]}
                />
              </View>
            ) : null}
            <Pressable
              onPress={() =>
                navigation.navigate("Papers", { screen: "GeneratePaper" })
              }
              style={({ pressed }) => [
                styles.compHeroCta,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="flash-outline" size={16} color="#101828" />
              <Text style={styles.compHeroCtaText}>Start session</Text>
              <Ionicons name="arrow-forward" size={16} color="#101828" />
            </Pressable>
          </View>

          {/* Stats row */}
          <View style={styles.compStatsRow}>
            <View style={styles.compStatItem}>
              <Text style={styles.compStatValue}>{model.attempts}</Text>
              <Text style={styles.compStatLabel}>Attempts</Text>
            </View>
            <View style={styles.compStatItem}>
              <Text style={styles.compStatValue}>{model.generatedPapers}</Text>
              <Text style={styles.compStatLabel}>Papers</Text>
            </View>
            <View style={styles.compStatItem}>
              <Text style={styles.compStatValue}>{model.checked}</Text>
              <Text style={styles.compStatLabel}>Checked</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* AI Insight Card */}
      {focusChapter ? (
        <View style={styles.compAiCard}>
          <View style={styles.compAiHeader}>
            <View style={styles.compAiAvatar}>
              <Text style={styles.compAiAvatarText}>E</Text>
            </View>
            <View style={styles.compAiNameWrap}>
              <Text style={styles.compAiName}>Eduraa AI</Text>
              <Text style={styles.compAiTime}>Just now</Text>
            </View>
          </View>
          <Text style={styles.compAiText}>
            I noticed your weakest area is{" "}
            <Text style={styles.compAiHighlight}>{focusChapter.chapter}</Text>{" "}
            at{" "}
            {focusChapter.mastery != null
              ? `${Math.round(focusChapter.mastery)}%`
              : "low"}{" "}
            mastery. A focused session here could significantly boost your JEE
            readiness score.
          </Text>
          <View style={styles.compAiActions}>
            <Pressable
              onPress={() =>
                navigation.navigate("Learning", { screen: "AgenticLearning" })
              }
              style={({ pressed }) => [
                styles.compAiPrimary,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.compAiPrimaryText}>Start learning</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                navigation.navigate("Learning", { screen: "AIStudio" })
              }
              style={({ pressed }) => [
                styles.compAiSecondary,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.compAiSecondaryText}>Ask tutor</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Subject Mastery Row */}
      <View style={styles.compSectionHeader}>
        <Text style={styles.compSectionTitle}>Subject readiness</Text>
        <Text style={styles.compSectionMeta}>
          {overallReadiness != null
            ? `${overallReadiness}% overall`
            : "No data yet"}
        </Text>
      </View>

      <View style={styles.compSubjectRow}>
        {subjectData.map((subject) => (
          <Pressable
            key={subject.name}
            onPress={() =>
              navigation.navigate("Learning", {
                screen: "CompetitiveSubject",
                params: { subjectName: subject.name },
              })
            }
            style={({ pressed }) => [
              styles.compSubjectCard,
              pressed && styles.pressed,
            ]}
          >
            <LinearGradient
              colors={
                subject.gradient
                  ? [subject.gradient.start, subject.gradient.end]
                  : [subject.tone, subject.tone]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.compSubjectIcon}
            >
              <Text style={styles.compSubjectIconText}>{subject.symbol}</Text>
            </LinearGradient>
            <Text style={styles.compSubjectName}>{subject.name}</Text>
            <View style={styles.compSubjectBar}>
              <LinearGradient
                colors={
                  subject.gradient
                    ? [subject.gradient.start, subject.gradient.end]
                    : [subject.tone, subject.tone]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  styles.compSubjectFill,
                  { width: `${Math.max(6, subject.avg)}%` },
                ]}
              />
            </View>
            <Text style={styles.compSubjectMeta}>
              {subject.count > 0
                ? `${subject.avg}% · ${subject.count} ch`
                : "Not started"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Quick Actions */}
      <View style={styles.compSectionHeader}>
        <Text style={styles.compSectionTitle}>Quick actions</Text>
      </View>

      <View style={styles.compQuickGrid}>
        <QuickAction
          icon="flash-outline"
          label="Generate paper"
          body="AI-focused from weak areas"
          tone="#f36c21"
          onPress={() =>
            navigation.navigate("Papers", { screen: "GeneratePaper" })
          }
        />
        <QuickAction
          icon="library-outline"
          label="JEE PYQs"
          body="Previous year questions"
          tone="#1e3a8a"
          onPress={() =>
            navigation.navigate("Learning", { screen: "PreviousPapers" })
          }
        />
        <QuickAction
          icon="sparkles-outline"
          label="AI Tutor"
          body="Explain concepts deeply"
          tone="#7c3aed"
          onPress={() =>
            navigation.navigate("Learning", { screen: "AIStudio" })
          }
        />
        <QuickAction
          icon="ribbon-outline"
          label="Results"
          body="Scores & feedback"
          tone="#059669"
          onPress={() =>
            navigation.navigate("Results", { screen: "ResultsList" })
          }
        />
      </View>

      {/* JEE Launchpad Banner */}
      <Pressable
        onPress={() =>
          navigation.navigate("Learning", { screen: "CompetitiveExam" })
        }
        style={({ pressed }) => [
          styles.compLaunchpad,
          pressed && styles.pressed,
        ]}
      >
        <LinearGradient
          colors={["#1e3a8a", "#2a4ab0", "#3b5cc6"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.compLaunchpadGradient}
        >
          <View style={styles.compLaunchpadLeft}>
            <View style={styles.compLaunchpadIcon}>
              <Ionicons name="rocket-outline" size={22} color="#ffffff" />
            </View>
            <View style={styles.compLaunchpadCopy}>
              <Text style={styles.compLaunchpadKicker}>JEE workspace</Text>
              <Text style={styles.compLaunchpadTitle}>Open launchpad</Text>
              <Text style={styles.compLaunchpadBody}>
                Chapter workspaces, cheat sheets & revision packs
              </Text>
            </View>
          </View>
          <Ionicons
            name="chevron-forward"
            size={22}
            color="rgba(255,255,255,0.70)"
          />
        </LinearGradient>
      </Pressable>

      {/* Recent Activity */}
      <View style={styles.compSectionHeader}>
        <Text style={styles.compSectionTitle}>Recent activity</Text>
        <Text style={styles.compSectionMeta}>
          {recentSubmissions.length > 0
            ? `${recentSubmissions.length} recent`
            : "No activity yet"}
        </Text>
      </View>

      <ActivityList
        submissions={recentSubmissions}
        exams={upcomingExams}
        onResult={(submissionId) =>
          navigation.navigate("Results", {
            screen: "ResultDetail",
            params: { checkedPaperId: submissionId },
          })
        }
        onPapers={() => navigation.navigate("Papers", { screen: "PapersList" })}
      />
    </AppScreen>
  );
}

function QuickAction({
  icon,
  label,
  body,
  tone,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  body: string;
  tone: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.compQuickCard, pressed && styles.pressed]}
    >
      <View style={[styles.compQuickIcon, { backgroundColor: `${tone}12` }]}>
        <Ionicons name={icon} size={18} color={tone} />
      </View>
      <Text style={styles.compQuickLabel}>{label}</Text>
      <Text style={styles.compQuickBody} numberOfLines={2}>
        {body}
      </Text>
    </Pressable>
  );
}

function LoadingHome() {
  return (
    <View style={styles.loadingStack}>
      <SkeletonCard lines={2} style={styles.loadingHero} />
      <View style={styles.homeMetricGrid}>
        <SkeletonCard lines={1} style={styles.loadingMetric} />
        <SkeletonCard lines={1} style={styles.loadingMetric} />
      </View>
      <SkeletonCard lines={3} />
    </View>
  );
}

export default function HomeScreen({
  competitive = false,
}: {
  competitive?: boolean;
}) {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();

  const {
    data: analytics,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["analytics", "student-dashboard"],
    queryFn: analyticsApi.getStudentDashboard,
    retry: 0,
  });

  const model = useHomeModel(analytics, user?.display_name);

  if (competitive) {
    return (
      <CompetitiveHome
        analytics={analytics}
        model={model}
        isLoading={isLoading}
        isError={isError}
        refetch={refetch}
        isRefetching={isRefetching}
      />
    );
  }

  const shortcuts: Shortcut[] = [
    {
      label: "Generate paper",
      body: "Generate practice from your weakest areas.",
      meta: "AI action",
      icon: "flash-outline",
      tone: colors.accent,
      onPress: () => navigation.navigate("Papers", { screen: "GeneratePaper" }),
    },
    {
      label: "Agentic Learning",
      body: "Open weak concepts and study the next lesson.",
      meta: "Learning",
      icon: "sparkles",
      tone: colors.ai.violet,
      onPress: () =>
        navigation.navigate("Learning", { screen: "AgenticLearning" }),
    },
    ...(competitive
      ? [
          {
            label: "JEE previous papers",
            body: "Browse PYQs and start paper practice.",
            meta: "PYQ",
            icon: "library-outline" as keyof typeof Ionicons.glyphMap,
            tone: colors.paperStudio.jee,
            onPress: () =>
              navigation.navigate("Learning", { screen: "PreviousPapers" }),
          },
        ]
      : []),
    {
      label: "Review checked results",
      body: "See marks, feedback, and manual review status.",
      meta: "Results",
      icon: "ribbon-outline",
      tone: colors.success,
      onPress: () => navigation.navigate("Results", { screen: "ResultsList" }),
    },
    {
      label: "Ask Eduraa AI",
      body: "Explain mistakes and plan your next study block.",
      meta: "Tutor",
      icon: "sparkles-outline",
      tone: colors.ai.violet,
      onPress: () => navigation.navigate("Learning", { screen: "AIStudio" }),
    },
  ];

  return (
    <AppScreen
      tone="auth"
      ambient={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
      contentStyle={styles.screenContent}
    >
      <Header
        name={model.firstName}
        detail={model.detail || user?.identifier}
      />

      {isLoading ? (
        <LoadingHome />
      ) : isError ? (
        <ErrorState
          title="Home could not load"
          message="Refresh and try again. Your token and routes are unchanged."
          actionLabel="Retry"
          onAction={() => refetch()}
        />
      ) : (
        <>
          <Hero
            focusChapter={model.focusChapter}
            onPractice={() =>
              navigation.navigate("Papers", { screen: "GeneratePaper" })
            }
            onAskAi={() =>
              navigation.navigate("Learning", { screen: "AIStudio" })
            }
          />

          <MetricSummary
            generated={model.generatedPapers}
            attempts={model.attempts}
            checked={model.checked}
          />

          <SectionRow
            title="Next best action"
            meta={model.focusChapter ? "Based on recent work" : "Start here"}
          />

          <NextBestActionCard
            focusChapter={model.focusChapter}
            onStart={() =>
              navigation.navigate("Learning", { screen: "AgenticLearning" })
            }
            onResult={() =>
              navigation.navigate("Results", { screen: "ResultsList" })
            }
          />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Next actions</Text>
            <Text style={styles.sectionSubtitle}>
              High-value routes for today.
            </Text>
          </View>

          <NextActionStack items={shortcuts} />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent movement</Text>
            <Text style={styles.sectionSubtitle}>
              Upcoming exams and checked work.
            </Text>
          </View>

          <ActivityList
            submissions={model.recentSubmissions}
            exams={model.upcomingExams}
            onResult={(submissionId) =>
              navigation.navigate("Results", {
                screen: "ResultDetail",
                params: { checkedPaperId: submissionId },
              })
            }
            onPapers={() =>
              navigation.navigate("Papers", { screen: "PapersList" })
            }
          />
        </>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingBottom: spacing[20],
    gap: spacing[3],
    backgroundColor: "#fbf6ec",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[1],
  },
  logoMark: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#fbf6ec",
    borderWidth: 1,
    borderColor: "#e0d6c8",
    ...shadows.sm,
  },
  logoImage: {
    width: 48,
    height: 48,
  },
  headerCopy: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#101828",
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  headerDetail: {
    ...typography.roles.label,
    color: "#5c6a82",
    marginTop: 2,
    fontSize: 12,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fbf6ec",
    borderWidth: 1,
    borderColor: "#e0d6c8",
    ...shadows.xs,
  },
  hero: {
    minHeight: 240,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#fff7df",
    borderWidth: 1,
    borderColor: "#e0d6c8",
    ...shadows.hero,
  },
  heroCopy: {
    paddingTop: spacing[5],
    paddingHorizontal: spacing[5],
  },
  heroEyebrow: {
    fontFamily: typography.fonts.bodyBold,
    color: "#c2410c",
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  heroTitle: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#101828",
    maxWidth: 260,
    fontSize: 26,
    lineHeight: 30,
    marginTop: spacing[2],
    letterSpacing: -0.3,
  },
  heroBody: {
    fontFamily: typography.fonts.bodyMedium,
    maxWidth: 256,
    color: "#5c6a82",
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing[2],
  },
  routeStage: {
    position: "absolute",
    left: spacing[4],
    right: spacing[4],
    bottom: spacing[3],
    height: 94,
  },
  routeSvg: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
  },
  routeNode: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 21,
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.96)",
    alignItems: "center",
    justifyContent: "center",
    ...shadows.sm,
  },
  routeNodeReview: {
    left: 0,
    top: 13,
    backgroundColor: colors.white,
  },
  routeNodeLearn: {
    left: 120,
    top: 0,
    backgroundColor: colors.accent,
  },
  routeNodePractice: {
    right: 0,
    top: 16,
    backgroundColor: colors.info,
  },
  routeNodeText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    color: colors.white,
  },
  routeNodeTextDark: {
    color: colors.text,
  },
  routeLabel: {
    position: "absolute",
    left: 65,
    right: 65,
    bottom: 0,
    minHeight: 50,
    justifyContent: "center",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: colors.border,
  },
  routeTitle: {
    fontFamily: typography.fonts.bodyBold,
    color: colors.text,
    fontSize: 12,
    lineHeight: 14,
  },
  routeMeta: {
    ...typography.roles.label,
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  homeMetricGrid: {
    flexDirection: "row",
    gap: spacing[2],
  },
  homeMetricCard: {
    flex: 1,
    minHeight: 88,
    padding: spacing[3],
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e0d6c8",
    ...shadows.sm,
  },
  homeMetricTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  homeMetricLabel: {
    fontFamily: typography.fonts.bodyBold,
    color: "#5c6a82",
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  homeMetricDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  homeMetricValue: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#101828",
    fontSize: 24,
    lineHeight: 26,
    marginTop: spacing[2],
    letterSpacing: -0.3,
  },
  homeMetricHelper: {
    fontFamily: typography.fonts.bodyMedium,
    color: "#5c6a82",
    fontSize: 10,
    marginTop: spacing[1],
  },
  compactSectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    paddingHorizontal: 2,
    marginTop: spacing[2],
  },
  compactSectionTitle: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#101828",
    fontSize: 16,
    letterSpacing: -0.2,
  },
  compactSectionMeta: {
    fontFamily: typography.fonts.bodyMedium,
    color: "#5c6a82",
    fontSize: 11,
  },
  planCard: {
    minHeight: 160,
    flexDirection: "row",
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: 22,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e0d6c8",
    ...shadows.sm,
  },
  planIndex: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(243, 108, 33, 0.10)",
    flexShrink: 0,
  },
  planIndexText: {
    fontFamily: typography.fonts.bodyBold,
    color: "#f36c21",
    fontSize: 12,
  },
  planCopy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    gap: spacing[2],
  },
  planTitle: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#101828",
    fontSize: 18,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  planBody: {
    fontFamily: typography.fonts.bodyMedium,
    color: "#5c6a82",
    fontSize: 12,
    lineHeight: 17,
  },
  planPills: {
    flexDirection: "row",
    gap: spacing[2],
  },
  planPill: {
    overflow: "hidden",
    borderRadius: radius.full,
    backgroundColor: "rgba(243, 108, 33, 0.10)",
    color: "#f36c21",
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  planActions: {
    flexDirection: "row",
    gap: spacing[2],
    marginTop: spacing[1],
  },
  planPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f36c21",
    ...shadows.sm,
    shadowColor: "#f36c21",
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  planPrimaryText: {
    fontFamily: typography.fonts.bodyBold,
    color: "#ffffff",
    fontSize: 13,
  },
  planGhost: {
    width: 96,
    minHeight: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fbf6ec",
    borderWidth: 1,
    borderColor: "#e0d6c8",
  },
  planGhostText: {
    fontFamily: typography.fonts.bodyBold,
    color: "#101828",
    fontSize: 13,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    marginTop: spacing[2],
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#101828",
    fontSize: 16,
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontFamily: typography.fonts.bodyMedium,
    color: "#5c6a82",
    fontSize: 11,
  },
  nextActionStack: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[3],
  },
  nextActionBox: {
    width: "31%",
    height: 144,
    minHeight: 144,
    justifyContent: "space-between",
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[3],
    borderRadius: 20,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e0d6c8",
    ...shadows.sm,
  },
  nextActionPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  nextActionTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  nextActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  nextActionCopy: {
    gap: 3,
  },
  nextActionMeta: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  nextActionTitle: {
    fontFamily: typography.fonts.bodyBold,
    color: "#101828",
    fontSize: 13,
    lineHeight: 16,
  },
  nextActionBody: {
    fontFamily: typography.fonts.bodyMedium,
    color: "#5c6a82",
    fontSize: 10,
    lineHeight: 14,
  },
  insightCard: {
    gap: spacing[4],
    backgroundColor: "#ffffff",
    borderColor: "#e0d6c8",
    borderRadius: 22,
    padding: spacing[5],
    ...shadows.sm,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing[3],
  },
  cardTitleCopy: {
    flex: 1,
    minWidth: 0,
  },
  kicker: {
    fontFamily: typography.fonts.bodyBold,
    color: "#f36c21",
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  cardTitle: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#101828",
    fontSize: 18,
    lineHeight: 22,
    marginTop: spacing[1],
    letterSpacing: -0.2,
  },
  cardBody: {
    fontFamily: typography.fonts.bodyMedium,
    color: "#5c6a82",
    fontSize: 13,
    lineHeight: 18,
  },
  insightBadge: {
    minWidth: 66,
    minHeight: 40,
    flexShrink: 0,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[3],
  },
  insightBadgeText: {
    ...typography.roles.title,
    fontSize: 18,
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: "#fbf6ec",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.full,
  },
  fullWidthButton: {
    alignSelf: "stretch",
  },
  aiCard: {
    gap: spacing[4],
    backgroundColor: colors.slate[950],
    borderColor: "rgba(255,255,255,0.08)",
  },
  aiOrb: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ai.violet,
    ...shadows.sm,
  },
  aiCopy: {
    gap: spacing[2],
  },
  aiKicker: {
    ...typography.roles.eyebrow,
    color: colors.teal[300],
  },
  aiTitle: {
    ...typography.roles.title,
    color: colors.white,
  },
  aiBody: {
    ...typography.roles.body,
    color: colors.slate[300],
  },
  activityCard: {
    padding: 0,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    borderColor: "#e0d6c8",
    borderRadius: 22,
    ...shadows.sm,
  },
  activityRow: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: "#e0d6c8",
  },
  activityRowLast: {
    borderBottomWidth: 0,
  },
  activityIcon: {
    width: 46,
    height: 46,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  activityCopy: {
    flex: 1,
  },
  activityTitle: {
    fontFamily: typography.fonts.bodyBold,
    color: "#101828",
    fontSize: 14,
    lineHeight: 18,
  },
  activityMeta: {
    fontFamily: typography.fonts.bodyMedium,
    color: "#5c6a82",
    fontSize: 11,
    marginTop: spacing[1],
  },
  smallButton: {
    width: 78,
  },
  emptyActivity: {
    alignItems: "flex-start",
    gap: spacing[3],
    backgroundColor: "#ffffff",
    borderColor: "#e0d6c8",
    borderRadius: 22,
    padding: spacing[5],
    ...shadows.sm,
  },
  emptyTitle: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#101828",
    fontSize: 17,
    letterSpacing: -0.2,
  },
  emptyBody: {
    fontFamily: typography.fonts.bodyMedium,
    color: "#5c6a82",
    fontSize: 13,
    lineHeight: 18,
  },
  loadingStack: {
    gap: spacing[4],
  },
  loadingHero: {
    minHeight: 272,
    backgroundColor: "#ffffff",
    borderColor: "#e0d6c8",
    borderRadius: 22,
  },
  loadingMetric: {
    flex: 1,
    minHeight: 120,
    backgroundColor: "#ffffff",
    borderColor: "#e0d6c8",
    borderRadius: 18,
  },

  // ── Competitive Home styles ──
  compScreen: {
    paddingBottom: spacing[20],
    gap: spacing[4],
    backgroundColor: "#fbf6ec",
  },
  compHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[1],
  },
  compAvatar: {
    width: 52,
    height: 52,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f36c21",
    shadowColor: "#f36c21",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  compAvatarText: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#ffffff",
    fontSize: 22,
  },
  compHeaderGreeting: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#101828",
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  compHeaderBell: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e0d6c8",
    ...shadows.sm,
  },
  compTrackPill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    backgroundColor: "rgba(243, 108, 33, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(243, 108, 33, 0.25)",
  },
  compTrackText: {
    fontFamily: typography.fonts.bodyBold,
    color: "#f36c21",
    fontSize: 10,
  },

  // Hero wrap with ambient orbs
  compHeroWrap: {
    position: "relative",
    borderRadius: 28,
    overflow: "hidden",
  },
  compOrb1: {
    position: "absolute",
    top: -30,
    right: -20,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(243, 108, 33, 0.18)",
    zIndex: 0,
  },
  compOrb2: {
    position: "absolute",
    bottom: -10,
    left: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(59, 130, 246, 0.12)",
    zIndex: 0,
  },

  // Hero
  compHero: {
    borderRadius: 28,
    padding: spacing[5],
    gap: spacing[4],
    overflow: "hidden",
    position: "relative",
    zIndex: 1,
  },
  compHeroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  compHeroStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  compStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#10b981",
  },
  compHeroStatusText: {
    fontFamily: typography.fonts.bodyMedium,
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
  },
  compHeroStat: {
    alignItems: "center",
    borderRadius: 16,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  compHeroStatValue: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#ffffff",
    fontSize: 20,
    letterSpacing: -0.3,
  },
  compHeroStatLabel: {
    color: "rgba(255,255,255,0.45)",
    fontFamily: typography.fonts.bodyBold,
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  compHeroCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[4],
  },
  compHeroEmptyRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.10)",
    gap: spacing[1],
  },
  compHeroEmptyLabel: {
    color: "rgba(255,255,255,0.35)",
    fontFamily: typography.fonts.bodyBold,
    fontSize: 10,
  },
  compHeroCopy: {
    flex: 1,
    gap: spacing[2],
  },
  compHeroTitle: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#ffffff",
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.4,
  },
  compHeroBody: {
    fontFamily: typography.fonts.bodyMedium,
    color: "rgba(255,255,255,0.72)",
    fontSize: 14,
    lineHeight: 20,
  },
  compHeroPills: {
    flexDirection: "row",
    gap: spacing[2],
  },
  compHeroPill: {
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  compHeroPillText: {
    color: "rgba(255,255,255,0.78)",
    fontFamily: typography.fonts.bodyBold,
    fontSize: 11,
  },

  // Glass card inside hero
  compGlassCard: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 22,
    padding: spacing[5],
    gap: spacing[3],
  },
  compGlassHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  compGlassLabel: {
    fontFamily: typography.fonts.bodyBold,
    color: "rgba(255,255,255,0.50)",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  compGlassBadge: {
    backgroundColor: "rgba(243, 108, 33, 0.20)",
    borderWidth: 1,
    borderColor: "rgba(243, 108, 33, 0.30)",
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: 3,
  },
  compGlassBadgeText: {
    fontFamily: typography.fonts.bodyBold,
    color: "#fb923c",
    fontSize: 10,
  },
  compGlassTitle: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#ffffff",
    fontSize: 20,
    letterSpacing: -0.3,
  },
  compGlassSubtitle: {
    fontFamily: typography.fonts.bodyMedium,
    color: "rgba(255,255,255,0.60)",
    fontSize: 13,
    lineHeight: 18,
  },
  compGlassProgress: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.10)",
    overflow: "hidden",
  },
  compGlassProgressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#f36c21",
  },
  compHeroCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: "#f36c21",
    shadowColor: "#f36c21",
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  compHeroCtaText: {
    fontFamily: typography.fonts.bodyBold,
    color: "#101828",
    fontSize: 15,
  },

  // Stats row inside hero
  compStatsRow: {
    flexDirection: "row",
    gap: spacing[2],
  },
  compStatItem: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: spacing[3],
    alignItems: "center",
  },
  compStatValue: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#ffffff",
    fontSize: 22,
    letterSpacing: -0.3,
  },
  compStatLabel: {
    fontFamily: typography.fonts.bodyBold,
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: spacing[1],
  },

  // AI Insight Card
  compAiCard: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e0d6c8",
    borderRadius: 24,
    padding: spacing[5],
    gap: spacing[4],
    ...shadows.sm,
  },
  compAiHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  compAiAvatar: {
    width: 40,
    height: 40,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f36c21",
  },
  compAiAvatarText: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#ffffff",
    fontSize: 16,
  },
  compAiNameWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  compAiName: {
    fontFamily: typography.fonts.bodyBold,
    color: "#101828",
    fontSize: 14,
  },
  compAiTime: {
    fontFamily: typography.fonts.bodyMedium,
    color: "#5c6a82",
    fontSize: 11,
  },
  compAiText: {
    fontFamily: typography.fonts.bodyMedium,
    color: "#101828",
    fontSize: 14,
    lineHeight: 21,
  },
  compAiHighlight: {
    fontFamily: typography.fonts.bodyBold,
    color: "#f36c21",
  },
  compAiActions: {
    flexDirection: "row",
    gap: spacing[2],
  },
  compAiPrimary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f36c21",
    shadowColor: "#f36c21",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  compAiPrimaryText: {
    fontFamily: typography.fonts.bodyBold,
    color: "#ffffff",
    fontSize: 14,
  },
  compAiSecondary: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fbf6ec",
    borderWidth: 1,
    borderColor: "#e0d6c8",
  },
  compAiSecondaryText: {
    fontFamily: typography.fonts.bodyBold,
    color: "#101828",
    fontSize: 14,
  },

  // Section headers
  compSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    paddingHorizontal: 2,
    marginTop: spacing[1],
  },
  compSectionTitle: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#101828",
    fontSize: 18,
    letterSpacing: -0.2,
  },
  compSectionMeta: {
    fontFamily: typography.fonts.bodyMedium,
    color: "#5c6a82",
    fontSize: 12,
  },

  // Subject row
  compSubjectRow: {
    flexDirection: "row",
    gap: spacing[3],
  },
  compSubjectCard: {
    flex: 1,
    minHeight: 168,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e0d6c8",
    padding: spacing[3],
    justifyContent: "center",
    alignItems: "center",
    gap: spacing[2],
    shadowColor: "rgba(0,0,0,0.06)",
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  compSubjectIcon: {
    width: 52,
    height: 52,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  compSubjectIconText: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#ffffff",
    fontSize: 22,
  },
  compSubjectName: {
    fontFamily: typography.fonts.bodyBold,
    color: "#101828",
    fontSize: 13,
  },
  compSubjectBar: {
    width: "100%",
    height: 6,
    borderRadius: 3,
    backgroundColor: "#f5f0e6",
    overflow: "hidden",
  },
  compSubjectFill: {
    height: "100%",
    borderRadius: 3,
  },
  compSubjectMeta: {
    fontFamily: typography.fonts.bodyMedium,
    color: "#5c6a82",
    fontSize: 10,
  },

  // Focus card (kept for backwards compat)
  compFocusCard: {
    gap: spacing[4],
    backgroundColor: "#ffffff",
    borderColor: "#e0d6c8",
    borderRadius: 22,
    padding: spacing[5],
    ...shadows.sm,
  },
  compFocusHeader: {
    flexDirection: "row",
    gap: spacing[3],
  },
  compFocusIcon: {
    width: 44,
    height: 44,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(243, 108, 33, 0.12)",
  },
  compFocusCopy: {
    flex: 1,
    gap: spacing[1],
  },
  compFocusKicker: {
    fontFamily: typography.fonts.bodyBold,
    color: "#f36c21",
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  compFocusTitle: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#101828",
    fontSize: 17,
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  compFocusBody: {
    fontFamily: typography.fonts.bodyMedium,
    color: "#5c6a82",
    fontSize: 13,
    lineHeight: 18,
  },
  compFocusActions: {
    flexDirection: "row",
    gap: spacing[2],
  },
  compFocusBtn: {
    flex: 1,
  },

  // Quick actions grid
  compQuickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[3],
  },
  compQuickCard: {
    width: "48%",
    flexGrow: 1,
    minHeight: 126,
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e0d6c8",
    padding: spacing[4],
    gap: spacing[2],
    shadowColor: "rgba(0,0,0,0.05)",
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  compQuickIcon: {
    width: 46,
    height: 46,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  compQuickLabel: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#101828",
    fontSize: 15,
    letterSpacing: -0.1,
  },
  compQuickBody: {
    fontFamily: typography.fonts.bodyMedium,
    color: "#5c6a82",
    fontSize: 11,
    lineHeight: 15,
  },

  // JEE Launchpad banner
  compLaunchpad: {
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "rgba(30, 58, 138, 0.25)",
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  compLaunchpadGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    padding: spacing[5],
    minHeight: 110,
  },
  compLaunchpadLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    flex: 1,
  },
  compLaunchpadIcon: {
    width: 52,
    height: 52,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  compLaunchpadCopy: {
    flex: 1,
    gap: spacing[1],
  },
  compLaunchpadKicker: {
    fontFamily: typography.fonts.bodyBold,
    color: "rgba(255,255,255,0.65)",
    letterSpacing: 0.8,
    fontSize: 10,
    textTransform: "uppercase",
  },
  compLaunchpadTitle: {
    fontFamily: "Georgia",
    fontWeight: "700",
    color: "#ffffff",
    fontSize: 20,
    letterSpacing: -0.3,
  },
  compLaunchpadBody: {
    fontFamily: typography.fonts.bodyMedium,
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    lineHeight: 16,
  },

  // Pressed state
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },

  // Loading
  loadingSubject: {
    flex: 1,
    minHeight: 160,
    backgroundColor: "#ffffff",
    borderColor: "#e0d6c8",
    borderRadius: 22,
  },
});
