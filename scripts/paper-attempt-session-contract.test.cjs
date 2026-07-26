const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

const hook = read('src/screens/papers/usePaperAttemptSession.ts')
const standardAttempt = read('src/screens/papers/AttemptPaperScreen.tsx')
const interactiveQuiz = read('src/screens/papers/QuizScreen.tsx')

test('shared mobile session serializes writes and flushes on background', () => {
  assert.match(hook, /writeChainRef\.current = writeChainRef\.current/)
  assert.match(hook, /AppState\.addEventListener\('change'/)
  assert.match(hook, /nextState === 'background' \|\| nextState === 'inactive'/)
  assert.match(hook, /await hydrationPromiseRef\.current/)
})

test('draft cleanup cannot be undone by an unmount flush', () => {
  assert.match(hook, /draftDisabledRef\.current = true/)
  assert.match(hook, /snapshot\?\.hydrated && !draftDisabledRef\.current/)
  assert.match(hook, /AsyncStorage\.removeItem\(paperAttemptDraftKey/)
})

test('standard attempts and interactive quizzes use the shared mobile session', () => {
  assert.match(standardAttempt, /usePaperAttemptSession\(\{/)
  assert.match(interactiveQuiz, /usePaperAttemptSession\(\{/)
  assert.match(standardAttempt, /mode: 'standard'/)
  assert.match(interactiveQuiz, /mode: 'interactive_quiz'/)
})

test('both mobile submission paths use the canonical safe answer snapshot', () => {
  for (const source of [standardAttempt, interactiveQuiz]) {
    assert.match(source, /buildPaperAnswerEntries\(/)
    assert.match(source, /getAnswerSnapshot\(\)/)
    assert.match(source, /clearDraft\(\)/)
  }
})

test('question cards are memoized and receive stable shared callbacks', () => {
  assert.match(standardAttempt, /const StandardQuestionCard = React\.memo/)
  assert.match(interactiveQuiz, /const QuestionCard = React\.memo/)
  assert.match(standardAttempt, /onSelectAnswer=\{selectAnswer\}/)
  assert.match(interactiveQuiz, /onAnswer=\{handleAnswer\}/)
})

test('selectable answers update card feedback and shared progress from the same press-in', () => {
  for (const source of [standardAttempt, interactiveQuiz]) {
    assert.match(source, /const \[optimisticAnswer, setOptimisticAnswer\] = useState\(answer\)/)
    assert.match(source, /const commitImmediateSelection = useCallback/)
    assert.match(source, /onPressIn=\{\(\) => commitImmediateSelection\(/)
    assert.match(source, /onPress=\{\(\) => finishSelection\(/)
    assert.match(source, /pressInSelectionRef\.current === value/)
  }
})
