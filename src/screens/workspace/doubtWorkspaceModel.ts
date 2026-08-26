import type { DoubtDetail, DoubtEvent, DoubtMessage, DoubtStatus, DoubtSummary, DoubtTeacherOption } from '../../api/doubts'

export interface DoubtDraft {
  teacherId: string
  subjectId: string
  subject: string
  title: string
  details: string
  clientRequestId: string
}

export type DoubtDraftErrors = Partial<Record<'teacher' | 'title' | 'details' | 'guardrail', string>>

const unsafePattern = /\b(?:kill\s+(?:myself|yourself|someone)|self[- ]?harm|suicide|send\s+nudes?|porn|sext|date\s+me|betting\s+tips?|casino|you(?:'re|\s+are)\s+(?:an?\s+)?(?:idiot|stupid|useless))\b/i

export const emptyDoubtDraft = (clientRequestId: string): DoubtDraft => ({
  teacherId: '',
  subjectId: '',
  subject: '',
  title: '',
  details: '',
  clientRequestId,
})

export function validateDoubtDraft(draft: DoubtDraft): DoubtDraftErrors {
  const errors: DoubtDraftErrors = {}
  const title = draft.title.trim()
  const details = draft.details.trim()
  if (!draft.teacherId || !draft.subject) errors.teacher = 'Choose the subject teacher for this doubt.'
  if (title.length < 4) errors.title = 'Use at least 4 characters so the doubt is easy to find.'
  else if (title.length > 160) errors.title = 'Keep the title within 160 characters.'
  if (details.length < 12) errors.details = 'Add at least 12 characters about where you are stuck.'
  else if (details.length > 5000) errors.details = 'Keep the question within 5,000 characters.'
  if (unsafePattern.test(`${title}\n${details}`)) {
    errors.guardrail = 'Keep this desk safe, respectful, and focused on schoolwork.'
  }
  return errors
}

export function selectTeacher(draft: DoubtDraft, option: DoubtTeacherOption): DoubtDraft {
  return {
    ...draft,
    teacherId: option.teacher_id,
    subjectId: option.subject_id ?? '',
    subject: option.subject_name,
  }
}

export function filterDoubts(items: DoubtSummary[], status: DoubtStatus | 'all') {
  return status === 'all' ? items : items.filter((item) => item.status === status)
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? value as UnknownRecord : {}
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback
}

export function normalizeDoubtStatus(value: unknown): DoubtStatus {
  if (value === 'answered' || value === 'resolved') return value
  if (value === 'closed') return 'resolved'
  return 'pending'
}

export function normalizeDoubtSummary(value: unknown): DoubtSummary {
  const raw = asRecord(value)
  const subject = stringValue(raw.subject, 'Academic')
  const latestMessageAt = stringValue(raw.latest_message_at, stringValue(raw.created_at, new Date(0).toISOString()))
  const createdAt = stringValue(raw.created_at, latestMessageAt)
  const revision = typeof raw.revision === 'number' && Number.isFinite(raw.revision) ? raw.revision : null

  return {
    id: stringValue(raw.id),
    student_id: stringValue(raw.student_id),
    student_name: stringValue(raw.student_name, 'Student'),
    teacher_id: stringValue(raw.teacher_id),
    teacher_name: stringValue(raw.teacher_name, 'Assigned teacher'),
    subject_id: typeof raw.subject_id === 'string' ? raw.subject_id : null,
    subject,
    title: stringValue(raw.title, `${subject} question`),
    school_id: typeof raw.school_id === 'string' ? raw.school_id : null,
    class_label: typeof raw.class_label === 'string' ? raw.class_label : null,
    status: normalizeDoubtStatus(raw.status),
    revision,
    latest_message_at: latestMessageAt,
    created_at: createdAt,
    updated_at: stringValue(raw.updated_at, latestMessageAt),
    last_message: typeof raw.last_message === 'string' ? raw.last_message : null,
  }
}

export function normalizeDoubtDetail(value: unknown): DoubtDetail {
  const raw = asRecord(value)
  return {
    doubt: normalizeDoubtSummary(raw.doubt),
    messages: Array.isArray(raw.messages) ? raw.messages as DoubtMessage[] : [],
    history: Array.isArray(raw.history) ? raw.history as DoubtEvent[] : [],
  }
}

type DoubtNavigationLike = {
  canGoBack?: () => boolean
  goBack?: () => void
  navigate?: (routeName: string) => void
  reset?: (state: { index: number; routes: Array<{ name: string }> }) => void
}

export function returnFromDoubts(navigation: DoubtNavigationLike, isTeacher: boolean) {
  if (navigation.canGoBack?.() && navigation.goBack) {
    navigation.goBack()
    return 'back' as const
  }

  const destination = isTeacher ? 'StaffWorkspace' : 'HomeMain'
  if (navigation.reset) {
    navigation.reset({ index: 0, routes: [{ name: destination }] })
  } else {
    navigation.navigate?.(destination)
  }
  return destination
}

export function createClientRequestId(random = Math.random) {
  const bytes = Array.from({ length: 16 }, () => Math.floor(random() * 256))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function doubtDraftStorageKey(accountId: string) {
  return `eduraa:doubt-draft:v1:${accountId}`
}

