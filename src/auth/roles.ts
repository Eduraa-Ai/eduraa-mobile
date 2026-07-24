import type { Role } from '../types'

export function isLearnerRole(role?: Role | null) {
  return role === 'student' || role === 'b2c_student'
}
