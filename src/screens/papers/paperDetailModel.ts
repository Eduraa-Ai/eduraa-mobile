type PaperAttemptSummary = {
  id: string
  grading_status?: string
  results_visible_to_student?: boolean
  total_score?: number
  max_score?: number
}

type EditableOption = {
  id: string
  text: string
  is_correct?: boolean
}

type EditableQuestion = {
  question_text: string
  question_type: string
  marks: number
  options?: EditableOption[] | { left: string[]; right: string[] }
  answer_key?: string | Record<string, string> | unknown[]
}

export type PaperQuestionDraft = {
  questionText: string
  answerText: string
  marksText: string
  options: EditableOption[]
  matchLeftText: string
  matchRightText: string
}

export type PaperQuestionUpdatePayload = {
  question_text: string
  answer_key: string | Record<string, string> | unknown[]
  marks: number
  options?: EditableOption[] | { left: string[]; right: string[] }
}

type InstructionPaper = {
  title: string
  standard?: string
  division?: string
  total_marks: number
  duration_minutes?: number
  questions: Array<EditableQuestion & { question_number: number }>
}

export function paperEditableContentFingerprint(paper: InstructionPaper): string {
  return JSON.stringify(
    paper.questions.map((question) => ({
      question_number: question.question_number,
      question_text: question.question_text,
      question_type: question.question_type,
      marks: question.marks,
      options: question.options ?? null,
      answer_key: question.answer_key ?? null,
    })),
  )
}

export type StoredPaperChatMessage = {
  role: 'user' | 'ai'
  text: string
}

export function paperChatStorageKey(userId: string, paperId: string) {
  return `paper_chat_${userId}_${paperId}`
}

export function paperPendingInstructionStorageKey(userId: string, paperId: string) {
  return `paper_pending_instruction_${userId}_${paperId}`
}

export function sanitizePendingPaperInstruction(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const instruction = value.trim().slice(0, 2000)
  return instruction || null
}

export function sanitizePaperChatMessages(raw: unknown): StoredPaperChatMessage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((entry): entry is StoredPaperChatMessage => (
      Boolean(entry)
      && typeof entry === 'object'
      && ((entry as StoredPaperChatMessage).role === 'user' || (entry as StoredPaperChatMessage).role === 'ai')
      && typeof (entry as StoredPaperChatMessage).text === 'string'
      && Boolean((entry as StoredPaperChatMessage).text.trim())
    ))
    .map((entry) => ({ role: entry.role, text: entry.text.trim().slice(0, 2000) }))
    .slice(-40)
}

export function buildPaperInstructionContext(paper: InstructionPaper): string {
  const lines = [
    `Title: ${paper.title}`,
    `Class: ${paper.standard || 'Not set'} ${paper.division || ''}`.trim(),
    `Marks: ${paper.total_marks}${paper.duration_minutes ? ` | Duration: ${paper.duration_minutes} min` : ''}`,
    '',
  ]

  for (const question of paper.questions) {
    lines.push(
      `Q${question.question_number} [${question.question_type}] ${question.marks}mk: ${question.question_text.slice(0, 180)}`,
    )
    if (Array.isArray(question.options)) {
      for (const option of question.options) {
        lines.push(`  (${option.id}) ${option.text.slice(0, 100)}`)
      }
    } else if (question.options) {
      lines.push(`  Column A: ${question.options.left.join(' | ')}`)
      lines.push(`  Column B: ${question.options.right.join(' | ')}`)
    }
    if (question.answer_key != null) lines.push(`  Answer: ${answerToText(question.answer_key).slice(0, 100)}`)
  }

  return lines.join('\n')
}

function answerToText(answer: EditableQuestion['answer_key']) {
  if (typeof answer === 'string') return answer
  if (answer == null) return ''
  return JSON.stringify(answer, null, 2)
}

export function createPaperQuestionDraft(question: EditableQuestion): PaperQuestionDraft {
  const options = Array.isArray(question.options)
    ? question.options.map((option) => ({
        id: String(option.id ?? ''),
        text: String(option.text ?? ''),
        is_correct:
          option.is_correct === true ||
          (typeof question.answer_key === 'string' &&
            question.answer_key.trim().toLowerCase() === String(option.id ?? '').trim().toLowerCase()),
      }))
    : []
  const match = !Array.isArray(question.options) ? question.options : undefined
  return {
    questionText: question.question_text,
    answerText: answerToText(question.answer_key),
    marksText: String(question.marks),
    options,
    matchLeftText: match?.left?.join('\n') ?? '',
    matchRightText: match?.right?.join('\n') ?? '',
  }
}

function nonEmptyLines(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
}

