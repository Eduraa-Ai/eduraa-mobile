import { randomUUID } from 'node:crypto'

export const SYNTHETIC_PASSWORD = 'Synthetic123!'

const accountDefinitions = [
  {
    id: 'a3000000-0000-4000-8000-000000000001',
    role: 'teacher',
    display_name: 'Meera Subramaniam',
    identifiers: ['attendance-teacher@example.test', 'TCH-1024'],
    class_teacher_opt_in: true,
    class_teacher_standard: '10',
    class_teacher_division: 'A',
    standards_taught: ['10'],
    divisions_taught: ['A'],
    subjects_taught: ['Mathematics'],
  },
  {
    id: 'a2000000-0000-4000-8000-000000000001',
    role: 'student',
    display_name: 'Aarav Jain',
    identifiers: ['attendance-student@example.test', 'ST-001'],
    standard: '10',
    division: 'A',
  },
  {
    id: 'a1000000-0000-4000-8000-000000000001',
    role: 'principal',
    display_name: 'Priya Shah',
    identifiers: ['attendance-leader@example.test', 'principal@example.test'],
  },
  {
    id: '00000000-0000-4000-8000-000000000019',
    role: 'student',
    display_name: 'Aarav Ramanathan',
    identifiers: [
      'exam-b2b.student@example.test',
      'school-student@example.test',
      'school-student-announcements@example.test',
      'student.doubts@eduraa.test',
    ],
    standard: '10',
    division: 'A',
  },
  {
    id: '00000000-0000-4000-8000-000000000020',
    role: 'teacher',
    display_name: 'Meera Subramaniam',
    identifiers: [
      'school-teacher@example.test',
      'school-teacher-announcements@example.test',
      'teacher@example.test',
      'teacher.doubts@eduraa.test',
    ],
    standards_taught: ['10'],
    divisions_taught: ['A'],
    subjects_taught: ['Mathematics'],
  },
  {
    id: '00000000-0000-4000-8000-000000000018',
    role: 'b2c_student',
    display_name: 'Aarav Test',
    identifiers: [
      'synthetic.jee.mobile@example.test',
      'paper-detail@example.test',
    ],
    profile_completed: true,
    is_email_verified: true,
    b2c_education_level: 'competitive_exams',
    b2c_target_exam: 'JEE Main + Advanced',
    b2c_subjects: ['Physics', 'Mathematics', 'Chemistry'],
  },
  {
    id: '00000000-0000-4000-8000-000000000021',
    role: 'b2c_student',
    display_name: 'Aarav Test',
    identifiers: ['pr6.ineligible@example.test'],
    profile_completed: true,
    is_email_verified: true,
    b2c_education_level: 'school',
    b2c_target_exam: null,
    b2c_subjects: ['Physics', 'Mathematics', 'Chemistry'],
  },
]

const accountsByIdentifier = new Map()
for (const definition of accountDefinitions) {
  const { identifiers, ...account } = definition
  for (const identifier of identifiers) {
    accountsByIdentifier.set(identifier.toLowerCase(), {
      ...account,
      identifier: identifiers[0],
    })
  }
}

export function normalizeIdentifier(value) {
  return String(value || '').trim().toLowerCase()
}

export function authenticateFixture(identifier, password) {
  if (password !== SYNTHETIC_PASSWORD) return null
  return accountsByIdentifier.get(normalizeIdentifier(identifier)) || null
}

export function createFixtureSessions() {
  const accessSessions = new Map()
  const refreshSessions = new Map()

  const issue = (account) => {
    const accessToken = `synthetic-access-${randomUUID()}`
    const refreshToken = `synthetic-refresh-${randomUUID()}`
    accessSessions.set(accessToken, account)
    refreshSessions.set(refreshToken, account)
    return { accessToken, refreshToken }
  }

  const accountForAuthorization = (authorization) => {
    const match = /^Bearer\s+(.+)$/i.exec(String(authorization || ''))
    return match ? accessSessions.get(match[1]) || null : null
  }

  const refresh = (refreshToken) => {
    const account = refreshSessions.get(String(refreshToken || ''))
    if (!account) return null
    refreshSessions.delete(String(refreshToken))
    return { account, ...issue(account) }
  }

  const revoke = ({ authorization, refreshToken }) => {
    const match = /^Bearer\s+(.+)$/i.exec(String(authorization || ''))
    if (match) accessSessions.delete(match[1])
    if (refreshToken) refreshSessions.delete(String(refreshToken))
  }

  return { issue, accountForAuthorization, refresh, revoke }
}
