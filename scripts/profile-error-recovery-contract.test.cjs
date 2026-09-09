const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/screens/profile/ProfileScreen.tsx'), 'utf8')

test('profile connection failure keeps retry and sign-out recovery actions reachable', () => {
  const branchStart = source.indexOf('if (profileQuery.isError || !profile) {')
  const branchEnd = source.indexOf('const isSecurity =', branchStart)
  const failureBranch = branchStart >= 0 && branchEnd > branchStart ? source.slice(branchStart, branchEnd) : ''

  assert.ok(failureBranch, 'expected a dedicated profile connection failure branch')
  assert.match(failureBranch, /onPress=\{\(\) => void profileQuery\.refetch\(\)\}/)
  assert.match(failureBranch, /accessibilityLabel="Sign out of this device"/)
  assert.match(failureBranch, /onPress=\{confirmSignOut\}/)
  assert.match(failureBranch, /disabled=\{signingOut\}/)
})

test('profile sign-out remains locally recoverable when the server logout request fails', () => {
  assert.match(source, /void logout\(\)\.catch\(\(\) => setSigningOut\(false\)\)/)
})
