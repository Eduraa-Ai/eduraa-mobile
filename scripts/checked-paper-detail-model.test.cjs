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
    ...Array.from({ length: 3 }, (_, index) => question(index + 18, 0, 5, { response: '' })),
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
  assert.equal(report.wrong, 5)
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
  assert.equal(model.questionStatus(question(2, 2, 5)), 'wrong')
  assert.equal(model.questionStatus(question(3, 0, 5)), 'wrong')
  assert.equal(model.questionStatus(question(4, 0, 5, { response: '' })), 'missed')
  assert.equal(model.questionStatus(question(4, null, 5)), 'pending')
})

test('checking state and estimated progress remain honest until a real score arrives', () => {
  const pending = paper({ status: 'graded', total_score: null, max_score: null })
  assert.equal(model.isCheckedPaperChecking(pending), true)
  assert.equal(model.isCheckedPaperChecking(paper()), false)
  assert.equal(model.isCheckedPaperChecking(paper({
    status: 'pending_manual_review',
    total_score: null,
    max_score: null,
  })), false)

  const started = Date.parse('2026-07-17T12:00:00.000Z')
  const halfway = model.buildCheckingEstimate('2026-07-17T12:00:00.000Z', started + 60_000)
  assert.equal(halfway.percent > 8 && halfway.percent < 94, true)
  assert.equal(halfway.timeLabel, '≈ 1m left')
  assert.equal(halfway.isOverdue, false)
  const overdue = model.buildCheckingEstimate('2026-07-17T12:00:00.000Z', started + 180_000)
  assert.equal(overdue.percent, 94)
  assert.equal(overdue.timeLabel, 'Finishing up')
  assert.equal(overdue.isOverdue, true)
})

test('legacy partial and incorrect values normalize to the Wrong category', () => {
  assert.equal(model.normalizeCheckedPaperStatus('partial'), 'wrong')
  assert.equal(model.normalizeCheckedPaperStatus('partially_correct'), 'wrong')
  assert.equal(model.normalizeCheckedPaperStatus('incorrect'), 'wrong')
  assert.equal(model.questionStatus(question(1, 0, 2, { status: 'partial' })), 'wrong')
})

test('MCQ options match selected and expected keys without changing stored answers', () => {
  const item = question(1, 0, 1, {
    response: 'B',
    expected_answer: 'C. Gamma',
    options: [
      { id: 'A', text: 'Alpha' },
      { id: 'B', text: '$\\beta$' },
      { id: 'C', text: 'Gamma' },
    ],
  })
  const review = model.buildQuestionReview(item)
  assert.equal(review.options.length, 3)
  assert.equal(review.options[1].selected, true)
  assert.equal(review.options[1].expected, false)
  assert.equal(review.options[2].selected, false)
  assert.equal(review.options[2].expected, true)
  assert.equal(item.response, 'B')
})

test('unanswered MCQs have no selected option and preserve the expected option', () => {
  const review = model.buildQuestionReview(question(1, 0, 1, {
    response: '',
    expected_answer: 'A',
    options: [{ id: 'A', text: 'One' }, { id: 'B', text: 'Two' }],
  }))
  assert.equal(review.unanswered, true)
  assert.equal(review.options.some((option) => option.selected), false)
  assert.equal(review.options[0].expected, true)
})

test('legacy option containers still produce a complete question context', () => {
  const nested = model.buildQuestionReview(question(1, 0, 1, {
    question_text: null,
    question_data: {
      prompt: 'Choose the value of x.',
      choices: {
        A: '1',
        B: '2',
        C: '3',
        D: '4',
      },
    },
    response: 'B',
    expected_answer: 'C',
  }))
  assert.equal(nested.questionText, 'Choose the value of x.')
  assert.deepEqual(nested.options.map((option) => option.text), ['1', '2', '3', '4'])
  assert.equal(nested.options[1].selected, true)
  assert.equal(nested.options[2].expected, true)

  const encoded = model.buildQuestionReview(question(1, 0, 1, {
    options: JSON.stringify([
      { id: 'A', text: 'Alpha' },
      { id: 'B', text: 'Beta' },
    ]),
  }))
  assert.equal(encoded.options.length, 2)
})

test('question figures normalize current and legacy checked-paper payloads', () => {
  const current = model.buildQuestionReview(question(1, 0, 1, {
    visual_payload: {
      kind: 'diagram',
      asset_url: '/api/v1/documents/visuals/oscillation.png',
      alt_text: 'Liquid oscillating in a U-shaped tube',
    },
  }))
  assert.deepEqual(current.questionFigure, {
    imageUrl: '/api/v1/documents/visuals/oscillation.png',
    altText: 'Liquid oscillating in a U-shaped tube',
  })

  const legacy = model.buildQuestionReview(question(2, 0, 1, {
    visual_payload: null,
    question_data: {
      visual_payload: JSON.stringify({
        asset_urls: ['/api/v1/ai/jee/diagrams/legacy.png'],
      }),
    },
  }))
  assert.deepEqual(legacy.questionFigure, {
    imageUrl: '/api/v1/ai/jee/diagrams/legacy.png',
    altText: 'Diagram associated with this question',
  })

  assert.equal(model.buildQuestionReview(question(3, 0, 1)).questionFigure, null)
})

test('missing question context and absent explanation remain explicit', () => {
  const review = model.buildQuestionReview(question(1, 0, 1, {
    question_text: null,
    response: '',
    expected_answer: null,
    feedback: null,
    recommendation: null,
  }))
  assert.equal(review.contextAvailable, false)
  assert.equal(review.questionText, '')
  assert.equal(review.detailedExplanation.length, 0)
})

test('detailed explanation omits empty sections and keeps supplied learning support', () => {
  const sections = model.buildDetailedExplanation(question(1, 0, 1, {
    feedback: 'Selected: B; Expected: C.',
    solution_ideas: ['Write the formula.', 'Substitute carefully.'],
    hints: [],
    easy_example: null,
    recommendation: 'Practice substitutions.',
  }))
  assert.deepEqual(sections.map((section) => section.title), ['Why Marks Cut', 'Potential Solutions', 'Recommendation'])
})

test('math text is readable without leaking latex wrappers', () => {
  assert.equal(model.readableMathText('$I = \\frac{m}{r}$'), 'I = (m)⁄(r)')
  assert.equal(model.readableMathText('$F = 4m\\pi^2r/T^2$'), 'F = 4mπ²r/T²')
  assert.equal(model.readableMathText('$^{39}C_{3r-1} - {}^{39}C_{r^2}$'), '³⁹C₃ᵣ₋₁ - ³⁹Cᵣ²')
})
