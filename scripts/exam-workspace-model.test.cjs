const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.EXAM_WORKSPACE_MODEL_PATH
if (!modelPath) throw new Error('Set EXAM_WORKSPACE_MODEL_PATH to the compiled exam workspace model.')
const {
  applyPaperDefaults,
  deriveExamSetupOptions,
  filterSubjectsForTeacher,
  isRetestableAttempt,
  keepOrSelectOnly,
  selectNewestDownloadableAttempt,
  selectNewestRetestableAttempt,
} = require(modelPath)

const sections = [
  { standard: 'Std 9', division: 'A', subjects: [{ id: 'physics', name: 'Physics' }] },
  { standard: 'Std 9', division: 'B', subjects: [{ id: 'chemistry', name: 'Chemistry' }] },
  { standard: 'Std 10', division: 'A', subjects: [{ id: 'physics', name: 'Physics' }] },
]

test('teacher and subject context narrows every downstream class option', () => {
  assert.deepEqual(
    filterSubjectsForTeacher(
      [{ id: 'physics', name: 'Physics' }, { id: 'chemistry', name: 'Chemistry' }],
      [' physics '],
    ).map((subject) => subject.id),
    ['physics'],
  )

  const options = deriveExamSetupOptions(sections, 'physics', 'Std 10', ['Std 9', 'Std 10'], ['A', 'B'])
  assert.deepEqual(options.standards, ['Std 9', 'Std 10'])
  assert.deepEqual(options.divisions, ['A'])
  assert.equal(keepOrSelectOnly('B', options.divisions), 'A')
  assert.deepEqual(
    deriveExamSetupOptions(sections, 'chemistry', '', ['Std 10'], ['A', 'B']).standards,
    [],
  )
})

test('paper metadata fills only blank exam details', () => {
  const hydrated = applyPaperDefaults(
    { name: '', subjectId: 'physics', standard: '', division: '', semester: '', durationMinutes: '' },
    { title: 'Motion unit test', subject_id: 'physics', standard: 'Std 9', division: 'A', semester: 'Semester 1', duration_minutes: 45 },
  )
  assert.deepEqual(hydrated, {
    name: 'Motion unit test',
    subjectId: 'physics',
    standard: 'Std 9',
    division: 'A',
    semester: 'Semester 1',
    durationMinutes: '45',
  })

  assert.equal(applyPaperDefaults({ ...hydrated, name: 'My exam', durationMinutes: '60' }, { title: 'Ignored', duration_minutes: 90 }).name, 'My exam')
  assert.equal(applyPaperDefaults({ ...hydrated, name: 'My exam', durationMinutes: '60' }, { title: 'Ignored', duration_minutes: 90 }).durationMinutes, '60')
})

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
