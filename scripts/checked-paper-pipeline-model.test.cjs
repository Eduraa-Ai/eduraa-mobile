const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.CHECKED_PAPER_PIPELINE_MODEL_PATH
if (!modelPath) throw new Error('Set CHECKED_PAPER_PIPELINE_MODEL_PATH to the compiled checked-paper pipeline model.')
const model = require(modelPath)

test('completed statuses match the backend manifest pipeline exactly', () => {
  assert.equal(model.isCheckedPaperStatusCompleted('graded'), true)
  assert.equal(model.isCheckedPaperStatusCompleted('auto_assessed'), true)
  assert.equal(model.isCheckedPaperStatusCompleted('pending_question_review'), true)
  assert.equal(model.isCheckedPaperStatusCompleted('rubric_grading'), false)
})

test('active statuses cover every pipeline stage before a terminal outcome', () => {
  const active = [
    'uploaded', 'pending', 'integrity_pending', 'integrity_running', 'integrity_verified',
    'evidence_pending', 'evidence_inventory', 'evidence_grouping', 'attempt_grouping', 'evidence_ready',
    'mapping_pending', 'blind_mapping', 'mapping_ready',
    'grading_pending', 'grading', 'rubric_grading', 'policy_ready',
    'release_evaluation_pending', 'completeness_challenge',
  ]
  for (const status of active) {
    assert.equal(model.isCheckedPaperStatusActive(status), true, `${status} should be active`)
  }
  assert.equal(model.isCheckedPaperStatusActive('graded'), false)
  assert.equal(model.isCheckedPaperStatusActive('integrity_failed'), false)
})

test('blocked detection matches any status containing needs_review or failed', () => {
  assert.equal(model.isCheckedPaperStatusBlocked('integrity_needs_review'), true)
  assert.equal(model.isCheckedPaperStatusBlocked('evidence_failed'), true)
  assert.equal(model.isCheckedPaperStatusBlocked('grading_failed'), true)
  assert.equal(model.isCheckedPaperStatusBlocked('pending_manual_review'), false)
  assert.equal(model.isCheckedPaperStatusBlocked('rubric_grading'), false)
})

test('teacher-facing status is limited to the four experience states', () => {
  assert.equal(model.checkedPaperExperienceStatus({ status: 'rubric_grading' }), 'checking')
  assert.equal(model.checkedPaperExperienceStatus({ status: 'auto_assessed' }), 'ready_for_review')
  assert.equal(model.checkedPaperExperienceStatus({ status: 'evidence_failed' }), 'needs_input')
  assert.equal(model.checkedPaperExperienceStatus({ status: 'pending_question_review' }), 'needs_input')
  assert.equal(model.checkedPaperExperienceStatus({ status: 'graded', results_published: true }), 'published')
  assert.equal(model.friendlyStage('rubric_grading'), 'Checking')
  assert.equal(model.friendlyStage('grading_failed'), 'Needs your input')
  assert.equal(model.friendlyStage(null), 'Checking')
})

test('review stays in checking until the terminal payload contains scores and questions', () => {
  const emptyTerminal = {
    status: 'auto_assessed',
    total_score: null,
    max_score: null,
    grading_results: [],
  }
  const completeTerminal = {
    status: 'auto_assessed',
    total_score: 7,
    max_score: 10,
    grading_results: [{ question_id: 'question-1' }],
  }

  assert.equal(model.checkedPaperExperienceStatus(emptyTerminal), 'ready_for_review')
  assert.equal(model.hasCheckedPaperReviewPayload(emptyTerminal), false)
  assert.equal(model.checkedPaperReviewExperienceStatus(emptyTerminal), 'checking')
  assert.equal(model.hasCheckedPaperReviewPayload(completeTerminal), true)
  assert.equal(model.checkedPaperReviewExperienceStatus(completeTerminal), 'ready_for_review')
})

