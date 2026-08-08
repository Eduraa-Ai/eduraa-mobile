const assert = require('node:assert/strict')
const test = require('node:test')

const { navigateToCheckedPapers } = require(process.env.PAPER_RESULTS_NAVIGATION_PATH)

function navigator(routeNames, parent) {
  const calls = []
  return {
    calls,
    getParent: () => parent,
    getState: () => ({ routeNames }),
    navigate: (...args) => calls.push(args),
  }
}

test('opens a learner result through an ancestor tab navigator', () => {
  const tabs = navigator(['Home', 'Papers', 'Results'])
  const papers = navigator(['PapersList', 'AttemptPaper'], tabs)

  assert.equal(navigateToCheckedPapers(papers, 'submission-1'), true)
  assert.deepEqual(tabs.calls, [[
    'Results',
    { screen: 'ResultDetail', params: { checkedPaperId: 'submission-1' } },
  ]])
})

test('opens the staff checked-paper library without a submission id', () => {
  const tabs = navigator(['StaffHome', 'StaffPapers', 'StaffResults'])

  assert.equal(navigateToCheckedPapers(tabs), true)
  assert.deepEqual(tabs.calls, [['StaffResults', { screen: 'ResultsList' }]])
})

test('returns false instead of locking the UI when no results route exists', () => {
  const papers = navigator(['PapersList', 'AttemptPaper'])

  assert.equal(navigateToCheckedPapers(papers, 'submission-1'), false)
  assert.deepEqual(papers.calls, [])
})
