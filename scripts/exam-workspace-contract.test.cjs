const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('the B2B learner workspace keeps teacher and owned-practice contracts separate', () => {
  const examsApi = read('src/api/exams.ts')
  const screen = read('src/screens/workspace/ExamsScreen.tsx')
  const home = read('src/screens/home/HomeScreen.tsx')
  const learning = read('src/screens/learning/LearningHomeScreen.tsx')

  assert.match(examsApi, /apiClient\.get<StudentExamRead\[]>\('\/exams\/student'\)/)
  assert.match(examsApi, /params:\s*\{\s*scope:\s*'mine',\s*limit:\s*200\s*\}/)
  assert.match(screen, /role === 'student'/)
  assert.match(screen, /label="Teacher"/)
  assert.match(screen, /label="Practice"/)
  assert.match(screen, /label="More"/)
  assert.match(screen, /function PaperActionsSheet/)
  assert.match(screen, /Download checked PDF/)
  assert.match(screen, /Start a fresh retest/)
  assert.doesNotMatch(screen, /function ExamsPhotoHeader/)
  assert.match(home, /screen:\s*"Exams"/)
  assert.match(learning, /destination:\s*'Exams'/)
  assert.match(learning, /b2bOnly:\s*true/)
})

test('download, retest, and owned-paper deletion use the website production contracts', () => {
  const examsApi = read('src/api/exams.ts')
  const papersApi = read('src/api/papers.ts')
  const checkedApi = read('src/api/checkedPapers.ts')
  const screen = read('src/screens/workspace/ExamsScreen.tsx')

  assert.match(checkedApi, /`\/checked-papers\/\$\{id\}\/download`/)
  assert.match(papersApi, /`\/papers\/\$\{paperId\}\/attempts`/)
  assert.match(screen, /reason:\s*'retest'/)
  assert.match(screen, /exam_id:\s*target\.examId/)
  assert.match(examsApi, /apiClient\.delete\(`\/papers\/\$\{paperId\}`\)/)
  assert.doesNotMatch(examsApi, /delete\(`\/exams\/\$\{examId\}`/)
})

test('retest creates a fresh cached attempt and preserves the prior result', () => {
  const screen = read('src/screens/workspace/ExamsScreen.tsx')

  assert.match(screen, /queryClient\.setQueryData/)
  assert.match(screen, /`retest-\$\{attempt\.id\}`/)
  assert.match(screen, /Your previous result remains saved/)
  assert.match(screen, /Teacher-assigned exams are never deleted here/)
})