test('continue as exception only shows when every blocker is teacher-resolvable', () => {
  const mixed = [{ resolvable_by_teacher: true }, { resolvable_by_teacher: false }]
  const allResolvable = [{ resolvable_by_teacher: true }, { resolvable_by_teacher: true }]
  assert.equal(model.canContinueAsException(mixed), false)
  assert.equal(model.canContinueAsException(allResolvable), true)
  assert.equal(model.canContinueAsException([]), false)
})

test('calibration flags explain that the teacher owns the final decision', () => {
  assert.equal(
    model.isReleaseConfidenceBlocker({ code: 'page_unreadable' }),
    false,
  )
  assert.equal(
    model.checkedPaperBlockerMessage({
      issue_id: 'technical:unknown',
      code: 'unknown',
      stage: 'release_evaluation',
      resolvable_by_teacher: false,
    }),
    'Eduraa needs a teacher to review this flag before the result can be approved.',
  )
})

test('teacher decision preserves distinct scoped flags and the suggested result', () => {
  const decision = model.buildTeacherPaperDecision({
    status: 'pending_question_review',
    needs_review: true,
    can_save_review: true,
    total_score: 18,
    max_score: 21,
    grading_results: Array.from({ length: 10 }, (_, index) => ({ question_id: String(index) })),
    processing_blockers: [
      { issue_id: 'language', code: 'language_identity_missing', stage: 'release_evaluation', resolvable_by_teacher: true },
      { issue_id: 'slice-1', code: 'slice_not_calibrated', stage: 'release_evaluation', resolvable_by_teacher: true },
      { issue_id: 'slice-2', code: 'slice_not_calibrated', stage: 'release_evaluation', resolvable_by_teacher: true },
    ],
  })

  assert.equal(decision.issueCount, 2)
  assert.equal(decision.statusLabel, '2 checks')
  assert.equal(decision.title, '2 checks need confirmation')
  assert.equal(decision.actionLabel, 'Review 2 checks')
  assert.match(decision.body, /graded all 10 questions and suggests 18\/21/)
})

test('duplicate issue delivery is collapsed only by stable issue identity', () => {
  const repeated = { issue_id: 'same', code: 'slice_not_calibrated', stage: 'release', resolvable_by_teacher: true }
  const unique = model.uniqueCheckedPaperBlockers([
    repeated,
    repeated,
    { ...repeated, issue_id: 'different', question_ids: ['q2'] },
  ])
  assert.deepEqual(unique.map((item) => item.issue_id), ['same', 'different'])
})

test('checking stages use backend milestones instead of elapsed-time percentages', () => {
  assert.equal(model.checkingStageLabel('integrity_running'), 'Checking page integrity')
  assert.equal(model.checkingStageLabel('grading', 'rubric_grading'), 'Applying the marking rubric')
  assert.equal(model.checkingStageLabel('mapping_pending'), 'Matching answers to questions')
})

test('legacy grading feedback yields a concise visible-answer summary', () => {
  const feedback = [
    '**Student response**',
    '- The student selected option `D`.',
    '- The map label is visible.',
    '',
    '**Rubric evaluation**',
    '1. Correct.',
  ].join('\n')

  assert.equal(
    model.studentResponseSummaryFromFeedback(feedback),
    'The student selected option D.\nThe map label is visible.',
  )
  assert.equal(model.studentResponseSummaryFromFeedback('Legacy free-form feedback'), null)
})

test('teacher decision gives a recovery action when checking fails without a result', () => {
  const decision = model.buildTeacherPaperDecision({
    status: 'grading_failed',
    needs_review: true,
    can_save_review: false,
    grading_results: [],
    processing_blockers: [],
  })

  assert.equal(decision.title, 'Checking could not finish')
  assert.equal(decision.actionLabel, 'Review scan issue')
  assert.equal(decision.hasSuggestedResult, false)
})

test('missing answer extraction is teacher review, never an automatic zero', () => {
  assert.equal(
    model.checkedPaperBlockerMessage({
      issue_id: 'evidence:no-candidate-response',
      code: 'no_candidate_response_detected',
      stage: 'answer_reading',
      resolvable_by_teacher: true,
    }),
    'Eduraa could not detect answer regions on the uploaded pages. Review the scan and set the final marks; a zero is not automatic.',
  )
})

