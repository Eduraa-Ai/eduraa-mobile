const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.GENERATE_PAPER_SETTINGS_MODEL_PATH
if (!modelPath) throw new Error('GENERATE_PAPER_SETTINGS_MODEL_PATH is required')

const {
  buildJeeFormPaperRequest,
  parsePaperDuration,
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
