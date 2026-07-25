const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.PAPER_ATTEMPT_MODEL_PATH
if (!modelPath) throw new Error('Set PAPER_ATTEMPT_MODEL_PATH to the compiled paper attempt model.')
const { selectNewestInProgressAttempt } = require(modelPath)

function attempt(overrides = {}) {
  return {
    id: 'attempt-1',
    paper_id: 'paper-1',
    b2c_student_id: 'student-1',
    attempt_number: 1,
    started_at: '2026-07-25T10:00:00.000Z',
    submitted_at: undefined,
    checked_at: undefined,
    answers: [],
    total_score: undefined,
    max_score: 90,
    mode: 'student_attempt',
    time_taken_seconds: undefined,
    settings: {},
    feedback: undefined,
    results: [],
    results_visible_to_student: false,
    grading_status: 'in_progress',
    misconduct_report: undefined,
    misconduct_score: undefined,
    created_at: '2026-07-25T10:00:00.000Z',
    ...overrides,
  }
}

test('returns undefined when the response has no attempts', () => {
  assert.equal(selectNewestInProgressAttempt([]), undefined)
})

test('returns undefined when every attempt is complete', () => {
  const attempts = [
    attempt({ id: 'attempt-1', grading_status: 'graded' }),
    attempt({ id: 'attempt-2', attempt_number: 2, grading_status: 'submitted' }),
  ]

  assert.equal(selectNewestInProgressAttempt(attempts), undefined)
})

test('returns the only in-progress attempt', () => {
  const attempts = [
    attempt({ id: 'attempt-1', grading_status: 'submitted' }),
    attempt({ id: 'attempt-2', attempt_number: 2, grading_status: 'in_progress' }),
  ]

  assert.equal(selectNewestInProgressAttempt(attempts)?.id, 'attempt-2')
})

test('selects the newest in-progress attempt from an oldest-first response', () => {
  const attempts = [
    attempt({ id: 'attempt-1', attempt_number: 1, grading_status: 'in_progress' }),
    attempt({ id: 'attempt-2', attempt_number: 2, grading_status: 'submitted' }),
    attempt({ id: 'attempt-3', attempt_number: 3, grading_status: 'in_progress' }),
  ]

  assert.equal(selectNewestInProgressAttempt(attempts)?.id, 'attempt-3')
})