test('standard/division matching normalizes "Class 10" / "Std. 10" prefixes and case', () => {
  assert.equal(model.normalizeStandard('Class 10'), '10')
  assert.equal(model.normalizeStandard('Std. 010'), '10')
  assert.equal(model.normalizeDivision(' a '), 'A')
  assert.equal(
    model.matchesStandardDivision({ standard: 'Std 10', division: 'a' }, { standard: '10', division: 'A' }),
    true,
  )
  assert.equal(
    model.matchesStandardDivision({ standard: '9', division: 'A' }, { standard: '10', division: 'A' }),
    false,
  )
})

test('matchesStandardDivision treats a missing target field as unfiltered', () => {
  assert.equal(model.matchesStandardDivision({ standard: '10' }, {}), true)
})

test('staff upload modes expose only confirmed custom papers in paper mode', () => {
  assert.equal(model.isPaperAvailableForUploadMode('custom_paper', 'custom_paper'), true)
  assert.equal(model.isPaperAvailableForUploadMode('ai_generation_system', 'custom_paper'), false)
  assert.equal(model.isPaperAvailableForUploadMode(null, 'custom_paper'), false)
  assert.equal(model.isPaperAvailableForUploadMode('custom_paper', 'ai_generation_system'), false)
})

test('scan upload linking matches the web request contract', () => {
  assert.deepEqual(
    model.resolveScanUploadLink({
      isStaff: true,
      mode: 'ai_generation_system',
      selectedPaperId: 'paper-ignored',
      selectedExamId: 'exam-1',
    }),
    { paperId: null, examId: 'exam-1', uploadMode: 'ai_generation_system' },
  )
  assert.deepEqual(
    model.resolveScanUploadLink({
      isStaff: true,
      mode: 'custom_paper',
      selectedPaperId: 'paper-1',
      selectedExamId: 'exam-ignored',
    }),
    { paperId: 'paper-1', examId: null, uploadMode: 'custom_paper' },
  )
  assert.deepEqual(
    model.resolveScanUploadLink({
      isStaff: false,
      mode: 'ai_generation_system',
      selectedPaperId: 'paper-2',
      selectedExamId: 'exam-ignored',
    }),
    { paperId: 'paper-2', examId: null, uploadMode: null },
  )
})

test('scan upload always sends the authoritative student identity', () => {
  assert.equal(
    model.resolveScanUploadStudentId({
      isStaff: true,
      selectedStudentId: 'roster-student',
      authenticatedUserId: 'teacher-account',
    }),
    'roster-student',
  )
  assert.equal(
    model.resolveScanUploadStudentId({
      isStaff: false,
      selectedStudentId: 'ignored-selection',
      authenticatedUserId: 'learner-account',
    }),
    'learner-account',
  )
  assert.equal(
    model.resolveScanUploadStudentId({ isStaff: false }),
    null,
  )
})

test('idempotency keys are unique and look like a uuid v4', () => {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const first = model.generateIdempotencyKey()
  const second = model.generateIdempotencyKey()
  assert.match(first, uuidPattern)
  assert.match(second, uuidPattern)
  assert.notEqual(first, second)
})

test('friendlyUploadError maps known backend codes and passes through unknown detail text', () => {
  assert.equal(
    model.friendlyUploadError('CHECKED_PAPER_V2_MANIFEST_REQUIRED'),
    'This paper needs its answer key confirmed before it can be checked. Confirm the paper first.',
  )
  assert.equal(model.friendlyUploadError('Student is not in the teacher\'s section.'), 'Student is not in the teacher\'s section.')
  assert.equal(
    model.friendlyUploadError('CHECKED_PAPER_LEGACY_READ_ONLY'),
    'This older checked paper is read-only.',
  )
  assert.equal(
    model.friendlyUploadError('checked_paper_v2_b2c_integrity_unavailable'),
    'Checking is not available for this paper yet. No grading was started.',
  )
  assert.equal(model.friendlyUploadError(null, 'Unable to upload this scan.'), 'Unable to upload this scan.')
})
