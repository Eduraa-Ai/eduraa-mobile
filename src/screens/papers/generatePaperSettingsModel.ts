export type PaperDurationResult = {
  minutes: number | null;
  error: string | null;
};

export type PaperScopeSubject = {
  id: string;
  name: string;
};

export type PaperScopeSection = {
  standard: string;
  division: string;
  subjects: PaperScopeSubject[];
};

export type PaperScopeInput = {
  standards?: string[];
  divisions?: string[];
  subjects?: PaperScopeSubject[];
  sections?: PaperScopeSection[];
};

export type PaperScopeSelection = {
  standard: string;
  division: string;
  subjectId: string;
};

export type PaperScope = {
  standards: string[];
  divisions: string[];
  subjects: PaperScopeSubject[];
  selection: PaperScopeSelection;
};

export type PaperGenerationJobLike = {
  status: string;
  stage?: string | null;
  progress?: number | null;
  message?: string | null;
  completed_units?: number | null;
  total_units?: number | null;
  paper_id?: string | null;
  error_message?: string | null;
};

export type PaperGenerationJobView = {
  headline: string;
  detail: string | null;
  percent: number | null;
  isActive: boolean;
  failed: boolean;
  paperId: string | null;
};

export type AiPaperGenerationInput = {
  examType: string;
  subject: string;
  chapterKeys: string[];
  count: number;
  marks: number;
  subtopic?: string;
  title: string;
};

const DURATION_ERROR = "Enter a positive whole number of minutes.";

export function parsePaperDuration(value: string): PaperDurationResult {
  const trimmed = value.trim();
  if (!trimmed) return { minutes: null, error: null };
  if (!/^\d+$/.test(trimmed)) {
    return { minutes: null, error: DURATION_ERROR };
  }

  const minutes = Number(trimmed);
  if (!Number.isSafeInteger(minutes) || minutes <= 0) {
    return { minutes: null, error: DURATION_ERROR };
  }

  return { minutes, error: null };
}

export function buildJeeFormPaperRequest(
  input: AiPaperGenerationInput,
  durationMinutes: number | null,
) {
  return {
    exam_type: input.examType,
    subject: input.subject,
    chapter_keys: input.chapterKeys,
    count: input.count,
    question_marks: input.marks,
    subtopic: input.subtopic,
    title: input.title,
    duration_minutes: durationMinutes,
  };
}

function standardKey(value?: string | null) {
  return String(value ?? "")
    .replace(/^std\.?\s*/i, "")
    .replace(/^standard\s*/i, "")
    .trim()
    .toLowerCase();
}

function plainKey(value?: string | null) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/** Orders `Std 9` before `Std 10` instead of lexicographically. */
function compareStandards(left: string, right: string) {
  const leftNumber = Number(standardKey(left));
  const rightNumber = Number(standardKey(right));
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}

function uniqueBy<T>(values: T[], key: (value: T) => string) {
  const seen = new Map<string, T>();
  for (const value of values) {
    const identity = key(value);
    if (identity && !seen.has(identity)) seen.set(identity, value);
  }
  return Array.from(seen.values());
}

function pickOption(
  options: string[],
  current: string,
  key: (value?: string | null) => string,
) {
  const match = options.find((option) => key(option) === key(current));
  return match ?? options[0] ?? "";
}

/**
 * Narrow the generation scope to combinations the backend will accept.
 *
 * `/papers/options` returns `sections` — the (standard, division) → subjects
 * pairs a teacher is actually assigned to — and `POST /papers/generate` rejects
 * any triple outside that set. Flat `standards`/`divisions`/`subjects` are the
 * union across sections, so choosing from them independently can produce a
 * combination no section contains. Selecting a standard therefore narrows the
 * divisions, and both together narrow the subjects, mirroring the website.
 *
 * Returned values are the backend's own spelling, so `Std 9` stays `Std 9`
 * rather than drifting to a stripped form that no longer matches an assignment.
 * Roles without class assignments get no sections and keep the flat lists.
 */
export function resolvePaperScope(
  input: PaperScopeInput,
  selection: PaperScopeSelection,
): PaperScope {
  const sections = input.sections ?? [];
  const subjectIsSelectable = (subjects: PaperScopeSubject[]) =>
    subjects.some((subject) => subject.id === selection.subjectId);

  if (sections.length === 0) {
    const subjects = input.subjects ?? [];
    return {
      standards: input.standards ?? [],
      divisions: input.divisions ?? [],
      subjects,
      selection: {
        standard: selection.standard,
        division: selection.division,
        subjectId: subjectIsSelectable(subjects) ? selection.subjectId : "",
      },
    };
  }

  const standards = uniqueBy(
    sections.map((section) => section.standard),
    standardKey,
  ).sort(compareStandards);
  const standard = pickOption(standards, selection.standard, standardKey);

  const standardSections = sections.filter(
    (section) => standardKey(section.standard) === standardKey(standard),
  );
  const divisions = uniqueBy(
    standardSections.map((section) => section.division),
    plainKey,
  ).sort((left, right) => left.localeCompare(right));
  const division = pickOption(divisions, selection.division, plainKey);

  const subjects = uniqueBy(
    standardSections
      .filter((section) => plainKey(section.division) === plainKey(division))
      .flatMap((section) => section.subjects),
    (subject) => subject.id,
  ).sort((left, right) => left.name.localeCompare(right.name));

  return {
    standards,
    divisions,
    subjects,
    selection: {
      standard,
      division,
      subjectId: subjectIsSelectable(subjects) ? selection.subjectId : "",
    },
  };
}

const JOB_HEADLINES: Record<string, string> = {
  idle: "Starting up",
  queued: "Queued for the generator",
  preparing: "Preparing your scope",
  generating: "Writing questions",
  validating: "Checking the paper",
  saving: "Saving your paper",
  completed: "Paper ready",
  failed: "Generation failed",
  cancelled: "Generation cancelled",
};

const ACTIVE_JOB_STATUSES = new Set([
  "queued",
  "preparing",
  "generating",
  "validating",
  "saving",
]);

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Turn a generation job into the progress copy the studio screen renders. */
export function describePaperGenerationJob(
  job: PaperGenerationJobLike,
): PaperGenerationJobView {
  const status = String(job.status ?? "").toLowerCase();
  const failed = status === "failed" || status === "cancelled";
  const completed = Number(job.completed_units ?? Number.NaN);
  const total = Number(job.total_units ?? Number.NaN);

  let percent: number | null = null;
  if (typeof job.progress === "number" && Number.isFinite(job.progress)) {
    percent = clampPercent(job.progress);
  } else if (
    Number.isFinite(completed) &&
    Number.isFinite(total) &&
    total > 0
  ) {
    percent = clampPercent((completed / total) * 100);
  }
  if (status === "completed") percent = 100;

  const message = job.message?.trim();
  const unitDetail =
    Number.isFinite(completed) && Number.isFinite(total) && total > 0
      ? `${completed} of ${total} questions`
      : null;

  return {
    headline: JOB_HEADLINES[status] ?? "Working on your paper",
    detail: failed
      ? job.error_message?.trim() || message || null
      : message || unitDetail,
    percent,
    isActive: ACTIVE_JOB_STATUSES.has(status),
    failed,
    paperId: job.paper_id ?? null,
  };
}
