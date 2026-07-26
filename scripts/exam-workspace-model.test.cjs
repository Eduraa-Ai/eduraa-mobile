const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.EXAM_WORKSPACE_MODEL_PATH
if (!modelPath) throw new Error('Set EXAM_WORKSPACE_MODEL_PATH to the compiled exam workspace model.')
const {
  isRetestableAttempt,
  selectNewestDownloadableAttempt,
  selectNewestRetestableAttempt,
} = require(modelPath)

test('a submitted or checking paper can be retested without replacing its saved attempt', () => {
  assert.equal(isRetestableAttempt({ id: 'submitted', grading_status: 'submitted' }), true)
  assert.equal(isRetestableAttempt({ id: 'checking', grading_status: 'checking' }), true)
  assert.equal(isRetestableAttempt({ id: 'draft', grading_status: 'in_progress' }), false)
})

test('retest resolves the newest non-draft attempt from an oldest-first response', () => {
  const attempts = [
    { id: 'checked-1', grading_status: 'checked' },
    { id: 'checking-2', grading_status: 'checking' },
    { id: 'draft-3', grading_status: 'in_progress' },
  ]

  assert.equal(selectNewestRetestableAttempt(attempts)?.id, 'checking-2')
})

test('download resolves only the newest visible completed result', () => {
  const attempts = [
    { id: 'checked-1', grading_status: 'checked', results_visible_to_student: true },
    { id: 'hidden-2', grading_status: 'checked', results_visible_to_student: false },
    { id: 'checking-3', grading_status: 'checking', results_visible_to_student: false },
  ]

  assert.equal(selectNewestDownloadableAttempt(attempts)?.id, 'checked-1')
  assert.equal(
    selectNewestDownloadableAttempt([
      { id: 'checking', grading_status: 'checking', results_visible_to_student: false },
    ]),
    undefined,
  )
})
