const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.PAPER_ATTEMPT_MODEL_PATH
if (!modelPath) throw new Error('Set PAPER_ATTEMPT_MODEL_PATH to the compiled paper attempt model.')
const {
  buildPaperAnswerEntries,
  clampCheckingProgress,
  createPaperAttemptState,
  legacyPaperAttemptDraftKey,
  paperAttemptDraftFromState,
  paperAttemptDraftKey,
  paperAttemptIdentityKey,
  parseLegacyPaperAttemptDraft,
  parsePaperAttemptDraft,
  reducePaperAttemptState,
  selectNewestInProgressAttempt,
  toggleSelectableAnswer,
} = require(modelPath)

const identity = {
  userId: 'student-1',
  paperId: 'paper-1',
  examId: 'exam-1',
  attemptId: 'attempt-1',
  mode: 'standard',
}

function reduce(state, action) {
  return reducePaperAttemptState(state, {
    identityKey: state.identityKey,
    ...action,
  })
}

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

test('tapping the selected answer again clears it without mutating other answers', () => {
  const answers = { 'question-1': 'B', 'question-2': 'True' }
  const cleared = toggleSelectableAnswer(answers, 'question-1', 'B')

  assert.deepEqual(cleared, { 'question-2': 'True' })
  assert.deepEqual(answers, { 'question-1': 'B', 'question-2': 'True' })
})

test('tapping a different answer replaces the current selection', () => {
  assert.deepEqual(
    toggleSelectableAnswer({ 'question-1': 'A' }, 'question-1', 'C'),
    { 'question-1': 'C' },
  )
})

test('selecting later questions preserves every earlier answer', () => {
  let state = createPaperAttemptState(identity)
  state = reduce(state, { type: 'select', questionId: 'question-1', value: 'A' })
  state = reduce(state, { type: 'select', questionId: 'question-2', value: 'B' })
  state = reduce(state, { type: 'select', questionId: 'question-3', value: 'C' })

  assert.deepEqual(state.answers, {
    'question-1': 'A',
    'question-2': 'B',
    'question-3': 'C',
  })
})

test('rapid selections settle on the final option without losing other questions', () => {
  let state = createPaperAttemptState(identity, { 'question-1': 'A' })
  state = reduce(state, { type: 'select', questionId: 'question-2', value: 'A' })
  state = reduce(state, { type: 'select', questionId: 'question-2', value: 'B' })
  state = reduce(state, { type: 'select', questionId: 'question-2', value: 'C' })

  assert.deepEqual(state.answers, {
    'question-1': 'A',
    'question-2': 'C',
  })
})

test('text changes and explicit clears affect only their own question', () => {
  let state = createPaperAttemptState(identity, {
    'question-1': 'A',
    'question-2': 'Existing answer',
  })
  state = reduce(state, { type: 'text', questionId: 'question-2', value: 'Updated answer' })
  state = reduce(state, { type: 'text', questionId: 'question-2', value: '' })

  assert.deepEqual(state.answers, { 'question-1': 'A' })
  assert.equal(state.clearedAnswers['question-2'], true)
})

test('late hydration cannot overwrite answers touched after hydration started', () => {
  let state = createPaperAttemptState(identity, { 'question-1': 'server-A' })
  state = reduce(state, { type: 'select', questionId: 'question-1', value: 'local-B' })
  state = reduce(state, { type: 'select', questionId: 'question-3', value: 'local-C' })
  const staleDraft = {
    version: 2,
    identity,
    revision: 1,
    updatedAt: 1,
    answers: { 'question-1': 'stale-A', 'question-2': 'draft-B' },
    clearedQuestionIds: ['question-3'],
    flaggedQuestionIds: [],
  }
  state = reduce(state, { type: 'hydrateDraft', draft: staleDraft })

  assert.deepEqual(state.answers, {
    'question-1': 'local-B',
    'question-2': 'draft-B',
    'question-3': 'local-C',
  })
})

