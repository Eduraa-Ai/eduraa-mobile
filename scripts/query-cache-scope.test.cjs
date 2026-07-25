const assert = require('node:assert/strict')
const test = require('node:test')

const { shouldClearQueryCache } = require(process.env.QUERY_CACHE_SCOPE_PATH)

test('keeps the first authenticated dashboard request alive after login', () => {
  assert.equal(shouldClearQueryCache(null, 'student-1'), false)
})

test('clears private query data when an authenticated user leaves', () => {
  assert.equal(shouldClearQueryCache('student-1', null), true)
})

test('clears private query data when the active account changes', () => {
  assert.equal(shouldClearQueryCache('student-1', 'student-2'), true)
})

test('does not clear for initial or unchanged identity state', () => {
  assert.equal(shouldClearQueryCache(undefined, null), false)
  assert.equal(shouldClearQueryCache('student-1', 'student-1'), false)
})
