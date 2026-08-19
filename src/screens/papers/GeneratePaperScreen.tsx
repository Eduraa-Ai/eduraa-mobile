import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { papersApi } from "../../api/papers";
import { AuthLogoMark } from "../../components/ui/AuthLogoMark";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { Screen } from "../../components/ui/Screen";
import type { PapersStackParamList } from "../../navigation";
import { colors } from "../../theme/colors";
import { fonts } from "../../theme/fonts";
import { layout, radius, shadows, spacing } from "../../theme/spacing";
import type { Chapter, Difficulty, PaperGenerateRequest } from "../../types";
import {
  findLargestAvailableBookCount,
  isBookQuestionShortage,
  withBookMcqCount,
} from "../../utils/bookPaperGeneration";
import {
  buildJeeFormPaperRequest,
  describePaperGenerationJob,
  parsePaperDuration,
  resolvePaperScope,
} from "./generatePaperSettingsModel";
import { usePaperGenerationJob } from "./usePaperGenerationJob";

type Nav = NativeStackNavigationProp<PapersStackParamList, "GeneratePaper">;
type Stage = 0 | 1 | 2;
type ChapterSource = "books" | "ai";
type QuestionKey =
  | "mcq"
  | "short_answer"
  | "long_answer"
  | "fill_blank"
  | "match_columns"
  | "true_false";
type CountKey =
  | "mcq_count"
  | "short_answer_count"
  | "long_answer_count"
  | "fill_blank_count"
  | "match_columns_count"
  | "true_false_count";
type MarkKey =
  | "marks_per_mcq"
  | "marks_per_short"
  | "marks_per_long"
  | "marks_per_fill_blank"
  | "marks_per_match_columns"
  | "marks_per_true_false";

type ChapterWithSubtopics = Chapter & {
  subtopics?: Array<string | { title?: string | null }> | null;
};

type CustomType = {
  id: string;
  name: string;
  count: number;
  marks: number;
};

type BlueprintSectionPayload = {
  id: string;
  title: string;
  question_type: string;
  order: number;
  slots: Array<{
    id: string;
    question_type: string;
    marks: number;
    is_placeholder: boolean;
  }>;
};

type QuestionRow = {
  key: QuestionKey;
  label: string;
  countKey: CountKey;
  markKey: MarkKey;
  max: number;
};

type GenerateInput = {
  payload: PaperGenerateRequest;
  useAvailableBookCount?: boolean;
  useGenerationJob?: boolean;
  ai?: {
    examType: string;
    subject: string;
    chapterKeys: string[];
    count: number;
    marks: number;
    subtopic?: string;
    title: string;
    durationMinutes: number | null;
  };
};

const QUESTION_ROWS: QuestionRow[] = [
  {
    key: "mcq",
    label: "MCQ",
    countKey: "mcq_count",
    markKey: "marks_per_mcq",
    max: 50,
  },
  {
    key: "short_answer",
    label: "Short answer",
    countKey: "short_answer_count",
    markKey: "marks_per_short",
    max: 30,
  },
  {
    key: "long_answer",
    label: "Long answer",
    countKey: "long_answer_count",
    markKey: "marks_per_long",
    max: 20,
  },
  {
    key: "fill_blank",
    label: "Fill in blanks",
    countKey: "fill_blank_count",
    markKey: "marks_per_fill_blank",
    max: 50,
  },
  {
    key: "match_columns",
    label: "Match columns",
    countKey: "match_columns_count",
    markKey: "marks_per_match_columns",
    max: 30,
  },
  {
    key: "true_false",
    label: "True / False",
    countKey: "true_false_count",
    markKey: "marks_per_true_false",
    max: 50,
  },
];

const PRESETS = [
  {
    id: "class_test",
    label: "Class test",
    sub: "Short mixed paper",
    counts: {
      mcq_count: 5,
      short_answer_count: 3,
      long_answer_count: 2,
      fill_blank_count: 0,
      match_columns_count: 0,
      true_false_count: 0,
    },
  },
  {
    id: "balanced",
    label: "Balanced",
    sub: "Web default mix",
    counts: {
      mcq_count: 5,
      short_answer_count: 3,
      long_answer_count: 2,
      fill_blank_count: 2,
      match_columns_count: 1,
      true_false_count: 2,
    },
  },
  {
    id: "mcq",
    label: "MCQ drill",
    sub: "Objective only",
    counts: {
      mcq_count: 20,
      short_answer_count: 0,
      long_answer_count: 0,
      fill_blank_count: 0,
      match_columns_count: 0,
      true_false_count: 0,
    },
  },
];

const COMPETITIVE_PRESETS = [
  {
    id: "light_quiz",
    label: "Light quiz",
    sub: "10 MCQ only",
    counts: {
      mcq_count: 10,
      short_answer_count: 0,
      long_answer_count: 0,
      fill_blank_count: 0,
      match_columns_count: 0,
      true_false_count: 0,
    },
  },
  {
    id: "mid_quiz",
    label: "Mid quiz",
    sub: "20 MCQ only",
    counts: {
      mcq_count: 20,
      short_answer_count: 0,
      long_answer_count: 0,
      fill_blank_count: 0,
      match_columns_count: 0,
      true_false_count: 0,
    },
  },
  {
    id: "hard_quiz",
    label: "Hard quiz",
    sub: "50 MCQ only",
    counts: {
      mcq_count: 50,
      short_answer_count: 0,
      long_answer_count: 0,
      fill_blank_count: 0,
      match_columns_count: 0,
      true_false_count: 0,
    },
  },
];

const DEFAULT_COUNTS: Record<CountKey, number> = PRESETS[1].counts;
const DEFAULT_MARKS: Record<MarkKey, number> = {
  marks_per_mcq: 1,
  marks_per_short: 2,
  marks_per_long: 5,
  marks_per_fill_blank: 1,
  marks_per_match_columns: 2,
  marks_per_true_false: 1,
};
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeStandard(value?: string | null) {
  if (!value) return "";
  return String(value)
    .replace(/^std\.?\s*/i, "")
    .replace(/^standard\s*/i, "")
    .trim();
}

function isCompetitiveCourse(value?: string | null) {
  return /\b(jee|mht|mh[-\s]?cet|cet|neet)\b/i.test(value ?? "");
}

function boardToExamType(value?: string | null) {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("advanced")) return "jee_advanced";
  if (
    normalized.includes("mh") ||
    normalized.includes("mht") ||
    normalized.includes("cet")
  )
    return "mhcet";
  if (normalized.includes("jee")) return "jee_mains";
  return null;
}

function subjectToCatalog(value?: string | null) {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("physics")) return "physics";
  if (normalized.includes("chemistry")) return "chemistry";
  if (normalized.includes("math")) return "mathematics";
  return null;
}

function getSubtopicTitle(item: string | { title?: string | null }) {
  return typeof item === "string" ? item : (item.title?.trim() ?? "");
}

function getQuestionTotals(
  counts: Record<CountKey, number>,
  marks: Record<MarkKey, number>,
  customTypes: CustomType[],
) {
  const baseQuestions = QUESTION_ROWS.reduce(
    (sum, row) => sum + counts[row.countKey],
    0,
  );
  const baseMarks = QUESTION_ROWS.reduce(
    (sum, row) => sum + counts[row.countKey] * marks[row.markKey],
    0,
  );
  const customQuestions = customTypes.reduce(
    (sum, item) => sum + item.count,
    0,
  );
  const customMarks = customTypes.reduce(
    (sum, item) => sum + item.count * item.marks,
    0,
  );
  return {
    questions: baseQuestions + customQuestions,
    marks: baseMarks + customMarks,
  };
}

