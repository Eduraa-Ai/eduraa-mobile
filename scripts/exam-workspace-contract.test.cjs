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
  assert.match(home, /navigate\("Exams"\)/)
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
  assert.match(examsApi, /apiClient\.delete\(`\/exams\/\$\{examId\}`\)/)
  assert.match(screen, /label="Delete exam"/)
  assert.match(screen, /confirmDestructive\(/)
  assert.match(screen, /Linked papers will stay in your paper library\./)
  assert.match(screen, /deleteExamMutation\.isPending/)
})

test('retest creates a fresh cached attempt and preserves the prior result', () => {
  const screen = read('src/screens/workspace/ExamsScreen.tsx')

  assert.match(screen, /queryClient\.setQueryData/)
  assert.match(screen, /`retest-\$\{attempt\.id\}`/)
  assert.match(screen, /Your previous result remains saved/)
  assert.match(screen, /Teacher-assigned exams are never deleted here/)
})

test('scan options refresh when an exam or eligible paper changes', () => {
  const scanApi = read('src/api/scanUpload.ts')
  const scanScreen = read('src/screens/workspace/ScanUploadScreen.tsx')
  const examsScreen = read('src/screens/workspace/ExamsScreen.tsx')
  const customPaperScreen = read('src/screens/papers/CustomPaperScreen.tsx')
  const paperDetailScreen = read('src/screens/papers/PaperDetailScreen.tsx')
  const invalidatesScanOptions = /invalidateQueries\(\{\s*queryKey:\s*SCAN_UPLOAD_OPTIONS_QUERY_KEY,?\s*\}\)/

  assert.match(scanApi, /SCAN_UPLOAD_OPTIONS_QUERY_KEY = \['scan-upload', 'options'\] as const/)
  assert.match(scanScreen, /queryKey: SCAN_UPLOAD_OPTIONS_QUERY_KEY/)
  assert.match(examsScreen, invalidatesScanOptions)
  assert.match(customPaperScreen, invalidatesScanOptions)
  assert.match(paperDetailScreen, invalidatesScanOptions)
})

