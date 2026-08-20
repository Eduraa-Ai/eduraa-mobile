import type { DoubtStatus, DoubtSummary, DoubtTeacherOption } from '../../api/doubts'

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

