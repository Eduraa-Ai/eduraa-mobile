/**
 * Compiles the screen model modules to CommonJS in a temp directory and runs
 * their node:test suites. Usage: npm run test:models
 */
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const root = path.join(__dirname, '..')
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eduraa-model-tests-'))

const models = [
  'src/screens/results/checkedPapersLibraryModel.ts',
  'src/screens/results/checkedPaperDetailModel.ts',
  'src/screens/results/checkedPaperWorkspaceModel.ts',
  'src/screens/learning/agenticLearningModel.ts',
  'src/screens/learning/previousPapersModel.ts',
  'src/screens/learning/schoolPreviousPapersModel.ts',
  'src/screens/papers/generatePaperSettingsModel.ts',
  'src/screens/papers/customPaperModel.ts',
  'src/screens/papers/paperAttemptModel.ts',
  'src/screens/papers/paperDetailModel.ts',
  'src/screens/workspace/examWorkspaceModel.ts',
  'src/screens/workspace/approvalsModel.ts',
  'src/screens/workspace/announcementModel.ts',
  'src/screens/workspace/attendanceModel.ts',
  'src/screens/workspace/dashboardModel.ts',
  'src/screens/workspace/doubtWorkspaceModel.ts',
  'src/screens/workspace/checkedPaperPipelineModel.ts',
  'src/screens/workspace/scanUploadModel.ts',
  'src/navigation/paperResultsNavigation.ts',
  'src/utils/mathText.ts',
  'src/utils/mathContent.ts',
  'src/utils/protectedDocumentModel.ts',
  'src/utils/latex.ts',
  'src/utils/aiResponseContent.ts',
  'src/utils/questionVisual.ts',
  'src/utils/matchColumns.ts',
  'src/utils/bookPaperGeneration.ts',
  'src/auth/queryCacheScope.ts',
  'src/auth/roles.ts',
  'src/auth/landing.ts',
  'src/screens/profile/b2bProfileModel.ts',
]

