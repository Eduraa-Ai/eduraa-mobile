const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('doubt creation is idempotent, attachment-free, and revision-aware', () => {
  const api = read('src/api/doubts.ts')
  const screen = read('src/screens/workspace/DoubtsScreen.tsx')

  assert.match(api, /'Idempotency-Key': input\.client_request_id/)
  assert.match(api, /expected_revision: expectedRevision/)
  assert.doesNotMatch(api, /FormData|attachment|image-picker/i)
  assert.match(screen, /createMutation\.isPending/)
  assert.match(screen, /AsyncStorage\.setItem\(storageKey/)
  assert.match(screen, /AsyncStorage\.removeItem\(storageKey\)/)
  assert.match(screen, /JSON\.stringify\(draftRef\.current\)/)
  assert.match(screen, /accepted\.current = true/)
  assert.match(screen, /Your draft is safe/)
})

test('both roles have native routes and unauthorized thread failures recover', () => {
  const navigation = read('src/navigation/index.tsx')
  const catalog = read('src/data/mobileControlCatalog.ts')
  const home = read('src/screens/home/HomeScreen.tsx')
  const screen = read('src/screens/workspace/DoubtsScreen.tsx')

  assert.match(navigation, /Doubts: 'student\/doubts\/\:doubtId\?'/)
  assert.match(navigation, /Doubts: 'teacher\/doubts\/\:doubtId\?'/)
  assert.match(catalog, /id: 'doubts'[\s\S]*roles: \['student', 'teacher'\]/)
  assert.match(home, /navigation\.navigate\("Doubts"\)/)
  assert.match(screen, /This thread is no longer available/)
  assert.match(screen, /Your access changed/)
})
