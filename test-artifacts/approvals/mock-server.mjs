import http from 'node:http'

const port = Number(process.env.APPROVALS_MOCK_PORT || 8021)

const principal = {
  id: 'a1000000-0000-4000-8000-000000000001',
  display_name: 'Ananya Rao',
  identifier: 'ananya.rao@example.test',
  role: 'principal',
  is_active: true,
  created_at: '2026-08-18T09:20:00.000Z',
}

const teachers = [
  {
    id: 'a2000000-0000-4000-8000-000000000001',
    display_name: 'Meera Subramaniam',
    identifier: 'TCH-1042',
    role: 'teacher',
    is_active: true,
    created_at: '2026-08-18T12:30:00.000Z',
    standards_taught: ['9', '10'],
    subjects_taught: ['Physics', 'Mathematics'],
  },
  {
    id: 'a2000000-0000-4000-8000-000000000002',
    display_name: 'Ravi Menon',
    identifier: 'TCH-1187',
    role: 'teacher',
    is_active: true,
    created_at: '2026-08-19T07:45:00.000Z',
    standards_taught: ['8'],
    subjects_taught: ['Chemistry'],
  },
]

const students = [
  {
    id: 'a3000000-0000-4000-8000-000000000001',
    display_name: 'Aarav Sharma',
    identifier: 'STU-2026-041',
    role: 'student',
    is_active: true,
    created_at: '2026-08-19T08:05:00.000Z',
  },
  {
    id: 'a3000000-0000-4000-8000-000000000002',
    display_name: 'Ishita Kulkarni',
    identifier: 'STU-2026-042',
    role: 'student',
    is_active: true,
    created_at: '2026-08-19T08:12:00.000Z',
  },
]

const classTeacherRequests = [{
  id: 'a4000000-0000-4000-8000-000000000001',
  class_teacher_name: 'Neha Desai',
  standard: '10',
  division: 'A',
  assignments: [
    { teacher_id: teachers[0].id, teacher_name: teachers[0].display_name, subject: 'Physics' },
    { teacher_id: teachers[1].id, teacher_name: teachers[1].display_name, subject: 'Chemistry' },
  ],
}]

const teacherProfileUpdates = [{
  id: 'a5000000-0000-4000-8000-000000000001',
  teacher_uuid: teachers[0].id,
  teacher_name: teachers[0].display_name,
  submitted_at: '2026-08-19T06:30:00.000Z',
  current_profile: {
    first_name: 'Meera', last_name: 'Subramaniam', email: 'meera.old@example.test', teacher_id: 'TCH-1042',
    branch_name: 'North Campus', board: 'CBSE', standards_taught: ['9'], divisions_taught: ['A'], subjects_taught: ['Physics'],
  },
  requested_profile: {
    first_name: 'Meera', last_name: 'Subramaniam', email: 'meera@example.test', teacher_id: 'TCH-1042',
    branch_name: 'North Campus', board: 'CBSE', standards_taught: ['9', '10'], divisions_taught: ['A'], subjects_taught: ['Physics', 'Mathematics'],
  },
}]

const initialQueues = { principals: [principal], teachers, students, classTeacherRequests, teacherProfileUpdates }
let queues = structuredClone(initialQueues)
let mode = 'ready'
let activeRole = 'principal'
let mutationCount = 0
const audit = []

