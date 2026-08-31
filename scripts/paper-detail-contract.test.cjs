const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const detailSource = fs.readFileSync(path.join(root, 'src/screens/papers/PaperDetailScreen.tsx'), 'utf8')
const attemptSource = fs.readFileSync(path.join(root, 'src/screens/papers/AttemptPaperScreen.tsx'), 'utf8')
const listSource = fs.readFileSync(path.join(root, 'src/screens/papers/PapersScreen.tsx'), 'utf8')
const apiSource = fs.readFileSync(path.join(root, 'src/api/papers.ts'), 'utf8')
const editorSource = fs.readFileSync(path.join(root, 'src/screens/papers/PaperQuestionEditor.tsx'), 'utf8')
const resultDetailSource = fs.readFileSync(path.join(root, 'src/screens/results/ResultDetailScreen.tsx'), 'utf8')
const checkedPaperWorkspaceSource = fs.readFileSync(path.join(root, 'src/screens/results/CheckedPaperWorkspaceScreen.tsx'), 'utf8')
const resultsLibrarySource = fs.readFileSync(path.join(root, 'src/screens/results/CheckedPapersLibraryScreen.tsx'), 'utf8')
const resultsNavigationSource = fs.readFileSync(path.join(root, 'src/navigation/paperResultsNavigation.ts'), 'utf8')

