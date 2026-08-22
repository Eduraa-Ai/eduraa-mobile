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

test('friendlyStage always returns a non-blank label for every active or blocked status', () => {
  const statuses = [...model.CHECKED_PAPER_ACTIVE_STATUSES, 'integrity_needs_review', 'evidence_failed', 'grading_failed']
  for (const status of statuses) {
    assert.ok(model.friendlyStage(status).length > 0, `${status} should have a label`)
  }
  assert.equal(model.friendlyStage(null), 'Processing')
})

test('continue as exception only shows when every blocker is teacher-resolvable', () => {
  const mixed = [{ resolvable_by_teacher: true }, { resolvable_by_teacher: false }]
  const allResolvable = [{ resolvable_by_teacher: true }, { resolvable_by_teacher: true }]
  assert.equal(model.canContinueAsException(mixed), false)
  assert.equal(model.canContinueAsException(allResolvable), true)
  assert.equal(model.canContinueAsException([]), false)
})

test('retry actions only surface for their exact failed status and stage', () => {
  const evidenceBlocker = [{ stage: 'answer_reading' }]
  const gradingBlocker = [{ stage: 'rubric_grading' }]
  assert.equal(model.canRetryEvidence('evidence_failed', evidenceBlocker), true)
  assert.equal(model.canRetryEvidence('evidence_failed', gradingBlocker), false)
  assert.equal(model.canRetryEvidence('mapping_failed', evidenceBlocker), false)
  assert.equal(model.canRetryGrading('grading_failed', gradingBlocker), true)
  assert.equal(model.canRetryGrading('grading_failed', evidenceBlocker), false)
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
  assert.equal(model.friendlyUploadError(null, 'Unable to upload this scan.'), 'Unable to upload this scan.')
})
