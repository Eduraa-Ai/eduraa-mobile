const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('an attempt warms the first book figures as soon as the paper resolves', () => {
  const attempt = read('src/screens/papers/AttemptPaperScreen.tsx')

  // Warming is driven by the resolved paper, not by a cell mounting.
  assert.match(attempt, /prefetchProtectedImages\(\s*planQuestionVisualPrefetch\(questions, \{/)
  assert.match(attempt, /\}, \[paper\?\.questions\]\)/)
  // The rolling window has to keep working while the learner scrolls, and
  // FlatList rejects a callback whose identity changes between renders.
  assert.match(attempt, /onViewableItemsChanged=\{prefetchVisualsAhead\}/)
  assert.match(attempt, /viewabilityConfig=\{visualPrefetchViewability\}/)
  assert.match(attempt, /const prefetchVisualsAhead = useCallback\(/)
  assert.match(attempt, /startIndex: firstVisible/)
  assert.match(attempt, /const visualPrefetchViewability = \{/)
})

test('protected figures resolve from one shared copy per URL', () => {
  const cache = read('src/utils/protectedImageCache.ts')
  const image = read('src/components/ui/ProtectedContentImage.tsx')

  // In-flight dedupe plus a bounded queue: N components asking for the same crop
  // share one download, and prefetching never floods the visible request.
  assert.match(cache, /const inFlight = new Map<string, Promise<string>>\(\)/)
  assert.match(cache, /const pending = inFlight\.get\(url\)\r?\n\s*if \(pending\) return pending/)
  assert.match(cache, /activePrefetches < MAX_PREFETCH_CONCURRENCY/)
  assert.match(cache, /while \(cached\.size > MAX_ENTRIES\)/)
  // Native reuses the file already on disk instead of downloading it again.
  assert.match(cache, /if \(destination\.exists && destination\.size > 0\) return destination\.uri/)
  assert.match(cache, /File\.downloadFileAsync\(url, destination, \{/)
  assert.match(cache, /Authorization: `Bearer \$\{token\}`/)

  assert.match(image, /useState<string \| null>\(\(\) =>\s*\n?\s*normalizedUri && needsAuth \? peekProtectedImage\(normalizedUri\) : null,/)
  assert.match(image, /loadProtectedImage\(normalizedUri\)/)
  assert.match(image, /if \(normalizedUri && needsAuth\) invalidateProtectedImage\(normalizedUri\)/)
  // A remount must not re-read credentials or throw away a warmed copy.
  assert.doesNotMatch(image, /getAccessToken/)
  assert.doesNotMatch(image, /URL\.revokeObjectURL/)
  assert.doesNotMatch(image, /URL\.createObjectURL/)
})

test('a slow figure still leaves the learner a retry and the question intact', () => {
  const image = read('src/components/ui/ProtectedContentImage.tsx')
  const visual = read('src/components/ui/QuestionVisual.tsx')

  assert.match(image, /accessibilityLabel="Loading question figure"/)
  assert.match(image, /Retry image/)
  // A cache failure on native falls back to the authorized remote source.
  assert.match(image, /setDirectToken\(\{ value \}\)/)
  assert.match(image, /Authorization: `Bearer \$\{directToken\.value\}`/)
  assert.match(visual, /getQuestionVisualAssetUrls\(visual\)/)
})
