const DIFFERENTIAL_COMMA_RE = /(?<=[0-9A-Za-z)\]}])\s*,\s*d([A-Za-z])(?![A-Za-z])/g
const BRACKETED_MATH_RE = /(?<!\\)\[\s*([\s\S]{6,}?)\s*(?<!\\)\](?!\()/g
const MATH_SIGNAL_RE = /\\[A-Za-z]+|[_^{}]|(?:\d|[A-Za-z])\s*[=<>+\-*/]\s*(?:\d|[A-Za-z])/

const superscriptMap: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  n: 'ⁿ',
}

const subscriptMap: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
}

const greekMap: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  varepsilon: 'ε',
  eta: 'η',
  theta: 'θ',
  vartheta: 'θ',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  varpi: 'π',
  rho: 'ρ',
  varrho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  varphi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Upsilon: 'Υ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
}

function looksLikeMath(value: string) {
  const compact = value.trim()
  if (compact.length < 6) return false
  if (compact.startsWith('http://') || compact.startsWith('https://')) return false
  return MATH_SIGNAL_RE.test(compact)
}

function normalizeMathMarkdown(value: string) {
  const repaired = (value || '')
    .replace(DIFFERENTIAL_COMMA_RE, '\\,d$1')
    .replace(BRACKETED_MATH_RE, (match, expression: string) => {
      const trimmed = expression.trim()
      return looksLikeMath(trimmed) ? `\\[${trimmed}\\]` : match
    })
    .replace(/\\\[(.*?)\\\]/gs, (_match, expression: string) => `$$${expression}$$`)
    .replace(/\\\((.*?)\\\)/gs, (_match, expression: string) => `$${expression}$`)

  return repaired
    .split(/(\$\$[\s\S]*?\$\$|\$[^$]*\$)/g)
    .map((part) => {
      if (part.startsWith('$')) return part
      return part.replace(
        /((?:\\[A-Za-z]+|[A-Za-z0-9{}^_+\-*/=(),])+?)(\\?)(?=([\s.;:!?)]|$))/g,
        (match, expression: string) => (expression.includes('\\') ? `$${expression}$` : match),
      )
    })
    .join('')
}

function toRaised(value: string) {
  const converted = value.split('').map((character) => superscriptMap[character] ?? '').join('')
  return converted || `^${value}`
}

function toLowered(value: string) {
  const converted = value.split('').map((character) => subscriptMap[character] ?? '').join('')
  return converted || `_${value}`
}

/**
 * Converts the common LaTeX emitted by paper generation into readable native
 * text. This keeps formula delimiters and commands from leaking into both
 * native and web attempts without introducing a WebView-only renderer.
 */
export function readableMathText(value: string | null | undefined) {
  let next = normalizeMathMarkdown(value || '')
    .replace(/\$\$([\s\S]*?)\$\$/g, (_match, expression: string) => ` ${expression} `)
    .replace(/\$([^$]*?)\$/g, (_match, expression: string) => ` ${expression} `)
    .replace(/\\(?:dfrac|tfrac|frac)\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\(?:mathrm|text|operatorname|mathit|mathbf|boldsymbol|vec|overline|overrightarrow)\{([^{}]+)\}/g, '$1')
    .replace(/\\left|\\right/g, '')
    .replace(/\\,/g, ' ')
    .replace(/\\;/g, ' ')
    .replace(/\\:/g, ' ')
    .replace(/\\quad|\\qquad/g, ' ')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\leq?/g, '≤')
    .replace(/\\geq?/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\approx/g, '≈')
    .replace(/\\infty/g, '∞')
    .replace(/\\sum/g, '∑')
    .replace(/\\prod/g, '∏')
    .replace(/\\int/g, '∫')
    .replace(/\\partial/g, '∂')
    .replace(/\\nabla/g, '∇')
    .replace(/\\%/g, '%')
    .replace(/\\circ/g, '°')

  Object.entries(greekMap).forEach(([latex, symbol]) => {
    next = next.replace(new RegExp(`\\\\${latex}(?![A-Za-z])`, 'g'), symbol)
  })

  return next
    .replace(/\^\s*°/g, '°')
    .replace(/\^\s*\\?circ\b/g, '°')
    .replace(/\^\s*deg\b/g, '°')
    .replace(/\^\{([^{}]+)\}/g, (_match, exponent: string) => toRaised(exponent))
    .replace(/_\{([^{}]+)\}/g, (_match, subscript: string) => toLowered(subscript))
    .replace(/\^([0-9+\-=()n])/g, (_match, exponent: string) => toRaised(exponent))
    .replace(/_([0-9+\-=()])/g, (_match, subscript: string) => toLowered(subscript))
    .replace(/[{}]/g, '')
    .replace(/\\([A-Za-z]+)/g, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
