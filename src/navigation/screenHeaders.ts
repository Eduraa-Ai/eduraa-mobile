import type { AccountMinimal } from '../types'

/**
 * One place for every screen's header copy. The label is the small orange line
 * above the title; it names the area of the app the screen belongs to.
 * Staff labels follow the Workspace groups (Teach / Assess / Connect / More).
 *
 * To rename a screen or move it to another area, edit this map only.
 */
export type ScreenHeaderMeta = {
  title?: string
  label?: string | ((role?: AccountMinimal['role']) => string)
  /** Where Back goes when there is no history (e.g. a deep link). */
  backFallback?: string
}

const isTeacher = (role?: string) => role === 'teacher'
const teach = (role?: string) => (isTeacher(role) || !role ? 'Teach' : 'Overview')
const connect = (role?: string) => (isTeacher(role) || !role ? 'Connect' : 'Manage')
const isStudent = (role?: string) => role === 'student' || role === 'b2c_student'

export const screenHeaders: Record<string, ScreenHeaderMeta> = {
  // Teach / Overview
  Dashboard: { title: 'Dashboard', label: teach },
  DashboardStudentDetail: { title: 'Student analysis', label: teach },
  DashboardPaperDetail: { title: 'Paper analysis', label: teach },
  ClassTeacherOverview: { title: 'My class', label: teach },
  ClassTeacherAssignments: { title: 'Teacher assignments', label: teach },
  ClassRoster: { title: 'Roster and divisions', label: teach },
  ClassSubjects: { title: 'Subjects and enrollment', label: teach },
  SubjectEnrollment: { title: 'Subject enrollment', label: teach },
  ClassValidation: { title: 'Validation report', label: teach },
  Attendance: { title: 'Attendance', label: (role) => (isStudent(role) ? 'School' : teach(role)) },
  StaffAttendance: { title: 'Attendance', label: teach },

  // Assess
  Exams: { title: 'Exams', label: (role) => (isStudent(role) ? 'School' : 'Assess') },
  StaffExams: { title: 'Exams', label: 'Assess' },
  ScanUpload: { title: 'Scan upload', label: 'Assess' },
  StaffScanUpload: { title: 'Scan upload', label: 'Assess' },
  CheckedPaperStatus: { title: 'Scan status', label: (role) => (isStudent(role) ? 'Results' : 'Assess') },
  StaffGeneratePaper: { title: 'Generate paper', label: 'Assess' },
  StaffCustomPaper: { title: 'Custom paper', label: 'Assess', backFallback: 'StaffGeneratePaper' },
  StaffPreviousPapers: { title: 'Paper library', label: 'Assess' },

  // Papers stack (students practise; staff reach it from Assess)
  PapersList: { title: 'Papers', label: (role) => (isStudent(role) ? 'Practice' : 'Assess') },
  GeneratePaper: { title: 'Generate paper', label: (role) => (isStudent(role) ? 'Practice' : 'Assess') },
  CustomPaper: { title: 'Custom paper', label: 'Assess', backFallback: 'GeneratePaper' },
  PaperDetail: { title: 'Paper', label: (role) => (isStudent(role) ? 'Practice' : 'Assess') },

  // Results stack
  ResultsList: { title: 'Checked papers', label: (role) => (isStudent(role) ? 'Results' : 'Assess') },
  ResultDetail: { title: 'Result', label: (role) => (isStudent(role) ? 'Results' : 'Assess') },
  QuestionEvidence: { title: 'Question review', label: (role) => (isStudent(role) ? 'Results' : 'Assess') },
  CheckedPaperWorkspace: { title: 'Paper review', label: (role) => (isStudent(role) ? 'Results' : 'Assess') },

  // Connect / Manage
  Approvals: { title: 'Approvals', label: connect },
  StaffApprovals: { title: 'Approvals', label: connect, backFallback: 'StaffHome' },
  Announcements: { title: 'Announcements', label: (role) => (isStudent(role) ? 'School' : connect(role)) },
  Doubts: { title: 'Doubts', label: (role) => (isStudent(role) ? 'Learn' : connect(role)) },

  // More
  Feature: { title: 'Feature', label: 'More' },
  ProfileMain: { title: 'Profile', label: 'Account' },

  // Student learning
  LearnerDashboard: { title: 'Dashboard', label: 'Progress' },
  CompetitiveExam: { title: 'JEE resources', label: 'JEE prep' },
  CompetitiveSubject: { title: 'Subject', label: 'JEE prep' },
  CompetitiveChapter: { title: 'Chapter', label: 'JEE prep' },
  AgenticLearning: { title: 'Agentic Learning', label: 'Learn' },
  AgenticSubject: { title: 'Subject', label: 'Learn' },
  AgenticTopic: { title: 'Topic', label: 'Learn' },
  PreviousPapers: { title: 'Previous papers', label: 'Practice' },
  CheatSheets: { title: 'Cheat sheets', label: 'Revise' },
}

export function resolveScreenHeader(routeName: string, role?: AccountMinimal['role']) {
  const meta = screenHeaders[routeName]
  const label = typeof meta?.label === 'function' ? meta.label(role) : meta?.label
  return { title: meta?.title, label, backFallback: meta?.backFallback }
}
