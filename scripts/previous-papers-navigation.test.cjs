const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('previous papers is an eligible final root tab with an accessible symbol', () => {
  const navigation = read('src/navigation/index.tsx')
  const bottomTabBar = read('src/components/ui/BottomTabBar.tsx')
  const profileIndex = navigation.indexOf('<Tab.Screen name="Profile"')
  const previousPapersIndex = navigation.indexOf('name="PreviousPapers"')

  assert.ok(profileIndex >= 0)
  assert.ok(previousPapersIndex > profileIndex)
  assert.match(navigation, /previousPapersEligible\s*\?\s*\(/)
  assert.match(navigation, /tabBarAccessibilityLabel:\s*'Previous-year JEE papers'/)
  assert.doesNotMatch(navigation, /<HomeStack\.Screen name="PreviousPapers"/)
  assert.match(bottomTabBar, /function ConstellationField\(/)
  assert.match(bottomTabBar, /PreviousPapers:\s*'documents-outline'/)
  assert.match(bottomTabBar, /options\?\.tabBarAccessibilityLabel \?\? label/)
  assert.match(bottomTabBar, /state\.routes\.length <= 6/)
})

test('the library back action falls back to Home without history', () => {
  const screen = read('src/screens/learning/PreviousPapersScreen.tsx')
  assert.match(screen, /navigation\.canGoBack\(\)/)
  assert.match(screen, /navigation\.navigate\('Home'\)/)
})

test('all previous-paper shortcuts target the independent tab', () => {
  const home = read('src/screens/home/HomeScreen.tsx')
  const catalog = read('src/data/mobileControlCatalog.ts')

  assert.match(home, /navigate\("PreviousPapers"\)/)
  assert.doesNotMatch(home, /screen:\s*"PreviousPapers"/)
  assert.match(catalog, /tab:\s*'PreviousPapers'/)
})

test('leaving a previous paper clears the papers stack before restoring its independent tab', () => {
  const navigation = read('src/navigation/index.tsx')
  const builder = read('src/screens/learning/PreviousPapersScreen.tsx')
  const attempt = read('src/screens/papers/AttemptPaperScreen.tsx')
  const resetPapersIndex = attempt.indexOf('navigation.reset({')
  const restorePreviousPapersIndex = attempt.indexOf(
    "navigation.getParent()?.navigate('PreviousPapers'",
  )

  assert.match(navigation, /returnTo\?: 'PreviousPapers'/)
  assert.match(builder, /returnTo:\s*'PreviousPapers'/)
  assert.match(attempt, /params\.returnTo === 'PreviousPapers'/)
  assert.match(attempt, /routes:\s*\[\{\s*name:\s*'PapersList'\s*\}\]/)
  assert.ok(resetPapersIndex >= 0)
  assert.ok(restorePreviousPapersIndex > resetPapersIndex)
})

test('the PYQ implementation has no checked-paper dependency', () => {
  const screen = read('src/screens/learning/PreviousPapersScreen.tsx')
  const api = read('src/api/previousPapers.ts')
  const implementation = `${screen}\n${api}`

  assert.doesNotMatch(implementation, /checked[-_ ]?papers?/i)
  assert.doesNotMatch(implementation, /ResultsList|ResultDetail|QuestionEvidence/)
})

test('the PYQ API uses only the production website contracts and returned paper id', () => {
  const api = read('src/api/previousPapers.ts')
  const screen = read('src/screens/learning/PreviousPapersScreen.tsx')
  const image = read('src/components/ui/AuthenticatedImage.tsx')

  assert.match(api, /apiClient\.get<PreviousPaper\[]>\('\/previous-papers\/published'\)/)
  assert.match(api, /apiClient\.get<PreviousChapter\[]>\('\/previous-papers\/chapters', \{ params, signal \}\)/)
  assert.match(api, /apiClient\.get<PreviousQuestion\[]>\('\/previous-papers\/questions', \{ params, signal \}\)/)
  assert.match(api, /apiClient\.post<StartPreviousPaperExamResponse>\(`\/previous-papers\/\$\{paperId\}\/start-exam`, payload\)/)
  assert.match(screen, /params:\s*\{\s*paperId:\s*result\.paper_id,\s*launchKey:/)
  assert.match(image, /requiresApiAuthorization\(normalizedUri, API_BASE_URL\)/)
})

test('multi-selection, timer preferences, and a fresh post-submit attempt stay wired end to end', () => {
  const api = read('src/api/previousPapers.ts')
  const model = read('src/screens/learning/previousPapersModel.ts')
  const builder = read('src/screens/learning/PreviousPapersScreen.tsx')
  const attempt = read('src/screens/papers/AttemptPaperScreen.tsx')

  assert.match(api, /subjects\?: string\[\]/)
  assert.match(api, /chapter_ids\?: string\[\]/)
  assert.match(api, /timer_enabled\?: boolean/)
  assert.match(api, /duration_minutes\?: number \| null/)
  assert.match(model, /subjects: selectedSubjects/)
  assert.match(model, /chapter_ids: selectedChapterIds/)
  assert.match(builder, /Select one or more/)
  assert.match(builder, /Practice timer/)
  assert.match(builder, /No timer/)
  assert.match(attempt, /reason: 'student_retest'/)
  assert.match(attempt, /Retest/)
  assert.match(attempt, /queryClient\.setQueryData/)
})
