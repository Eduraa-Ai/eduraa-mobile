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

test('continue as exception only shows when every blocker is teacher-resolvable', () => {
  const mixed = [{ resolvable_by_teacher: true }, { resolvable_by_teacher: false }]
  const allResolvable = [{ resolvable_by_teacher: true }, { resolvable_by_teacher: true }]
  assert.equal(model.canContinueAsException(mixed), false)
  assert.equal(model.canContinueAsException(allResolvable), true)
  assert.equal(model.canContinueAsException([]), false)
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
