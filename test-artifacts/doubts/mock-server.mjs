import http from 'node:http'
import { randomUUID } from 'node:crypto'

const port = Number(process.env.PORT || 8002)
const student = {
  id: '10000000-0000-4000-8000-000000000001', role: 'student', identifier: 'student.doubts@eduraa.test',
  display_name: 'Aarav Mehta', school_id: '20000000-0000-4000-8000-000000000001',
  standard: '10', division: 'A', is_active: true,
}
const teacherId = '30000000-0000-4000-8000-000000000001'
const teacher = {
  id: teacherId, role: 'teacher', identifier: 'teacher.doubts@eduraa.test', display_name: 'Meera Shah',
  school_id: student.school_id, standard: '10', division: 'A', is_active: true, is_approved: true,
}
const now = new Date().toISOString()
const makeSummary = (id, status, title, subject, last, offset = 0) => ({
  id, student_id: student.id, student_name: student.display_name, teacher_id: teacherId,
  teacher_name: 'Ms Meera Shah', subject_id: `40000000-0000-4000-8000-00000000000${offset + 1}`,
  subject, title, school_id: student.school_id, class_label: 'Class 10 · A', status, revision: status === 'pending' ? 1 : 2,
  latest_message_at: new Date(Date.now() - offset * 3_600_000).toISOString(), created_at: now, updated_at: now, last_message: last,
})

let doubts = [
  makeSummary('50000000-0000-4000-8000-000000000001', 'pending', 'Why does acceleration stay constant?', 'Physics', 'I understand the formula but not why the slope is unchanged.', 1),
  makeSummary('50000000-0000-4000-8000-000000000002', 'answered', 'Factoring this quadratic', 'Mathematics', 'Try grouping the middle terms as +3x and +2x.', 2),
  makeSummary('50000000-0000-4000-8000-000000000003', 'resolved', 'Function of the nephron loop', 'Biology', 'Resolved after the osmosis explanation.', 3),
]
let listMode = 'populated'

const messages = new Map([
  [doubts[0].id, [{ id: randomUUID(), sender_id: student.id, sender_role: 'student', sender_name: student.display_name, body: doubts[0].last_message, created_at: doubts[0].created_at }]],
  [doubts[1].id, [
    { id: randomUUID(), sender_id: student.id, sender_role: 'student', sender_name: student.display_name, body: 'I can find the roots with the formula, but how do I factor x² + 5x + 6?', created_at: doubts[1].created_at },
    { id: randomUUID(), sender_id: teacherId, sender_role: 'teacher', sender_name: 'Ms Meera Shah', body: doubts[1].last_message, created_at: doubts[1].latest_message_at },
  ]],
  [doubts[2].id, [{ id: randomUUID(), sender_id: teacherId, sender_role: 'teacher', sender_name: 'Ms Meera Shah', body: doubts[2].last_message, created_at: doubts[2].created_at }]],
])
const event = (doubt, eventType, fromStatus, toStatus, actor = student, messageId = null) => ({
  id: randomUUID(), actor_id: actor.id, actor_role: actor.role, actor_name: actor.display_name,
  event_type: eventType, from_status: fromStatus, to_status: toStatus, message_id: messageId,
  created_at: doubt.updated_at || doubt.created_at,
})
const histories = new Map([
  [doubts[0].id, [event(doubts[0], 'created', null, 'pending')]],
  [doubts[1].id, [event(doubts[1], 'created', null, 'pending'), event(doubts[1], 'answered', 'pending', 'answered', teacher)]],
  [doubts[2].id, [event(doubts[2], 'created', null, 'pending'), event(doubts[2], 'answered', 'pending', 'answered', teacher), event(doubts[2], 'resolved', 'answered', 'resolved', teacher)]],
])

function setPrimaryStatus(status) {
  const current = doubts.find((item) => item.id === '50000000-0000-4000-8000-000000000001')
  if (!current) return
  let updated = current
  if ((status === 'answered' || status === 'resolved') && current.status === 'pending') {
    const answerBody = 'Acceleration remains constant because equal time intervals add equal amounts of velocity, so Δv ÷ Δt stays unchanged.'
    const replyMessage = { id: randomUUID(), sender_id: teacher.id, sender_role: 'teacher', sender_name: teacher.display_name, body: answerBody, created_at: new Date().toISOString() }
    updated = { ...current, status: 'answered', revision: current.revision + 1, latest_message_at: replyMessage.created_at, updated_at: replyMessage.created_at, last_message: answerBody }
    messages.set(current.id, [...(messages.get(current.id) || []), replyMessage])
    histories.set(current.id, [...(histories.get(current.id) || []), event(updated, 'answered', 'pending', 'answered', teacher, replyMessage.id)])
  }
  if (status === 'resolved' && updated.status !== 'resolved') {
    updated = { ...updated, status: 'resolved', revision: updated.revision + 1, updated_at: new Date().toISOString() }
    histories.set(updated.id, [...(histories.get(updated.id) || []), event(updated, 'resolved', 'answered', 'resolved', teacher)])
  }
  doubts = doubts.map((item) => item.id === updated.id ? updated : item)
}

