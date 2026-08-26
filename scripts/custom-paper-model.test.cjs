const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const modelPath = process.env.CUSTOM_PAPER_MODEL_PATH
if (!modelPath) throw new Error('CUSTOM_PAPER_MODEL_PATH is required')

const root = path.join(__dirname, '..')

const {
  CUSTOM_PDF_MAX_BYTES,
  customPaperDraftFingerprint,
  customPaperFilesMatch,
  createIdempotencyKey,
  describeManifest,
  formatCustomPaperFileSize,
  manifestIssues,
  manifestProcessingStatus,
  validateCustomPaperFile,
} = require(modelPath)

const extracting = {
  status: 'draft',
  extraction_metadata: { processing_status: 'processing' },
}

const ready = {
  status: 'draft',
  manifest_sha256: 'abc123',
  validation_status: 'invalid',
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

const validReady = {
  ...ready,
  validation_status: 'valid',
  validation_report: {
    calculated_total_marks: '40',
    errors: [],
    warnings: [],
  },
  unresolved_items: [],
  occurrences: ready.occurrences.map((item) => ({
    ...item,
    resolution_status: 'resolved',
  })),
}

test('reports extraction as in-flight and not confirmable', () => {
  const view = describeManifest(extracting)
  assert.equal(view.phase, 'extracting')
  assert.equal(view.isPolling, true)
  assert.equal(view.canConfirm, false)
})

test('treats a needs_confirmation draft as reviewable', () => {
  const view = describeManifest(validReady)
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
  assert.equal(view.isPolling, true)
})

test('invalid manifests retry from saved PDFs instead of confirming', () => {
  const view = describeManifest(ready)
  assert.equal(view.canConfirm, false)
  assert.equal(view.canRetry, true)
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

test('validates custom PDFs before upload', () => {
  assert.equal(
    validateCustomPaperFile({ name: 'questions.docx', type: 'application/msword', size: 1024 }, 'Question paper'),
    'Question paper must be a PDF file.',
  )
  assert.match(
    validateCustomPaperFile({ name: 'questions.pdf', type: 'application/pdf', size: CUSTOM_PDF_MAX_BYTES + 1 }, 'Question paper'),
    /larger than 50 MB/,
  )
  assert.equal(
    validateCustomPaperFile({ name: 'questions.pdf', type: 'application/pdf', size: 2048 }, 'Question paper'),
    null,
  )
  assert.equal(formatCustomPaperFileSize(2 * 1024 * 1024), '2.0 MB')
})

test('detects the same selected source without rejecting unrelated files', () => {
  const question = { uri: 'file:///questions.pdf', name: 'questions.pdf', size: 200, lastModified: 10 }
  assert.equal(customPaperFilesMatch(question, { ...question }), true)
  assert.equal(
    customPaperFilesMatch(question, { ...question, uri: 'file:///answer-key.pdf', name: 'answers.pdf' }),
    false,
  )
})

test('draft fingerprint changes only when upload meaning changes', () => {
  const draft = {
    titleLine1: 'Class test',
    standard: 'Std 10',
    division: 'A',
    subjectId: 'maths',
    questionPaper: { uri: 'file:///questions.pdf', name: 'questions.pdf', size: 200 },
    answerKey: { uri: 'file:///answers.pdf', name: 'answers.pdf', size: 100 },
  }
  assert.equal(customPaperDraftFingerprint(draft), customPaperDraftFingerprint({ ...draft }))
  assert.notEqual(
    customPaperDraftFingerprint(draft),
    customPaperDraftFingerprint({ ...draft, division: 'B' }),
  )
})

test('custom paper routes expose one explicit accessible back button', () => {
  const navigation = fs.readFileSync(
    path.join(root, 'src/navigation/index.tsx'),
    'utf8',
  )

  for (const routeName of ['CustomPaper', 'StaffCustomPaper']) {
    const routeStart = navigation.indexOf(`name="${routeName}"`)
    assert.ok(routeStart >= 0, `${routeName} must remain registered`)

    const routeConfig = navigation.slice(routeStart, routeStart + 700)
    assert.match(routeConfig, /headerBackVisible: false/)
    assert.match(routeConfig, /CustomPaperHeaderBackButton/)
    assert.match(routeConfig, /navigation\.canGoBack\(\)/)
  }

  assert.match(navigation, /accessibilityLabel="Back to generate paper"/)
  assert.match(navigation, /customPaperBack:[\s\S]*minHeight: 44/)
})

test('custom paper creation selects and persists the complete class scope', () => {
  const screen = fs.readFileSync(
    path.join(root, 'src/screens/papers/CustomPaperScreen.tsx'),
    'utf8',
  )
  const api = fs.readFileSync(path.join(root, 'src/api/paperManifests.ts'), 'utf8')

  assert.match(screen, /label="Standard \*"/)
  assert.match(screen, /label="Division \*"/)
  assert.match(screen, /label="Subject \*"/)
  assert.match(screen, /titleLine1\.trim\(\) && standard\.trim\(\) && division\.trim\(\) && subjectId\.trim\(\)/)
  assert.match(screen, /standard: standard\.trim\(\)/)
  assert.match(screen, /division: division\.trim\(\)/)
  assert.match(api, /appendOptional\(formData, 'standard', payload\.standard\)/)
  assert.match(api, /appendOptional\(formData, 'division', payload\.division\)/)
})

test('workspace opens generation in the canonical papers stack', () => {
  const workspace = fs.readFileSync(
    path.join(root, 'src/screens/workspace/WorkspaceScreen.tsx'),
    'utf8',
  )

  assert.match(workspace, /parent\.navigate\([\s\S]*'StaffPapers'[\s\S]*screen: control\.target\.screen/)
  assert.doesNotMatch(workspace, /navigation\.navigate\('StaffGeneratePaper'\)/)
})
