import type { Role } from '../../types'

export type B2BProfileRole = Extract<Role, 'student' | 'teacher' | 'principal'>

export type ProfileFieldAccess =
  | 'visible'
  | 'editable'
  | 'immutable'
  | 'approval_required'

export type ProfileFieldContract = {
  visible: readonly string[]
  editable: readonly string[]
  immutable: readonly string[]
  approvalRequired: readonly string[]
}

export const B2B_PROFILE_FIELD_CONTRACT: Record<B2BProfileRole, ProfileFieldContract> = {
  student: {
    visible: [
      'student_id',
      'first_name',
      'last_name',
      'email',
      'school_name',
      'branch_name',
      'board',
      'standard',
      'division',
      'subjects',
      'class_teacher_name',
      'assignment_status',
    ],
    editable: [],
    immutable: [
      'id',
      'student_id',
      'first_name',
      'last_name',
      'email',
      'school_id',
      'school_name',
      'branch_id',
      'branch_name',
      'board',
      'standard',
      'division',
      'subjects',
      'class_teacher_name',
      'assignment_status',
    ],
    approvalRequired: [],
  },
  teacher: {
    visible: [
      'teacher_id',
      'first_name',
      'last_name',
      'email',
      'school_name',
      'branch_name',
      'board',
      'standards_taught',
      'divisions_taught',
      'subjects_taught',
      'subject_mappings',
      'class_teacher_opt_in',
      'class_teacher_standard',
      'class_teacher_division',
      'assignment_status',
      'pending_update_request',
    ],
    editable: [],
    immutable: [
      'id',
      'school_id',
      'school_name',
      'subject_mappings',
      'class_teacher_opt_in',
      'class_teacher_standard',
      'class_teacher_division',
      'assignment_status',
      'is_approved',
      'is_active',
    ],
    approvalRequired: [
      'teacher_id',
      'first_name',
      'last_name',
      'email',
      'branch_id',
      'branch_name',
      'board',
      'standards_taught',
      'divisions_taught',
      'subjects_taught',
    ],
  },
  principal: {
    visible: [
      'first_name',
      'last_name',
      'email',
      'school_name',
      'branch_name',
      'role',
    ],
    editable: [],
    immutable: [
      'first_name',
      'last_name',
      'email',
      'school_name',
      'branch_name',
      'role',
    ],
    approvalRequired: [],
  },
}

export type TeacherProfileApprovalDraft = {
  firstName: string
  lastName: string
  email: string
  teacherId: string
  branchId: string
  board: string
  standardsTaught: string | readonly string[]
  divisionsTaught: string | readonly string[]
  subjectsTaught: string | readonly string[]
}

export type TeacherProfileApprovalPayload = {
  first_name: string
  last_name: string
  email: string
  teacher_id: string
  branch_id: string
  board: string
  standards_taught: string[]
  divisions_taught: string[]
  subjects_taught: string[]
}

export type TeacherDraftErrors = Partial<Record<keyof TeacherProfileApprovalDraft, string>>

export function normalizeProfileList(value: string | readonly string[]): string[] {
  const values = typeof value === 'string' ? value.split(',') : value
  const seen = new Set<string>()
  const normalized: string[] = []

  values.forEach((entry) => {
    const trimmed = String(entry).trim()
    const key = trimmed.toLocaleLowerCase()
    if (!trimmed || seen.has(key)) return
    seen.add(key)
    normalized.push(trimmed)
  })

  return normalized
}

export type TeachingScopeOffering = {
  standard: string
  divisions: readonly string[]
}

export function teachingScopeOptions(
  offerings: readonly TeachingScopeOffering[],
  selectedStandards: string | readonly string[],
) {
  const standards = normalizeProfileList(offerings.map((offering) => offering.standard))
  const selected = new Set(normalizeProfileList(selectedStandards))
  const divisions = normalizeProfileList(
    offerings
      .filter((offering) => selected.has(offering.standard))
      .flatMap((offering) => offering.divisions),
  )
  return { standards, divisions }
}

export function retainAvailableSelections(
  selections: string | readonly string[],
  available: readonly string[],
) {
  if (available.length === 0) return normalizeProfileList(selections)
  const allowed = new Set(available)
  return normalizeProfileList(selections).filter((selection) => allowed.has(selection))
}

export function validateTeacherApprovalDraft(draft: TeacherProfileApprovalDraft): TeacherDraftErrors {
  const errors: TeacherDraftErrors = {}
  const firstName = draft.firstName.trim()
  const lastName = draft.lastName.trim()
  const email = draft.email.trim()
  const teacherId = draft.teacherId.trim()
  const board = draft.board.trim()

  if (!firstName) errors.firstName = 'First name is required.'
  else if (firstName.length > 100) errors.firstName = 'First name must be 100 characters or fewer.'
  if (!lastName) errors.lastName = 'Last name is required.'
  else if (lastName.length > 100) errors.lastName = 'Last name must be 100 characters or fewer.'
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = 'Enter a valid email address.'
  if (!teacherId) errors.teacherId = 'Teacher ID is required.'
  else if (teacherId.length > 120) errors.teacherId = 'Teacher ID must be 120 characters or fewer.'
  if (!draft.branchId.trim()) errors.branchId = 'Choose a branch.'
  if (!board) errors.board = 'Board is required.'
  else if (board.length > 100) errors.board = 'Board must be 100 characters or fewer.'
  const standards = normalizeProfileList(draft.standardsTaught)
  const divisions = normalizeProfileList(draft.divisionsTaught)
  const subjects = normalizeProfileList(draft.subjectsTaught)
  if (!standards.length) {
    errors.standardsTaught = 'Add at least one standard.'
  } else if (standards.some((value) => value.length > 20)) {
    errors.standardsTaught = 'Each standard must be 20 characters or fewer.'
  }
  if (!divisions.length) {
    errors.divisionsTaught = 'Add at least one division.'
  } else if (divisions.some((value) => value.length > 20)) {
    errors.divisionsTaught = 'Each division must be 20 characters or fewer.'
  }
  if (!subjects.length) {
    errors.subjectsTaught = 'Add at least one subject.'
  } else if (subjects.some((value) => value.length > 50)) {
    errors.subjectsTaught = 'Each subject must be 50 characters or fewer.'
  }
  return errors
}

/**
 * Builds the only profile mutation body available to B2B mobile users.
 * Explicit property selection prevents immutable or client-injected fields from
 * being forwarded to the approval endpoint.
 */
export function buildTeacherApprovalPayload(
  draft: TeacherProfileApprovalDraft,
): TeacherProfileApprovalPayload {
  return {
    first_name: draft.firstName.trim(),
    last_name: draft.lastName.trim(),
    email: draft.email.trim().toLocaleLowerCase(),
    teacher_id: draft.teacherId.trim(),
    branch_id: draft.branchId.trim(),
    board: draft.board.trim(),
    standards_taught: normalizeProfileList(draft.standardsTaught),
    divisions_taught: normalizeProfileList(draft.divisionsTaught),
    subjects_taught: normalizeProfileList(draft.subjectsTaught),
  }
}

export function canMutateB2BProfileDirectly(_role: B2BProfileRole) {
  return false
}
