const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.GENERATE_PAPER_SETTINGS_MODEL_PATH
if (!modelPath) throw new Error('GENERATE_PAPER_SETTINGS_MODEL_PATH is required')

const {
  buildJeeFormPaperRequest,
  describePaperGenerationJob,
  parsePaperDuration,
  resolvePaperScope,
} = require(modelPath)

test('treats blank duration as no timer', () => {
  assert.deepEqual(parsePaperDuration('  '), {
    minutes: null,
    error: null,
  })
})

test('parses positive whole minutes', () => {
  assert.deepEqual(parsePaperDuration('75'), {
    minutes: 75,
    error: null,
  })
})

test('rejects zero, decimals, negatives, and text', () => {
  for (const value of ['0', '1.5', '-5', 'abc']) {
    assert.deepEqual(parsePaperDuration(value), {
      minutes: null,
      error: 'Enter a positive whole number of minutes.',
    })
  }
})

test('preserves optional duration in AI paper requests', () => {
  const input = {
    examType: 'jee_mains',
    subject: 'chemistry',
    chapterKeys: ['12th::chemistry::solid-state'],
    count: 5,
    marks: 4,
    subtopic: 'Crystal lattices',
    title: 'Chemistry practice',
  }

  assert.deepEqual(buildJeeFormPaperRequest(input, null), {
    exam_type: 'jee_mains',
    subject: 'chemistry',
    chapter_keys: ['12th::chemistry::solid-state'],
    count: 5,
    question_marks: 4,
    subtopic: 'Crystal lattices',
    title: 'Chemistry practice',
    duration_minutes: null,
  })
  assert.equal(buildJeeFormPaperRequest(input, 45).duration_minutes, 45)
})

const maths = { id: 'sub-maths', name: 'Mathematics' }
const science = { id: 'sub-science', name: 'Science' }
const english = { id: 'sub-english', name: 'English' }

// A teacher assigned to Std 9-A Maths/Science and Std 10-B English.
const teacherOptions = {
  standards: ['Std 10', 'Std 9'],
  divisions: ['A', 'B'],
  subjects: [english, maths, science],
  sections: [
    { standard: 'Std 9', division: 'A', subjects: [science, maths] },
    { standard: 'Std 10', division: 'B', subjects: [english] },
  ],
}

test('keeps flat lists when the role has no section assignments', () => {
  const scope = resolvePaperScope(
    { standards: ['Std 5'], divisions: ['C'], subjects: [maths], sections: [] },
    { standard: 'Std 5', division: 'C', subjectId: 'sub-maths' },
  )

  assert.deepEqual(scope.standards, ['Std 5'])
  assert.deepEqual(scope.divisions, ['C'])
  assert.deepEqual(scope.subjects, [maths])
  assert.deepEqual(scope.selection, {
    standard: 'Std 5',
    division: 'C',
    subjectId: 'sub-maths',
  })
})

test('defaults flat teacher options to a valid standard and division', () => {
  const scope = resolvePaperScope(
    { standards: ['Std 10', 'Std 5'], divisions: ['B', 'A'], subjects: [maths], sections: [] },
    { standard: '', division: '', subjectId: '' },
  )

  assert.equal(scope.selection.standard, 'Std 5')
  assert.equal(scope.selection.division, 'A')
})

test('narrows divisions and subjects to the selected standard', () => {
  const scope = resolvePaperScope(teacherOptions, {
    standard: 'Std 9',
    division: 'A',
    subjectId: 'sub-maths',
  })

  assert.deepEqual(scope.divisions, ['A'])
  assert.deepEqual(
    scope.subjects.map((subject) => subject.name),
    ['Mathematics', 'Science'],
  )
  assert.equal(scope.selection.subjectId, 'sub-maths')
})

test('drops a subject that the newly selected standard does not offer', () => {
  const scope = resolvePaperScope(teacherOptions, {
    standard: 'Std 10',
    division: 'B',
    subjectId: 'sub-maths',
  })

  assert.deepEqual(
    scope.subjects.map((subject) => subject.name),
    ['English'],
  )
  assert.equal(scope.selection.subjectId, '')
})

