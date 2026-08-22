const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const root = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('approval API loads one targeted queue and implements approve and reject', () => {
  const source = read('src/api/approvals.ts')
  assert.match(source, /getQueue<K extends ApprovalQueueKey>/)
  assert.doesNotMatch(source, /async getQueues\(/)
  for (const method of [
    'rejectPrincipal',
    'rejectTeacher',
    'rejectStudent',
    'rejectClassTeacherRequest',
    'rejectTeacherProfileUpdate',
  ]) assert.match(source, new RegExp(`async ${method}\\(`))
})

test('approval screen gates API reads by role and targets retries', () => {
  const source = read('src/screens/workspace/ApprovalsScreen.tsx')
  assert.match(source, /enabled,/)
  assert.match(source, /getVisibleApprovalQueues\(user\?\.role\)/)
  assert.match(source, /Try this queue again/)
  assert.match(source, /retry: false/)
  assert.match(source, /removeCompletedApproval/)
  assert.match(source, /Your identity, this target, the decision, and server time will be recorded/)
  assert.match(source, /Modal visible=\{Boolean\(pendingDecision\)\}/)
})

test('student status uses a private credentialed endpoint without decision methods', () => {
  const source = read('src/screens/auth/SchoolApprovalStatusScreen.tsx')
  assert.match(source, /getSchoolApprovalStatus/)
  assert.match(source, /never opens approval queues or administrative actions/)
  assert.doesNotMatch(source, /approvalsApi/)
})

test('navigation omits approval tab for roles without decision access', () => {
  const source = read('src/navigation/index.tsx')
  assert.match(source, /canAccessApprovalActions\(user\.role\)/)
  assert.match(source, /SchoolApprovalStatus/)
})
