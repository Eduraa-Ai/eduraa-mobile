const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const root = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('class teacher assignment APIs use the existing web/backend endpoints', () => {
  const source = read('src/api/classTeacher.ts')
  assert.match(source, /getOptions\(standard\?[\s\S]*?\/class-teacher\/options/)
  assert.match(source, /updateProfile\(input[\s\S]*?\/class-teacher\/opt-in/)
  assert.match(source, /getAssignmentTeachers\(\)[\s\S]*?\/class-teacher\/teachers/)
  assert.match(source, /getMyRequests\(\)[\s\S]*?\/class-teacher\/requests\/me/)
  assert.match(source, /createRequest\(assignments[\s\S]*?post<ClassTeacherRequest>\('\/class-teacher\/requests'/)
  assert.match(source, /classTeacherAssignmentSubjects/)
})

test('assignment management presents server status and protects duplicate writes', () => {
  const source = read('src/screens/classTeacher/ClassTeacherAssignmentsScreen.tsx')
  assert.match(source, /activeRequest\.status === 'pending'/)
  assert.match(source, /activeRequest\.status === 'approved'/)
  assert.match(source, /selectedTeacherIds\.size !== rows\.length/)
  assert.match(source, /submitGuard\.current/)
  assert.match(source, /profileSubmitGuard\.current/)
  assert.match(source, /activeRequest\.status === 'rejected'/)
  assert.match(source, /rejection_reason/)
  assert.match(source, /Assignments submitted for principal approval\./)
})

test('first-time teachers can enter setup and management waits for approval', () => {
  const catalog = read('src/data/mobileControlCatalog.ts')
  const assignments = read('src/screens/classTeacher/ClassTeacherAssignmentsScreen.tsx')
  const overview = read('src/screens/classTeacher/ClassTeacherOverviewScreen.tsx')

  const entry = catalog.match(/\{\s*id: 'class-teacher',[\s\S]*?\n  \},/)
  assert.ok(entry)
  assert.doesNotMatch(entry[0], /requiresClassTeacher: true/)
  assert.match(assignments, /Continue to teaching plan/)
  assert.match(assignments, /classTeacherApi\.updateProfile/)
  assert.match(overview, /enabled: access\.isAuthorized && planIsApproved/)
  assert.match(overview, /Plan awaiting approval/)
})

test('approved class access survives a pending or rejected plan revision', () => {
  const overview = read('src/screens/classTeacher/ClassTeacherOverviewScreen.tsx')
  assert.match(overview, /const approvedPlan = requestsQuery\.data\?\.find/)
  assert.match(overview, /const planIsApproved = Boolean\(approvedPlan\)/)
  assert.match(overview, /current approved class remains available/)
})

test('validation findings provide direct recovery actions', () => {
  const validation = read('src/screens/classTeacher/ClassValidationScreen.tsx')
  assert.match(validation, /navigation\.navigate\('ClassRoster'\)/)
  assert.match(validation, /navigation\.navigate\('ClassSubjects'\)/)
})

test('all class management screens preserve the selected class', () => {
  const hook = read('src/hooks/useClassTeacherAccess.ts')
  assert.match(hook, /export function useActiveClassSection/)

  for (const screen of [
    'ClassTeacherAssignmentsScreen.tsx',
    'ClassTeacherOverviewScreen.tsx',
    'ClassRosterScreen.tsx',
    'ClassSubjectsScreen.tsx',
    'ClassValidationScreen.tsx',
    'SubjectEnrollmentScreen.tsx',
  ]) {
    assert.match(read(`src/screens/classTeacher/${screen}`), /useActiveClassSection/)
  }
})

test('overview and subject setup consume the request cache', () => {
  const overview = read('src/screens/classTeacher/ClassTeacherOverviewScreen.tsx')
  const subjects = read('src/screens/classTeacher/ClassSubjectsScreen.tsx')
  const navigation = read('src/navigation/index.tsx')
  assert.match(overview, /classTeacherKeys\.requests/)
  assert.match(overview, /ClassTeacherAssignments/)
  assert.match(subjects, /mergeApprovedAssignmentSubjects/)
  assert.match(subjects, /request\?\.status !== 'approved'/)
  assert.match(navigation, /name="ClassTeacherAssignments"/)
})

test('subject setup keeps teacher-added optional subjects and saves without a blocking alert callback', () => {
  const subjects = read('src/screens/classTeacher/ClassSubjectsScreen.tsx')
  assert.match(subjects, /if \(draft\.subjects\.length > 0 \|\| request\?\.status !== 'approved'/)
  assert.match(subjects, /const handleSave = async \(\) => \{[\s\S]*?saveMutation\.mutate\(draftToPayload\(draft\)\)/)
  assert.match(subjects, /group_name: !subject\.is_mandatory \? null : subject\.group_name/)
})

test('subject enrollment persists removals directly and exposes in-screen save feedback', () => {
  const enrollment = read('src/screens/classTeacher/SubjectEnrollmentScreen.tsx')
  assert.match(enrollment, /const handleSave = async \(\) => \{[\s\S]*?saveMutation\.mutate\(\{ student_ids: \[\.\.\.selection\], select_all: everyone \}\)/)
  assert.match(enrollment, /setSaveNotice\('Enrollment saved\.'\)/)
  assert.match(enrollment, /\{saveError \? <Text style=\{styles\.errorNote\}>\{saveError\}<\/Text> : null\}/)
  assert.match(enrollment, /saveError\s*\?\s*'Retry save'/)
  assert.match(enrollment, /saveMutation\.isPending\s*\?\s*'Saving enrollment…'/)
})

test('timeouts are not misreported as an offline request that was never sent', () => {
  const errors = read('src/api/errors.ts')
  assert.match(errors, /\| 'timeout'/)
  assert.match(errors, /axiosError\?\.code === 'ECONNABORTED'/)
  assert.match(errors, /kind: ApiFailureKind = isTimeout \? 'timeout' : isNetwork \? 'offline' : 'unknown'/)
})
