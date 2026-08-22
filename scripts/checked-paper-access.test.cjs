const assert = require('node:assert/strict')
const test = require('node:test')

const documentModelPath = process.env.PROTECTED_DOCUMENT_MODEL_PATH
const rolesPath = process.env.AUTH_ROLES_PATH
if (!documentModelPath || !rolesPath) throw new Error('Checked-paper access model paths are required.')

const documents = require(documentModelPath)
const roles = require(rolesPath)

test('resolves relative protected scan URLs against the API origin', () => {
  assert.equal(
    documents.resolveDocumentUrl('/api/v1/checked-papers/paper-1/scan', 'https://api.example.test/'),
    'https://api.example.test/api/v1/checked-papers/paper-1/scan',
  )
  assert.equal(
    documents.resolveDocumentUrl('uploads/paper-1.pdf', 'https://api.example.test'),
    'https://api.example.test/uploads/paper-1.pdf',
  )
})

test('preserves absolute scan URLs and rejects missing sources', () => {
  const absolute = 'https://files.example.test/paper-1.pdf?signature=synthetic'
  assert.equal(documents.resolveDocumentUrl(absolute, 'https://api.example.test'), absolute)
  assert.throws(() => documents.resolveDocumentUrl('  ', 'https://api.example.test'))
})

test('derives safe document extensions without trusting query strings', () => {
  assert.equal(documents.documentFileExtension('https://files.example.test/paper.PDF?token=synthetic'), '.pdf')
  assert.equal(documents.documentFileExtension('https://files.example.test/scan.jpeg'), '.jpg')
  assert.equal(documents.documentFileExtension('https://files.example.test/download/1'), '.pdf')
})

test('sends bearer authorization only to the configured API origin', () => {
  assert.equal(
    documents.requiresApiAuthorization('https://api.example.test/uploads/paper.pdf', 'https://api.example.test'),
    true,
  )
  assert.equal(
    documents.requiresApiAuthorization('https://signed-storage.example.test/paper.pdf', 'https://api.example.test'),
    false,
  )
})

test('accepts only same-origin school question-paper view and download routes', () => {
  assert.equal(
    documents.resolveSchoolQuestionPaperFileUrl(
      '/api/v1/question-papers/paper-1/view',
      'https://api.example.test',
    ),
    'https://api.example.test/api/v1/question-papers/paper-1/view',
  )
  assert.equal(
    documents.resolveSchoolQuestionPaperFileUrl(
      'https://api.example.test/api/v1/question-papers/paper-1/download',
      'https://api.example.test',
    ),
    'https://api.example.test/api/v1/question-papers/paper-1/download',
  )
  assert.throws(() => documents.resolveSchoolQuestionPaperFileUrl(
    'https://files.example.test/api/v1/question-papers/paper-1/view',
    'https://api.example.test',
  ))
  assert.throws(() => documents.resolveSchoolQuestionPaperFileUrl(
    '/api/v1/accounts/me',
    'https://api.example.test',
  ))
  assert.throws(() => documents.resolveSchoolQuestionPaperFileUrl(' ', 'https://api.example.test'))
})

test('builds a safe authenticated checked-paper PDF download request', () => {
  assert.equal(
    documents.checkedPaperDownloadEndpoint('paper id/synthetic'),
    '/checked-papers/paper%20id%2Fsynthetic/download',
  )
  assert.throws(() => documents.checkedPaperDownloadEndpoint('  '))
  assert.equal(documents.safeDocumentFileStem('Algebra / Checked Report'), 'Algebra-Checked-Report')
  assert.equal(documents.safeDocumentFileStem('***'), 'checked-paper')
})

test('names cached protected images stably and per source URL', () => {
  const first = 'https://api.example.test/api/v1/documents/visuals/chapter2_q105.png'
  const second = 'https://api.example.test/api/v1/documents/visuals/book-b/chapter2_q105.png'

  assert.equal(
    documents.protectedImageCacheFileName(first),
    documents.protectedImageCacheFileName(first),
  )
  assert.notEqual(
    documents.protectedImageCacheFileName(first),
    documents.protectedImageCacheFileName(second),
  )
  assert.match(documents.protectedImageCacheFileName(first), /^visual-chapter2_q105-[a-z0-9]+\.png$/)
  assert.match(
    documents.protectedImageCacheFileName('https://api.example.test/api/v1/documents/visuals/1'),
    /^visual-1-[a-z0-9]+\.img$/,
  )
  assert.doesNotMatch(
    documents.protectedImageCacheFileName('https://api.example.test/visuals/a%20b c.PNG?v=2'),
    /[^a-z0-9_.-]/i,
  )
  assert.throws(() => documents.protectedImageCacheFileName('  '))
})

test('student roles retain learner actions while staff roles do not', () => {
  assert.equal(roles.isLearnerRole('student'), true)
  assert.equal(roles.isLearnerRole('b2c_student'), true)
  assert.equal(roles.isLearnerRole('teacher'), false)
  assert.equal(roles.isLearnerRole('principal'), false)
})
