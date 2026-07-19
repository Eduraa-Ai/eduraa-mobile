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
]

try {
  const tscBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc')
  execFileSync(
    tscBin,
    [...models, '--outDir', outDir, '--module', 'commonjs', '--target', 'es2020', '--esModuleInterop', '--skipLibCheck'],
    { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
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