function cors(response) {
  response.setHeader('Access-Control-Allow-Origin', response.__requestOrigin || '*')
  response.setHeader('Access-Control-Allow-Credentials', 'true')
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

function json(response, status, payload) {
  cors(response)
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

async function body(request) {
  let value = ''
  for await (const chunk of request) value += chunk
  return value ? JSON.parse(value) : {}
}

function userForRole(role) {
  return {
    id: `90000000-0000-4000-8000-${String(['school_super_admin', 'branch_admin', 'principal', 'teacher', 'student'].indexOf(role) + 1).padStart(12, '0')}`,
    display_name: role === 'teacher' ? 'Kabir Singh' : role === 'student' ? 'Aarav Sharma' : 'Priya Kapoor',
    identifier: `${role}@example.test`, role, profile_completed: true, is_email_verified: true,
    school_id: '70000000-0000-4000-8000-000000000001', branch_id: '71000000-0000-4000-8000-000000000001',
    class_teacher_opt_in: role === 'teacher', class_teacher_standard: role === 'teacher' ? '10' : null, class_teacher_division: role === 'teacher' ? 'A' : null,
    standard: role === 'student' ? '10' : undefined, division: role === 'student' ? 'A' : undefined,
  }
}

function roleFromIdentifier(identifier = '') {
  if (identifier.includes('super')) return 'school_super_admin'
  if (identifier.includes('branch')) return 'branch_admin'
  if (identifier.includes('teacher')) return 'teacher'
  if (identifier.includes('student')) return 'student'
  return 'principal'
}

function allowedQueue(role, key) {
  return (role === 'school_super_admin' || role === 'branch_admin') ? key === 'principals'
    : role === 'principal' ? ['teachers', 'classTeacherRequests', 'teacherProfileUpdates'].includes(key)
      : role === 'teacher' ? key === 'students'
        : false
}

const queueByPath = new Map([
  ['/api/v1/approvals/principals/pending', 'principals'],
  ['/api/v1/approvals/teachers/pending', 'teachers'],
  ['/api/v1/approvals/students/pending', 'students'],
  ['/api/v1/approvals/class-teacher-requests/pending', 'classTeacherRequests'],
  ['/api/v1/approvals/teacher-profile-updates/pending', 'teacherProfileUpdates'],
])

function decisionPath(path) {
  const match = path.match(/^\/api\/v1\/approvals\/(principals|teachers|students|class-teacher-requests|teacher-profile-updates)\/([^/]+)\/(approve|reject)$/)
  if (!match) return null
  const keys = { principals: 'principals', teachers: 'teachers', students: 'students', 'class-teacher-requests': 'classTeacherRequests', 'teacher-profile-updates': 'teacherProfileUpdates' }
  return { key: keys[match[1]], id: match[2], action: match[3] }
}

const server = http.createServer(async (request, response) => {
  response.__requestOrigin = request.headers.origin
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  const path = url.pathname
  if (request.method === 'OPTIONS') return json(response, 204, {})

  if (request.method === 'POST' && path === '/__test__/mode') {
    const payload = await body(request)
    mode = String(payload.mode || 'ready')
    if (payload.reset) { queues = structuredClone(initialQueues); mutationCount = 0; audit.length = 0 }
    return json(response, 200, { mode, mutationCount })
  }
  if (request.method === 'GET' && path === '/__test__/audit') return json(response, 200, { mutationCount, events: audit })

  if (request.method === 'POST' && path === '/api/v1/auth/login') {
    const payload = await body(request)
    activeRole = roleFromIdentifier(String(payload.identifier || ''))
    if (activeRole === 'student' && String(payload.identifier).includes('pending')) return json(response, 403, { detail: 'Your school account is waiting for approval.' })
    return json(response, 200, { access_token: `synthetic-${activeRole}`, refresh_token: `refresh-${activeRole}`, token_type: 'bearer', user: userForRole(activeRole) })
  }
  if (request.method === 'GET' && path === '/api/v1/auth/me') return json(response, 200, userForRole(activeRole))
  if (request.method === 'POST' && path === '/api/v1/auth/refresh') return json(response, 200, { access_token: `synthetic-${activeRole}`, refresh_token: `refresh-${activeRole}` })
  if (request.method === 'POST' && path === '/api/v1/auth/logout') return json(response, 200, {})
  if (request.method === 'POST' && path === '/api/v1/auth/approval-status') {
    const payload = await body(request)
    const identifier = String(payload.identifier || '')
    const state = identifier.includes('approved') ? 'approved' : identifier.includes('rejected') ? 'rejected' : 'pending'
    const role = identifier.includes('teacher') ? 'teacher' : identifier.includes('principal') ? 'principal' : 'student'
    return json(response, 200, {
      role, display_name: role === 'student' ? 'Aarav Sharma' : role === 'teacher' ? 'Meera Subramaniam' : 'Ananya Rao', state,
      submitted_at: '2026-08-18T09:20:00.000Z', reviewed_at: state === 'pending' ? null : '2026-08-19T10:15:00.000Z',
    })
  }

  if (request.method === 'GET' && queueByPath.has(path)) {
    const key = queueByPath.get(path)
    if (!allowedQueue(activeRole, key)) return json(response, 403, { detail: 'This role is not permitted to open this approval queue.' })
    if (mode === 'expired') return json(response, 401, { detail: 'Session expired.' })
    if (mode === 'permission' || (mode === 'partial' && key === 'classTeacherRequests')) return json(response, 403, { detail: 'This queue is outside your current school scope.' })
    if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 7000))
    return json(response, 200, mode === 'empty' ? [] : queues[key])
  }

  const decision = decisionPath(path)
  if (request.method === 'POST' && decision) {
    if (!allowedQueue(activeRole, decision.key)) return json(response, 403, { detail: 'This role cannot decide this request.' })
    if (mode === 'conflict') return json(response, 409, { detail: 'Another reviewer already completed this request.' })
    const item = queues[decision.key].find(candidate => candidate.id === decision.id)
    if (!item) return json(response, 409, { detail: 'This request is no longer pending.' })
    if (mode === 'mutation-slow') await new Promise(resolve => setTimeout(resolve, 1500))
    mutationCount += 1
    audit.push({ actor: userForRole(activeRole).id, target: decision.id, action: decision.action, timestamp: new Date().toISOString() })
    queues[decision.key] = queues[decision.key].filter(candidate => candidate.id !== decision.id)
    return json(response, 200, item)
  }

  return json(response, 404, { detail: `No synthetic route for ${request.method} ${path}` })
})

server.listen(port, '127.0.0.1', () => console.log(`Approvals mock listening on http://127.0.0.1:${port}`))
