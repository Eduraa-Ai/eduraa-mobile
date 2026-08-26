const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.MATH_TEXT_MODEL_PATH
if (!modelPath) throw new Error('Set MATH_TEXT_MODEL_PATH to the compiled math text utility.')
const { readableMathText } = require(modelPath)

test('renders fill-in-the-blank and degree notation instead of leaking commands', () => {
  assert.equal(
    readableMathText('$(x, y) = (\\underline{\\hspace{1cm}}, -1)$'),
    '(x, y) = (_____, -1)',
  )
  assert.equal(readableMathText('a $30^\\circ-60^\\circ$ triangle'), 'a 30°-60° triangle')
  assert.equal(readableMathText('$\\theta = 37^{\\circ}$'), 'θ = 37°')
  assert.equal(readableMathText('$\\underline{answer}$ here'), 'answer here')
})

test('converts common paper LaTeX without leaking delimiters or commands', () => {
  const rendered = readableMathText(
    String.raw`If \(\alpha^2 + \frac{1}{2}\geq\sqrt{4}\), find \(x_1\).`,
  )

  assert.equal(rendered, 'If α² + (1)/(2)≥√(4), find x₁.')
  assert.doesNotMatch(rendered, /\\(?:frac|sqrt|alpha)|[$]/)
})

test('repairs display math and preserves ordinary bracketed prose and links', () => {
  assert.equal(readableMathText(String.raw`Evaluate [ x^2 + y^2 = 1 ] now.`), 'Evaluate x² + y² = 1 now.')
  assert.equal(readableMathText('Read [chapter notes] at https://example.com/a_b.'), 'Read [chapter notes] at https://example.com/a_b.')
})

test('handles operators, Greek symbols, units, and nullish content', () => {
  assert.equal(
    readableMathText(String.raw`$\Delta T \approx 3^\circ$ and $a \times b \neq 0$`),
    'Δ T ≈ 3° and a × b ≠ 0',
  )
  assert.equal(readableMathText(undefined), '')
})

test('normalizes common JEE vector, permittivity, and calculus notation', () => {
  assert.equal(
    readableMathText(String.raw`$\vec{E}=\frac{q}{6\epsilon_0}$ and $\int \nabla\phi\,dx$`),
    'E=(q)/(6ε₀) and ∫ ∇φ dx',
  )
})