test('explicit clears survive serialization and restart hydration', () => {
  let state = createPaperAttemptState(identity, { 'question-1': 'server-A' })
  state = reduce(state, { type: 'select', questionId: 'question-1', value: 'server-A' })
  const draft = paperAttemptDraftFromState(state, 10)

  let restarted = createPaperAttemptState(identity, { 'question-1': 'server-A' })
  restarted = reduce(restarted, { type: 'hydrateDraft', draft })

  assert.deepEqual(restarted.answers, {})
  assert.equal(restarted.clearedAnswers['question-1'], true)
})

test('attempt identity scopes query state and storage keys', () => {
  const otherAttempt = { ...identity, attemptId: 'attempt-2' }
  const otherUser = { ...identity, userId: 'student-2' }
  const quiz = { ...identity, mode: 'interactive_quiz' }

  assert.notEqual(paperAttemptIdentityKey(identity), paperAttemptIdentityKey(otherAttempt))
  assert.notEqual(paperAttemptDraftKey(identity), paperAttemptDraftKey(otherUser))
  assert.notEqual(paperAttemptDraftKey(identity), paperAttemptDraftKey(quiz))
  assert.equal(
    legacyPaperAttemptDraftKey(identity),
    'eduraa-attempt-draft:student-1:paper-1:exam-1',
  )
})

test('draft parsing rejects mismatched attempts and malformed data', () => {
  const draft = paperAttemptDraftFromState(createPaperAttemptState(identity), 10)
  assert.deepEqual(parsePaperAttemptDraft(JSON.stringify(draft), identity), draft)
  assert.equal(
    parsePaperAttemptDraft(JSON.stringify(draft), { ...identity, attemptId: 'attempt-2' }),
    null,
  )
  assert.equal(parsePaperAttemptDraft('{bad json', identity), null)
})

test('matching standard legacy drafts migrate without crossing attempts or quiz modes', () => {
  const raw = JSON.stringify({
    attemptId: identity.attemptId,
    answers: { 'question-1': 'A' },
    flagged: { 'question-2': true, 'question-3': false },
  })
  assert.deepEqual(parseLegacyPaperAttemptDraft(raw, identity), {
    version: 2,
    identity,
    revision: 0,
    updatedAt: 0,
    answers: { 'question-1': 'A' },
    clearedQuestionIds: [],
    flaggedQuestionIds: ['question-2'],
  })
  assert.equal(parseLegacyPaperAttemptDraft(raw, { ...identity, attemptId: 'attempt-2' }), null)
  assert.equal(parseLegacyPaperAttemptDraft(raw, { ...identity, mode: 'interactive_quiz' }), null)
})

test('hydration from another identity is ignored', () => {
  const state = createPaperAttemptState(identity, { 'question-1': 'A' })
  const foreignDraft = paperAttemptDraftFromState(
    createPaperAttemptState({ ...identity, userId: 'student-2' }, { 'question-1': 'B' }),
  )
  const hydrated = reduce(state, { type: 'hydrateDraft', draft: foreignDraft })

  assert.equal(hydrated, state)
})

test('submission entries preserve order, blanks, and reject unsafe question ids', () => {
  assert.deepEqual(
    buildPaperAnswerEntries(['question-1', 'question-2'], { 'question-1': 'A' }),
    [
      { question_id: 'question-1', response: 'A' },
      { question_id: 'question-2', response: '' },
    ],
  )
  assert.throws(
    () => buildPaperAnswerEntries(['question-1', 'question-1'], {}),
    /missing or duplicate question IDs/,
  )
  assert.throws(() => buildPaperAnswerEntries([''], {}), /missing or duplicate question IDs/)
})

test('checking progress accepts finite percentages and clamps API drift', () => {
  assert.equal(clampCheckingProgress(42.4), 42)
  assert.equal(clampCheckingProgress(120), 100)
  assert.equal(clampCheckingProgress(-5), 0)
  assert.equal(clampCheckingProgress('42'), null)
  assert.equal(clampCheckingProgress(Number.NaN), null)
})
