const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const detailSource = fs.readFileSync(path.join(root, 'src/screens/papers/PaperDetailScreen.tsx'), 'utf8')
const attemptSource = fs.readFileSync(path.join(root, 'src/screens/papers/AttemptPaperScreen.tsx'), 'utf8')
const listSource = fs.readFileSync(path.join(root, 'src/screens/papers/PapersScreen.tsx'), 'utf8')
const apiSource = fs.readFileSync(path.join(root, 'src/api/papers.ts'), 'utf8')

test('paper detail keeps retest, download, and owned-paper delete in the top-right action area', () => {
  assert.match(detailSource, /headerRight/)
  assert.match(detailSource, /label="Paper actions"/)
  assert.match(detailSource, /accessibilityLabel="Start a fresh retest"/)
  assert.match(detailSource, /accessibilityLabel="Download paper PDF"/)
  assert.match(detailSource, /accessibilityLabel="Delete paper"/)
  assert.match(detailSource, /canDelete \?/)
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
  assert.match(listSource, /item\.is_submitted_by_me \? 'Attempted'/)
})

test('result and fresh-attempt actions are explicit rather than conflated', () => {
  assert.match(detailSource, /primaryAction === 'view_results'/)
  assert.match(detailSource, /primaryAction === 'attempt_again'/)
  assert.match(detailSource, /View My Results/)
  assert.match(detailSource, /Attempt Again/)
  assert.match(detailSource, /reason: 'retest'/)
})
