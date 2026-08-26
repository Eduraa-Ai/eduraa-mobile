const test = require('node:test')
const assert = require('node:assert/strict')

const modelPath = process.env.SCAN_UPLOAD_MODEL_PATH
if (!modelPath) throw new Error('Set SCAN_UPLOAD_MODEL_PATH to the compiled scan upload model.')
const model = require(modelPath)

const file = (name, size = 100) => ({ uri: `file:///${name}`, name, type: 'image/jpeg', size })

test('readiness follows assessment, student, subject, then files', () => {
  assert.equal(model.scanUploadReadiness({ isStudent: false, assessmentSelected: false, studentSelected: false, subjectResolved: false, fileCount: 0 }).message, 'Choose the paper or exam first.')
  assert.equal(model.scanUploadReadiness({ isStudent: false, assessmentSelected: true, studentSelected: false, subjectResolved: true, fileCount: 1 }).message, 'Choose the student.')
  assert.equal(model.scanUploadReadiness({ isStudent: false, assessmentSelected: true, studentSelected: true, subjectResolved: true, fileCount: 1 }).ready, true)
})

test('student uploads do not require a separate roster selection', () => {
  assert.equal(model.scanUploadReadiness({ isStudent: true, assessmentSelected: true, studentSelected: false, subjectResolved: true, fileCount: 1 }).ready, true)
})

test('duplicates are rejected without silently removing accepted pages', () => {
  const first = file('page-1.jpg')
  const result = model.validateAndMergeScanFiles([first], [first, file('page-2.jpg')])
  assert.deepEqual(result.files.map((item) => item.name), ['page-1.jpg', 'page-2.jpg'])
  assert.equal(result.rejected.length, 1)
  assert.match(result.rejected[0].reason, /already/)
})

test('file count and byte limits reject only the unsafe additions', () => {
  const limits = { maxFiles: 2, maxFileBytes: 10, maxTotalBytes: 15 }
  const result = model.validateAndMergeScanFiles([], [file('a.jpg', 8), file('b.jpg', 11), file('c.jpg', 8)], limits)
  assert.deepEqual(result.files.map((item) => item.name), ['a.jpg'])
  assert.equal(result.rejected.length, 2)
  assert.match(result.rejected[0].reason, /Each file/)
  assert.match(result.rejected[1].reason, /combined upload/)
})

test('pages move deterministically and invalid moves are no-ops', () => {
  const pages = ['one', 'two', 'three']
  assert.deepEqual(model.moveScanFile(pages, 2, 0), ['three', 'one', 'two'])
  assert.deepEqual(model.moveScanFile(pages, 0, -1), pages)
})

test('page replacement keeps its original position', () => {
  const result = model.replaceScanFile([file('one.jpg'), file('two.jpg')], 0, file('new-one.jpg'))
  assert.deepEqual(result.files.map((item) => item.name), ['new-one.jpg', 'two.jpg'])
})
