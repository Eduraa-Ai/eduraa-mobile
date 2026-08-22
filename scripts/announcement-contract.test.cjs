const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('registers role-safe announcement navigation for teacher workspace and student home', () => {
  const catalog = read('src/data/mobileControlCatalog.ts')
  const navigation = read('src/navigation/index.tsx')
  const workspace = read('src/screens/workspace/WorkspaceScreen.tsx')
  const home = read('src/screens/home/HomeScreen.tsx')
  assert.match(catalog, /id: 'announcements'[\s\S]*roles: \['student', 'teacher', 'principal'\][\s\S]*nativeStatus: 'native'/)
  assert.match(navigation, /Announcements: 'announcements\/:announcementId\?'/)
  assert.match(workspace, /control\.id === 'announcements'/)
  assert.match(home, /label: "School announcements"/)
})

test('uses separate draft, publish, archive, detail, and read API transitions', () => {
  const api = read('src/api/announcements.ts')
  assert.match(api, /post<Announcement>\('\/communication\/announcements', payload\)/)
  assert.match(api, /put<Announcement>/)
  assert.match(api, /\/publish`/)
  assert.match(api, /\/archive`/)
  assert.match(api, /\/read`/)
})

test('screen protects duplicate publication and preserves unfinished text locally', () => {
  const screen = read('src/screens/workspace/AnnouncementsScreen.tsx')
  assert.match(screen, /publishLock\.current/)
  assert.match(screen, /AsyncStorage\.setItem\(storageKey/)
  assert.match(screen, /validateAnnouncementDraft/)
  assert.match(screen, /reconcileAnnouncements/)
})
