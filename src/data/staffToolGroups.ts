import type { Ionicons } from '@expo/vector-icons'
import type { Role } from '../types'
import type { MobileControl } from './mobileControlCatalog'

export type StaffToolGroupId = 'teach' | 'assess' | 'connect' | 'more' | 'learn' | 'school' | 'progress'

export interface StaffToolGroup {
  id: StaffToolGroupId
  label: string
  controls: MobileControl[]
}

const groupDefinitions: { id: StaffToolGroupId; label: string; controls: readonly string[] }[] = [
  { id: 'teach', label: 'Teach', controls: ['dashboard', 'class-teacher', 'teacher-students', 'attendance'] },
  { id: 'assess', label: 'Assess', controls: ['exams', 'generate', 'generate-custom', 'scan-upload', 'checked-papers', 'previous-papers'] },
  { id: 'connect', label: 'Connect', controls: ['approvals', 'announcements', 'doubts'] },
  { id: 'more', label: 'More', controls: ['ai-studio', 'teacher', 'principal-profile', 'index-books', 'index-notes'] },
]

// Students use the same Home, grouped by what they are trying to do.
const learnerGroupDefinitions: { id: StaffToolGroupId; label: string; controls: readonly string[] }[] = [
  { id: 'learn', label: 'Learn', controls: ['agentic-learning', 'generate', 'previous-papers', 'competitive-exam', 'cheat-sheets', 'ai-studio'] },
  { id: 'school', label: 'School', controls: ['student-exams', 'announcements', 'doubts', 'attendance'] },
  { id: 'progress', label: 'Progress', controls: ['dashboard', 'checked-papers', 'scan-upload'] },
  { id: 'more', label: 'More', controls: ['student-profile'] },
]

export function isLearnerRole(role: Role | undefined) {
  return role === 'student' || role === 'b2c_student'
}

function groupLabel(role: Role | undefined, id: StaffToolGroupId, fallback: string) {
  if (role === 'teacher') return fallback
  if (id === 'teach') return 'Overview'
  if (id === 'connect') return 'Manage'
  return fallback
}

/**
 * Splits visible controls into the staff workflow groups, in the order each
 * group lists them. Anything not listed in a group lands in "More" so a new
 * catalog entry is never silently unreachable.
 */
export function groupStaffControls(controls: MobileControl[], role: Role | undefined): StaffToolGroup[] {
  const learner = isLearnerRole(role)
  const definitions = learner ? learnerGroupDefinitions : groupDefinitions
  const groups: StaffToolGroup[] = definitions.map((group) => ({
    id: group.id,
    label: learner ? group.label : groupLabel(role, group.id, group.label),
    controls: group.controls.flatMap((id) => controls.filter((control) => control.id === id)),
  }))
  const ungrouped = controls.filter((control) => !definitions.some((group) => group.controls.includes(control.id)))
  groups.find((group) => group.id === 'more')!.controls.push(...ungrouped)
  return groups.filter((group) => group.controls.length > 0)
}

/** Shorter, task-first names for the All tools sheet. */
export const staffToolLabels: Record<string, string> = {
  generate: 'Question paper',
  'scan-upload': 'Scan papers',
  'checked-papers': 'Checked papers',
  'previous-papers': 'Previous papers',
  'index-books': 'Index books',
  'index-notes': 'Index notes',
}

/** Names students see on Home (task-first, in their words). */
export const learnerToolLabels: Record<string, string> = {
  'agentic-learning': 'Learn a concept',
  generate: 'Practice paper',
  'previous-papers': 'Previous papers',
  'competitive-exam': 'JEE resources',
  'cheat-sheets': 'Cheat sheets',
  'ai-studio': 'Ask Eduraa AI',
  'student-exams': 'Exams',
  announcements: 'School announcements',
  doubts: 'Ask your teacher',
  attendance: 'Attendance',
  dashboard: 'Learning dashboard',
  'checked-papers': 'Checked results',
  'scan-upload': 'Upload answer sheet',
  'student-profile': 'Profile',
}

export function workspaceToolLabel(control: MobileControl, learner: boolean) {
  return (learner ? learnerToolLabels[control.id] : undefined) ?? control.label
}

/** One outline icon per tool so the sheet reads as a single family. */
export const staffToolIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  dashboard: 'grid-outline',
  'class-teacher': 'school-outline',
  'teacher-students': 'people-outline',
  attendance: 'checkmark-circle-outline',
  exams: 'calendar-outline',
  generate: 'flash-outline',
  'generate-custom': 'attach-outline',
  'scan-upload': 'scan-outline',
  'checked-papers': 'ribbon-outline',
  'previous-papers': 'documents-outline',
  approvals: 'checkmark-done-outline',
  announcements: 'megaphone-outline',
  doubts: 'chatbubble-ellipses-outline',
  'ai-studio': 'sparkles-outline',
  teacher: 'person-outline',
  'principal-profile': 'person-outline',
  'index-books': 'book-outline',
  'index-notes': 'document-text-outline',
}