const send = (res, status, payload) => {
  res.writeHead(status, {
    'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'http://127.0.0.1:8083',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  })
  res.end(payload == null ? '' : JSON.stringify(payload))
}
const readBody = async (req) => {
  let body = ''
  for await (const chunk of req) body += chunk
  return body ? JSON.parse(body) : {}
}
const detail = (doubt) => ({
  doubt,
  messages: messages.get(doubt.id) || [],
  history: histories.get(doubt.id) || [],
})

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, null)
  const url = new URL(req.url, `http://localhost:${port}`)
  if (url.pathname === '/__mock/mode') {
    listMode = url.searchParams.get('value') || 'populated'
    return send(res, 200, { mode: listMode })
  }
  if (url.pathname === '/__mock/primary') {
    setPrimaryStatus(url.searchParams.get('status') || 'pending')
    return send(res, 200, { status: doubts[0]?.status })
  }
  if (url.pathname.endsWith('/auth/login') && req.method === 'POST') {
    const body = await readBody(req)
    const isTeacher = String(body.identifier || '').includes('teacher.doubts')
    return send(res, 200, { access_token: isTeacher ? 'mock-token-teacher' : 'mock-token-student', token_type: 'bearer', user: isTeacher ? teacher : student })
  }
  if (url.pathname.endsWith('/auth/me') || url.pathname.endsWith('/auth/refresh')) {
    const isTeacher = String(req.headers.authorization || '').includes('teacher')
    return send(res, 200, url.pathname.endsWith('/refresh') ? { access_token: isTeacher ? 'mock-token-teacher' : 'mock-token-student', refresh_token: null } : isTeacher ? teacher : student)
  }
  if (url.pathname.endsWith('/analytics/student-dashboard-lab')) return send(res, 200, { generated_papers: 0, attempts: 0, checked_papers: 0, recent_submissions: [], upcoming_exams: [] })
  if (url.pathname.endsWith('/communication/doubts/teachers')) return send(res, 200, [
    { teacher_id: teacherId, teacher_name: 'Ms Meera Shah', subject_id: '40000000-0000-4000-8000-000000000001', subject_name: 'Physics' },
    { teacher_id: teacherId, teacher_name: 'Ms Meera Shah', subject_id: '40000000-0000-4000-8000-000000000002', subject_name: 'Mathematics' },
  ])
  if (url.pathname.endsWith('/communication/doubts') && req.method === 'GET') {
    if (listMode === 'error') return send(res, 503, { detail: 'Synthetic network pause' })
    if (listMode === 'slow') await new Promise((resolve) => setTimeout(resolve, 6000))
    return send(res, 200, { items: listMode === 'empty' ? [] : doubts })
  }
  if (url.pathname.endsWith('/communication/doubts') && req.method === 'POST') {
    await new Promise((resolve) => setTimeout(resolve, 1800))
    const body = await readBody(req)
    const existing = doubts.find((item) => item.client_request_id === body.client_request_id)
    if (existing) return send(res, 200, detail(existing))
    const created = { ...makeSummary(randomUUID(), 'pending', body.title, body.subject, body.description), client_request_id: body.client_request_id }
    doubts = [created, ...doubts]
    const createdMessage = { id: randomUUID(), sender_id: student.id, sender_role: 'student', sender_name: student.display_name, body: body.description, created_at: now }
    messages.set(created.id, [createdMessage])
    histories.set(created.id, [event(created, 'created', null, 'pending', student, createdMessage.id)])
    return send(res, 200, detail(created))
  }
  const match = url.pathname.match(/\/communication\/doubts\/([^/]+)(?:\/(messages|resolve))?$/)
  if (match) {
    const doubt = doubts.find((item) => item.id === match[1])
    if (!doubt) return send(res, 404, { detail: 'Doubt not found.' })
    if (!match[2] && req.method === 'GET') return send(res, 200, detail(doubt))
    if (match[2] === 'messages' && req.method === 'POST') {
      const body = await readBody(req)
      const isTeacher = String(req.headers.authorization || '').includes('teacher')
      const updated = { ...doubt, status: isTeacher ? 'answered' : 'pending', revision: doubt.revision + 1, latest_message_at: new Date().toISOString(), last_message: body.body }
      doubts = doubts.map((item) => item.id === doubt.id ? updated : item)
      const replyMessage = { id: randomUUID(), sender_id: isTeacher ? teacher.id : student.id, sender_role: isTeacher ? 'teacher' : 'student', sender_name: isTeacher ? teacher.display_name : student.display_name, body: body.body, created_at: updated.latest_message_at }
      messages.set(doubt.id, [...(messages.get(doubt.id) || []), replyMessage])
      histories.set(doubt.id, [...(histories.get(doubt.id) || []), event(updated, isTeacher ? 'answered' : 'student_replied', doubt.status, updated.status, isTeacher ? teacher : student, replyMessage.id)])
      return send(res, 200, detail(updated))
    }
    if (match[2] === 'resolve' && req.method === 'PATCH') {
      const updated = { ...doubt, status: 'resolved', revision: doubt.revision + 1, latest_message_at: new Date().toISOString() }
      doubts = doubts.map((item) => item.id === doubt.id ? updated : item)
      histories.set(doubt.id, [...(histories.get(doubt.id) || []), event(updated, 'resolved', doubt.status, 'resolved', teacher)])
      return send(res, 200, detail(updated))
    }
  }
  return send(res, 404, { detail: 'Mock route not found' })
}).listen(port, '127.0.0.1', () => console.log(`Doubt mock listening on ${port}`))
