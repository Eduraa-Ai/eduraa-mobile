const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.CHECKED_PAPERS_MODEL_PATH
if (!modelPath) throw new Error('Set CHECKED_PAPERS_MODEL_PATH to the compiled checked-papers model.')
const model = require(modelPath)

function paper(overrides = {}) {
  return {
    id: 'paper-1',
    student_id: 'student-1',
    teacher_id: 'teacher-1',
    exam_id: null,
    scanned_pdf_url: 'https://fixture.invalid/paper.pdf',
    ocr_text: 'Synthetic OCR',
    identifier_text: 'Physics Mock',
    status: 'graded',
    total_score: 72,
    max_score: 100,
    grading_results: [],
    needs_review: false,
    is_teacher_override: false,
    manual_review_requested: false,
    exam_name: 'Physics Mock',
    subject_name: 'Physics',
    created_at: '2026-07-17T12:00:00.000Z',
    updated_at: '2026-07-17T12:00:00.000Z',
    ...overrides,
  }
}

test('formats paper count with correct singular and plural labels', () => {
  assert.equal(model.formatPaperCount(0), '0 PAPERS')
  assert.equal(model.formatPaperCount(1), '1 PAPER')
  assert.equal(model.formatPaperCount(3), '3 PAPERS')
})

test('search matches real local fields and rejects an empty result', () => {
  const fixture = paper({ exam_name: 'JEE Mains Physics Mock', grading_feedback: 'Repair rotational setup' })
  assert.equal(model.matchesSearch(fixture, 'physics'), true)
  assert.equal(model.matchesSearch(fixture, 'rotational'), true)
  assert.equal(model.matchesSearch(fixture, 'organic'), false)
})

test('presentation tabs use the existing 65 percent detail-screen band', () => {
  const attention = paper({ id: 'attention', total_score: 64 })
  const strong = paper({ id: 'strong', total_score: 65 })
  assert.equal(model.matchesTab(attention, 'needs_attention'), true)
  assert.equal(model.matchesTab(attention, 'strong'), false)
  assert.equal(model.matchesTab(strong, 'strong'), true)
})

test('single paper never fabricates a trend', () => {
  const assessment = model.buildAssessmentModel([paper()])
  assert.equal(assessment.delta, null)
  assert.equal(assessment.insight, 'Complete another paper to unlock a reliable trend.')
})

test('two ordered papers produce a mathematically valid delta', () => {
  const assessment = model.buildAssessmentModel([
    paper({ id: 'latest', total_score: 72 }),
    paper({ id: 'previous', total_score: 64, updated_at: '2026-07-14T12:00:00.000Z' }),
  ])
  assert.equal(assessment.delta, 8)
  assert.equal(assessment.headline, 'Your latest result is moving upward.')
})

test('missing question metadata remains unavailable instead of becoming zero', () => {
  assert.equal(model.getQuestionCount(paper({ grading_results: null })), null)
  assert.equal(model.scoreLabel(paper()), '72/100')
})

test('pending scores keep the checked-paper inbox polling until a real result arrives', () => {
  assert.equal(model.isPaperChecking(paper({ total_score: null, max_score: null })), true)
  assert.equal(model.isPaperChecking(paper()), false)
  assert.equal(model.isPaperChecking(paper({
    status: 'pending_manual_review',
    total_score: null,
    max_score: null,
  })), false)
})

test('paper opening rejects missing ids and an already claimed navigation', () => {
  assert.equal(model.canOpenPaper('', null), false)
  assert.equal(model.canOpenPaper(undefined, null), false)
  assert.equal(model.canOpenPaper('paper-1', 'paper-opening'), false)
  assert.equal(model.canOpenPaper('paper-1', null), true)
})

test('score accessibility label includes non-color score, status, and missing metadata', () => {
  const label = model.paperAccessibilityLabel(
    paper({ grading_results: null }),
    'Jul 17, 2026',
  )
  assert.match(label, /72\/100/)
  assert.match(label, /Strong/)
  assert.match(label, /Question count unavailable/)
  assert.match(label, /Opens the checked paper report/)
})
