import type { AccountMinimal } from '../types'

export type MobileLanding =
  | 'b2c_onboarding'
  | 'competitive_learner'
  | 'school_learner'
  | 'staff_workspace'
  | 'admin_workspace'
  | 'developer_workspace'

function normalized(value?: string | null) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')
}

function isCompetitiveProfile(user: AccountMinimal) {
  const educationLevel = normalized(user.b2c_education_level)
  const examTrack = normalized(user.exam_track)
  const targetExam = normalized(user.b2c_target_exam)
  return (
    educationLevel === 'competitive_exams' ||
    educationLevel === 'competitive_exam' ||
    examTrack === 'jee' ||
    examTrack.startsWith('jee_') ||
    targetExam.includes('jee')
  )
}

const COMPETITIVE_EXAM_LEVELS = new Set(['competitive_exam', 'competitive_exams'])

export function isPreviousPapersEligible(user?: AccountMinimal | null) {
  if (
    user?.role !== 'b2c_student' ||
    !COMPETITIVE_EXAM_LEVELS.has(String(user.b2c_education_level ?? '').trim())
  ) {
    return false
  }

  return [
    user.b2c_board,
    user.b2c_standard,
    user.b2c_target_exam,
    ...(user.b2c_subjects ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes('jee')
}

// Cheat Sheets are shown to any competitive-exam b2c student.
// Web navLinks: requiresCompetitiveExam: true, no requiresJee.
export function isCheatSheetsEligible(user?: AccountMinimal | null) {
  if (user?.role !== 'b2c_student') return false
  return COMPETITIVE_EXAM_LEVELS.has(String(user.b2c_education_level ?? '').trim())
}

export function resolveMobileLanding(user: AccountMinimal): MobileLanding {
  if (user.role === 'b2c_student' && user.profile_completed === false) {
    return 'b2c_onboarding'
  }
  if (user.role === 'b2c_student') {
    return isCompetitiveProfile(user) ? 'competitive_learner' : 'school_learner'
  }
  if (user.role === 'student') return 'school_learner'
  if (user.role === 'admin') return 'admin_workspace'
  if (user.role === 'developer') return 'developer_workspace'
  return 'staff_workspace'
}
