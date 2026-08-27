const test = require('node:test')
const assert = require('node:assert/strict')

const model = require(process.env.CHECKED_PAPER_WORKSPACE_MODEL_PATH)

test('uses the website highlight contract and preserves percent coordinates', () => {
  const highlight = model.questionReviewHighlight({
    question_id: 'q1',
    highlight_region: {
      primary_region: {
        page: 2,
        bbox_percent: { left: 8, top: 21, width: 80, height: 14 },
        confidence: 0.92,
        verification_passed: true,
      },
    },
  })
  assert.deepEqual(highlight, {
    page: 2,
    bboxPercent: { left: 8, top: 21, width: 80, height: 14 },
    confidence: 0.92,
    uncertain: false,
  })
})

test('accepts normalized manifest citations and flags uncertain evidence', () => {
  const highlight = model.questionReviewHighlight({
    question_id: 'q2',
    evidence_citations: [{
      page_number: 1,
      bbox: { left: 0.1, top: 0.2, width: 0.7, height: 0.15 },
      confidence: 0.4,
    }],
  })
  assert.equal(highlight.page, 1)
  assert.deepEqual(highlight.bboxPercent, { left: 10, top: 20, width: 70, height: 15 })
  assert.equal(highlight.uncertain, true)
})

test('falls back to the website legacy answer image box', () => {
  const highlight = model.questionReviewHighlight({
    question_id: 'q3',
    answer_image_bbox: { page: 3, left_percent: 4, top_percent: 11, width_percent: 88, height_percent: 20 },
  })
  assert.equal(highlight.page, 3)
  assert.equal(highlight.bboxPercent.width, 88)
})

test('selects linked question safely and clamps teacher marks', () => {
  const questions = [{ question_id: 'a' }, { question_id: 'b', result_id: 'result-b' }]
  assert.equal(model.initialQuestionIndex(questions, 'result-b'), 1)
  assert.equal(model.initialQuestionIndex(questions, 'missing', 99), 0)
  assert.equal(model.clampReviewScore(7, 5), 5)
  assert.equal(model.clampReviewScore(-1, 5), 0)
})

test('opens the first unanswered teacher check when no question was linked', () => {
  const questions = [
    { question_id: 'a', manual_review_requested: false },
    { question_id: 'b', manual_review_requested: true, manual_review_completed: false },
    { question_id: 'c', manual_review_requested: true, manual_review_completed: true },
  ]
  assert.equal(model.initialQuestionIndex(questions), 1)
})

test('formats total and stage timings consistently with the website', () => {
  assert.equal(model.formatCheckedPaperDuration(null), '—')
  assert.equal(model.formatCheckedPaperDuration(-1), '—')
  assert.equal(model.formatCheckedPaperDuration(8.25), '8.3s')
  assert.equal(model.formatCheckedPaperDuration(43.05), '43s')
  assert.equal(model.formatCheckedPaperDuration(181), '3m 01s')
})

test('polls only while optional learning support is being prepared', () => {
  assert.equal(model.isLearningSupportInProgress('pending'), true)
  assert.equal(model.isLearningSupportInProgress('running'), true)
  assert.equal(model.isLearningSupportInProgress('ready'), false)
  assert.equal(model.isLearningSupportInProgress('failed'), false)
  assert.equal(model.isLearningSupportInProgress(null), false)
})
