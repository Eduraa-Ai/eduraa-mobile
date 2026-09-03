const assert = require('node:assert/strict')
const test = require('node:test')

const { navigateToCheckedPapers, returnToCheckedPapers } = require(process.env.PAPER_RESULTS_NAVIGATION_PATH)

function navigator(routeNames, parent, canGoBack = false) {
  const calls = []
  return {
    calls,
    canGoBack: () => canGoBack,
    getParent: () => parent,
    getState: () => ({ routeNames }),
    goBack: () => calls.push(['goBack']),
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

test('result back always opens the checked-paper homepage instead of the submission flow', () => {
  const tabs = navigator(['Home', 'Papers', 'Results'])
  const resultDetail = navigator(['ResultsList', 'ResultDetail'], tabs, true)

  assert.equal(returnToCheckedPapers(resultDetail), true)
  assert.deepEqual(resultDetail.calls, [])
  assert.deepEqual(tabs.calls, [['Results', { screen: 'ResultsList' }]])
})

test('result back falls through to the staff checked-paper library without history', () => {
  const staffWorkspace = navigator(['StaffWorkspace', 'StaffResults', 'ResultDetail'])

  assert.equal(returnToCheckedPapers(staffWorkspace), true)
  assert.deepEqual(staffWorkspace.calls, [['StaffResults', { screen: 'ResultsList' }]])
})