test('native scan uploads use Expo file-backed multipart while web keeps Axios', () => {
  const client = read('src/api/client.ts')
  const scanApi = read('src/api/scanUpload.ts')
  const scanScreen = read('src/screens/workspace/ScanUploadScreen.tsx')
  const scanDraft = read('src/screens/workspace/scanUploadDraft.ts')

  assert.match(scanApi, /new ExpoFile\(file\.uri\)/)
  assert.match(scanApi, /authenticatedFetch\(`\$\{API_BASE_URL\}\/api\/v1\/checked-papers\/scan`/)
  assert.match(scanApi, /if \(Platform\.OS !== 'web'\) return uploadNative\(payload\)/)
  assert.match(scanApi, /apiClient\.post<ScanUploadReceipt>\('\/checked-papers\/scan'/)
  // The scan is queued server-side, so the client resolves the paper by polling.
  assert.match(scanApi, /checked-papers\/uploads\/\$\{uploadId\}/)
  assert.match(scanApi, /async awaitCheckedPaper\(/)
  assert.match(scanDraft, /pendingUpload: ScanUploadReceipt \| null/)
  assert.match(scanDraft, /clientUploadId: string/)
  assert.match(scanApi, /'Idempotency-Key': payload\.clientUploadId/)
  assert.match(scanScreen, /pendingUpload: receipt/)
  assert.match(scanScreen, /Resume checking/)
  assert.match(scanScreen, /Upload next answer sheet/)
  assert.doesNotMatch(scanScreen, /Stop waiting/)
  assert.match(scanScreen, /Checking continues in the background…/)
  assert.match(scanScreen, /Confirming receipt…/)
  assert.match(scanScreen, /if \(uploadMutationGuardRef\.current\) return/)
  assert.match(client, /response\.status !== 401/)
  assert.match(client, /refreshAccessToken\(\)/)
  assert.match(scanApi, /Your selections are still here/)
  assert.match(scanScreen, /typeof detail === 'object'/)
})

test('replace-paper recovery preserves the original roster and paper context', () => {
  const navigation = read('src/navigation/index.tsx')
  const statusScreen = read('src/screens/workspace/CheckedPaperStatusScreen.tsx')
  const scanScreen = read('src/screens/workspace/ScanUploadScreen.tsx')

  assert.match(navigation, /export type ScanUploadParams/)
  assert.match(statusScreen, /initialPaperId: data\?\.paper_id/)
  assert.match(statusScreen, /initialStudentId: data\?\.student_id/)
  assert.match(scanScreen, /useState\(initial\?\.initialStudentId \?\? ''\)/)
  assert.match(scanScreen, /initial\.initialPaperId\)\?\.source_type === 'custom_paper'/)
})

test('replacement upload state is refreshed and completed AI marks have a single audited confirmation action', () => {
  const scanScreen = read('src/screens/workspace/ScanUploadScreen.tsx')
  const statusScreen = read('src/screens/workspace/CheckedPaperStatusScreen.tsx')

  assert.match(scanScreen, /setQueryData\(\['checked-paper', paper\.id\], paper\)/)
  assert.match(statusScreen, /data\?\.can_save_review/)
  assert.match(statusScreen, /label="Confirm reviewed marks"/)
  assert.match(statusScreen, /checkedPapersApi\.updateTeacherReview/)
  assert.match(statusScreen, /label="View scan evidence"/)
  assert.match(statusScreen, /Use suggested/)
  assert.match(statusScreen, /Inspect or edit \$\{reviewResults\.length\} marks/)
  assert.match(statusScreen, /This is optional\. Inspect only the question marks you want to verify or change\./)
  assert.match(statusScreen, /student_answer_summary/)
  assert.doesNotMatch(statusScreen, /Re-grade|Re-run AI grading/)
})

test('exam setup cascades teacher, subject, class, and paper context', () => {
  const examsApi = read('src/api/exams.ts')
  const screen = read('src/screens/workspace/ExamsScreen.tsx')

  assert.match(examsApi, /subject_id: subjectId \|\| undefined/)
  assert.match(screen, /handleTeacherChange/)
  assert.match(screen, /handleSubjectChange/)
  assert.match(screen, /handleStandardChange/)
  assert.match(screen, /handleDivisionChange/)
  assert.match(screen, /applyPaperDefaults/)
  assert.match(screen, /Select teacher first/)
  assert.match(screen, /Select subject first/)
})

test('exam setup follows the restrained scan-upload composition', () => {
  const screen = read('src/screens/workspace/ExamsScreen.tsx')

  assert.match(screen, /EXAM SETUP/)
  assert.match(screen, /Choose class and subject/)
  assert.match(screen, /Choose paper and name/)
  assert.match(screen, /Student experience/)
  assert.match(screen, /style=\{styles\.workflowSurface\}/)
  assert.match(screen, /styles\.submitSurface, formReady && styles\.submitSurfaceReady/)
  assert.match(screen, /tone="auth"/)
  assert.match(screen, /ambient=\{false\}/)
  assert.match(screen, /accessibilityRole="switch"/)
  assert.doesNotMatch(screen, /<GradientHeroCard/)
})

test('existing staff exams render as compact operational records', () => {
  const screen = read('src/screens/workspace/ExamsScreen.tsx')

  assert.match(screen, /styles\.staffExamRecord/)
  assert.match(screen, /Manage schedules, papers, and student visibility\./)
  assert.match(screen, /\{exams\.length\} total/)
  assert.match(screen, /No time limit/)
  assert.match(screen, /Not published/)
  assert.match(screen, /label="Edit exam"/)
  assert.match(screen, /visiblePapers = linkedPapers\.slice\(0, 2\)/)
  assert.doesNotMatch(screen, /<MetricTile/)
})

test('teacher result routes use issue-specific decisions instead of a generic blocker label', () => {
  const resultDetail = read('src/screens/results/ResultDetailScreen.tsx')
  const statusScreen = read('src/screens/workspace/CheckedPaperStatusScreen.tsx')
  const libraryScreen = read('src/screens/results/CheckedPapersLibraryScreen.tsx')

  assert.match(resultDetail, /buildTeacherPaperDecision/)
  assert.match(resultDetail, /teacherDecision\.actionLabel/)
  assert.doesNotMatch(resultDetail, /Review paper issue/)
  assert.match(statusScreen, /teacherDecision\?\.title/)
  assert.match(statusScreen, /publication remains a separate action/)
  assert.match(libraryScreen, /Platform\.OS === 'web' \? undefined : 'button'/)
})
