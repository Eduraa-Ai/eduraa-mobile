const assert = require('node:assert/strict')
const test = require('node:test')

const modelPath = process.env.LATEX_MODEL_PATH
if (!modelPath) throw new Error('Set LATEX_MODEL_PATH to the compiled LaTeX model.')
const model = require(modelPath)

test('preserves mixed physics prose and one multiline display equation', () => {
  const physicsQuestion = String.raw`A physical quantity $Q$ is given by
\[
Q=\frac{F\sqrt{L}}{\rho v^2},
\]
where $F$ is force, $L$ is length, $\rho$ is mass density and $v$ is speed.`

  const normalized = model.normalizeLatexContent(physicsQuestion)

  assert.equal(normalized, physicsQuestion)
  assert.equal((normalized.match(/\\\[/g) || []).length, 1)
  assert.equal((normalized.match(/\\\]/g) || []).length, 1)
  assert.equal(model.containsLatex(normalized), true)
  assert.deepEqual(
    model.splitLatexContent('Force $F$ is given by \\[F=ma\\].'),
    [
      { kind: 'text', value: 'Force ' },
      { kind: 'inline-math', value: '$F$' },
      { kind: 'text', value: ' is given by ' },
      { kind: 'display-math', value: String.raw`\[F=ma\]` },
      { kind: 'text', value: '.' },
    ],
  )
})

test('preserves chemistry notation for the bundled MathJax mhchem package', () => {
  const chemistryQuestion = String.raw`Balance the reaction:
\[
\ce{2H2 + O2 -> 2H2O}
\]`

  assert.equal(model.normalizeLatexContent(chemistryQuestion), chemistryQuestion)
  assert.match(model.normalizeLatexContent(chemistryQuestion), /\\ce\{2H2 \+ O2 -> 2H2O\}/)
})

test('repairs fenced and standalone generated formulas', () => {
  const fenced = ['```latex', String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}`, '```'].join('\n')

  assert.equal(
    model.normalizeLatexContent(fenced),
    String.raw`\[\frac{-b\pm\sqrt{b^2-4ac}}{2a}\]`,
  )
  assert.equal(
    model.normalizeLatexContent(String.raw`Q=\frac{F\sqrt{L}}{\rho v^2}`),
    String.raw`\[Q=\frac{F\sqrt{L}}{\rho v^2}\]`,
  )
})

test('repairs duplicated delimiters without changing TeX commands', () => {
  assert.equal(
    model.normalizeLatexContent(String.raw`Energy is \\(E=mc^2\\).`),
    String.raw`Energy is \(E=mc^2\).`,
  )

  assert.equal(
    model.normalizeLatexContent(String.raw`$\[M^0L^{1/2}T^0\]$`),
    String.raw`\[M^0L^{1/2}T^0\]`,
  )
})

test('leaves ordinary brackets and plain prose untouched', () => {
  const prose = 'Revise topics [force, length, density] before the attempt.'

  assert.equal(model.normalizeLatexContent(prose), prose)
  assert.equal(model.containsLatex(prose), false)
})

test('escapes HTML operators and provides a readable accessibility fallback', () => {
  const expression = String.raw`For $x < y$ and $y > 0$, use $\rho$.`

  assert.equal(
    model.escapeMathJaxHtml(expression),
    String.raw`For $x &lt; y$ and $y &gt; 0$, use $\rho$.`,
  )
  assert.equal(model.latexToPlainText(expression), 'For x < y and y > 0, use ρ.')
})