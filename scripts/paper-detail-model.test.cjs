const assert = require('node:assert/strict')
const test = require('node:test')

const {
  hasVisibleAttemptResult,
  paperPrimaryAction,
  selectNewestSubmittedAttempt,
  visibleScore,
  buildPaperQuestionUpdate,
  createPaperQuestionDraft,
  validatePaperQuestionDraft,
  validateQuestionVisualFile,
  buildPaperInstructionContext,
  paperEditableContentFingerprint,
  paperChatStorageKey,
  paperPendingInstructionStorageKey,
  sanitizePendingPaperInstruction,
  sanitizePaperChatMessages,
} = require(process.env.PAPER_DETAIL_MODEL_PATH)

test('AI paper context includes live questions, options, answers, and class metadata', () => {
  const context = buildPaperInstructionContext({
    title: 'Geography Paper',
    standard: 'Std 10',
    division: 'A',
    total_marks: 2,
    questions: [{
      question_number: 1,
      question_text: 'Which river flows west?',
      question_type: 'mcq',
      marks: 2,
      options: [{ id: 'A', text: 'Narmada' }, { id: 'B', text: 'Ganga' }],
      answer_key: 'A',
    }],
  })
  assert.match(context, /Class: Std 10 A/)
  assert.match(context, /Q1 \[mcq\] 2mk: Which river flows west\?/)
  assert.match(context, /\(A\) Narmada/)
  assert.match(context, /Answer: A/)
})

test('paper conversations persist safely per teacher and paper', () => {
  assert.equal(
    paperChatStorageKey('teacher-1', 'paper-2'),
    'paper_chat_teacher-1_paper-2',
  )
  assert.equal(
    paperPendingInstructionStorageKey('teacher-1', 'paper-2'),
    'paper_pending_instruction_teacher-1_paper-2',
  )
  assert.equal(sanitizePendingPaperInstruction('  change Q1  '), 'change Q1')
  assert.equal(sanitizePendingPaperInstruction({ instruction: 'change Q1' }), null)
  assert.deepEqual(
    sanitizePaperChatMessages([
      { role: 'user', text: '  Change Q1  ' },
      { role: 'ai', text: 'Done.' },
      { role: 'system', text: 'hidden prompt' },
      { role: 'user', text: '   ' },
    ]),
    [
      { role: 'user', text: 'Change Q1' },
      { role: 'ai', text: 'Done.' },
    ],
  )
})

test('AI success verification ignores ids and detects editable content changes', () => {
  const original = {
    title: 'Paper', total_marks: 1,
    questions: [{
      question_number: 15,
      question_text: 'True or false?',
      question_type: 'true_false',
      marks: 1,
      options: [{ id: 'A', text: 'True' }, { id: 'B', text: 'False' }],
      answer_key: 'B',
    }],
  }
  assert.equal(
    paperEditableContentFingerprint(original),
    paperEditableContentFingerprint({ ...original, id: 'different-response-id' }),
  )
  assert.notEqual(
    paperEditableContentFingerprint(original),
    paperEditableContentFingerprint({
      ...original,
      questions: [{
        ...original.questions[0],
        options: [{ id: 'A', text: 'True' }, { id: 'B', text: 'True' }],
      }],
    }),
  )
})

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

test('teacher question drafts preserve options and produce the web-equivalent patch payload', () => {
  const question = {
    question_text: 'Which organelle produces ATP?',
    question_type: 'mcq',
    marks: 2,
    answer_key: 'B',
    options: [
      { id: 'A', text: 'Nucleus' },
      { id: 'B', text: 'Mitochondrion' },
    ],
  }
  const draft = createPaperQuestionDraft(question)
  assert.equal(draft.options[1].is_correct, true)
  draft.questionText = 'Which cell organelle produces most ATP?'
  draft.marksText = '2.5'
  assert.equal(validatePaperQuestionDraft('mcq', draft), null)
  assert.deepEqual(buildPaperQuestionUpdate(question, draft), {
    question_text: 'Which cell organelle produces most ATP?',
    answer_key: 'B',
    marks: 2.5,
    options: [
      { id: 'A', text: 'Nucleus', is_correct: false },
      { id: 'B', text: 'Mitochondrion', is_correct: true },
    ],
  })
})

test('question editor blocks incomplete content and unsafe image uploads', () => {
  const question = {
    question_text: 'Match the following',
    question_type: 'match_columns',
    marks: 4,
    answer_key: { A: '1' },
    options: { left: ['A'], right: [] },
  }
  const draft = createPaperQuestionDraft(question)
  assert.equal(validatePaperQuestionDraft('match_columns', draft), 'Add entries to both match columns.')
  assert.equal(validateQuestionVisualFile({ type: 'application/pdf', size: 100 }), 'Choose a PNG, JPG, or WebP image.')
  assert.equal(
    validateQuestionVisualFile({ type: 'image/png', size: 10 * 1024 * 1024 + 1 }),
    'Choose an image that is 10 MB or smaller.',
  )
})
