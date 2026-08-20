import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createClientRequestId,
  emptyDoubtDraft,
  filterDoubts,
  selectTeacher,
  validateDoubtDraft,
} from '../src/screens/workspace/doubtWorkspaceModel'
import type { DoubtSummary } from '../src/api/doubts'

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
  } satisfies Omit<DoubtSummary, 'id' | 'status'>
  const items: DoubtSummary[] = [
    { ...base, id: '1', status: 'pending' },
    { ...base, id: '2', status: 'answered' },
    { ...base, id: '3', status: 'resolved' },
  ]

  assert.deepEqual(filterDoubts(items, 'answered').map((item) => item.id), ['2'])
  assert.equal(filterDoubts(items, 'all').length, 3)
})

