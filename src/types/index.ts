/**
 * Eduraa Mobile — TypeScript Types
 * Ported from frontend/src/types/index.ts + backend schemas
 */

// ─── Auth ────────────────────────────────────────────────────────────────────

export type Role =
  | "developer"
  | "school_super_admin"
  | "branch_admin"
  | "student"
  | "b2c_student"
  | "teacher"
  | "principal"
  | "admin";

export interface AccountMinimal {
  id: string;
  display_name: string;
  identifier: string;
  role: Role;
  profile_completed?: boolean | null;
  b2c_education_level?: string | null;
  b2c_board?: string | null;
  b2c_standard?: string | null;
  b2c_target_exam?: string | null;
  b2c_subjects?: string[] | null;
  exam_track?: string | null;
  is_email_verified?: boolean | null;
  class_teacher_opt_in?: boolean | null;
  class_teacher_standard?: string | null;
  class_teacher_division?: string | null;
  standards_taught?: string[] | null;
  divisions_taught?: string[] | null;
  subjects_taught?: string[] | null;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
  user: AccountMinimal;
  refresh_token?: string | null;
}

export interface Account extends AccountMinimal {
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── B2C Student Profile ──────────────────────────────────────────────────────

export type EducationLevel =
  | "school"
  | "competitive_exams"
  | "science_high_school"
  | "commerce_high_school"
  | "post_graduation";

export interface B2CProfileRead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  education_level: EducationLevel;
  school_name?: string;
  school_board?: string;
  school_standard?: string;
  competitive_exam?: string;
  exam_stream?: string;
  subjects?: string[];
  board?: string;
  standard?: string;
  division?: string;
  competitive_exam_selected: boolean;
  is_email_verified: boolean;
  auth_provider: string;
  profile_completed: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface B2CRegisterRequest {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  confirm_password: string;
  education_level: EducationLevel;
  school_name?: string | null;
  competitive_exam?: string | null;
  school_board?: string | null;
  school_standard?: string | null;
  subjects?: string[] | null;
}

// ─── Papers ───────────────────────────────────────────────────────────────────

export type QuestionType =
  | "mcq"
  | "short_answer"
  | "long_answer"
  | "fill_blank"
  | "match_columns"
  | "true_false";

export type Difficulty = "easy" | "medium" | "hard";

export type PaperStatus = "draft" | "published" | "archived";

export interface MCQOption {
  id: string;
  text: string;
}

export interface MatchColumnsOptions {
  left: string[];
  right: string[];
}

export interface RubricItem {
  criterion: string;
  marks: number;
}

export interface QuestionVisualPayload {
  kind: string;
  asset_url?: string | null;
  asset_urls?: string[];
  alt_text?: string | null;
  source_figure_id?: string | null;
  source_figure_ids?: string[];
  captions?: string[];
  placement?: string | null;
  layout?: string | null;
  figure_type?: string | null;
  page_number?: number | null;
}

export interface QuestionInPaper {
  id: string;
  question_number: number;
  section?: string;
  question_text: string;
  question_type: QuestionType;
  difficulty: Difficulty;
  marks: number;
  options?: MCQOption[] | MatchColumnsOptions;
  answer_key?: string | Record<string, string>;
  marking_rubric?: RubricItem[];
  topic_id?: string;
  topic_name?: string;
  subject_name?: string;
  chapter_id?: string | null;
  chapter_title?: string | null;
  subtopic_tags?: string[];
  visual_payload?: QuestionVisualPayload | null;
}

export interface Paper {
  id: string;
  school_id: string;
  // Absent from GET /papers/{id}, which exposes only `created_by_name`.
  created_by?: string;
  subject_id?: string;
  title: string;
  subtitle?: string;
  semester?: string;
  course?: string;
  category?: string;
  standard?: string;
  division?: string;
  total_marks: number;
  duration_minutes?: number;
  instructions?: string;
  status: PaperStatus;
  published_at?: string;
  generation_config?: Record<string, unknown>;
  created_at: string;
  questions: QuestionInPaper[];
}

export interface PaperListItem {
  id: string;
  title: string;
  subject_id?: string;
  subject_name?: string;
  standard?: string | null;
  division?: string | null;
  category?: string | null;
  total_marks: number;
  duration_minutes?: number | null;
  status: PaperStatus;
  created_at: string;
  question_count?: number;
  is_submitted_by_me?: boolean;
}

export interface PaperGenerateRequest {
  subject_id: string;
  chapter_ids: string[];
  difficulty: Difficulty;
  title_line_1: string;
  title_line_2?: string;
  semester?: string;
  course?: string;
  category?: string;
  standard?: string;
  division?: string;
  duration_minutes?: number | null;
  instructions?: string;
  topic_ids?: string[];
  chapter_titles?: string[];
  note_ids?: string[];
  mcq_count: number;
  short_answer_count: number;
  long_answer_count: number;
  fill_blank_count: number;
  match_columns_count: number;
  true_false_count: number;
  marks_per_mcq?: number;
  marks_per_short?: number;
  marks_per_long?: number;
  marks_per_fill_blank?: number;
  marks_per_match_columns?: number;
  marks_per_true_false?: number;
  additional_instructions?: string;
  custom_question_types?: Array<{ name: string; count: number; marks: number }>;
  include_reference_visuals?: boolean;
  visual_question_types?: string[];
  subtopic_names?: string[];
  only_fill_blanks?: boolean;
  timer_value?: number | null;
  timer_unit?: string;
  blueprint_header?: {
    title: string;
    subject_name?: string;
    board?: string;
    standard?: string;
    division?: string;
    duration_minutes?: number | null;
    target_marks?: number;
  };
  blueprint_sections?: Array<{
    id: string;
    title: string;
    question_type: string;
    order?: number;
    slots: Array<{
      id: string;
      question_type: string;
      marks: number;
      is_placeholder?: boolean;
    }>;
  }>;
}

// ─── Submission ───────────────────────────────────────────────────────────────

export interface AnswerEntry {
  question_id: string;
  response: string;
}

export interface PaperSubmissionCreate {
  answers: AnswerEntry[];
  attempt_id?: string;
  exam_id?: string;
  misconduct_report?: Record<string, unknown>;
  mode?: string;
  time_taken_seconds?: number;
  settings?: Record<string, unknown>;
}

export interface QuestionResult {
  question_id: string;
  score?: number;
  max_score?: number;
  feedback?: string;
  learning_support?: string;
}

export interface PaperSubmissionRead {
  id: string;
  paper_id: string;
  student_id?: string;
  b2c_student_id?: string;
  exam_id?: string;
  attempt_number?: number;
  retest_of_submission_id?: string;
  started_at?: string;
  submitted_at?: string;
  checked_at?: string;
  answers: AnswerEntry[];
  total_score?: number;
  max_score?: number;
  mode?: string;
  time_taken_seconds?: number;
  settings?: Record<string, unknown>;
  feedback?: string;
  results: QuestionResult[];
  results_visible_to_student: boolean;
  grading_status?: string;
  checking_progress_percent?: number;
  misconduct_report?: Record<string, unknown>;
  misconduct_score?: number;
  created_at: string;
}

export interface PaperAttemptsResponse {
  items: PaperSubmissionRead[];
}

// ─── Exams ────────────────────────────────────────────────────────────────────

export interface Exam {
  id: string;
  name: string;
  teacher_id: string;
  subject_id?: string;
  standard?: string;
  division?: string;
  semester?: string;
  category?: string;
  exam_date?: string;
  duration_minutes?: number;
  auto_grade_enabled: boolean;
  results_published: boolean;
  teacher_name?: string;
  paper_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface StudentExamPaper {
  id: string;
  title: string;
  total_marks: number;
  status: PaperStatus;
  is_submitted_by_me?: boolean;
  created_at: string;
}

export interface StudentExamRead extends Exam {
  teacher_name: string;
  subject_name?: string;
  papers: StudentExamPaper[];
}

// ─── Checked Papers ───────────────────────────────────────────────────────────

// Backend returns either the legacy status set ("graded" | "pending_manual_review" | ...)
// or, for the V2 manifest pipeline, one of the pipeline stage statuses below.
export type CheckedPaperStatus =
  | "graded"
  | "pending_manual_review"
  | "uploaded"
  | "processing"
  | "completed"
  | "needs_review"
  // V2 manifest pipeline
  | "pending"
  | "integrity_pending"
  | "integrity_running"
  | "integrity_verified"
  | "integrity_needs_review"
  | "integrity_failed"
  | "evidence_pending"
  | "evidence_inventory"
  | "evidence_grouping"
  | "attempt_grouping"
  | "evidence_ready"
  | "evidence_needs_review"
  | "evidence_failed"
  | "mapping_pending"
  | "blind_mapping"
  | "mapping_ready"
  | "mapping_needs_review"
  | "mapping_failed"
  | "grading_pending"
  | "grading"
  | "rubric_grading"
  | "policy_ready"
  | "grading_needs_review"
  | "grading_failed"
  | "release_evaluation_pending"
  | "completeness_challenge"
  | "release_evaluation_failed"
  | "auto_assessed"
  | "pending_question_review"
  | string; // allow any future status values

export interface CheckedPaperProcessingBlocker {
  issue_id: string;
  code: string;
  message: string;
  stage: string;
  resolvable_by_teacher: boolean;
  page_ids?: string[];
  page_numbers?: number[];
  occurrence_ids?: string[];
  attempt_ids?: string[];
  resolved_by_teacher?: boolean;
}

export interface GradingResultItem {
  result_id?: string | null;
  question_id: string;
  topic_id?: string | null;
  topic_name?: string | null;
  subject_id?: string | null;
  subject_name?: string | null;
  question_number?: number;
  question_text?: string | null;
  question_type?: string | null;
  response?: unknown;
  student_answer?: unknown;
  selected_answer?: unknown;
  expected_answer?: unknown;
  options?: unknown;
  visual_payload?: QuestionVisualPayload | Record<string, unknown> | null;
  visual_asset_url?: string | null;
  question_image_url?: string | null;
  diagram_url?: string | null;
  status?: string | null;
  result_status?: string | null;
  correctness?: string | null;
  policy_status?: string | null;
  selected?: boolean | null;
  attempt_ids?: string[] | null;
  evidence_citations?: unknown[] | null;
  score?: number | null;
  max_score?: number | null;
  feedback?: string | null;
  confidence?: number | null;
  recommendation?: string | null;
  marking_rubric?: unknown;
  hints?: string[] | string | null;
  solution_ideas?: string[] | string | null;
  solution_steps?: string[] | string | null;
  explanation?: string | null;
  easy_example?: string | null;
  why_marks_cut?: string | null;
  manual_review_requested?: boolean | null;
  manual_review_note?: string | null;
  manual_review_requested_at?: string | null;
  manual_review_requested_by?: string | null;
  manual_review_completed?: boolean | null;
  manual_review_completed_at?: string | null;
  manual_review_completed_by?: string | null;
  question_review_thread?: Array<{
    event_type?: string | null;
    author_role?: string | null;
    author_id?: string | null;
    message?: string | null;
    created_at?: string | null;
    student_notification_pending?: boolean | null;
    student_seen_at?: string | null;
  }> | null;
}

export interface CheckedPaper {
  id: string;
  student_id: string;
  teacher_id: string;
  exam_id: string | null;
  paper_id?: string | null;
  subject_id?: string | null;
  scanned_pdf_url?: string | null;
  annotated_pdf_url?: string | null;
  ocr_text: string;
  identifier_text: string;
  status: CheckedPaperStatus;
  total_score?: number | null;
  max_score?: number | null;
  checking_progress_percent?: number | null;
  grading_feedback?: string | null;
  grading_results?: GradingResultItem[] | null;
  needs_review: boolean;
  grading_confidence?: number | null;
  is_teacher_override: boolean;
  teacher_reviewed_at?: string | null;
  teacher_reviewed_by?: string | null;
  manual_review_requested: boolean;
  manual_review_note?: string | null;
  manual_review_requested_at?: string | null;
  manual_review_requested_by?: string | null;
  manual_review_completed?: boolean | null;
  manual_review_completed_at?: string | null;
  manual_review_completed_by?: string | null;
  pending_question_review_count?: number;
  pending_question_review_labels?: string[];
  unread_question_review_response_count?: number;
  unread_question_review_response_labels?: string[];
  // enriched fields from backend list/detail endpoints
  student_name?: string | null;
  student_standard?: string | null;
  student_division?: string | null;
  exam_name?: string | null;
  subject_name?: string | null;
  created_at: string;
  updated_at: string;
  // V2 manifest pipeline fields — optional so the legacy DTO shape stays valid.
  row_version?: number;
  active_script_version_id?: string | null;
  active_integrity_run_id?: string | null;
  active_evidence_run_id?: string | null;
  active_mapping_run_id?: string | null;
  active_grading_run_id?: string | null;
  active_release_evaluation_run_id?: string | null;
  auto_grade_enabled?: boolean;
  results_published?: boolean;
  results_visible_to_student?: boolean;
  approval_status?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  release_status?: string | null;
  published_at?: string | null;
  published_by?: string | null;
  processing_stage?: string | null;
  processing_blockers?: CheckedPaperProcessingBlocker[];
  release_evaluation_status?: string | null;
  identity_resolved?: boolean;
  can_save_review?: boolean;
  can_approve?: boolean;
  can_publish?: boolean;
  legacy_read_only?: boolean;
  vlm_streaming_enabled?: boolean;
}

// ─── Subjects & Chapters ──────────────────────────────────────────────────────

export interface Subject {
  id: string;
  name: string;
  code?: string;
  school_id?: string;
  created_at: string;
}

export interface Chapter {
  id: string;
  title: string;
  subject_id: string;
  document_id?: string;
  order?: number;
}

export interface Topic {
  id: string;
  title: string;
  chapter_id: string;
  subject_id: string;
}

// PaperGenerateOptions matches backend PaperGenerateOptions schema
export interface PaperSubjectOption {
  id: string;
  name: string;
}

export interface PaperSectionOption {
  standard: string;
  division: string;
  subjects: PaperSubjectOption[];
}

export interface PaperOptions {
  courses: string[];
  standards: string[];
  divisions: string[];
  subjects: PaperSubjectOption[];
  sections: PaperSectionOption[];
  exam_types: string[];
}

// AI Chat
export interface ChatRequest {
  message: string;
  conversation_id?: string;
  question_id?: string;
  paper_id?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface ChatResponse {
  response: string;
  timestamp: string;
  conversation_id: string;
  message_id: string;
}

export interface ChatConversation {
  id: string;
  title: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface ChatConversationMemory {
  conversation_id: string;
  active_domain?: string | null;
  active_task?: string | null;
  summary?: string | null;
  goals?: Array<Record<string, unknown>>;
  output_preferences?: Record<string, unknown>;
  recalled_chunk_count?: number;
}

export interface UserMemoryItem {
  id: string;
  category: string;
  memory_key: string;
  value_json: Record<string, unknown>;
  status: string;
  confidence: number;
  observation_count: number;
  note?: string | null;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface DashboardSubmission {
  id: string;
  kind: string;
  paper: string; // paper title
  exam: string | null;
  subject: string | null;
  score: number | null;
  max_score: number | null;
  date: string;
  status: string;
  cat: string | null;
  sem: number | null;
  difficulty: string | null;
  time_taken_seconds?: number | null;
}

export interface DashboardExamScore {
  exam: string;
  cat: string | null;
  sem: number | null;
  date: string;
  avg: number;
  subject_scores: Record<string, number>;
}

// Used in question_type_performance list (full stats)
export interface DashboardQuestionTypePerf {
  type: string;
  scored: number;
  total: number;
  attempts: number;
  accuracy: number; // 0-100
}

// Used in subject_question_types map (summary row from backend SubjectQuestionTypeRow)
export interface SubjectQuestionTypeRow {
  type: string;
  accuracy: number; // 0-100
  marks: number;
}

export interface DashboardSummary {
  total_submissions: number;
  total_checked: number;
  distinct_papers: number;
  generated_papers: number;
}

export interface DashboardSemester {
  id: string;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  index: number;
}

export interface DashboardSubjectOption {
  id?: string | null;
  name: string;
  code?: string | null;
}

export interface DashboardUpcomingExam {
  id: string;
  name: string;
  date?: string | null;
  subject?: string | null;
  cat?: string | null;
}

export interface DashboardAiUsageRow {
  week: string;
  conversations: number;
  messages: number;
}

export interface DashboardTopicMastery {
  topic: string;
  subject?: string | null;
  mastery: number;
  difficulty?: string | null;
  chapter?: string | null;
}

export interface DashboardChapterMastery {
  chapter: string;
  subject?: string | null;
  mastery: number;
  difficulty?: string | null;
  topics_count: number;
}

export interface DashboardExamQTypeBreakdown {
  exam: string;
  date?: string | null;
  type_counts: Record<string, number>;
}

export interface StudentDashboardLab {
  student: {
    first_name: string;
    last_name: string;
    student_id: string;
    standard?: string | null;
    division?: string | null;
    school_name?: string | null;
    board?: string | null;
    branch_name?: string | null;
    subjects: string[];
    class_teacher_name?: string | null;
    class_size?: number | null;
  };
  semesters: DashboardSemester[];
  subjects: DashboardSubjectOption[];
  submissions: DashboardSubmission[];
  exam_scores: DashboardExamScore[];
  question_type_performance: DashboardQuestionTypePerf[];
  subject_question_types: Record<string, SubjectQuestionTypeRow[]>;
  exam_question_type_breakdown: DashboardExamQTypeBreakdown[];
  summary: DashboardSummary;
  topic_mastery: DashboardTopicMastery[];
  chapter_mastery: DashboardChapterMastery[];
  upcoming_exams: DashboardUpcomingExam[];
  ai_usage: DashboardAiUsageRow[];
}

// ─── Pagination ───────────────────────────────────────────────────────────────

// Backend papers list uses skip/limit (not page/size)
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

// ─── API Errors ───────────────────────────────────────────────────────────────

export interface ApiError {
  detail: string | { msg: string; type: string }[];
  status_code?: number;
}
