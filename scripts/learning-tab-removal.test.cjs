const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath))

test('the Learning root tab and its footer icon are gone', () => {
  const navigation = read('src/navigation/index.tsx')
  const bottomTabBar = read('src/components/ui/BottomTabBar.tsx')

  assert.doesNotMatch(navigation, /<Tab\.Screen name="Learning"/)
  assert.doesNotMatch(navigation, /Learning:\s*NavigatorScreenParams/)
  assert.doesNotMatch(navigation, /LearningNavigator|LearningStack|LearningHomeScreen/)
  assert.doesNotMatch(bottomTabBar, /Learning:\s*'library-outline'/)
  assert.equal(exists('src/screens/learning/LearningHomeScreen.tsx'), false)
})

test('retained Learning screens keep a reachable entry point under Home', () => {
  const navigation = read('src/navigation/index.tsx')

  for (const screen of [
    'AgenticLearning',
    'AgenticSubject',
    'AgenticTopic',
    'CompetitiveExam',
    'CompetitiveSubject',
    'CompetitiveChapter',
    'Exams',
    'AIStudio',
  ]) {
    assert.match(navigation, new RegExp(`<HomeStack\\.Screen name="${screen}"`))
  }

  assert.match(navigation, /<HomeStack\.Screen name="HomeMain"/)

  // The agentic deep links now hang off the Home tab, and HomeMain owns "/" so
  // the shell does not park on "/HomeMain" after sign-in.
  const homeLinking = navigation.slice(
    navigation.indexOf('Home: {'),
    navigation.indexOf('Results: {'),
  )
  assert.match(homeLinking, /HomeMain:\s*''/)
  assert.match(homeLinking, /AgenticLearning:\s*'learning\/agentic'/)
  assert.match(homeLinking, /AgenticSubject:\s*'learning\/agentic\/subjects\/:subjectId'/)
  assert.match(homeLinking, /AgenticTopic:\s*'learning\/agentic\/topics\/:topicId'/)
})

test('the Home tab and its stack register screens without inline element factories', () => {
  const navigation = read('src/navigation/index.tsx')

  // An inline `{() => <Screen />}` child gets a fresh component identity on every
  // parent render, which remounts the screen and drops its state.
  assert.match(navigation, /<Tab\.Screen name="Home" component=\{HomeNavigator\}/)
  assert.match(navigation, /<HomeStack\.Screen name="HomeMain" component=\{HomeScreen\}/)
  assert.doesNotMatch(navigation, /<Tab\.Screen name="Home"[^/]*>\s*\{\(\)/)
  assert.doesNotMatch(navigation, /<HomeStack\.Screen name="HomeMain"[^/]*>\s*\{\(\)/)
})

test('shortcuts, remediation, and AI Studio no longer target the removed route', () => {
  const home = read('src/screens/home/HomeScreen.tsx')
  const catalog = read('src/data/mobileControlCatalog.ts')
  const resultDetail = read('src/screens/results/ResultDetailScreen.tsx')
  const questionEvidence = read('src/screens/results/QuestionEvidenceScreen.tsx')
  const aiStudio = read('src/screens/studio/AIStudioScreen.tsx')

  for (const source of [home, catalog, resultDetail, questionEvidence]) {
    assert.doesNotMatch(source, /['"]Learning['"]\s*,\s*\{/)
    assert.doesNotMatch(source, /tab:\s*'Learning'/)
  }

  assert.match(resultDetail, /navigate\('Home',\s*\{\s*screen:\s*'AgenticLearning'/)
  assert.match(questionEvidence, /navigate\('Home',\s*\{\s*screen:\s*'AgenticTopic'/)
  assert.match(aiStudio, /routeNames\.includes\("HomeMain"\)/)
  assert.doesNotMatch(aiStudio, /LearningHome/)
})

test('Previous Papers and Cheat Sheets stay independently reachable', () => {
  const navigation = read('src/navigation/index.tsx')
  const catalog = read('src/data/mobileControlCatalog.ts')

  assert.match(navigation, /name="PreviousPapers"/)
  assert.match(navigation, /name="CheatSheets"/)
  // Learning Resources was removed as a mobile tab; the underlying
  // CompetitiveExam experience lives under the Home stack.
  assert.doesNotMatch(navigation, /name="LearningResources"/)
  assert.match(catalog, /tab:\s*'CheatSheets'/)
  assert.match(catalog, /tab:\s*'Home',\s*screen:\s*'CompetitiveExam'/)
})
