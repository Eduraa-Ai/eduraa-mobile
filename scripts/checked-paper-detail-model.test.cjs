const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
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
  const incompletePaper = paper({ status: 'auto_assessed', total_score: null, max_score: null, grading_results: null })
  const report = model.buildCheckedPaperReport(incompletePaper)
  assert.equal(report.percent, null)
  assert.equal(report.questions.length, 0)
  assert.equal(report.headline, 'Your diagnosis will appear when checking finishes.')
  assert.equal(model.isCheckedPaperChecking(incompletePaper), true)
})

test('terminal score metadata without question results keeps polling', () => {
  assert.equal(model.isCheckedPaperChecking(paper({
    status: 'auto_assessed',
    total_score: 7,
    max_score: 10,
    grading_results: [],
  })), true)
})

test('checking stopwatch derives elapsed time from the server start timestamp', () => {
  const fixture = paper({
    status: 'checking',
    total_score: null,
    max_score: null,
    grading_results: null,
    processing_timing: {
      started_at: '2026-08-27T12:00:00.000Z',
      completed_at: null,
      total_seconds: null,
      stages: [],
    },
  })

  assert.equal(model.checkedPaperElapsedSeconds(fixture, Date.parse('2026-08-27T12:01:05.900Z')), 65)
  assert.equal(model.formatCheckedPaperStopwatch(65), '01:05')
  assert.equal(model.formatCheckedPaperStopwatch(3661), '01:01:01')
})

test('checking stopwatch freezes at the authoritative completed duration', () => {
  const fixture = paper({
    processing_timing: {
      started_at: '2026-08-27T12:00:00.000Z',
      completed_at: '2026-08-27T12:02:00.000Z',
      total_seconds: 119.8,
      stages: [],
    },
  })

  assert.equal(model.checkedPaperElapsedSeconds(fixture, Date.parse('2026-08-27T13:00:00.000Z')), 120)
  assert.equal(model.checkedPaperElapsedSeconds(paper({ processing_timing: null })), null)
})

test('stage timeline preserves server order and exposes per-stage timing states', () => {
  const fixture = paper({
    status: 'grading',
    total_score: null,
    max_score: null,
    grading_results: null,
    processing_timing: {
      started_at: '2026-08-27T12:00:00.000Z',
      completed_at: null,
      total_seconds: null,
      stages: [
        { key: 'integrity', label: 'Integrity check', status: 'completed', queued_at: '2026-08-27T12:00:00.000Z', started_at: '2026-08-27T12:00:01.000Z', completed_at: '2026-08-27T12:00:05.000Z', total_seconds: 5 },
        { key: 'evidence', label: 'Read answers', status: 'completed', queued_at: '2026-08-27T12:00:05.000Z', started_at: '2026-08-27T12:00:06.000Z', completed_at: '2026-08-27T12:00:20.000Z', total_seconds: 15 },
        { key: 'grading', label: 'Grade answers', status: 'running', queued_at: '2026-08-27T12:00:20.000Z', started_at: '2026-08-27T12:00:22.000Z', completed_at: null, total_seconds: null },
        { key: 'release', label: 'Prepare result', status: 'pending', queued_at: '2026-08-27T12:00:20.000Z', started_at: null, completed_at: null, total_seconds: null },
      ],
    },
  })

  const timeline = model.buildCheckedPaperStageTimeline(fixture, Date.parse('2026-08-27T12:00:30.000Z'))
  assert.deepEqual(timeline.map(({ key, state, elapsedSeconds }) => ({ key, state, elapsedSeconds })), [
    { key: 'integrity', state: 'complete', elapsedSeconds: 5 },
    { key: 'evidence', state: 'complete', elapsedSeconds: 15 },
    { key: 'grading', state: 'active', elapsedSeconds: 10 },
    { key: 'release', state: 'queued', elapsedSeconds: null },
  ])
})

test('stage timeline keeps blocked stages explicit and does not fabricate missing timing data', () => {
  const fixture = paper({
    processing_timing: {
      stages: [
        { key: 'mapping', label: 'Match questions', status: 'mapping_needs_review', queued_at: 'invalid', started_at: null, completed_at: null, total_seconds: null },
      ],
    },
  })

  assert.deepEqual(model.buildCheckedPaperStageTimeline(fixture), [{
    key: 'mapping',
    label: 'Match questions',
    state: 'blocked',
    elapsedSeconds: null,
  }])
  assert.deepEqual(model.buildCheckedPaperStageTimeline(paper({ processing_timing: null })), [])
})

test('blocked paper without a score explains the saved recovery action', () => {
  const report = model.buildCheckedPaperReport(paper({
    status: 'integrity_needs_review',
    needs_review: true,
    total_score: null,
    max_score: null,
    grading_results: [],
    processing_blockers: [{
      message: 'The system could not confirm whether the script is complete.',
      resolved_by_teacher: false,
    }],
  }))

  assert.equal(report.percent, null)
  assert.equal(report.headline, 'Checking paused.\nReview one issue to continue.')
  assert.equal(report.diagnosisTitle, 'Your paper needs a quick check.')
  assert.equal(report.diagnosisBody, 'The system could not confirm whether the script is complete.')
})

