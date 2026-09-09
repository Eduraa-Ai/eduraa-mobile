const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')

test('synthetic attendance accounts authenticate by email or institutional ID', async () => {
  const { authenticateFixture, SYNTHETIC_PASSWORD } = await import('../test-artifacts/ai-studio/auth-fixtures.mjs')

  const teacherByEmail = authenticateFixture('attendance-teacher@example.test', SYNTHETIC_PASSWORD)
  const teacherById = authenticateFixture(' tch-1024 ', SYNTHETIC_PASSWORD)
  const studentByEmail = authenticateFixture('attendance-student@example.test', SYNTHETIC_PASSWORD)
  const studentById = authenticateFixture('ST-001', SYNTHETIC_PASSWORD)

  assert.equal(teacherByEmail.role, 'teacher')
  assert.equal(teacherById.id, teacherByEmail.id)
  assert.equal(teacherByEmail.display_name, 'Meera Subramaniam')
  assert.equal(studentByEmail.role, 'student')
  assert.equal(studentById.id, studentByEmail.id)
  assert.equal(studentByEmail.display_name, 'Aarav Jain')
})

test('unknown identifiers and incorrect passwords cannot become another role', async () => {
  const { authenticateFixture, SYNTHETIC_PASSWORD } = await import('../test-artifacts/ai-studio/auth-fixtures.mjs')

  assert.equal(authenticateFixture('unknown@example.test', SYNTHETIC_PASSWORD), null)
  assert.equal(authenticateFixture('attendance-teacher@example.test', 'wrong-password'), null)
})

test('teacher and student sessions are isolated through refresh and logout', async () => {
  const { authenticateFixture, createFixtureSessions, SYNTHETIC_PASSWORD } = await import('../test-artifacts/ai-studio/auth-fixtures.mjs')
  const sessions = createFixtureSessions()
  const teacher = authenticateFixture('TCH-1024', SYNTHETIC_PASSWORD)
  const student = authenticateFixture('ST-001', SYNTHETIC_PASSWORD)
  const teacherTokens = sessions.issue(teacher)
  const studentTokens = sessions.issue(student)

  assert.notEqual(teacherTokens.accessToken, studentTokens.accessToken)
  assert.equal(sessions.accountForAuthorization(`Bearer ${teacherTokens.accessToken}`).role, 'teacher')
  assert.equal(sessions.accountForAuthorization(`Bearer ${studentTokens.accessToken}`).role, 'student')

  const refreshedTeacher = sessions.refresh(teacherTokens.refreshToken)
  assert.equal(refreshedTeacher.account.role, 'teacher')
  assert.equal(sessions.refresh(teacherTokens.refreshToken), null)
  assert.equal(sessions.accountForAuthorization(`Bearer ${studentTokens.accessToken}`).role, 'student')

  sessions.revoke({
    authorization: `Bearer ${refreshedTeacher.accessToken}`,
    refreshToken: refreshedTeacher.refreshToken,
  })
  assert.equal(sessions.accountForAuthorization(`Bearer ${refreshedTeacher.accessToken}`), null)
  assert.equal(sessions.accountForAuthorization(`Bearer ${studentTokens.accessToken}`).role, 'student')
})

test('synthetic API exposes the same session lifecycle used by mobile', () => {
  const source = fs.readFileSync('test-artifacts/ai-studio/mock-server.mjs', 'utf8')

  assert.match(source, /path === '\/api\/v1\/auth\/login'/)
  assert.match(source, /path === '\/api\/v1\/auth\/me'/)
  assert.match(source, /path === '\/api\/v1\/auth\/refresh'/)
  assert.match(source, /path === '\/api\/v1\/auth\/logout'/)
  assert.doesNotMatch(source, /syntheticRole/)
})
