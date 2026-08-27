const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const screen = fs.readFileSync(path.join(root, 'src/screens/results/CheckedPapersLibraryScreen.tsx'), 'utf8')
const api = fs.readFileSync(path.join(root, 'src/api/checkedPapers.ts'), 'utf8')
const types = fs.readFileSync(path.join(root, 'src/types/index.ts'), 'utf8')

test('checked-paper deletion is exposed only when the backend grants the capability', () => {
  assert.match(types, /can_delete\?: boolean/)
  assert.match(screen, /const canDelete = isStaff && paper\.can_delete === true/)
  assert.match(screen, /if \(!isStaff \|\| paper\.can_delete !== true \|\| deleteMutation\.isPending\) return/)
})

test('checked-paper deletion uses the canonical encoded API route', () => {
  assert.match(api, /apiClient\.delete\(`\/checked-papers\/\$\{encodeURIComponent\(id\)\}`\)/)
})

test('delete is separated from card navigation and requires explicit confirmation', () => {
  assert.match(screen, /event\.stopPropagation\(\)/)
  assert.match(screen, /Delete checked paper\?/)
  assert.match(screen, /accessibilityLabel="Confirm delete checked paper"/)
  assert.match(screen, /This cannot be undone\./)
})

test('successful deletion removes stale list and detail cache entries', () => {
  assert.match(screen, /current\?\.filter\(\(paper\) => paper\.id !== deletedId\)/)
  assert.match(screen, /removeQueries\(\{ queryKey: \['checked-paper', deletedId\] \}\)/)
})
