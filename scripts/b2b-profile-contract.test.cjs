const assert = require('node:assert/strict')
const { test } = require('node:test')

const {
  B2B_PROFILE_FIELD_CONTRACT,
  buildTeacherApprovalPayload,
  canMutateB2BProfileDirectly,
  retainAvailableSelections,
  teachingScopeOptions,
  validateTeacherApprovalDraft,
} = require(process.env.B2B_PROFILE_MODEL_PATH)

const validDraft = {
  firstName: '  Mira ',
  lastName: ' Shah  ',
  email: ' MIRA@SCHOOL.EDU ',
  teacherId: ' TCH-104 ',
  branchId: 'branch-1',
  board: ' CBSE ',
  standardsTaught: 'Std 9, Std 10, std 9',
  divisionsTaught: ['A', 'B', 'a'],
  subjectsTaught: 'Physics, Mathematics',
}

test('all B2B roles prohibit direct profile mutation', () => {
  for (const role of ['student', 'teacher', 'principal']) {
    assert.equal(canMutateB2BProfileDirectly(role), false)
    assert.deepEqual(B2B_PROFILE_FIELD_CONTRACT[role].editable, [])
  }
})

test('student and principal contracts have no approval mutation fields', () => {
  assert.deepEqual(B2B_PROFILE_FIELD_CONTRACT.student.approvalRequired, [])
  assert.deepEqual(B2B_PROFILE_FIELD_CONTRACT.principal.approvalRequired, [])
})

test('visible contracts exclude internal authorization identifiers', () => {
  assert.equal(B2B_PROFILE_FIELD_CONTRACT.student.visible.includes('school_id'), false)
  assert.equal(B2B_PROFILE_FIELD_CONTRACT.student.visible.includes('branch_id'), false)
  assert.equal(B2B_PROFILE_FIELD_CONTRACT.teacher.visible.includes('school_id'), false)
  assert.equal(B2B_PROFILE_FIELD_CONTRACT.teacher.visible.includes('is_active'), false)
})

test('teacher approval serializer sends exactly the approved field set', () => {
  const hostileDraft = {
    ...validDraft,
    school_id: 'attacker-school',
    is_active: false,
    is_approved: true,
    class_teacher_opt_in: true,
    status: 'approved',
  }
  const payload = buildTeacherApprovalPayload(hostileDraft)

  assert.deepEqual(Object.keys(payload).sort(), [
    'board',
    'branch_id',
    'divisions_taught',
    'email',
    'first_name',
    'last_name',
    'standards_taught',
    'subjects_taught',
    'teacher_id',
  ])
  assert.equal(payload.email, 'mira@school.edu')
  assert.deepEqual(payload.standards_taught, ['Std 9', 'Std 10'])
  assert.deepEqual(payload.divisions_taught, ['A', 'B'])
  assert.equal('school_id' in payload, false)
  assert.equal('class_teacher_opt_in' in payload, false)
})

test('teacher validation rejects missing identity and teaching scope', () => {
  const errors = validateTeacherApprovalDraft({
    firstName: '',
    lastName: '',
    email: 'invalid',
    teacherId: '',
    branchId: '',
    board: '',
    standardsTaught: '',
    divisionsTaught: [],
    subjectsTaught: '   ',
  })
  assert.deepEqual(Object.keys(errors).sort(), [
    'board',
    'branchId',
    'divisionsTaught',
    'email',
    'firstName',
    'lastName',
    'standardsTaught',
    'subjectsTaught',
    'teacherId',
  ])
})

test('teacher validation mirrors server length limits', () => {
  const errors = validateTeacherApprovalDraft({
    ...validDraft,
    firstName: 'F'.repeat(101),
    lastName: 'L'.repeat(101),
    teacherId: 'T'.repeat(121),
    board: 'B'.repeat(101),
  })
  assert.deepEqual(Object.keys(errors).sort(), ['board', 'firstName', 'lastName', 'teacherId'])
})

test('teacher list values mirror database element limits', () => {
  const errors = validateTeacherApprovalDraft({
    ...validDraft,
    standardsTaught: ['S'.repeat(21)],
    divisionsTaught: ['D'.repeat(21)],
    subjectsTaught: ['X'.repeat(51)],
  })
  assert.deepEqual(
    Object.keys(errors).sort(),
    ['divisionsTaught', 'standardsTaught', 'subjectsTaught'],
  )
})

test('teacher contract separates approval and immutable fields', () => {
  const contract = B2B_PROFILE_FIELD_CONTRACT.teacher
  assert.ok(contract.approvalRequired.includes('branch_id'))
  assert.ok(contract.approvalRequired.includes('subjects_taught'))
  assert.ok(contract.immutable.includes('school_id'))
  assert.ok(contract.immutable.includes('class_teacher_opt_in'))
  assert.equal(contract.approvalRequired.includes('school_id'), false)
})

test('teaching scope derives unique standards and only divisions for selected standards', () => {
  assert.deepEqual(
    teachingScopeOptions(
      [
        { standard: '5', divisions: ['A', 'B'] },
        { standard: '10', divisions: ['A', 'C'] },
      ],
      ['10'],
    ),
    { standards: ['5', '10'], divisions: ['A', 'C'] },
  )
})

test('canonical options remove stale selections but preserve values when no options are configured', () => {
  assert.deepEqual(retainAvailableSelections(['A', 'Legacy', 'a'], ['A', 'B']), ['A'])
  assert.deepEqual(retainAvailableSelections(['Legacy'], []), ['Legacy'])
})
