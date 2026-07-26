const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.MATH_CONTENT_PATH
if (!modelPath) throw new Error('Set MATH_CONTENT_PATH to the compiled math content utility.')
const { normalizeMathContent } = require(modelPath)

test('formula rendering snapshots cover required notation', () => {
  const snapshots = {
    fraction: normalizeMathContent('Speed is $\\frac{d}{t}$.').text,
    superscript: normalizeMathContent('$b^2-4ac$').text,
    subscript: normalizeMathContent('$S_z$ and $\\epsilon_0$').text,
    root: normalizeMathContent('$\\sqrt{b^2-4ac}$').text,
    matrix: normalizeMathContent('$$\\begin{matrix}a & b \\\\ c & d\\end{matrix}$$').text,
    units: normalizeMathContent('$9.8\\,\\mathrm{m\\,s^{-2}}$').text,
  }
  assert.deepEqual(snapshots, {
    fraction: 'Speed is (d)⁄(t).',
    superscript: 'b²-4ac',
    subscript: 'S_z and ε₀',
    root: '√(b²-4ac)',
    matrix: '⎡ a b ⎤\n⎣ c d ⎦',
    units: '9.8 m s⁻²',
  })
})

test('removes inline and block wrappers without losing prose', () => {
  assert.equal(
    normalizeMathContent('Use \\(x^2\\), then solve \\[x=\\frac{-b}{2a}\\]').text,
    'Use x², then solve x=(-b)⁄(2a)',
  )
})

test('malformed formulas degrade to readable non-throwing text', () => {
  const normalized = normalizeMathContent('Value: $$\\frac{a}{b and \\unknown{x}')
  assert.equal(normalized.text.includes('$'), false)
  assert.equal(normalized.text.includes('\\'), false)
  assert.equal(normalized.text.length > 0, true)
  assert.equal(normalized.degraded, true)
})