function buildBlueprintSections(
  counts: Record<CountKey, number>,
  marks: Record<MarkKey, number>,
  customTypes: CustomType[],
): BlueprintSectionPayload[] {
  const sections: BlueprintSectionPayload[] = QUESTION_ROWS.filter(
    (row) => counts[row.countKey] > 0,
  ).map((row, index) => ({
    id: `section-${row.key}`,
    title: row.label,
    question_type: row.key,
    order: index,
    slots: Array.from({ length: counts[row.countKey] }, (_, slotIndex) => ({
      id: `slot-${row.key}-${slotIndex + 1}`,
      question_type: row.key,
      marks: marks[row.markKey],
      is_placeholder: true,
    })),
  }));

  customTypes
    .filter((item) => item.name.trim() && item.count > 0)
    .forEach((item, index) => {
      const sectionIndex = sections.length;
      sections.push({
        id: `section-custom-${item.id}`,
        title: item.name.trim(),
        question_type: "short_answer",
        order: sectionIndex + index,
        slots: Array.from({ length: item.count }, (_, slotIndex) => ({
          id: `slot-custom-${item.id}-${slotIndex + 1}`,
          question_type: "short_answer",
          marks: item.marks,
          is_placeholder: true,
        })),
      });
    });

  return sections;
}

function defaultPaperName(subjectName?: string, standard?: string) {
  return [subjectName, standard ? `Std ${standard}` : "", "Paper"]
    .filter(Boolean)
    .join(" ");
}

