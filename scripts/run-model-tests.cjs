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
  'src/screens/learning/agenticLearningModel.ts',
  'src/screens/learning/previousPapersModel.ts',
  'src/screens/papers/paperAttemptModel.ts',
  'src/screens/papers/paperDetailModel.ts',
  'src/screens/workspace/examWorkspaceModel.ts',
  'src/utils/mathText.ts',
  'src/utils/protectedDocumentModel.ts',
  'src/auth/queryCacheScope.ts',
  'src/auth/roles.ts',
  'src/auth/landing.ts',
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
    file: 'scripts/agentic-learning-model.test.cjs',
    env: { AGENTIC_LEARNING_MODEL_PATH: path.join(outDir, 'screens/learning/agenticLearningModel.js') },
  },
  {
    file: 'scripts/previous-papers-model.test.cjs',
    env: { PREVIOUS_PAPERS_MODEL_PATH: path.join(outDir, 'screens/learning/previousPapersModel.js') },
  },
  {
    file: 'scripts/paper-attempt-model.test.cjs',
    env: { PAPER_ATTEMPT_MODEL_PATH: path.join(outDir, 'screens/papers/paperAttemptModel.js') },
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
    file: 'scripts/exam-workspace-contract.test.cjs',
    env: {},
  },
  {
    file: 'scripts/paper-detail-contract.test.cjs',
    env: {},
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
    file: 'scripts/previous-papers-access.test.cjs',
    env: { LANDING_MODEL_PATH: path.join(outDir, 'auth/landing.js') },
  },
  {
    file: 'scripts/previous-papers-navigation.test.cjs',
    env: {},
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
