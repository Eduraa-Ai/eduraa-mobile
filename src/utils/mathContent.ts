export interface NormalizedMathContent {
  text: string
  hasMath: boolean
  degraded: boolean
}

const SYMBOLS: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  phi: 'φ',
  omega: 'ω',
  infty: '∞',
  neq: '≠',
  approx: '≈',
  leq: '≤',
  geq: '≥',
  pm: '±',
  times: '×',
  cdot: '·',
  div: '÷',
  rightarrow: '→',
  leftarrow: '←',
  leftrightarrow: '↔',
  sum: '∑',
  prod: '∏',
  int: '∫',
  partial: '∂',
  nabla: '∇',
}

const SUPERSCRIPTS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  n: 'ⁿ', i: 'ⁱ',
}

const SUBSCRIPTS: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ',
  l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ',
  s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
}

function mapScript(value: string, table: Record<string, string>) {
  const mapped = [...value].map((character) => table[character] ?? character).join('')
  return mapped === value && value.length > 1 ? `(${value})` : mapped
}

function readGroup(source: string, openIndex: number) {
  if (source[openIndex] !== '{') return null
  let depth = 0
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') depth -= 1
    if (depth === 0) {
      return { value: source.slice(openIndex + 1, index), end: index + 1 }
    }
  }
  return null
}

function replaceGroupedCommand(
  source: string,
  command: string,
  groupCount: number,
  replacement: (groups: string[]) => string,
) {
  const marker = `\\${command}`
  let cursor = 0
  let output = ''
  let degraded = false

  while (cursor < source.length) {
    const commandIndex = source.indexOf(marker, cursor)
    if (commandIndex < 0) {
      output += source.slice(cursor)
      break
    }

    output += source.slice(cursor, commandIndex)
    let groupIndex = commandIndex + marker.length
    const groups: string[] = []
    while (groups.length < groupCount) {
      while (/\s/.test(source[groupIndex] ?? '')) groupIndex += 1
      const group = readGroup(source, groupIndex)
      if (!group) break
      groups.push(group.value)
      groupIndex = group.end
    }

    if (groups.length !== groupCount) {
      output += command
      cursor = commandIndex + marker.length
      degraded = true
      continue
    }

    output += replacement(groups)
    cursor = groupIndex
  }

  return { value: output, degraded }
}

function replaceMatrices(source: string) {
  let degraded = false
  const value = source.replace(
    /\\begin\{([bpvV]?matrix)\}([\s\S]*?)\\end\{\1\}/g,
    (_match, _kind: string, body: string) => {
      const rows = body
        .split(/\\\\/)
        .map((row: string) => row.split('&').map((cell) => cell.trim()).filter(Boolean))
        .filter((row: string[]) => row.length > 0)
      if (!rows.length) {
        degraded = true
        return '[]'
      }
      return rows.map((row: string[], index: number) => {
        const left = rows.length === 1 ? '[' : index === 0 ? '⎡' : index === rows.length - 1 ? '⎣' : '⎢'
        const right = rows.length === 1 ? ']' : index === 0 ? '⎤' : index === rows.length - 1 ? '⎦' : '⎥'
        return `${left} ${row.join('  ')} ${right}`
      }).join('\n')
    },
  )
  return { value, degraded }
}

function normalizeFormula(source: string) {
  let value = source
  let degraded = false

  const matrix = replaceMatrices(value)
  value = matrix.value
  degraded ||= matrix.degraded

  for (let pass = 0; pass < 6; pass += 1) {
    const fractionNames = ['dfrac', 'tfrac', 'frac']
    let fractionValue = value
    let fractionDegraded = false
    for (const name of fractionNames) {
      const result = replaceGroupedCommand(fractionValue, name, 2, ([top, bottom]) => `(${top})⁄(${bottom})`)
      fractionValue = result.value
      fractionDegraded ||= result.degraded
    }
    value = fractionValue
    degraded ||= fractionDegraded

    const squareRoot = replaceGroupedCommand(value, 'sqrt', 1, ([radicand]) => `√(${radicand})`)
    value = squareRoot.value
    degraded ||= squareRoot.degraded
  }

  for (const command of ['mathrm', 'mathbf', 'mathit', 'text', 'operatorname', 'boxed']) {
    const result = replaceGroupedCommand(value, command, 1, ([content]) => content)
    value = result.value
    degraded ||= result.degraded
  }

  Object.entries(SYMBOLS).forEach(([command, symbol]) => {
    value = value.replace(new RegExp(`\\\\${command}(?![A-Za-z])`, 'g'), symbol)
  })

  value = value
    .replace(/\\(?:left|right)\b/g, '')
    .replace(/\\(?:quad|qquad|,|;|:|!)(?:\s*)/g, ' ')
    .replace(/\\%/g, '%')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\^\{([^{}]+)\}/g, (_match, exponent: string) => mapScript(exponent, SUPERSCRIPTS))
    .replace(/\^([A-Za-z0-9+\-=()])/g, (_match, exponent: string) => mapScript(exponent, SUPERSCRIPTS))
    .replace(/_\{([^{}]+)\}/g, (_match, subscript: string) => {
      const mapped = mapScript(subscript, SUBSCRIPTS)
      return mapped === subscript ? `_${subscript}` : mapped
    })
    .replace(/_([A-Za-z0-9+\-=()])/g, (_match, subscript: string) => {
      const mapped = mapScript(subscript, SUBSCRIPTS)
      return mapped === subscript ? `_${subscript}` : mapped
    })
    .replace(/\\([A-Za-z]+)/g, (_match, command: string) => {
      degraded = true
      return command
    })

  if (/[{}]/.test(value)) {
    degraded = true
    value = value.replace(/[{}]/g, '')
  }

  return {
    value: value.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim(),
    degraded,
  }
}

/**
 * Converts common LaTeX into readable Unicode on every React Native target.
 * Invalid input is deliberately preserved as readable text without exposing
 * raw math wrappers or throwing during rendering.
 */
export function normalizeMathContent(input?: string | null): NormalizedMathContent {
  const source = String(input ?? '').replace(/\r\n?/g, '\n')
  if (!source) return { text: '', hasMath: false, degraded: false }

  const segments: Array<{ math: boolean; value: string }> = []
  const wrapper = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$([^$\n]+?)\$/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = wrapper.exec(source))) {
    if (match.index > cursor) segments.push({ math: false, value: source.slice(cursor, match.index) })
    segments.push({ math: true, value: match[1] ?? match[2] ?? match[3] ?? match[4] ?? '' })
    cursor = match.index + match[0].length
  }
  if (cursor < source.length) segments.push({ math: false, value: source.slice(cursor) })

  const hasCommands = /\\(?:begin|frac|dfrac|tfrac|sqrt|[A-Za-z]+)|[_^]\{?[\w+\-=()]/.test(source)
  if (!segments.some((segment) => segment.math) && hasCommands) {
    segments.splice(0, segments.length, { math: true, value: source })
  }

  let degraded = false
  const text = segments.map((segment) => {
    if (!segment.math) return segment.value
    const normalized = normalizeFormula(segment.value)
    degraded ||= normalized.degraded
    return normalized.value
  }).join('')

  const unmatchedWrappers = /(?:\$\$?|\\\[|\\\]|\\\(|\\\))/.test(text)
  degraded ||= unmatchedWrappers
  const readable = text
    .replace(/\$\$?/g, '')
    .replace(/\\[\[\]()]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    text: readable || source.replace(/\$\$?/g, '').replace(/\\[\[\]()]/g, '').trim(),
    hasMath: segments.some((segment) => segment.math) || hasCommands,
    degraded,
  }
}
