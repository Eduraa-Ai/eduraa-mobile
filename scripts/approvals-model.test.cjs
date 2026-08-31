const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  APPROVAL_ROLE_MATRIX,
  canAccessApprovalActions,
  getVisibleApprovalQueues,
  removeCompletedApproval,
} = require(process.env.APPROVALS_MODEL_PATH)

test('B2B role matrix exposes only the permitted queues', () => {
  assert.deepEqual(getVisibleApprovalQueues('school_super_admin'), ['principals'])
  assert.deepEqual(getVisibleApprovalQueues('branch_admin'), ['principals'])
  assert.deepEqual(getVisibleApprovalQueues('principal'), ['teachers', 'classTeacherRequests', 'teacherProfileUpdates'])
  assert.deepEqual(getVisibleApprovalQueues('teacher'), ['students'])
  assert.deepEqual(getVisibleApprovalQueues('student'), [])
  assert.deepEqual(getVisibleApprovalQueues('admin'), [])
  assert.deepEqual(getVisibleApprovalQueues('developer'), [])
  assert.deepEqual(getVisibleApprovalQueues('b2c_student'), [])
})

test('students and non-school platform roles never receive approval powers', () => {
  for (const role of ['student', 'b2c_student', 'admin', 'developer', undefined]) {
    assert.equal(canAccessApprovalActions(role), false)
    assert.deepEqual(getVisibleApprovalQueues(role), [])
  }
  assert.equal(APPROVAL_ROLE_MATRIX.student.statusOnly, true)
})

test('completed mutation reconciliation removes only its target', () => {
  const original = [{ id: 'one' }, { id: 'two' }, { id: 'three' }]
  assert.deepEqual(removeCompletedApproval(original, 'two'), [{ id: 'one' }, { id: 'three' }])
  assert.deepEqual(original, [{ id: 'one' }, { id: 'two' }, { id: 'three' }])
})

test('zero, one, and many queues preserve deterministic counts', () => {
  assert.equal(removeCompletedApproval([], 'missing').length, 0)
  assert.equal(removeCompletedApproval([{ id: 'one' }], 'one').length, 0)
  assert.equal(removeCompletedApproval([{ id: 'one' }, { id: 'two' }], 'missing').length, 2)
})