test('partial review keeps known marks visible and labels them provisional', () => {
  const report = model.buildCheckedPaperReport(paper({
    status: 'pending_question_review',
    needs_review: true,
    total_score: 67,
  }))
  assert.equal(report.totalScore, 67)
  assert.equal(report.provisional, true)
  assert.equal(model.isCheckedPaperChecking(paper({ status: 'pending_question_review', needs_review: true, total_score: 67 })), false)
  assert.equal(model.isCheckedPaperCheckFailed(paper({ status: 'mapping_needs_review', needs_review: true })), false)
})

test('question evidence resolves by stable id before index', () => {
  const fixture = paper()
  const evidence = model.findEvidenceQuestion(fixture, 'question-7', 0)
  assert.equal(evidence.index, 6)
  assert.equal(evidence.item.question_number, 7)
})

test('unread teacher responses are separate from resolved review history', () => {
  const fixture = paper()
  fixture.grading_results[0].question_review_thread = [
    { author_role: 'student', event_type: 'requested' },
    { author_role: 'teacher', event_type: 'resolved', student_notification_pending: false },
  ]
  fixture.grading_results[1].question_review_thread = [
    { author_role: 'student', event_type: 'requested' },
    { author_role: 'teacher', event_type: 'teacher_reply', student_notification_pending: true },
  ]

  assert.equal(model.hasUnreadTeacherReviewResponse(fixture.grading_results[0]), false)
  assert.equal(model.hasUnreadTeacherReviewResponse(fixture.grading_results[1]), true)
  assert.deepEqual(
    model.unreadQuestionReviewResponseItems(fixture).map(({ index }) => index),
    [1],
  )
})

test('legacy review threads notify only for the newest teacher response after the latest student message', () => {
  const item = question(4, 1, 1, {
    result_id: 'result-4',
    question_review_thread: [
      { author_role: 'student', message: 'First request', created_at: '2026-08-20T10:00:00Z' },
      { author_role: 'teacher', message: 'First response', created_at: '2026-08-20T10:01:00Z' },
      { author_role: 'student', message: 'Please check again', created_at: '2026-08-20T10:02:00Z' },
      { author_role: 'teacher', event_type: 'resolved', message: 'Updated', created_at: '2026-08-20T10:03:00Z' },
    ],
  })
  const key = model.reviewResponseNotificationKey('paper-1', item, 3)

  assert.equal(key, 'paper-1:result-4:2026-08-20T10:03:00Z')
  assert.equal(model.hasUnreadTeacherReviewResponse(item, 3, 'paper-1'), true)
  assert.equal(model.hasUnreadTeacherReviewResponse(item, 3, 'paper-1', new Set([key])), false)
})

test('question evidence survives refreshed data when a unique stable id moves', () => {
  const fixture = paper()
  const moved = fixture.grading_results.splice(6, 1)[0]
  fixture.grading_results.splice(2, 0, moved)
  const evidence = model.findEvidenceQuestion(fixture, 'question-7', 6)
  assert.equal(evidence.index, 2)
  assert.equal(evidence.item.question_number, 7)
})

test('question evidence falls back to the stable index for missing and duplicate ids', () => {
  const fixture = paper()
  fixture.grading_results[4].question_id = 'question-1'
  assert.equal(model.findEvidenceQuestion(fixture, 'missing-question', 3).item.question_number, 4)
  assert.equal(model.findEvidenceQuestion(fixture, 'question-1', 4).item.question_number, 5)
})

test('question evidence clamps stale indexes and handles an empty result', () => {
  assert.equal(model.findEvidenceQuestion(paper(), undefined, 999).item.question_number, 20)
  assert.equal(model.findEvidenceQuestion(paper({ grading_results: null }), undefined, 0), null)
})

test('next question navigation handles first, middle, and final questions', () => {
  const fixture = paper()
  assert.equal(model.findNextEvidenceQuestion(fixture, 'question-1', 0).item.question_number, 2)
  assert.equal(model.findNextEvidenceQuestion(fixture, 'question-10', 9).item.question_number, 11)
  assert.equal(model.findNextEvidenceQuestion(fixture, 'question-20', 19), null)
})

test('next question navigation uses the safe index when ids are missing or duplicated', () => {
  const fixture = paper()
  fixture.grading_results[1].question_id = 'question-1'
  assert.equal(model.findNextEvidenceQuestion(fixture, 'question-1', 1).item.question_number, 3)
  assert.equal(model.findNextEvidenceQuestion(fixture, 'missing-question', 7).item.question_number, 9)
})

test('question status is expressed with text and not color alone', () => {
  assert.equal(model.questionStatus(question(1, 5, 5)), 'correct')
  assert.equal(model.questionStatus(question(2, 2, 5)), 'wrong')
  assert.equal(model.questionStatus(question(3, 0, 5)), 'wrong')
  assert.equal(model.questionStatus(question(4, 0, 5, { response: '' })), 'missed')
  assert.equal(model.questionStatus(question(4, null, 5)), 'pending')
})

