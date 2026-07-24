const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.CHECKED_PAPER_DETAIL_MODEL_PATH
if (!modelPath) throw new Error('Set CHECKED_PAPER_DETAIL_MODEL_PATH to the compiled checked-paper detail model.')
const model = require(modelPath)

function question(number, score, maxScore, overrides = {}) {
  return {
    question_id: `question-${number}`,
    question_number: number,
    question_type: number === 7 ? 'long_answer' : 'mcq',
    question_text: `Question ${number}`,
    response: 'Student response',
    expected_answer: 'Expected answer',
    score,
    max_score: maxScore,
    feedback: score < maxScore ? 'Repair the setup.' : 'Correct reasoning.',
    recommendation: score < maxScore ? 'State the method first.' : null,
    ...overrides,
  }
}

function paper(overrides = {}) {
  const questions = [
    ...Array.from({ length: 12 }, (_, index) => question(index + 1, 5, 5)),
    ...Array.from({ length: 5 }, (_, index) => question(index + 13, index < 3 ? 2 : 3, 5)),
    ...Array.from({ length: 3 }, (_, index) => question(index + 18, 0, 5)),
  ]
  return {
    id: 'paper-1',
    exam_name: 'Physics Mock',
    subject_name: 'Physics',
    identifier_text: 'Physics Mock',
    status: 'graded',
    total_score: 72,
    max_score: 100,
    grading_results: questions,
    grading_feedback: 'Focus the setup.',
    manual_review_requested: false,
    needs_review: false,
    created_at: '2026-07-17T12:00:00.000Z',
    updated_at: '2026-07-17T12:00:00.000Z',
    ...overrides,
  }
}

test('report derives a real score and question distribution', () => {
  const report = model.buildCheckedPaperReport(paper())
  assert.equal(report.percent, 72)
  assert.equal(report.correct, 12)
  assert.equal(report.partial, 5)
  assert.equal(report.missed, 3)
  assert.equal(report.headline, 'You understand the chapter.\nYour setup needs precision.')
})

test('report never fabricates a score when summary metadata is missing', () => {
  const report = model.buildCheckedPaperReport(paper({ total_score: null, max_score: null, grading_results: null }))
  assert.equal(report.percent, null)
  assert.equal(report.questions.length, 0)
  assert.equal(report.headline, 'Your diagnosis will appear when checking finishes.')
})

test('question evidence resolves by stable id before index', () => {
  const fixture = paper()
  const evidence = model.findEvidenceQuestion(fixture, 'question-7', 0)
  assert.equal(evidence.index, 6)
  assert.equal(evidence.item.question_number, 7)
})

test('question evidence clamps stale indexes and handles an empty result', () => {
  assert.equal(model.findEvidenceQuestion(paper(), undefined, 999).item.question_number, 20)
  assert.equal(model.findEvidenceQuestion(paper({ grading_results: null }), undefined, 0), null)
})

test('question status is expressed with text and not color alone', () => {
  assert.equal(model.questionStatus(question(1, 5, 5)), 'correct')
  assert.equal(model.questionStatus(question(2, 2, 5)), 'partial')
  assert.equal(model.questionStatus(question(3, 0, 5)), 'missed')
  assert.equal(model.questionStatus(question(4, null, 5)), 'pending')
})

test('math text is readable without leaking latex wrappers', () => {
  assert.equal(model.readableMathText('$I = \\frac{m}{r}$'), 'I = (m)/(r)')
})
