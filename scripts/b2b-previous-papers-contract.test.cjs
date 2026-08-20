const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('the client uses the backend-enforced school catalogs without tenant selectors', () => {
  const api = read('src/api/previousPapers.ts')
  const screen = read('src/screens/learning/SchoolPreviousPapersScreen.tsx')

  assert.match(api, /'\/question-papers\/student'/)
  assert.match(api, /'\/question-papers\/teacher'/)
  assert.match(api, /subject_id: filters\.subject_id/)
  assert.doesNotMatch(api, /school_id:|branch_id:|board:|standard:|division:/)
  assert.match(api, /resolveSchoolQuestionPaperFileUrl\(url, API_BASE_URL\)/)
  assert.match(screen, /papersApi\.list\(\{ status: 'published', limit: 100 \}\)/)
})

test('student attempts reuse the canonical flow and teacher cards never receive attempt actions', () => {
  const screen = read('src/screens/learning/SchoolPreviousPapersScreen.tsx')
  const model = read('src/screens/learning/schoolPreviousPapersModel.ts')
  const detail = read('src/screens/papers/PaperDetailScreen.tsx')

  assert.match(screen, /screen: 'AttemptPaper'[\s\S]*returnTo: 'PreviousPapers'/)
  assert.match(screen, /navigation\.navigate\('StaffPapers',[\s\S]*screen: 'PaperDetail'[\s\S]*presentation: 'teacher_reference'/)
  assert.match(model, /role === 'student'.*\['attempt'\]/)
  assert.match(model, /role === 'teacher'.*\['open_details'\]/)
  assert.doesNotMatch(model, /role === 'teacher'.*\['attempt'\]/)
  assert.match(detail, /enabled: Boolean\(paper && !isTeacherReference\)/)
  assert.match(detail, /isTeacherReference \? \(/)
  assert.match(detail, /Download teacher reference PDF/)
})

test('role-specific queries are account scoped and duplicate opening is guarded', () => {
  const screen = read('src/screens/learning/SchoolPreviousPapersScreen.tsx')

  assert.match(screen, /accountCacheScope\(user\)/)
  assert.match(screen, /queryKey: \['school-previous-papers', accountKey/)
  assert.match(screen, /queryKey: \['papers', accountKey/)
  assert.match(screen, /if \(openingRef\.current \|\| !role\) return/)
  assert.match(screen, /if \(!downloadMutation\.isPending\) downloadMutation\.mutate\(paper\)/)
})

test('B2C stays on the competitive implementation while school roles use the school screen', () => {
  const wrapper = read('src/screens/learning/PreviousPapersScreen.tsx')
  const catalog = read('src/data/mobileControlCatalog.ts')

  assert.match(wrapper, /role === 'student' \|\| role === 'teacher'/)
  assert.match(wrapper, /return <SchoolPreviousPapersScreen \/>/)
  assert.match(wrapper, /return <CompetitivePreviousPapersScreen \/>/)
  assert.match(catalog, /roles: \['student', 'b2c_student', 'teacher'\]/)
})
