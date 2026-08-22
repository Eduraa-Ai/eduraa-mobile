const assert = require('node:assert/strict')
const test = require('node:test')

const landingPath = process.env.LANDING_MODEL_PATH
if (!landingPath) throw new Error('Set LANDING_MODEL_PATH to the compiled landing model.')
const { isPreviousPapersEligible, isSchoolPreviousPapersEligible } = require(landingPath)

function user(overrides = {}) {
  return {
    id: 'student-1',
    display_name: 'Synthetic Student',
    identifier: 'synthetic@example.test',
    role: 'b2c_student',
    profile_completed: true,
    b2c_education_level: 'competitive_exams',
    b2c_board: null,
    b2c_standard: null,
    b2c_target_exam: 'JEE Main + Advanced',
    b2c_subjects: ['Physics', 'Chemistry', 'Mathematics'],
    ...overrides,
  }
}

test('matches the website B2C JEE eligibility contract', () => {
  assert.equal(isPreviousPapersEligible(user()), true)
  assert.equal(isPreviousPapersEligible(user({ b2c_education_level: 'competitive_exam' })), true)
  assert.equal(isPreviousPapersEligible(user({ b2c_education_level: 'school' })), false)
  assert.equal(isPreviousPapersEligible(user({ b2c_target_exam: 'NEET', b2c_subjects: ['Biology'] })), false)
  assert.equal(isPreviousPapersEligible(null), false)
})

test('school previous papers are enabled only for B2B students and teachers', () => {
  assert.equal(isSchoolPreviousPapersEligible(user({ role: 'student' })), true)
  assert.equal(isSchoolPreviousPapersEligible(user({ role: 'teacher' })), true)
  assert.equal(isSchoolPreviousPapersEligible(user({ role: 'principal' })), false)
  assert.equal(isSchoolPreviousPapersEligible(user()), false)
  assert.equal(isSchoolPreviousPapersEligible(null), false)
  assert.equal(isPreviousPapersEligible(user({ role: 'student' })), true)
  assert.equal(isPreviousPapersEligible(user({ role: 'teacher' })), true)
  assert.equal(isPreviousPapersEligible(user({ role: 'principal' })), false)
})