function CompactSelect({
  label,
  value,
  placeholder,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((option) => option.value === value)?.label;

  return (
    <View style={[styles.field, disabled && styles.disabledBlock]}>
      <TouchableOpacity
        activeOpacity={0.88}
        disabled={disabled}
        style={styles.selectTrigger}
        onPress={() => setOpen((current) => !current)}
      >
        <View style={styles.selectTextBlock}>
          <Text style={styles.fieldLabel}>{label}</Text>
          <Text
            style={[styles.selectValue, !selectedLabel && styles.placeholder]}
            numberOfLines={1}
          >
            {selectedLabel || placeholder}
          </Text>
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={17}
          color={colors.textMuted}
        />
      </TouchableOpacity>
      {open ? (
        <View style={styles.menu}>
          {options.length === 0 ? (
            <Text style={styles.emptyText}>No options available</Text>
          ) : (
            options.map((option) => {
              const active = option.value === value;
              return (
                <TouchableOpacity
                  key={option.value}
                  activeOpacity={0.86}
                  style={[styles.menuItem, active && styles.menuItemActive]}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.menuItemText,
                      active && styles.menuItemTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {active ? (
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color={colors.accentStrong}
                    />
                  ) : null}
                </TouchableOpacity>
              );
            })
          )}
        </View>
      ) : null}
    </View>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <TouchableOpacity
          activeOpacity={0.82}
          style={styles.stepperButton}
          onPress={() =>
            onChange(clamp(Number((value - step).toFixed(2)), min, max))
          }
        >
          <Ionicons name="remove" size={15} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{value}</Text>
        <TouchableOpacity
          activeOpacity={0.82}
          style={styles.stepperButton}
          onPress={() =>
            onChange(clamp(Number((value + step).toFixed(2)), min, max))
          }
        >
          <Ionicons name="add" size={15} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function InlineRecovery({
  title,
  body,
  onRetry,
  retryLabel = "Try again",
  onSecondary,
  secondaryLabel,
  pending = false,
}: {
  title: string;
  body: string;
  onRetry: () => void;
  retryLabel?: string;
  onSecondary?: () => void;
  secondaryLabel?: string;
  pending?: boolean;
}) {
  return (
    <View style={styles.inlineRecovery}>
      <View style={styles.inlineRecoveryIcon}>
        <Ionicons
          name="cloud-offline-outline"
          size={18}
          color={colors.dangerText}
        />
      </View>
      <View style={styles.inlineRecoveryCopy}>
        <Text style={styles.inlineRecoveryTitle}>{title}</Text>
        <Text style={styles.inlineRecoveryBody}>{body}</Text>
        <TouchableOpacity
          activeOpacity={0.84}
          style={styles.inlineRetry}
          disabled={pending}
          onPress={onRetry}
        >
          {pending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="refresh" size={14} color={colors.white} />
          )}
          <Text style={styles.inlineRetryText}>{retryLabel}</Text>
        </TouchableOpacity>
        {onSecondary && secondaryLabel ? (
          <TouchableOpacity
            activeOpacity={0.84}
            style={styles.inlineSecondary}
            disabled={pending}
            onPress={onSecondary}
          >
            <Text style={styles.inlineSecondaryText}>{secondaryLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function StageCard({
  index,
  title,
  summary,
  active,
  done,
  locked,
  onPress,
  children,
}: {
  index: number;
  title: string;
  summary?: string;
  active: boolean;
  done?: boolean;
  locked?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.stageCard,
        active && styles.stageCardActive,
        locked && styles.disabledBlock,
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.88}
        disabled={locked}
        style={styles.stageHeader}
        onPress={onPress}
      >
        <View
          style={[
            styles.stageNumber,
            done && styles.stageNumberDone,
            active && styles.stageNumberActive,
          ]}
        >
          {done ? (
            <Ionicons name="checkmark" size={16} color={colors.white} />
          ) : (
            <Text
              style={[
                styles.stageNumberText,
                active && styles.stageNumberTextActive,
              ]}
            >
              {String(index).padStart(2, "0")}
            </Text>
          )}
        </View>
        <View style={styles.stageTitleBlock}>
          <Text style={styles.stageTitle}>{title}</Text>
          {summary ? (
            <Text style={styles.stageSummary} numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
        {locked ? (
          <Ionicons
            name="lock-closed-outline"
            size={16}
            color={colors.textSubtle}
          />
        ) : done ? (
          <View style={styles.stageEdit}>
            <Text style={styles.stageEditText}>Edit</Text>
            <Ionicons
              name="chevron-forward"
              size={15}
              color={colors.accentStrong}
            />
          </View>
        ) : (
          <Ionicons
            name={active ? "chevron-up" : "chevron-down"}
            size={17}
            color={colors.textMuted}
          />
        )}
      </TouchableOpacity>
      {active && !locked ? (
        <View style={styles.stageBody}>{children}</View>
      ) : null}
    </View>
  );
}

function GenerateStudioHeader({
  stage,
  onBack,
}: {
  stage: Stage;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const stageCopy = [
    {
      pill: "Build",
      title: "Generate.",
      body: "Pick exam, subject, source, and chapters. No hidden page.",
    },
    {
      pill: "Mix",
      title: "Question mix.",
      body: "Keep generation fast with clear presets and an honest total.",
    },
    {
      pill: "Ready",
      title: "Generate draft.",
      body: "Duration, difficulty, and the final action.",
    },
  ][stage];

  return (
    <View
      style={[styles.studioHeader, { paddingTop: insets.top + spacing[3] }]}
    >
      <View style={styles.studioTop}>
        <TouchableOpacity
          activeOpacity={0.86}
          style={styles.studioBackButton}
          onPress={onBack}
          accessibilityLabel="Back to papers"
        >
          <Ionicons name="arrow-back" size={18} color={colors.nav} />
        </TouchableOpacity>
        <AuthLogoMark size={38} style={styles.studioLogo} />
        <View style={styles.studioBrandCopy}>
          <Text style={styles.studioBrandTitle}>Eduraa AI</Text>
          <Text style={styles.studioBrandSubtitle}>Generate paper</Text>
        </View>
        <View style={styles.studioStepPill}>
          <Text style={styles.studioStepPillText}>
            {String(stage + 1).padStart(2, "0")} · {stageCopy.pill}
          </Text>
        </View>
      </View>
      <View style={styles.studioHeading}>
        <Text style={styles.studioKicker}>PAPER STUDIO</Text>
        <Text style={styles.studioTitle}>{stageCopy.title}</Text>
        <Text style={styles.studioBody}>{stageCopy.body}</Text>
      </View>
    </View>
  );
}

export default function GeneratePaperScreen() {
  const navigation = useNavigation<Nav>();
  const [stage, setStage] = useState<Stage>(0);
  const [maxStageReached, setMaxStageReached] = useState(0);
  const [chapterSource, setChapterSource] = useState<ChapterSource>("books");
  const [board, setBoard] = useState("");
  const [standard, setStandard] = useState("");
  const [division, setDivision] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterIds, setChapterIds] = useState<string[]>([]);
  const [subtopicNames, setSubtopicNames] = useState<string[]>([]);
  const [chapters, setChapters] = useState<ChapterWithSubtopics[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [chaptersError, setChaptersError] = useState(false);
  const [chapterLoadKey, setChapterLoadKey] = useState(0);
  const [paperName, setPaperName] = useState("");
  const [counts, setCounts] =
    useState<Record<CountKey, number>>(DEFAULT_COUNTS);
  const [marks, setMarks] = useState<Record<MarkKey, number>>(DEFAULT_MARKS);
  const [customTypes, setCustomTypes] = useState<CustomType[]>([]);
  const [durationInput, setDurationInput] = useState("");
  const [durationTouched, setDurationTouched] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [generationError, setGenerationError] = useState<string | null>(null);
  // Latches once the student picks a source themselves, so the smart default
  // below never overrides a deliberate choice. Reset on subject/exam pivot.
  const userChoseSourceRef = useRef(false);
  const durationResult = useMemo(
    () => parsePaperDuration(durationInput),
    [durationInput],
  );

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const {
    data: options,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["paper-options"],
    queryFn: papersApi.getOptions,
  });

  const isCompetitive = isCompetitiveCourse(board);
  const scope = useMemo(
    () => resolvePaperScope(options ?? {}, { standard, division, subjectId }),
    [division, options, standard, subjectId],
  );
  const subjects = scope.subjects;
  const selectedSubject = subjects.find((subject) => subject.id === subjectId);
  const aiExamType = boardToExamType(board);
  const aiCatalogSubject = subjectToCatalog(selectedSubject?.name);
  const aiSourceAvailable = Boolean(
    isCompetitive && aiExamType && aiCatalogSubject,
  );
  const {
    data: aiSyllabus,
    isLoading: aiSyllabusLoading,
    isError: aiSyllabusError,
    refetch: refetchAiSyllabus,
  } = useQuery({
    queryKey: ["jee-syllabus", aiExamType, aiCatalogSubject],
    enabled: aiSourceAvailable,
    queryFn: () =>
      papersApi.getJeeSyllabus({
        exam_type: aiExamType!,
        subject: aiCatalogSubject!,
      }),
  });
  const aiChapters = useMemo<ChapterWithSubtopics[]>(
    () =>
      (aiSyllabus?.chapters ?? []).map((chapter) => ({
        id: chapter.key,
        title: chapter.title,
        subject_id: subjectId,
        order: 0,
        subtopics: chapter.subtopics ?? [],
      })),
    [aiSyllabus, subjectId],
  );
  const activeChapters = useMemo(
    () => (chapterSource === "ai" ? aiChapters : chapters),
    [aiChapters, chapterSource, chapters],
  );
  const selectedChapters = useMemo(
    () => activeChapters.filter((chapter) => chapterIds.includes(chapter.id)),
    [activeChapters, chapterIds],
  );
  const activePresets = isCompetitive ? COMPETITIVE_PRESETS : PRESETS;
  const visibleQuestionRows = isCompetitive
    ? QUESTION_ROWS.filter((row) => row.key === "mcq")
    : QUESTION_ROWS;
  const derivedSubtopics = useMemo(() => {
    const names = selectedChapters.flatMap((chapter) =>
      (chapter.subtopics ?? []).map(getSubtopicTitle),
    );
    return Array.from(new Set(names.filter(Boolean)));
  }, [selectedChapters]);
  const totals = getQuestionTotals(counts, marks, customTypes);
  const topicDone = !!subjectId && chapterIds.length > 0;
  const questionsDone = totals.questions > 0;
  const topicConfirmed = topicDone && maxStageReached >= 1;
  const questionsConfirmed = questionsDone && maxStageReached >= 2;
  const effectiveStandard = isCompetitive ? board : standard;
  const effectiveDivision = isCompetitive ? "Individual" : division;
  const effectivePaperName =
    paperName.trim() ||
    defaultPaperName(selectedSubject?.name, isCompetitive ? "" : standard);
  const topicSummary = topicDone
    ? `${selectedSubject?.name ?? "Subject"} - ${chapterIds.length} chapter${chapterIds.length === 1 ? "" : "s"}`
    : undefined;
  const questionSummary = questionsDone
    ? `${totals.questions} questions - ${totals.marks} marks`
    : undefined;

  useEffect(() => {
    if (!board && options?.courses?.[0]) setBoard(options.courses[0]);
  }, [board, options]);

  // Pull the selection back onto a combination the backend accepts whenever the
  // options load or a narrower choice invalidates a wider one.
  useEffect(() => {
    if (!options) return;
    if (scope.selection.standard !== standard) {
      setStandard(scope.selection.standard);
    }
    if (scope.selection.division !== division) {
      setDivision(scope.selection.division);
    }
    if (scope.selection.subjectId !== subjectId) {
      setSubjectId(scope.selection.subjectId);
    }
  }, [division, options, scope, standard, subjectId]);

  // Smart default: prefer Books whenever this (exam, subject) pair actually has
  // indexed book chapters, and only fall back to AI when the book shelf comes
  // back empty. Keying off `chapters.length` rather than `aiSourceAvailable`
  // matters — every JEE subject makes AI "available", so the old check pushed
  // students onto AI even when a full book bank existed. Stops the moment the
  // student picks a source themselves.
  useEffect(() => {
    if (userChoseSourceRef.current) return;
    if (!subjectId) {
      if (chapterSource !== "books") setChapterSource("books");
      return;
    }
    if (chaptersLoading) return;
    if (chapters.length === 0 && aiSourceAvailable) {
      if (chapterSource !== "ai") {
        setChapterSource("ai");
      }
    } else if (chapters.length > 0 && chapterSource !== "books") {
      setChapterSource("books");
    }
  }, [
    aiSourceAvailable,
    chapterSource,
    chapters.length,
    chaptersLoading,
    subjectId,
  ]);

  // Pivoting subject or exam invalidates any chapter ids/keys from the previous
  // source, and re-arms the smart default for the new pair.
  useEffect(() => {
    userChoseSourceRef.current = false;
    setChapterIds([]);
    setSubtopicNames([]);
  }, [board, subjectId]);

  useEffect(() => {
    if (!subjectId) {
      setChapters([]);
      setChapterIds([]);
      setSubtopicNames([]);
      setChaptersError(false);
      return;
    }

    let cancelled = false;
    setChaptersLoading(true);
    setChaptersError(false);
    setChapters([]);
    setChapterIds([]);
    setSubtopicNames([]);
    papersApi
      .getChapters(subjectId, {
        board,
        standard: effectiveStandard,
        indexedOnly: true,
      })
      .then((items) => {
        if (cancelled) return;
        setChapters(items as ChapterWithSubtopics[]);
      })
      .catch(() => {
        if (!cancelled) {
          setChapters([]);
          setChaptersError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setChaptersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [board, chapterLoadKey, effectiveStandard, subjectId]);

  useEffect(() => {
    setSubtopicNames((current) => {
      const next = current.filter((name) => derivedSubtopics.includes(name));
      return next.length === current.length &&
        next.every((name, index) => name === current[index])
        ? current
        : next;
    });
  }, [derivedSubtopics]);

  useEffect(() => {
    if (!isCompetitive) return;
    setCustomTypes([]);
    setCounts(COMPETITIVE_PRESETS[0].counts);
  }, [isCompetitive]);

  const generationJob = usePaperGenerationJob({
    onCompleted: (paperId) => navigation.replace("PaperDetail", { paperId }),
    onFailed: (message) => setGenerationError(message),
  });

  const generateMutation = useMutation({
    mutationFn: async (input: GenerateInput) => {
      if (input.ai) {
        const response = await papersApi.generateJeeFormPaper(
          buildJeeFormPaperRequest(input.ai, input.ai.durationMinutes),
        );
        if (response.status === "failed") {
          throw new Error(
            response.error ||
              "AI question generator failed. Try different chapters.",
          );
        }
        if (!response.paper_id) {
          throw new Error(
            `AI generation finished but no paper was produced. Status: ${response.status}`,
          );
        }
        const paper = await papersApi.getById(response.paper_id);
        return {
          paper,
          requestedCount: input.ai.count,
          generatedCount: paper.questions.length,
        };
      }
      // School papers mix long and short answers over retrieval and routinely
      // outrun a single request, so they go through the background worker.
      // Competitive papers are short MCQ sets and keep the direct call, which
      // is also what the book-shortage retry below probes against.
      if (input.useGenerationJob) {
        await generationJob.start(input.payload);
        return null;
      }
      if (!input.useAvailableBookCount) {
        const paper = await papersApi.generate(input.payload);
        return {
          paper,
          requestedCount: input.payload.mcq_count,
          generatedCount: paper.questions.length,
        };
      }

      const largest = await findLargestAvailableBookCount(
        input.payload.mcq_count,
        (count) => papersApi.generate(withBookMcqCount(input.payload, count)),
      );
      if (!largest) {
        throw new Error(
          "No approved book questions are available for these chapters.",
        );
      }
      return {
        paper: largest.result,
        requestedCount: input.payload.mcq_count,
        generatedCount: largest.result.questions.length,
      };
    },
    onMutate: () => setGenerationError(null),
    onSuccess: (result) => {
      if (!result) return;
      const { paper, requestedCount, generatedCount } = result;
      navigation.replace("PaperDetail", {
        paperId: paper.id,
        generationNotice:
          generatedCount < requestedCount
            ? `Created ${generatedCount} of ${requestedCount} requested questions from the approved book bank.`
            : undefined,
      });
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail
                .map((item: any) => item.msg || JSON.stringify(item))
                .join("\n")
            : err?.message || "Unable to generate the draft.";
      setGenerationError(message);
    },
  });

  const jobView = generationJob.job
    ? describePaperGenerationJob(generationJob.job)
    : null;
  const isGenerating =
    generateMutation.isPending ||
    generationJob.isStarting ||
    generationJob.isRunning;

  const selectAllChapters = () =>
    setChapterIds(activeChapters.map((chapter) => chapter.id));
  const clearChapters = () => {
    setChapterIds([]);
    setSubtopicNames([]);
  };
  const toggleChapter = (id: string) => {
    setChapterIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  };
  const toggleSubtopic = (name: string) => {
    setSubtopicNames((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name],
    );
  };
  const setCount = (key: CountKey, value: number) => {
    const max = QUESTION_ROWS.find((row) => row.countKey === key)?.max ?? 50;
    setCounts((current) => ({
      ...current,
      [key]: clamp(Math.round(value), 0, max),
    }));
  };
  const setMark = (key: MarkKey, value: number) => {
    setMarks((current) => ({
      ...current,
      [key]: clamp(Number(value.toFixed(2)), 0.25, 50),
    }));
  };
  const applyPreset = (presetId: string) => {
    const preset = activePresets.find((item) => item.id === presetId);
    if (preset) setCounts(preset.counts);
  };
  const updateCustomType = (id: string, patch: Partial<CustomType>) => {
    setCustomTypes((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };
  const removeCustomType = (id: string) => {
    setCustomTypes((current) => current.filter((item) => item.id !== id));
  };

  const handleGenerate = (generationMode: "exact" | "available" = "exact") => {
    if (!topicDone) {
      setStage(0);
      Alert.alert(
        "Select topic",
        "Choose subject and at least one chapter first.",
      );
      return;
    }
    if (!questionsDone) {
      setStage(1);
      Alert.alert(
        "Add questions",
        "Add at least one question before generating.",
      );
      return;
    }
    setDurationTouched(true);
    if (durationResult.error) return;

    const blueprintSections = buildBlueprintSections(
      counts,
      marks,
      customTypes,
    );
    const payload: PaperGenerateRequest = {
      subject_id: subjectId,
      chapter_ids: chapterIds,
      chapter_titles: selectedChapters.map((chapter) => chapter.title),
      difficulty,
      title_line_1: effectivePaperName,
      course: board || undefined,
      standard: normalizeStandard(effectiveStandard) || undefined,
      division: effectiveDivision || undefined,
      subtopic_names: subtopicNames.length ? subtopicNames : undefined,
      custom_question_types: customTypes
        .filter((item) => item.name.trim() && item.count > 0)
        .map((item) => ({
          name: item.name.trim(),
          count: item.count,
          marks: item.marks,
        })),
      timer_value: durationResult.minutes,
      timer_unit: "minutes",
      duration_minutes: durationResult.minutes,
      only_fill_blanks:
        counts.fill_blank_count > 0 &&
        counts.mcq_count === 0 &&
        counts.short_answer_count === 0 &&
        counts.long_answer_count === 0 &&
        counts.match_columns_count === 0 &&
        counts.true_false_count === 0 &&
        customTypes.every((item) => item.count === 0),
      blueprint_header: {
        title: effectivePaperName,
        subject_name: selectedSubject?.name ?? "Subject",
        board,
        standard: normalizeStandard(effectiveStandard),
        division: effectiveDivision,
        duration_minutes: durationResult.minutes,
        target_marks: totals.marks,
      },
      blueprint_sections: blueprintSections,
      ...counts,
      ...marks,
    };

    generateMutation.mutate({
      payload,
      useGenerationJob: !isCompetitive,
      useAvailableBookCount:
        generationMode === "available" && chapterSource === "books",
      ai:
        chapterSource === "ai" && aiSourceAvailable
          ? {
              examType: aiExamType!,
              subject: aiCatalogSubject!,
              chapterKeys: chapterIds,
              count: totals.questions,
              marks: marks.marks_per_mcq,
              subtopic: subtopicNames[0],
              title: effectivePaperName,
              durationMinutes: durationResult.minutes,
            }
          : undefined,
    });
  };

  if (isLoading) {
    return (
      <View style={styles.root}>
        <GenerateStudioHeader stage={0} onBack={() => navigation.goBack()} />
        <View style={styles.stateSurface}>
          <View style={styles.stateMark}>
            <ActivityIndicator color={colors.accentStrong} />
          </View>
          <Text style={styles.stateEyebrow}>PAPER STUDIO</Text>
          <Text style={styles.stateTitle}>Preparing your scope.</Text>
          <Text style={styles.stateBody}>
            Loading exams, subjects, and the chapter sources available to you.
          </Text>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.root}>
        <GenerateStudioHeader stage={0} onBack={() => navigation.goBack()} />
        <View style={styles.stateSurface}>
          <View style={[styles.stateMark, styles.stateMarkError]}>
            <Ionicons
              name="cloud-offline-outline"
              size={22}
              color={colors.dangerText}
            />
          </View>
          <Text style={styles.stateEyebrow}>SCOPE UNAVAILABLE</Text>
          <Text style={styles.stateTitle}>Your setup is still safe.</Text>
          <Text style={styles.stateBody}>
            Paper options could not load. Check the connection and retry from
            here.
          </Text>
          <PrimaryButton
            label="Try again"
            variant="secondary"
            onPress={() => void refetch()}
          />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <GenerateStudioHeader stage={stage} onBack={() => navigation.goBack()} />
      <Screen contentStyle={styles.screenContentAfterHeader}>
        <View style={styles.progress}>
          {[0, 1, 2].map((item) => {
            const done =
              (item === 0 && topicConfirmed) ||
              (item === 1 && questionsConfirmed);
            return (
              <React.Fragment key={item}>
                <View
                  style={[
                    styles.progressDot,
                    stage === item && styles.progressDotActive,
                    done && stage !== item && styles.progressDotDone,
                  ]}
                >
                  {done && stage !== item ? (
                    <Ionicons name="checkmark" size={14} color={colors.white} />
                  ) : (
                    <Text
                      style={[
                        styles.progressDotText,
                        stage === item && styles.progressDotTextActive,
                      ]}
                    >
                      {item + 1}
                    </Text>
                  )}
                </View>
                {item < 2 ? (
                  <View
                    style={[
                      styles.progressLine,
                      (item < stage || done) && styles.progressLineDone,
                    ]}
                  />
                ) : null}
              </React.Fragment>
            );
          })}
        </View>

        <StageCard
          index={1}
          title="Topic"
          summary={topicSummary}
          active={stage === 0}
          done={topicConfirmed && stage !== 0}
          onPress={() => setStage(0)}
        >
          {(options?.courses ?? []).length > 1 ? (
            <CompactSelect
              label={isCompetitive ? "Competitive exam" : "Board"}
              value={board}
              placeholder={isCompetitive ? "Select exam" : "Select board"}
              options={(options?.courses ?? []).map((item) => ({
                value: item,
                label: item,
              }))}
              onChange={(value) => {
                setBoard(value);
                clearChapters();
              }}
            />
          ) : null}
          {!isCompetitive && scope.standards.length > 0 ? (
            <CompactSelect
              label="Standard"
              value={standard}
              placeholder="Select standard"
              options={scope.standards.map((item) => ({
                value: item,
                label: normalizeStandard(item)
                  ? `Std ${normalizeStandard(item)}`
                  : item,
              }))}
              onChange={(value) => {
                setStandard(value);
                setSubjectId("");
                clearChapters();
              }}
            />
          ) : null}
          {!isCompetitive && scope.divisions.length > 0 ? (
            <CompactSelect
              label="Division"
              value={division}
              placeholder="Select division"
              options={scope.divisions.map((item) => ({
                value: item,
                label: `Div ${item}`,
              }))}
              onChange={(value) => {
                setDivision(value);
                setSubjectId("");
                clearChapters();
              }}
            />
          ) : null}
          {isCompetitive ? (
            <View style={styles.examModeCard}>
              <View style={styles.examModeIcon}>
                <Ionicons
                  name="trophy-outline"
                  size={17}
                  color={colors.accentStrong}
                />
              </View>
              <View style={styles.examModeCopy}>
                <Text style={styles.examModeTitle}>
                  {board || "Competitive exam"} mode
                </Text>
                <Text style={styles.examModeBody}>
                  Standard and division are handled as Individual, matching the
                  website flow.
                </Text>
              </View>
            </View>
          ) : null}
          <CompactSelect
            label="Subject"
            value={subjectId}
            placeholder="Select subject"
            options={subjects.map((subject) => ({
              value: subject.id,
              label: subject.name,
            }))}
            onChange={setSubjectId}
          />
          {subjectId && isCompetitive ? (
            <View style={styles.sourcePanel}>
              <View style={styles.sourceHeader}>
                <Text style={styles.fieldLabel}>Question source</Text>
                {aiSourceAvailable ? (
                  <Text style={styles.sourceReady}>AI ready</Text>
                ) : (
                  <Text style={styles.sourceMuted}>AI unavailable</Text>
                )}
              </View>
              <View style={styles.sourceTabs}>
                {(["ai", "books"] as ChapterSource[]).map((source) => {
                  const active = chapterSource === source;
                  const disabled = source === "ai" && !aiSourceAvailable;
                  return (
                    <TouchableOpacity
                      key={source}
                      activeOpacity={0.88}
                      disabled={disabled}
                      style={[
                        styles.sourceTab,
                        active && styles.sourceTabActive,
                        disabled && styles.disabledBlock,
                      ]}
                      onPress={() => {
                        userChoseSourceRef.current = true;
                        setChapterSource(source);
                        clearChapters();
                      }}
                    >
                      <Ionicons
                        name={
                          source === "ai"
                            ? "sparkles-outline"
                            : "library-outline"
                        }
                        size={15}
                        color={active ? colors.white : colors.textMuted}
                      />
                      <Text
                        style={[
                          styles.sourceTabText,
                          active && styles.sourceTabTextActive,
                        ]}
                      >
                        {source === "ai" ? "AI syllabus" : "Books"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
          <View style={styles.boxField}>
            <View style={styles.boxHeader}>
              <View>
                <Text style={styles.fieldLabel}>
                  {chapterSource === "ai" ? "AI syllabus chapters" : "Chapters"}
                </Text>
                {subjectId && activeChapters.length > 0 ? (
                  <Text style={styles.selectionMeta}>
                    {chapterIds.length} of {activeChapters.length} selected
                  </Text>
                ) : null}
              </View>
              <View style={styles.rowActions}>
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={selectAllChapters}
                >
                  <Text style={styles.linkText}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.86} onPress={clearChapters}>
                  <Text style={styles.linkText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>
            {(chapterSource === "ai" ? aiSyllabusLoading : chaptersLoading) ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator color={colors.accentStrong} />
                <Text style={styles.emptyText}>Loading chapters</Text>
              </View>
            ) : chapterSource === "ai" && aiSyllabusError ? (
              <InlineRecovery
                title="AI syllabus unavailable"
                body="Your selections are safe. Check the connection and retry this syllabus."
                onRetry={() => void refetchAiSyllabus()}
              />
            ) : chapterSource === "books" && chaptersError ? (
              <InlineRecovery
                title="Chapters unavailable"
                body="Your subject is still selected. Retry the indexed chapter list."
                onRetry={() => setChapterLoadKey((current) => current + 1)}
              />
            ) : !subjectId ? (
              <Text style={styles.emptyText}>Select subject first</Text>
            ) : chapterSource === "ai" && !aiSourceAvailable ? (
              <Text style={styles.emptyText}>
                AI source needs MH-CET/JEE and Physics, Chemistry, or
                Mathematics.
              </Text>
            ) : activeChapters.length === 0 ? (
              <Text style={styles.emptyText}>
                {chapterSource === "ai"
                  ? "No AI syllabus available for this exam and subject."
                  : "No indexed books for this subject yet."}
              </Text>
            ) : (
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator
                style={styles.optionList}
                contentContainerStyle={styles.optionListContent}
              >
                {activeChapters.map((chapter) => {
                  const active = chapterIds.includes(chapter.id);
                  return (
                    <TouchableOpacity
                      key={chapter.id}
                      activeOpacity={0.86}
                      style={[styles.checkRow, active && styles.checkRowActive]}
                      onPress={() => toggleChapter(chapter.id)}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          active && styles.checkboxActive,
                        ]}
                      >
                        {active ? (
                          <Ionicons
                            name="checkmark"
                            size={12}
                            color={colors.white}
                          />
                        ) : null}
                      </View>
                      <Text
                        style={[
                          styles.checkText,
                          active && styles.checkTextActive,
                        ]}
                        numberOfLines={2}
                      >
                        {chapter.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
          <View style={styles.boxField}>
            <View style={styles.boxHeader}>
              <Text style={styles.fieldLabel}>Subtopics</Text>
              {derivedSubtopics.length > 0 ? (
                <View style={styles.rowActions}>
                  <TouchableOpacity
                    activeOpacity={0.86}
                    onPress={() => setSubtopicNames(derivedSubtopics)}
                  >
                    <Text style={styles.linkText}>All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.86}
                    onPress={() => setSubtopicNames([])}
                  >
                    <Text style={styles.linkText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
            {chapterIds.length === 0 ? (
              <Text style={styles.emptyText}>Select chapters first</Text>
            ) : derivedSubtopics.length === 0 ? (
              <Text style={styles.emptyText}>
                No subtopics detected for selected chapters
              </Text>
            ) : (
              <View style={styles.chipWrap}>
                {derivedSubtopics.map((topic) => {
                  const active = subtopicNames.includes(topic);
                  return (
                    <TouchableOpacity
                      key={topic}
                      activeOpacity={0.86}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => toggleSubtopic(topic)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {topic}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
          <PrimaryButton
            label="Next: Questions"
            disabled={!topicDone}
            onPress={() => {
              setMaxStageReached((current) => Math.max(current, 1));
              setStage(1);
            }}
          />
        </StageCard>

        <StageCard
          index={2}
          title="Questions"
          summary={questionSummary}
          active={stage === 1}
          done={questionsConfirmed && stage !== 1}
          locked={!topicDone}
          onPress={() => {
            setMaxStageReached((current) => Math.max(current, 1));
            setStage(1);
          }}
        >
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Paper name (optional)</Text>
            <TextInput
              value={paperName}
              onChangeText={setPaperName}
              placeholder={defaultPaperName(
                selectedSubject?.name,
                isCompetitive ? "" : standard,
              )}
              placeholderTextColor={colors.textSubtle}
              style={styles.input}
            />
          </View>
          <View style={styles.presetRow}>
            {activePresets.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                activeOpacity={0.88}
                style={styles.presetButton}
                onPress={() => applyPreset(preset.id)}
              >
                <Text style={styles.presetTitle}>{preset.label}</Text>
                <Text style={styles.presetSub}>{preset.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.questionList}>
            {visibleQuestionRows.map((row) => (
              <View key={row.key} style={styles.questionRow}>
                <View style={styles.questionHeader}>
                  <Text style={styles.questionTitle}>{row.label}</Text>
                  <Text style={styles.questionMeta}>
                    {counts[row.countKey]} x {marks[row.markKey]} ={" "}
                    {counts[row.countKey] * marks[row.markKey]}
                  </Text>
                </View>
                <View style={styles.questionControls}>
                  <Stepper
                    label="Count"
                    value={counts[row.countKey]}
                    min={0}
                    max={row.max}
                    onChange={(value) => setCount(row.countKey, value)}
                  />
                  <Stepper
                    label="Marks"
                    value={marks[row.markKey]}
                    min={0.25}
                    max={50}
                    step={0.25}
                    onChange={(value) => setMark(row.markKey, value)}
                  />
                </View>
              </View>
            ))}
            {customTypes.map((item) => (
              <View key={item.id} style={styles.customRow}>
                <View style={styles.customHeader}>
                  <TextInput
                    value={item.name}
                    onChangeText={(value) =>
                      updateCustomType(item.id, { name: value })
                    }
                    placeholder="Custom type"
                    placeholderTextColor={colors.textSubtle}
                    style={[styles.input, styles.customInput]}
                  />
                  <TouchableOpacity
                    activeOpacity={0.86}
                    style={styles.removeButton}
                    onPress={() => removeCustomType(item.id)}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={17}
                      color={colors.danger}
                    />
                  </TouchableOpacity>
                </View>
                <View style={styles.questionControls}>
                  <Stepper
                    label="Count"
                    value={item.count}
                    min={0}
                    max={30}
                    onChange={(value) =>
                      updateCustomType(item.id, { count: Math.round(value) })
                    }
                  />
                  <Stepper
                    label="Marks"
                    value={item.marks}
                    min={0.25}
                    max={50}
                    step={0.25}
                    onChange={(value) =>
                      updateCustomType(item.id, { marks: value })
                    }
                  />
                </View>
              </View>
            ))}
          </View>
          {!isCompetitive ? (
            <TouchableOpacity
              activeOpacity={0.86}
              style={styles.addTypeButton}
              onPress={() =>
                setCustomTypes((current) => [
                  ...current,
                  { id: String(Date.now()), name: "", count: 2, marks: 2 },
                ])
              }
            >
              <Ionicons name="add" size={16} color={colors.accentStrong} />
              <Text style={styles.addTypeText}>Add custom type</Text>
            </TouchableOpacity>
          ) : null}
          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>
              {totals.questions} questions - {totals.marks} marks
            </Text>
          </View>
          <PrimaryButton
            label="Next: Settings"
            disabled={!questionsDone}
            onPress={() => {
              setMaxStageReached((current) => Math.max(current, 2));
              setStage(2);
            }}
          />
        </StageCard>

        <StageCard
          index={3}
          title="Settings & generate"
          active={stage === 2}
          locked={!topicDone || !questionsDone}
          onPress={() => {
            setMaxStageReached((current) => Math.max(current, 2));
            setStage(2);
          }}
        >
          <View style={styles.twoCol}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Duration (minutes)</Text>
              <TextInput
                value={durationInput}
                onChangeText={setDurationInput}
                onBlur={() => setDurationTouched(true)}
                placeholder="Enter minutes"
                placeholderTextColor={colors.textSubtle}
                keyboardType="number-pad"
                inputMode="numeric"
                returnKeyType="done"
                accessibilityLabel="Duration in minutes"
                accessibilityHint="Leave empty for no timer"
                aria-invalid={durationTouched && Boolean(durationResult.error)}
                style={[
                  styles.input,
                  durationTouched &&
                    durationResult.error &&
                    styles.inputInvalid,
                ]}
              />
              {durationTouched && durationResult.error ? (
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={styles.fieldError}
                >
                  {durationResult.error}
                </Text>
              ) : (
                <Text style={styles.fieldHelper}>
                  Leave empty for no timer.
                </Text>
              )}
            </View>
            <CompactSelect
              label="Difficulty"
              value={difficulty}
              placeholder="Select difficulty"
              options={DIFFICULTIES.map((item) => ({
                value: item,
                label: item[0].toUpperCase() + item.slice(1),
              }))}
              onChange={(value) => setDifficulty(value as Difficulty)}
            />
          </View>
          <View style={styles.generateSummary}>
            <Text style={styles.generateTitle}>{effectivePaperName}</Text>
            <Text style={styles.generateBody}>
              {selectedSubject?.name ?? "Subject"} - {chapterIds.length}{" "}
              chapters - {totals.questions} questions - {totals.marks} marks
            </Text>
          </View>
          {generationError ? (
            <InlineRecovery
              title={
                chapterSource === "books" &&
                isBookQuestionShortage(generationError)
                  ? "Fewer approved book questions"
                  : "The draft paused"
              }
              body={
                chapterSource === "books" &&
                isBookQuestionShortage(generationError)
                  ? `These chapters do not have ${totals.questions} approved book questions yet. Generate the largest available set with its textbook images, or use AI syllabus for the full count.`
                  : `${generationError} Your topic, question mix, and settings are still here.`
              }
              retryLabel={
                chapterSource === "books" &&
                isBookQuestionShortage(generationError)
                  ? "Generate available"
                  : "Try again"
              }
              pending={isGenerating}
              onRetry={() =>
                handleGenerate(
                  chapterSource === "books" &&
                    isBookQuestionShortage(generationError)
                    ? "available"
                    : "exact",
                )
              }
              secondaryLabel={
                chapterSource === "books" &&
                isBookQuestionShortage(generationError) &&
                aiSourceAvailable
                  ? "Use AI syllabus"
                  : undefined
              }
              onSecondary={
                chapterSource === "books" &&
                isBookQuestionShortage(generationError) &&
                aiSourceAvailable
                  ? () => {
                      userChoseSourceRef.current = true;
                      setChapterSource("ai");
                      clearChapters();
                      setGenerationError(null);
                      setStage(0);
                    }
                  : undefined
              }
            />
          ) : null}
          {jobView && !generationError ? (
            <View style={styles.jobCard} accessibilityLiveRegion="polite">
              <View style={styles.jobHeader}>
                <ActivityIndicator size="small" color={colors.accentStrong} />
                <Text style={styles.jobHeadline}>{jobView.headline}</Text>
                {jobView.percent !== null ? (
                  <Text style={styles.jobPercent}>{jobView.percent}%</Text>
                ) : null}
              </View>
              {jobView.percent !== null ? (
                <View style={styles.jobTrack}>
                  <View
                    style={[styles.jobFill, { width: `${jobView.percent}%` }]}
                  />
                </View>
              ) : null}
              <Text style={styles.jobDetail}>
                {jobView.detail ??
                  "This keeps running if you leave the screen — come back any time."}
              </Text>
            </View>
          ) : null}
          <PrimaryButton
            label={isGenerating ? "Generating draft..." : "Generate draft"}
            loading={isGenerating}
            disabled={!topicDone || !questionsDone || isGenerating}
            onPress={handleGenerate}
          />
        </StageCard>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FBF6EC",
  },
  jobCard: {
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
  },
  jobHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  jobHeadline: {
    flex: 1,
    fontFamily: fonts.displaySemibold,
    fontSize: 15,
    color: colors.text,
  },
  jobPercent: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.accentStrong,
  },
  jobTrack: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.borderStrong,
    overflow: "hidden",
  },
  jobFill: {
    height: "100%",
    borderRadius: radius.full,
    backgroundColor: colors.accentStrong,
  },
  jobDetail: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textMuted,
  },
  screenContent: {
    paddingTop: spacing[2],
    paddingBottom: layout.bottomTabHeight + spacing[6],
    gap: spacing[3],
  },
  screenContentAfterHeader: {
    paddingTop: spacing[4],
    paddingBottom: layout.bottomTabHeight + spacing[6],
    gap: spacing[3],
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[3],
    padding: spacing[6],
    backgroundColor: colors.background,
  },
  stateSurface: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[7],
    paddingBottom: spacing[14],
  },
  stateMark: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF0E5",
    marginBottom: spacing[4],
  },
  stateMarkError: {
    backgroundColor: colors.dangerBg,
  },
  stateEyebrow: {
    color: colors.accentStrong,
    fontFamily: fonts.extrabold,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  stateTitle: {
    color: colors.nav,
    fontFamily: fonts.displayBold,
    fontSize: 23,
    lineHeight: 28,
    textAlign: "center",
    marginTop: spacing[1],
  },
  stateBody: {
    maxWidth: 310,
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 19,
    textAlign: "center",
    marginTop: spacing[2],
    marginBottom: spacing[5],
  },
  loadingText: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  errorTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 18,
  },
  errorBody: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  studioHeader: {
    minHeight: 184,
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[4],
    backgroundColor: "#FBF6EC",
    borderBottomWidth: 1,
    borderBottomColor: "#E0D6C8",
  },
  studioTop: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  studioBackButton: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: "#E0D6C8",
    ...shadows.xs,
  },
  studioLogo: {
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    backgroundColor: "transparent",
  },
  studioBrandCopy: {
    flex: 1,
  },
  studioBrandTitle: {
    color: colors.nav,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  studioBrandSubtitle: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 10,
    marginTop: 2,
  },
  studioStepPill: {
    minHeight: 30,
    paddingHorizontal: spacing[3],
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF0E5",
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  studioStepPillText: {
    color: "#9A3412",
    fontFamily: fonts.extrabold,
    fontSize: 9,
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  studioHeading: {
    paddingTop: spacing[4],
  },
  studioKicker: {
    color: colors.accentStrong,
    fontFamily: fonts.extrabold,
    fontSize: 9,
    letterSpacing: 1.4,
  },
  studioTitle: {
    color: colors.nav,
    fontFamily: fonts.displayBold,
    fontSize: 28,
    lineHeight: 31,
    marginTop: 4,
  },
  studioBody: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 17,
    marginTop: spacing[1],
  },
  hero: {
    borderRadius: 24,
    minHeight: 164,
    borderWidth: 1,
    borderColor: "rgba(194, 65, 12, 0.20)",
    overflow: "hidden",
    ...shadows.md,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  heroWarmVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(194,65,12,0.07)",
  },
  heroContent: {
    flex: 1,
    padding: spacing[4],
    justifyContent: "space-between",
    gap: spacing[4],
  },
  heroTop: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heroBackButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  heroBadge: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    backgroundColor: "rgba(17, 24, 39, 0.62)",
    borderWidth: 1,
    borderColor: "rgba(254, 215, 170, 0.22)",
  },
  heroBadgeText: {
    color: colors.orangeScale[100],
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  heroBody: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing[3],
  },
  heroCopy: {
    flex: 1,
  },
  heroSubtitle: {
    color: colors.slate[300],
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing[1],
  },
  topBar: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.backgroundElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topCopy: {
    flex: 1,
  },
  kicker: {
    color: colors.orangeScale[200],
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: colors.white,
    fontFamily: fonts.displayBold,
    fontSize: 25,
    letterSpacing: 0,
  },
  totalPill: {
    minWidth: 74,
    minHeight: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    paddingHorizontal: spacing[2],
  },
  totalPillText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  totalPillSub: {
    color: colors.slate[300],
    fontFamily: fonts.medium,
    fontSize: 10,
  },
  progress: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[1],
  },
  progressDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D9CCBC",
    backgroundColor: "#FFFDF8",
  },
  progressDotActive: {
    backgroundColor: colors.accentStrong,
    borderColor: colors.accentStrong,
  },
  progressDotDone: {
    backgroundColor: colors.nav,
    borderColor: colors.nav,
  },
  progressDotText: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  progressDotTextActive: {
    color: colors.white,
  },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#D9CCBC",
  },
  progressLineDone: {
    backgroundColor: colors.accent,
  },
  stageCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    overflow: "hidden",
    ...shadows.xs,
  },
  stageCardActive: {
    borderColor: colors.borderBrand,
    shadowColor: colors.orangeScale[700],
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  stageHeader: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
  },
  stageNumber: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.backgroundMuted,
  },
  stageNumberActive: {
    backgroundColor: colors.accentStrong,
  },
  stageNumberDone: {
    backgroundColor: colors.slate[950],
  },
  stageNumberText: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  stageNumberTextActive: {
    color: colors.white,
  },
  stageTitleBlock: {
    flex: 1,
  },
  stageTitle: {
    color: colors.text,
    fontFamily: fonts.displaySemibold,
    fontSize: 17,
    letterSpacing: 0,
  },
  stageSummary: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
    marginTop: 2,
  },
  stageEdit: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  stageEditText: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 11,
    textTransform: "uppercase",
  },
  stageBody: {
    gap: spacing[4],
    padding: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  field: {
    gap: spacing[2],
  },
  fieldLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  selectionMeta: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 10,
    marginTop: 3,
  },
  selectTrigger: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.slate[50],
    paddingHorizontal: spacing[3],
  },
  selectTextBlock: {
    flex: 1,
    gap: 2,
  },
  selectValue: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  examModeCard: {
    minHeight: 70,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[3],
  },
  examModeIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderBrand,
  },
  examModeCopy: {
    flex: 1,
    gap: 2,
  },
  examModeTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  examModeBody: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
  },
  sourcePanel: {
    gap: spacing[2],
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.slate[50],
    padding: spacing[3],
  },
  sourceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sourceReady: {
    color: colors.success,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  sourceMuted: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  sourceTabs: {
    flexDirection: "row",
    gap: spacing[2],
  },
  sourceTab: {
    flex: 1,
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  sourceTabActive: {
    backgroundColor: colors.slate[950],
    borderColor: colors.slate[950],
  },
  sourceTabText: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  sourceTabTextActive: {
    color: colors.white,
  },
  placeholder: {
    color: colors.textSubtle,
  },
  menu: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  menuItem: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  menuItemActive: {
    backgroundColor: colors.accentSurfaceStrong,
  },
  menuItemText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  menuItemTextActive: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
  },
  boxField: {
    gap: spacing[2],
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.slate[50],
    padding: spacing[3],
    overflow: "hidden",
  },
  boxHeader: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowActions: {
    flexDirection: "row",
    gap: spacing[3],
  },
  linkText: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  inlineLoading: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  emptyText: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 20,
    paddingVertical: spacing[1],
  },
  optionList: {
    maxHeight: 228,
    borderRadius: 14,
    overflow: "hidden",
  },
  optionListContent: {
    gap: spacing[1],
    paddingBottom: spacing[1],
  },
  checkRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    borderRadius: 14,
    paddingHorizontal: spacing[2],
  },
  checkRowActive: {
    backgroundColor: colors.accentSurface,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
  },
  checkboxActive: {
    borderColor: colors.accentStrong,
    backgroundColor: colors.accentStrong,
  },
  checkText: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  checkTextActive: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  chip: {
    minHeight: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[3],
  },
  chipActive: {
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurfaceStrong,
  },
  chipText: {
    color: colors.textSecondary,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  chipTextActive: {
    color: colors.accentStrong,
  },
  input: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.slate[50],
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 14,
    paddingHorizontal: spacing[3],
  },
  inputInvalid: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerSurface,
  },
  fieldHelper: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 16,
  },
  fieldError: {
    color: colors.dangerText,
    fontFamily: fonts.bold,
    fontSize: 11,
    lineHeight: 16,
  },
  presetRow: {
    flexDirection: "row",
    gap: spacing[2],
  },
  presetButton: {
    flex: 1,
    minHeight: 66,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.slate[50],
    justifyContent: "center",
    paddingHorizontal: spacing[2],
  },
  presetTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  presetSub: {
    color: colors.textMuted,
    fontFamily: fonts.regular,
    fontSize: 10,
    marginTop: 2,
  },
  questionList: {
    gap: spacing[2],
  },
  questionRow: {
    gap: spacing[3],
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.slate[50],
    padding: spacing[3],
  },
  questionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
  },
  questionTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  questionMeta: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  questionControls: {
    flexDirection: "row",
    gap: spacing[2],
  },
  stepper: {
    flex: 1,
    gap: spacing[1],
  },
  stepperLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 10,
    textTransform: "uppercase",
  },
  stepperControls: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundElevated,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    overflow: "hidden",
  },
  stepperButton: {
    width: 38,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperValue: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  customRow: {
    gap: spacing[2],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
    padding: spacing[3],
  },
  customHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  customInput: {
    flex: 1,
    backgroundColor: colors.white,
  },
  removeButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addTypeButton: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
  },
  addTypeText: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  totalBox: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderBrand,
    backgroundColor: colors.accentSurface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[3],
  },
  totalLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  totalValue: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  twoCol: {
    gap: spacing[4],
  },
  inlineRecovery: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBg,
    padding: spacing[3],
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
  },
  inlineRecoveryIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  inlineRecoveryCopy: {
    flex: 1,
  },
  inlineRecoveryTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  inlineRecoveryBody: {
    color: colors.dangerText,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 2,
  },
  inlineRetry: {
    alignSelf: "flex-start",
    minHeight: 38,
    marginTop: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.full,
    backgroundColor: colors.nav,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  inlineRetryText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  inlineSecondary: {
    alignSelf: "flex-start",
    minHeight: 38,
    paddingHorizontal: spacing[2],
    justifyContent: "center",
  },
  inlineSecondaryText: {
    color: colors.dangerText,
    fontFamily: fonts.bold,
    fontSize: 11,
    textDecorationLine: "underline",
  },
  generateSummary: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.slate[50],
    padding: spacing[4],
    gap: spacing[1],
  },
  generateTitle: {
    color: colors.text,
    fontFamily: fonts.displaySemibold,
    fontSize: 17,
    letterSpacing: 0,
  },
  generateBody: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 19,
  },
  disabledBlock: {
    opacity: 0.55,
  },
});
