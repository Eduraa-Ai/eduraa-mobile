const BLANK = '_____'

// A generated fill-in-the-blank arrives as \underline{\hspace{1cm}}: an underline
// wrapped around pure spacing. Readers need the blank, not its LaTeX.
const SPACING_ONLY = String.raw`(?:\\(?:hspace|kern|mspace)\*?\{[^{}]*\}|\\q?quad|\\[,;:!]|~|\s)*`
const UNDERLINE_BLANK = new RegExp(String.raw`\\underline\s*\{${SPACING_ONLY}\}`, 'g')
const UNDERLINE_CONTENT = /\\underline\s*\{([^{}]*)\}/g
const SPACING_COMMAND = /\\(?:hspace|kern|mspace)\*?\{[^{}]*\}/g
const DEGREE = /\^\s*\{\s*\\circ\s*\}|\^\s*\\circ(?![A-Za-z])|\\circ(?![A-Za-z])|\\degree(?![A-Za-z])/g

/**
 * Normalises the blank and degree notation the paper generator emits, which
 * every downstream renderer otherwise leaks as raw command names.
 */
export function normalizeLatexBlanksAndDegrees(value: string) {
  return value
    .replace(UNDERLINE_BLANK, BLANK)
    .replace(UNDERLINE_CONTENT, '$1')
    .replace(SPACING_COMMAND, ' ')
    .replace(DEGREE, '°')
}
