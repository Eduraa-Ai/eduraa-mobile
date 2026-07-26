const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.GENERATE_PAPER_SETTINGS_MODEL_PATH
if (!modelPath) throw new Error('GENERATE_PAPER_SETTINGS_MODEL_PATH is required')

const { parsePaperDuration } = require(modelPath)

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