const suites = [
  {
    file: 'scripts/checked-papers-model.test.cjs',
    env: { CHECKED_PAPERS_MODEL_PATH: path.join(outDir, 'screens/results/checkedPapersLibraryModel.js') },
  },
  {
    file: 'scripts/checked-paper-detail-model.test.cjs',
    env: { CHECKED_PAPER_DETAIL_MODEL_PATH: path.join(outDir, 'screens/results/checkedPaperDetailModel.js') },
  },
  {
    file: 'scripts/checked-paper-workspace-model.test.cjs',
    env: { CHECKED_PAPER_WORKSPACE_MODEL_PATH: path.join(outDir, 'screens/results/checkedPaperWorkspaceModel.js') },
  },
  {
    file: 'scripts/agentic-learning-model.test.cjs',
    env: { AGENTIC_LEARNING_MODEL_PATH: path.join(outDir, 'screens/learning/agenticLearningModel.js') },
  },
  {
    file: 'scripts/previous-papers-model.test.cjs',
    env: { PREVIOUS_PAPERS_MODEL_PATH: path.join(outDir, 'screens/learning/previousPapersModel.js') },
  },
  {
    file: 'scripts/school-previous-papers-model.test.cjs',
    env: { SCHOOL_PREVIOUS_PAPERS_MODEL_PATH: path.join(outDir, 'screens/learning/schoolPreviousPapersModel.js') },
  },
  {
    file: 'scripts/generate-paper-settings.test.cjs',
    env: { GENERATE_PAPER_SETTINGS_MODEL_PATH: path.join(outDir, 'screens/papers/generatePaperSettingsModel.js') },
  },
  {
    file: 'scripts/custom-paper-model.test.cjs',
    env: { CUSTOM_PAPER_MODEL_PATH: path.join(outDir, 'screens/papers/customPaperModel.js') },
  },
  {
    file: 'scripts/paper-attempt-model.test.cjs',
    env: { PAPER_ATTEMPT_MODEL_PATH: path.join(outDir, 'screens/papers/paperAttemptModel.js') },
  },
  {
    file: 'scripts/paper-attempt-session-contract.test.cjs',
    env: {},
  },
  {
    file: 'scripts/paper-detail-model.test.cjs',
    env: { PAPER_DETAIL_MODEL_PATH: path.join(outDir, 'screens/papers/paperDetailModel.js') },
  },
  {
    file: 'scripts/math-text.test.cjs',
    env: { MATH_TEXT_MODEL_PATH: path.join(outDir, 'utils/mathText.js') },
  },
  {
    file: 'scripts/exam-workspace-model.test.cjs',
    env: { EXAM_WORKSPACE_MODEL_PATH: path.join(outDir, 'screens/workspace/examWorkspaceModel.js') },
  },
  {
    file: 'scripts/checked-paper-pipeline-model.test.cjs',
    env: { CHECKED_PAPER_PIPELINE_MODEL_PATH: path.join(outDir, 'screens/workspace/checkedPaperPipelineModel.js') },
  },
  {
    file: 'scripts/scan-upload-model.test.cjs',
    env: { SCAN_UPLOAD_MODEL_PATH: path.join(outDir, 'screens/workspace/scanUploadModel.js') },
  },
  {
    file: 'scripts/exam-workspace-contract.test.cjs',
    env: {},
  },
  {
    file: 'scripts/approvals-model.test.cjs',
    env: { APPROVALS_MODEL_PATH: path.join(outDir, 'screens/workspace/approvalsModel.js') },
  },
  {
    file: 'scripts/b2b-approvals-contract.test.cjs',
    env: {},
  },
  {
    file: 'scripts/announcement-model.test.cjs',
    env: { ANNOUNCEMENT_MODEL_PATH: path.join(outDir, 'screens/workspace/announcementModel.js') },
  },
  {
    file: 'scripts/announcement-contract.test.cjs',
    env: {},
  },
  {
    file: 'scripts/doubt-workspace-model.test.cjs',
    env: { DOUBT_WORKSPACE_MODEL_PATH: path.join(outDir, 'screens/workspace/doubtWorkspaceModel.js') },
  },
  {
    file: 'scripts/doubt-workspace-contract.test.cjs',
    env: {},
  },
  {
    file: 'scripts/attendance-model.test.cjs',
    env: { ATTENDANCE_MODEL_PATH: path.join(outDir, 'screens/workspace/attendanceModel.js') },
  },
  {
    file: 'scripts/dashboard-model.test.cjs',
    env: { DASHBOARD_MODEL_PATH: path.join(outDir, 'screens/workspace/dashboardModel.js') },
  },
  {
    file: 'scripts/paper-detail-contract.test.cjs',
    env: {},
  },
  {
    file: 'scripts/paper-results-navigation.test.cjs',
    env: { PAPER_RESULTS_NAVIGATION_PATH: path.join(outDir, 'navigation/paperResultsNavigation.js') },
  },
  {
    file: 'scripts/math-content.test.cjs',
    env: { MATH_CONTENT_PATH: path.join(outDir, 'utils/mathContent.js') },
  },
  {
    file: 'scripts/checked-paper-access.test.cjs',
    env: {
      PROTECTED_DOCUMENT_MODEL_PATH: path.join(outDir, 'utils/protectedDocumentModel.js'),
      AUTH_ROLES_PATH: path.join(outDir, 'auth/roles.js'),
    },
  },
  {
    file: 'scripts/query-cache-scope.test.cjs',
    env: { QUERY_CACHE_SCOPE_PATH: path.join(outDir, 'auth/queryCacheScope.js') },
  },
  {
    file: 'scripts/auth-session-contract.test.cjs',
    env: {},
  },
  {
    file: 'scripts/previous-papers-access.test.cjs',
    env: { LANDING_MODEL_PATH: path.join(outDir, 'auth/landing.js') },
  },
  {
    file: 'scripts/previous-papers-navigation.test.cjs',
    env: {},
  },
  {
    file: 'scripts/b2b-previous-papers-contract.test.cjs',
    env: {},
  },
  {
    file: 'scripts/b2b-profile-contract.test.cjs',
    env: { B2B_PROFILE_MODEL_PATH: path.join(outDir, 'screens/profile/b2bProfileModel.js') },
  },
  {
    file: 'scripts/b2b-profile-integration-contract.test.cjs',
    env: {},
  },
  {
    file: 'scripts/learning-tab-removal.test.cjs',
    env: {},
  },
  {
    file: 'scripts/latex.test.cjs',
    env: { LATEX_MODEL_PATH: path.join(outDir, 'utils/latex.js') },
  },
  {
    file: 'scripts/ai-response-content.test.cjs',
    env: { AI_RESPONSE_CONTENT_PATH: path.join(outDir, 'utils/aiResponseContent.js') },
  },
  {
    file: 'scripts/question-visual.test.cjs',
    env: { QUESTION_VISUAL_MODEL_PATH: path.join(outDir, 'utils/questionVisual.js') },
  },
  {
    file: 'scripts/question-visual-prefetch.test.cjs',
    env: {},
  },
  {
    file: 'scripts/book-paper-generation.test.cjs',
    env: { BOOK_PAPER_GENERATION_MODEL_PATH: path.join(outDir, 'utils/bookPaperGeneration.js') },
  },
  {
    file: 'scripts/match-columns.test.cjs',
    env: { MATCH_COLUMNS_MODEL_PATH: path.join(outDir, 'utils/matchColumns.js') },
  },
]

try {
  const tscBin = require.resolve('typescript/bin/tsc')
  execFileSync(
    process.execPath,
    [tscBin, ...models, '--outDir', outDir, '--module', 'commonjs', '--target', 'es2020', '--esModuleInterop', '--skipLibCheck'],
    { cwd: root, stdio: 'inherit' },
  )

  for (const suite of suites) {
    execFileSync(process.execPath, ['--test', suite.file], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, ...suite.env },
    })
  }
} finally {
  fs.rmSync(outDir, { recursive: true, force: true })
}
