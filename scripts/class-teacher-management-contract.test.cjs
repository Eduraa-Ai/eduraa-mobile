const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const root = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('class teacher assignment APIs use the existing web/backend endpoints', () => {
  const source = read('src/api/classTeacher.ts')
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
  assert.match(source, /Assignments submitted for principal approval\./)
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

test('the enrollment API sends the committed roster before slow catalog syncing', () => {
  const backendRoot = path.resolve(root, '..', 'AI_Question_Paper_System', 'eduraa-ai', 'backend')
  const service = fs.readFileSync(path.join(backendRoot, 'app', 'services', 'class_management_service.py'), 'utf8')
  const route = fs.readFileSync(path.join(backendRoot, 'app', 'api', 'v1', 'class_teacher.py'), 'utf8')
  assert.match(service, /sync_catalog: bool = False/)
  assert.match(service, /async def sync_subject_enrollment_catalog\(/)
  assert.match(route, /background_tasks: BackgroundTasks/)
  assert.match(route, /background_tasks\.add_task\([\s\S]*?_sync_subject_enrollment_catalog_after_response/)
})

test('timeouts are not misreported as an offline request that was never sent', () => {
  const errors = read('src/api/errors.ts')
  assert.match(errors, /\| 'timeout'/)
  assert.match(errors, /axiosError\?\.code === 'ECONNABORTED'/)
  assert.match(errors, /kind: ApiFailureKind = isTimeout \? 'timeout' : isNetwork \? 'offline' : 'unknown'/)
})