export function validatePaperQuestionDraft(
  questionType: string,
  draft: PaperQuestionDraft,
): string | null {
  if (!draft.questionText.trim()) return 'Add the question before saving.'
  if (draft.questionText.trim().length > 5000) return 'Keep the question under 5,000 characters.'
  const marks = Number(draft.marksText)
  if (!Number.isFinite(marks) || marks < 0.25 || marks > 100 || marks * 4 % 1 !== 0) {
    return 'Marks must be between 0.25 and 100, in quarter-mark steps.'
  }
  if (!draft.answerText.trim()) return 'Add the answer key before saving.'
  if ((questionType === 'mcq' || questionType === 'true_false') && draft.options.length) {
    if (draft.options.some((option) => !option.text.trim())) return 'Complete every option before saving.'
    if (!draft.options.some((option) => option.is_correct)) return 'Choose the correct option.'
  }
  if (questionType === 'match_columns') {
    const left = nonEmptyLines(draft.matchLeftText)
    const right = nonEmptyLines(draft.matchRightText)
    if (!left.length || !right.length) return 'Add entries to both match columns.'
  }
  return null
}

export function buildPaperQuestionUpdate(
  question: EditableQuestion,
  draft: PaperQuestionDraft,
): PaperQuestionUpdatePayload {
  let answer: PaperQuestionUpdatePayload['answer_key'] = draft.answerText.trim()
  if (question.answer_key && typeof question.answer_key !== 'string') {
    try {
      answer = JSON.parse(draft.answerText)
    } catch {
      answer = draft.answerText.trim()
    }
  }
  const payload: PaperQuestionUpdatePayload = {
    question_text: draft.questionText.trim(),
    answer_key: answer,
    marks: Number(draft.marksText),
  }
  if (question.question_type === 'match_columns') {
    payload.options = {
      left: nonEmptyLines(draft.matchLeftText),
      right: nonEmptyLines(draft.matchRightText),
    }
  } else if (draft.options.length) {
    payload.options = draft.options.map((option) => ({
      id: option.id,
      text: option.text.trim(),
      is_correct: option.is_correct === true,
    }))
    const correct = draft.options.find((option) => option.is_correct)
    if (correct) payload.answer_key = correct.id
  }
  return payload
}

export function validateQuestionVisualFile(file: { type?: string; size?: number }) {
  if (!String(file.type ?? '').toLowerCase().startsWith('image/')) {
    return 'Choose a PNG, JPG, or WebP image.'
  }
  if (typeof file.size === 'number' && file.size > 10 * 1024 * 1024) {
    return 'Choose an image that is 10 MB or smaller.'
  }
  return null
}

const pendingStatuses = new Set(['submitted', 'checking', 'processing', 'uploaded'])
const failedStatuses = new Set(['failed', 'error', 'grading_failed', 'checking_failed'])

function normalizedStatus(attempt: PaperAttemptSummary) {
  return String(attempt.grading_status || 'checked').trim().toLowerCase()
}

export function selectNewestStartedAttempt<T extends PaperAttemptSummary>(
  attempts: readonly T[],
): T | undefined {
  return attempts.at(-1)
}

export function selectNewestSubmittedAttempt<T extends PaperAttemptSummary>(
  attempts: readonly T[],
): T | undefined {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (normalizedStatus(attempts[index]) !== 'in_progress') return attempts[index]
  }
  return undefined
}

export function isAttemptChecking(attempt?: PaperAttemptSummary) {
  return Boolean(attempt && pendingStatuses.has(normalizedStatus(attempt)))
}

export function isAttemptCheckDelayed(attempt?: PaperAttemptSummary) {
  return Boolean(attempt && failedStatuses.has(normalizedStatus(attempt)))
}

export function hasVisibleAttemptResult(attempt?: PaperAttemptSummary) {
  if (!attempt || attempt.results_visible_to_student === false) return false
  const status = normalizedStatus(attempt)
  return status !== 'in_progress' && !pendingStatuses.has(status) && !failedStatuses.has(status)
}

export function paperPrimaryAction(
  attempts: readonly PaperAttemptSummary[],
): 'attempt' | 'continue' | 'attempt_again' | 'view_results' {
  const submitted = selectNewestSubmittedAttempt(attempts)
  if (hasVisibleAttemptResult(submitted)) return 'view_results'
  if (submitted) return 'attempt_again'
  return normalizedStatus(selectNewestStartedAttempt(attempts) || { id: '' }) === 'in_progress'
    ? 'continue'
    : 'attempt'
}

export function visibleScore(attempt?: PaperAttemptSummary) {
  if (!hasVisibleAttemptResult(attempt)) return null
  if (
    typeof attempt?.total_score !== 'number'
    || typeof attempt.max_score !== 'number'
    || attempt.max_score <= 0
  ) {
    return null
  }
  return `${attempt.total_score} / ${attempt.max_score}`
}
