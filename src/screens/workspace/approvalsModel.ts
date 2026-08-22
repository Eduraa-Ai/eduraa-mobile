import type { Role } from '../../types'

export const APPROVAL_QUEUE_KEYS = [
  'principals',
  'teachers',
  'students',
  'classTeacherRequests',
  'teacherProfileUpdates',
] as const

export type ApprovalQueueKey = (typeof APPROVAL_QUEUE_KEYS)[number]

export type ApprovalRoleContract = {
  label: string
  purpose: string
  queues: readonly ApprovalQueueKey[]
  canDecide: boolean
  statusOnly: boolean
}

export const APPROVAL_ROLE_MATRIX: Readonly<
  Record<'school_super_admin' | 'branch_admin' | 'principal' | 'teacher' | 'student', ApprovalRoleContract>
> = {
  school_super_admin: {
    label: 'School super admin',
    purpose: 'Review pending principals across the school.',
    queues: ['principals'],
    canDecide: true,
    statusOnly: false,
  },
  branch_admin: {
    label: 'Branch admin',
    purpose: 'Review pending principals in the assigned branch.',
    queues: ['principals'],
    canDecide: true,
    statusOnly: false,
  },
  principal: {
    label: 'Principal',
    purpose: 'Review staff access, class-teacher plans, and teacher profile changes.',
    queues: ['teachers', 'classTeacherRequests', 'teacherProfileUpdates'],
    canDecide: true,
    statusOnly: false,
  },
  teacher: {
    label: 'Teacher',
    purpose: 'Review students assigned to your class.',
    queues: ['students'],
    canDecide: true,
    statusOnly: false,
  },
  student: {
    label: 'Student',
    purpose: 'See only your own school access status.',
    queues: [],
    canDecide: false,
    statusOnly: true,
  },
}

export function getApprovalRoleContract(role?: Role | null): ApprovalRoleContract | null {
  if (!role || !(role in APPROVAL_ROLE_MATRIX)) return null
  return APPROVAL_ROLE_MATRIX[role as keyof typeof APPROVAL_ROLE_MATRIX]
}

export function getVisibleApprovalQueues(role?: Role | null): readonly ApprovalQueueKey[] {
  return getApprovalRoleContract(role)?.queues ?? []
}

export function canAccessApprovalActions(role?: Role | null) {
  return Boolean(getApprovalRoleContract(role)?.canDecide)
}

export function removeCompletedApproval<T extends { id: string }>(
  items: readonly T[] | undefined,
  completedId: string,
): T[] {
  return (items ?? []).filter((item) => item.id !== completedId)
}
