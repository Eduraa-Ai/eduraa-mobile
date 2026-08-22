const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.CUSTOM_PAPER_MODEL_PATH
if (!modelPath) throw new Error('CUSTOM_PAPER_MODEL_PATH is required')

const {
  createIdempotencyKey,
  describeManifest,
  manifestIssues,
  manifestProcessingStatus,
} = require(modelPath)

const extracting = {
  status: 'draft',
  extraction_metadata: { processing_status: 'processing' },
}

const ready = {
  status: 'draft',
  manifest_sha256: 'abc123',
  extraction_metadata: { processing_status: 'needs_confirmation' },
  validation_report: {
    calculated_total_marks: '40',
    errors: [{ code: 'missing_marks', message: 'Q3 has no marks', severity: 'error' }],
    warnings: [{ code: 'low_confidence', message: 'Q5 is unclear', severity: 'warning' }],
  },
  unresolved_items: [
    { code: 'missing_marks', message: 'Q3 has no marks', severity: 'error' },
  ],
  occurrences: [
    { occurrence_id: 'q1', display_label: 'Q1', resolution_status: 'resolved' },
    { occurrence_id: 'q2', display_label: 'Q2', resolution_status: 'ambiguous' },
    { occurrence_id: 'q2a', parent_occurrence_id: 'q2', display_label: 'Q2(a)', resolution_status: 'resolved' },
  ],
}

test('reports extraction as in-flight and not confirmable', () => {
  const view = describeManifest(extracting)
  assert.equal(view.phase, 'extracting')
  assert.equal(view.isPolling, true)
  assert.equal(view.canConfirm, false)
})

test('treats a needs_confirmation draft as reviewable', () => {
  const view = describeManifest(ready)
  assert.equal(view.phase, 'needs_confirmation')
  assert.equal(view.isPolling, false)
  assert.equal(view.canConfirm, true)
  assert.equal(view.totalMarks, 40)
})

test('counts only leaf occurrences as questions', () => {
  // Q2(a) is a sub-part of Q2, so the paper still has two questions.
  assert.equal(describeManifest(ready).questionCount, 2)
})

test('counts occurrences the extractor could not resolve', () => {
  assert.equal(describeManifest(ready).unresolvedCount, 1)
})

test('de-duplicates issues repeated across report channels', () => {
  const issues = manifestIssues(ready)
  assert.equal(issues.length, 2)
  assert.equal(issues.filter((i) => i.code === 'missing_marks').length, 1)
})

test('separates error and warning counts', () => {
  const view = describeManifest(ready)
  assert.equal(view.errorCount, 1)
  assert.equal(view.warningCount, 1)
})

test('never offers confirmation without a review hash', () => {
  const view = describeManifest({ ...ready, manifest_sha256: null })
  assert.equal(view.canConfirm, false)
})

test('surfaces a failed extraction for retry', () => {
  const view = describeManifest({
    status: 'draft',
    extraction_metadata: { processing_status: 'failed' },
  })
  assert.equal(view.phase, 'failed')
  assert.equal(view.isPolling, false)
  assert.equal(view.canConfirm, false)
})

test('stops polling once the manifest is confirmed', () => {
  const view = describeManifest({ ...ready, status: 'confirmed' })
  assert.equal(view.phase, 'confirmed')
  assert.equal(view.isPolling, false)
})

test('handles a missing manifest without throwing', () => {
  const view = describeManifest(null)
  assert.equal(view.phase, 'extracting')
  assert.equal(view.questionCount, 0)
  assert.equal(manifestProcessingStatus(null), '')
})

test('builds RFC 4122 version 4 idempotency keys', () => {
  const key = createIdempotencyKey(() => 0.5)
  assert.match(
    key,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
})

test('produces a different key per upload attempt', () => {
  assert.notEqual(createIdempotencyKey(), createIdempotencyKey())
})