test('checking state remains active until a real score or review outcome arrives', () => {
  const pending = paper({ status: 'graded', total_score: null, max_score: null })
  assert.equal(model.isCheckedPaperChecking(pending), true)
  assert.equal(model.isCheckedPaperChecking(paper()), false)
  assert.equal(model.isCheckedPaperChecking(paper({
    status: 'pending_manual_review',
    total_score: null,
    max_score: null,
  })), false)

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
      { id: 'D', text: 'Delta' },
    ],
  })
  const review = model.buildQuestionReview(item)
  assert.equal(review.options.length, 4)
  assert.deepEqual(review.optionContext, { status: 'complete', expectedCount: 4, actualCount: 4 })
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
    options: [
      { id: 'A', text: 'One' },
      { id: 'B', text: 'Two' },
      { id: 'C', text: 'Three' },
      { id: 'D', text: 'Four' },
    ],
  }))
  assert.equal(review.unanswered, true)
  assert.equal(review.options.some((option) => option.selected), false)
  assert.equal(review.options[0].expected, true)
})

test('evaluated scan evidence is not mislabeled as an unanswered question when response text is omitted', () => {
  const item = question(1, 1, 2, {
    question_type: 'short_answer',
    response: null,
    policy_status: 'evaluated',
    attempt_ids: ['attempt-1'],
    evidence_citations: [{ page: 1, region_id: 'region-1' }],
  })
  const review = model.buildQuestionReview(item)

  assert.equal(review.answerAvailable, false)
  assert.equal(review.answerEvaluatedFromScan, true)
  assert.equal(review.unanswered, false)
  assert.equal(model.questionStatus(item), 'wrong')
})

test('published teacher-reviewed results are final even when resolved pipeline blockers remain in history', () => {
  const report = model.buildCheckedPaperReport(paper({
    status: 'graded',
    release_status: 'published',
    results_published: true,
    processing_blockers: [{ code: 'slice_not_calibrated', resolved_by_teacher: true }],
  }))

  assert.equal(report.provisional, false)
})

test('missing and partial MCQ option payloads remain explicit without fabricating content', () => {
  const missing = model.buildQuestionReview(question(1, 0, 1, {
    options: null,
  }))
  assert.deepEqual(missing.options, [])
  assert.deepEqual(missing.optionContext, { status: 'unavailable', expectedCount: 4, actualCount: 0 })

  const partial = model.buildQuestionReview(question(1, 0, 1, {
    options: [
      { id: 'A', text: 'Alpha' },
      { id: 'B', text: 'Beta' },
      { id: 'C', text: 'Gamma' },
    ],
  }))
  assert.deepEqual(partial.options.map((option) => option.key), ['A', 'B', 'C'])
  assert.deepEqual(partial.optionContext, { status: 'partial', expectedCount: 4, actualCount: 3 })
})

test('true or false accepts two options and image-only MCQ options preserve complete context', () => {
  const trueFalse = model.buildQuestionReview(question(1, 0, 1, {
    question_type: 'true_false',
    options: { A: 'True', B: 'False' },
  }))
  assert.deepEqual(trueFalse.optionContext, { status: 'complete', expectedCount: 2, actualCount: 2 })

  const imageOnly = model.buildQuestionReview(question(1, 0, 1, {
    options: [
      { id: 'A', image_url: '/options/a.png' },
      { id: 'B', visual_payload: { asset_url: '/options/b.png' } },
      { id: 'C', asset_url: '/options/c.png' },
      { id: 'D', image: '/options/d.png' },
    ],
  }))
  assert.deepEqual(imageOnly.options.map((option) => option.imageUrl), [
    '/options/a.png',
    '/options/b.png',
    '/options/c.png',
    '/options/d.png',
  ])
  assert.deepEqual(imageOnly.optionContext, { status: 'complete', expectedCount: 4, actualCount: 4 })
})

test('question evidence renders a recoverable notice for incomplete option context', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/screens/results/QuestionEvidenceScreen.tsx'),
    'utf8',
  )
  assert.match(source, /review\.optionContext\.status === 'partial'/)
  assert.match(source, /review\.optionContext\.status === 'unavailable'/)
  assert.match(source, /Options unavailable/)
  assert.match(source, /Some options are unavailable/)
  assert.match(source, /onRetry=\{\(\) => void refetch\(\)\}/)
  assert.match(source, /Report incomplete record/)
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
      { id: 'C', text: 'Gamma' },
      { id: 'D', text: 'Delta' },
    ]),
  }))
  assert.equal(encoded.options.length, 4)
  assert.equal(encoded.optionContext.status, 'complete')
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
  assert.deepEqual(sections.map((section) => section.title), ['Why Marks Cut', 'Solution Steps', 'Recommendation'])
})

test('math text is readable without leaking latex wrappers', () => {
  assert.equal(model.readableMathText('$I = \\frac{m}{r}$'), 'I = (m)⁄(r)')
  assert.equal(model.readableMathText('$F = 4m\\pi^2r/T^2$'), 'F = 4mπ²r/T²')
  assert.equal(model.readableMathText('$^{39}C_{3r-1} - {}^{39}C_{r^2}$'), '³⁹C₃ᵣ₋₁ - ³⁹Cᵣ²')
})
