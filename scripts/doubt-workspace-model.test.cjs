const assert = require('node:assert/strict')
const test = require('node:test')

const {
  createClientRequestId,
  emptyDoubtDraft,
  filterDoubts,
  filterDoubtsForRole,
  normalizeDoubtDetail,
  normalizeDoubtSummary,
  returnFromDoubts,
  selectTeacher,
  validateDoubtDraft,
} = require(process.env.DOUBT_WORKSPACE_MODEL_PATH)

test('valid academic input is accepted and keeps the retry id', () => {
  const requestId = createClientRequestId(() => 0.42)
  const selected = selectTeacher(emptyDoubtDraft(requestId), {
    teacher_id: 'teacher-1',
    teacher_name: 'Meera Shah',
    subject_id: 'subject-1',
    subject_name: 'Physics',
  })
  const draft = {
    ...selected,
    title: "Newton's third law",
    details: 'Why do action and reaction forces not cancel each other?',
  }

  assert.deepEqual(validateDoubtDraft(draft), {})
  assert.equal(draft.clientRequestId, requestId)
  assert.match(requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('validation catches missing context, long titles, and unsafe content', () => {
  const errors = validateDoubtDraft({
    ...emptyDoubtDraft(createClientRequestId()),
    title: 'x'.repeat(161),
    details: 'Give me betting tips for tonight',
  })

  assert.ok(errors.teacher)
  assert.ok(errors.title)
  assert.ok(errors.guardrail)
})

test('status filtering never leaks another state into the selected queue', () => {
  const base = {
    student_id: 'student-1',
    student_name: 'Aarav',
    teacher_id: 'teacher-1',
    teacher_name: 'Meera',
    subject: 'Physics',
    title: 'Question',
    revision: 1,
    latest_message_at: '2026-08-19T10:00:00Z',
    created_at: '2026-08-19T10:00:00Z',
    updated_at: '2026-08-19T10:00:00Z',
  }
  const items = [
    { ...base, id: '1', status: 'pending' },
    { ...base, id: '3', status: 'resolved' },
  ]

  assert.deepEqual(filterDoubts(items, 'pending').map((item) => item.id), ['1'])
  assert.deepEqual(filterDoubts(items, 'resolved').map((item) => item.id), ['3'])
  assert.equal(filterDoubts(items, 'all').length, 2)
})

test('legacy answered doubts are normalized into pending', () => {
  const summary = normalizeDoubtSummary({
    id: 'legacy-answered',
    subject: 'Math',
    status: 'answered',
    latest_message_at: '2026-08-25T10:00:00Z',
    created_at: '2026-08-25T09:00:00Z',
  })

  assert.equal(summary.status, 'pending')
})

test('role filters separate teachers for students and class plus student for teachers', () => {
  const base = {
    subject: 'Physics', title: 'Question', status: 'pending', revision: 1,
    latest_message_at: '2026-08-19T10:00:00Z', created_at: '2026-08-19T10:00:00Z', updated_at: '2026-08-19T10:00:00Z',
  }
  const items = [
    { ...base, id: '1', teacher_id: 't1', teacher_name: 'Teacher One', student_id: 's1', student_name: 'Student One', class_label: 'Std 8 - A' },
    { ...base, id: '2', teacher_id: 't2', teacher_name: 'Teacher Two', student_id: 's2', student_name: 'Student Two', class_label: 'Std 8 - B' },
  ]

  assert.deepEqual(filterDoubtsForRole(items, 'all', false, { personId: 't2', classLabel: null }).map((item) => item.id), ['2'])
  assert.deepEqual(filterDoubtsForRole(items, 'all', true, { personId: 's1', classLabel: 'Std 8 - A' }).map((item) => item.id), ['1'])
})

test('legacy backend doubt records are normalized without blanking the screen', () => {
  const legacy = normalizeDoubtSummary({
    id: 'doubt-1',
    student_id: 'student-1',
    student_name: 'Aarav',
    teacher_id: 'teacher-1',
    teacher_name: 'Meera',
    subject: 'Physics',
    status: 'open',
    latest_message_at: '2026-08-25T10:00:00Z',
    created_at: '2026-08-25T09:00:00Z',
    last_message: 'Why does acceleration stay constant?',
  })

  assert.equal(legacy.status, 'pending')
  assert.equal(legacy.title, 'Physics question')
  assert.equal(legacy.revision, null)
  assert.equal(legacy.updated_at, legacy.latest_message_at)
})

test('legacy detail responses get safe empty history and closed status mapping', () => {
  const detail = normalizeDoubtDetail({
    doubt: {
      id: 'doubt-2',
      subject: 'Chemistry',
      status: 'closed',
      created_at: '2026-08-25T09:00:00Z',
      latest_message_at: '2026-08-25T10:00:00Z',
    },
    messages: [],
  })

  assert.equal(detail.doubt.status, 'resolved')
  assert.deepEqual(detail.history, [])
})

test('doubts back uses history when available', () => {
  const calls = []
  const result = returnFromDoubts({
    canGoBack: () => true,
    goBack: () => calls.push('back'),
    reset: () => calls.push('reset'),
  }, false)

  assert.equal(result, 'back')
  assert.deepEqual(calls, ['back'])
})

test('direct doubt routes reset to the role-safe workspace root', () => {
  const studentStates = []
  const teacherStates = []

  assert.equal(returnFromDoubts({ reset: (state) => studentStates.push(state) }, false), 'HomeMain')
  assert.equal(returnFromDoubts({ reset: (state) => teacherStates.push(state) }, true), 'StaffWorkspace')
  assert.deepEqual(studentStates, [{ index: 0, routes: [{ name: 'HomeMain' }] }])
  assert.deepEqual(teacherStates, [{ index: 0, routes: [{ name: 'StaffWorkspace' }] }])
})
