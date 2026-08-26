const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const root = path.join(__dirname, '..')
const apiSource = fs.readFileSync(path.join(root, 'src/api/b2bProfile.ts'), 'utf8')
const screenSource = fs.readFileSync(path.join(root, 'src/screens/profile/B2BProfileScreen.tsx'), 'utf8')
const wrapperSource = fs.readFileSync(path.join(root, 'src/screens/profile/ProfileScreen.tsx'), 'utf8')
const navigationSource = fs.readFileSync(path.join(root, 'src/navigation/index.tsx'), 'utf8')

test('B2B role reads use canonical role-protected server endpoints', () => {
  assert.match(apiSource, /getStudentProfile[\s\S]*'\/roster\/student\/master-profile'/)
  assert.match(apiSource, /getTeacherProfile[\s\S]*'\/roster\/teacher\/master-profile'/)
  assert.match(apiSource, /getPrincipalProfile[\s\S]*'\/analytics\/principal-dashboard-lab'/)
})

test('profile cache projections drop unused master-profile and dashboard payload fields', () => {
  assert.match(apiSource, /getStudentProfile[\s\S]*subjects: \(data\.subjects \?\? \[\]\)\.map/)
  assert.match(apiSource, /getTeacherProfile[\s\S]*subject_mappings: \(data\.subject_mappings \?\? \[\]\)\.map[\s\S]*pending_update_request: data\.pending_update_request/)
  assert.match(apiSource, /getPrincipalProfile[\s\S]*profile: data\.profile,[\s\S]*filters: data\.filters,[\s\S]*summary: data\.summary/)
  assert.equal([...apiSource.matchAll(/return response\.data/g)].length, 1)
  assert.doesNotMatch(apiSource, /password_masked|password_is_set/)
})

test('only teacher approval is exposed as a B2B profile mutation', () => {
  const mutationCalls = [...apiSource.matchAll(/apiClient\.(?:post|patch|put|delete)/g)]
  assert.equal(mutationCalls.length, 1)
  assert.match(apiSource, /submitTeacherProfileUpdate[\s\S]*'\/roster\/teacher\/profile-update-request'/)
  assert.doesNotMatch(apiSource, /submitStudent|updateStudent|submitPrincipal|updatePrincipal/)
})

test('teacher editor loads canonical web-parity dropdown data', () => {
  assert.match(apiSource, /listTeacherProfileSubjects[\s\S]*'\/subjects'/)
  assert.match(screenSource, /authApi\.listOfferings/)
  assert.match(screenSource, /<MultiSelectField[\s\S]*label="Standards"/)
  assert.match(screenSource, /<MultiSelectField[\s\S]*label="Divisions"/)
  assert.match(screenSource, /<MultiSelectField[\s\S]*label="Subjects"/)
})

test('B2C profile behavior is retained behind the existing role branch', () => {
  assert.match(wrapperSource, /role !== 'b2c_student'[\s\S]*<B2BProfileScreen/)
  assert.match(wrapperSource, /<B2CProfileScreen \{\.\.\.props\}/)
  assert.match(wrapperSource, /queryKey: \['b2c-profile', accountKey\]/)
})

test('B2B private profile queries are account-scoped and staff profile is role-limited', () => {
  assert.match(screenSource, /queryKey: \['b2b-profile', accountKey, 'student'\]/)
  assert.match(screenSource, /queryKey: \['b2b-profile', accountKey, 'teacher'\]/)
  assert.match(screenSource, /queryKey: \['b2b-profile', accountKey, 'principal'\]/)
  assert.match(navigationSource, /user\.role === 'teacher' \|\| user\.role === 'principal'/)
  assert.match(navigationSource, /name="StaffProfile"/)
})

test('teacher save and password reset paths guard duplicate taps', () => {
  assert.match(screenSource, /if \(!updateMutation\.isPending\) updateMutation\.mutate\(\)/)
  assert.match(screenSource, /if \(!resetMutation\.isPending\) resetMutation\.mutate\(\)/)
  assert.match(screenSource, /accessibilityState=\{\{ disabled: saving, busy: saving \}\}/)
})

test('teacher request status yields to canonical server data after approval', () => {
  assert.match(screenSource, /if \(!teacher\.pending_update_request\) setSubmittedRequest\(null\)/)
})