test('paper detail keeps retest, download, and owned-paper delete in the top-right action area', () => {
  assert.match(detailSource, /headerRight/)
  assert.match(detailSource, /label=\{isTeacherReference \? ["']Download paper PDF["'] : ["']Paper actions["']\}/)
  assert.match(detailSource, /accessibilityLabel="Start a fresh retest"/)
  assert.match(detailSource, /accessibilityLabel="Download paper PDF"/)
  assert.match(detailSource, /accessibilityLabel="Delete paper"/)
  assert.match(detailSource, /canDelete \?/)
})

test('teacher references do not request attempts or expose learner paper actions', () => {
  assert.match(detailSource, /params\.presentation === ["']teacher_reference["']/)
  assert.match(detailSource, /enabled: Boolean\(paper && !isTeacherReference\)/)
  assert.match(detailSource, /if \(paper && !isTeacherReference\) void attemptsQuery\.refetch\(\)/)
  assert.match(detailSource, /Download teacher reference PDF/)
  assert.match(detailSource, /const canDelete = !isTeacherReference/)
})

test('delete requires the Eduraa confirmation sheet and calls the production paper route', () => {
  assert.match(detailSource, /Delete this paper\?/)
  assert.match(detailSource, /Confirm delete paper/)
  assert.match(detailSource, /Teacher-assigned papers cannot be deleted/)
  assert.match(apiSource, /apiClient\.delete\(`\/papers\/\$\{paperId\}`\)/)
})

test('submission refreshes every paper state surface and suppresses checking placeholder scores', () => {
  assert.match(attemptSource, /resultIsReady && data\.total_score/)
  assert.match(attemptSource, /invalidateQueries\(\{ queryKey: \['papers'\] \}\)/)
  assert.match(attemptSource, /paper-attempts-detail/)
  assert.match(listSource, /item\.is_submitted_by_me \? ["']Attempted["']/)
})

test('result and fresh-attempt actions are explicit rather than conflated', () => {
  assert.match(detailSource, /primaryAction === ["']view_results["']/)
  assert.match(detailSource, /primaryAction === ["']attempt_again["']/)
  assert.match(detailSource, /View Results/)
  assert.match(detailSource, /Retest/)
  assert.match(detailSource, /reason: ["']retest["']/)
})

test('submitted papers can always leave for learner or staff checked papers', () => {
  assert.match(resultsNavigationSource, /names\.includes\('Results'\)/)
  assert.match(resultsNavigationSource, /names\.includes\('StaffResults'\)/)
  assert.match(attemptSource, /Open checked papers/)
  assert.match(attemptSource, /navigateToCheckedPapers\(navigation, submitOutcome\.submissionId\)/)
  assert.match(
    detailSource,
    /navigateToCheckedPapers\(\s*navigation,\s*submittedAttempt\.id,?\s*\)/,
  )
  assert.match(resultDetailSource, /const goBack = \(\) => returnToCheckedPapers\(navigation\)/)
  assert.match(checkedPaperWorkspaceSource, /const goBack = \(\) => returnToCheckedPapers\(navigation\)/)
  assert.match(checkedPaperWorkspaceSource, /accessibilityLabel="Back to checked papers" onPress=\{goBack\}/)
  assert.match(resultDetailSource, /navigation\.navigate\('CheckedPaperWorkspace', \{ checkedPaperId: id \}\)/)

  assert.match(resultsLibrarySource, /navigation\.navigate\('CheckedPaperStatus', \{ checkedPaperId: paper\.id \}\)/)
  assert.match(resultsLibrarySource, /navigation\.navigate\('CheckedPaperWorkspace'/)
  assert.match(resultsLibrarySource, /navigation\.navigate\('ResultDetail', \{ checkedPaperId: paper\.id \}\)/)
  assert.match(resultsLibrarySource, /needsInput \? `Check \$\{reviewCount \|\| ''\}`\.trim\(\) : 'View'/)
})

test('teacher draft paper detail provides inline question and image editing with production endpoints', () => {
  assert.match(detailSource, /const canEditPaper = isTeacher && !isTeacherReference/)
  assert.match(detailSource, /<PaperQuestionEditor/)
  assert.match(detailSource, /YOUR PAPER/)
  assert.match(detailSource, /Tap to edit/)
  assert.match(detailSource, /Ask AI to change anything/)
  assert.match(detailSource, /HeaderPublishAction/)
  assert.match(editorSource, /Camera/)
  assert.match(editorSource, /Gallery/)
  assert.match(editorSource, /Files/)
  assert.match(editorSource, /your work stays here if saving fails/)
  assert.match(apiSource, /`\/papers\/\$\{paperId\}\/questions\/\$\{questionNumber\}`/)
  assert.match(apiSource, /`\/papers\/\$\{paperId\}\/questions\/\$\{questionNumber\}\/visual`/)
  assert.match(apiSource, /visual_payload: null/)
  assert.match(detailSource, /runInstructionMutation/)
  assert.match(detailSource, /AsyncStorage\.setItem/)
  assert.match(detailSource, /pendingPaperInstruction/)
  assert.match(apiSource, /pending_instruction: input\.pendingInstruction/)
  assert.match(detailSource, /paperChatMessages\.map/)
  assert.match(detailSource, /message\.role === ["']user["']/)
  assert.doesNotMatch(detailSource, /resolveDirectPaperInstruction/)
  assert.match(detailSource, /Done — I updated your paper/)
  assert.match(apiSource, /runPaperInstruction/)
  assert.match(apiSource, /paper_context: input\.paperContext/)
  assert.match(apiSource, /chat_history: input\.chatHistory\.slice\(-6\)/)
  assert.match(apiSource, /dry_run: false/)
})

test('teacher checked-paper report states publication plainly', () => {
  assert.match(resultDetailSource, /'Published to student\.'/)
  assert.match(resultDetailSource, /'Suggested marks ready\.\\nNot published yet\.'/)
  assert.match(resultDetailSource, /'Marks confirmed\.\\nNot published yet\.'/)
  assert.match(resultDetailSource, /'Review and confirm marks'/)
  assert.match(resultDetailSource, /'Continue to publish'/)
  assert.match(resultDetailSource, /isStaff \? 'Teacher result' : 'Performance report'/)
})

test('terminal scan status cannot show ready before review data is available', () => {
  const statusSource = fs.readFileSync(path.join(root, 'src/screens/workspace/CheckedPaperStatusScreen.tsx'), 'utf8')
  assert.match(statusSource, /checkedPaperReviewExperienceStatus\(paper\) === 'checking'/)
  assert.match(resultDetailSource, /checkedPaperReviewExperienceStatus\(data\)/)
  assert.match(resultDetailSource, /isChecking\s*\n\s*\? 'Checking'/)
  assert.match(resultDetailSource, /'Preparing review details'/)
})

test('result detail shows server-backed checking time without a reset-prone local counter', () => {
  assert.match(resultDetailSource, /checkedPaperElapsedSeconds\(data, stopwatchNow\)/)
  assert.match(resultDetailSource, /'Elapsed' : 'Checked in'/)
  assert.match(resultDetailSource, /accessibilityLabel=\{isChecking \? `Checking elapsed time/)
  assert.match(resultDetailSource, /buildCheckedPaperStageTimeline\(data, stopwatchNow\)/)
  assert.match(resultDetailSource, /Checking timeline/)
  assert.match(resultDetailSource, /Time spent at each processing stage/)
})