test('repairs a division that belongs to a different standard', () => {
  const scope = resolvePaperScope(teacherOptions, {
    standard: 'Std 9',
    division: 'B',
    subjectId: '',
  })

  assert.equal(scope.selection.division, 'A')
})

test('falls back to the first assignment when nothing is selected yet', () => {
  const scope = resolvePaperScope(teacherOptions, {
    standard: '',
    division: '',
    subjectId: '',
  })

  assert.deepEqual(scope.selection, {
    standard: 'Std 9',
    division: 'A',
    subjectId: '',
  })
})

test('orders standards numerically rather than lexicographically', () => {
  const scope = resolvePaperScope(
    {
      sections: [
        { standard: 'Std 10', division: 'A', subjects: [maths] },
        { standard: 'Std 2', division: 'A', subjects: [maths] },
        { standard: 'Std 9', division: 'A', subjects: [maths] },
      ],
    },
    { standard: '', division: '', subjectId: '' },
  )

  assert.deepEqual(scope.standards, ['Std 2', 'Std 9', 'Std 10'])
})

test('matches a stored standard that omits the Std prefix', () => {
  const scope = resolvePaperScope(teacherOptions, {
    standard: '9',
    division: 'A',
    subjectId: '',
  })

  assert.equal(scope.selection.standard, 'Std 9')
})

test('leaves a single competitive section intact', () => {
  const physics = { id: 'sub-physics', name: 'Physics' }
  const scope = resolvePaperScope(
    {
      standards: ['JEE Main'],
      divisions: ['Individual'],
      subjects: [physics],
      sections: [
        { standard: 'JEE Main', division: 'Individual', subjects: [physics] },
      ],
    },
    { standard: 'JEE Main', division: 'Individual', subjectId: 'sub-physics' },
  )

  assert.deepEqual(scope.standards, ['JEE Main'])
  assert.deepEqual(scope.divisions, ['Individual'])
  assert.deepEqual(scope.subjects, [physics])
  assert.equal(scope.selection.subjectId, 'sub-physics')
})

test('reports a running job as active with a percentage', () => {
  const view = describePaperGenerationJob({
    status: 'generating',
    progress: 42,
    message: 'Writing question 5',
    completed_units: 5,
    total_units: 12,
    paper_id: null,
  })

  assert.equal(view.headline, 'Writing questions')
  assert.equal(view.detail, 'Writing question 5')
  assert.equal(view.percent, 42)
  assert.equal(view.isActive, true)
  assert.equal(view.failed, false)
})

test('derives progress from unit counts when the worker sends no percentage', () => {
  const view = describePaperGenerationJob({
    status: 'generating',
    completed_units: 3,
    total_units: 12,
  })

  assert.equal(view.percent, 25)
  assert.equal(view.detail, '3 of 12 questions')
})

test('never reports a partial percentage for a finished paper', () => {
  const view = describePaperGenerationJob({
    status: 'completed',
    progress: 90,
    completed_units: 9,
    total_units: 12,
    paper_id: 'paper-1',
  })

  assert.equal(view.percent, 100)
  assert.equal(view.isActive, false)
  assert.equal(view.paperId, 'paper-1')
})

test('surfaces the worker error rather than a generic message', () => {
  const view = describePaperGenerationJob({
    status: 'failed',
    message: 'Writing question 5',
    error_message: 'Selected standard is not assigned for this subject.',
  })

  assert.equal(view.failed, true)
  assert.equal(view.isActive, false)
  assert.equal(view.detail, 'Selected standard is not assigned for this subject.')
})

test('keeps an unrecognized status renderable', () => {
  const view = describePaperGenerationJob({ status: 'reticulating' })

  assert.equal(view.headline, 'Working on your paper')
  assert.equal(view.percent, null)
  assert.equal(view.isActive, false)
})
