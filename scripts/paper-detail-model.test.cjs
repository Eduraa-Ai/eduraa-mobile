const assert = require('node:assert/strict')
const test = require('node:test')

const {
  hasVisibleAttemptResult,
  paperPrimaryAction,
  selectNewestSubmittedAttempt,
  visibleScore,
} = require(process.env.PAPER_DETAIL_MODEL_PATH)

test('checking submissions never expose a placeholder score or results action', () => {
  const attempt = {
    id: 'checking',
    grading_status: 'checking',
    results_visible_to_student: true,
    total_score: 0,
    max_score: 300,
  }
  assert.equal(hasVisibleAttemptResult(attempt), false)
  assert.equal(visibleScore(attempt), null)
  assert.equal(paperPrimaryAction([attempt]), 'attempt_again')
})

test('a released checked result consistently exposes View Results', () => {
  const attempt = {
    id: 'checked',
    grading_status: 'checked',
    results_visible_to_student: true,
    total_score: 224,
    max_score: 300,
  }
  assert.equal(hasVisibleAttemptResult(attempt), true)
  assert.equal(visibleScore(attempt), '224 / 300')
  assert.equal(paperPrimaryAction([attempt]), 'view_results')
})

test('a new blank retest does not erase the previous submitted result', () => {
  const checked = { id: 'checked', grading_status: 'checked', results_visible_to_student: true }
  const blankRetest = { id: 'retest', grading_status: 'in_progress', results_visible_to_student: false }
  assert.equal(selectNewestSubmittedAttempt([checked, blankRetest]), checked)
  assert.equal(paperPrimaryAction([checked, blankRetest]), 'view_results')
})

test('unfinished and untouched papers have distinct actions', () => {
  assert.equal(paperPrimaryAction([]), 'attempt')
  assert.equal(
    paperPrimaryAction([{ id: 'draft', grading_status: 'in_progress' }]),
    'continue',
  )
})
