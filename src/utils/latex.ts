const CODE_FENCE_RE = /```(?:latex|tex|math)?[ \t]*\n?([\s\S]*?)```/gi;
const BRACKETED_MATH_RE = /(?<!\\)\[\s*([\s\S]{3,}?)\s*(?<!\\)\](?!\()/g;
const EXPLICIT_MATH_RE =
  /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)/;
const EXPLICIT_MATH_SPLIT_RE =
  /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g;
const TEX_COMMAND_RE = /^\\[A-Za-z]+\b/;
const MATH_SIGNAL_RE =
  /\\[A-Za-z]+|[_^{}]|(?:\d|[A-Za-z])\s*[=<>+\-*/]\s*(?:\d|[A-Za-z])/;

function looksLikeMath(value: string) {
  const compact = value.trim();
  if (
    !compact ||
    compact.startsWith("http://") ||
    compact.startsWith("https://")
  )
    return false;
  return MATH_SIGNAL_RE.test(compact);
}

function normalizeDuplicatedDelimiters(value: string) {
  let normalized = value;
  const delimiterPairs = [
    [String.raw`\\[`, String.raw`\\]`, String.raw`\[`, String.raw`\]`],
    [String.raw`\\(`, String.raw`\\)`, String.raw`\(`, String.raw`\)`],
  ] as const;

  delimiterPairs.forEach(([escapedOpen, escapedClose, open, close]) => {
    if (normalized.includes(escapedOpen) && normalized.includes(escapedClose)) {
      normalized = normalized
        .split(escapedOpen)
        .join(open)
        .split(escapedClose)
        .join(close);
    }
  });

  normalized = normalized
    .replace(/\$\$\s*(\\\[[\s\S]*?\\\])\s*\$\$/g, "$1")
    .replace(/\$\s*(\\\[[\s\S]*?\\\])\s*\$/g, "$1")
    .replace(/\\\(\s*\$([^$]+?)\$\s*\\\)/g, String.raw`\($1\)`);

  return normalized;
}

function wrapImplicitLatexAtoms(value: string) {
  const groupedAtom =
    /\\(?:dfrac|tfrac|frac)\s*\{[^{}\n]+\}\s*\{[^{}\n]+\}|\\[A-Za-z]+\s*(?:\{[^{}\n]*\}|[A-Za-z0-9])(?:\s*[_^]\s*(?:\{[^{}\n]*\}|[A-Za-z0-9+\-=()]))*/g;

  return value
    .split(EXPLICIT_MATH_SPLIT_RE)
    .map((part) => {
      if (!part || EXPLICIT_MATH_RE.test(part)) return part;
      return part.replace(groupedAtom, (atom) => `$${atom}$`);
    })
    .join("");
}

function wrapStandaloneMathLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || EXPLICIT_MATH_RE.test(trimmed)) return line;

  const isTexExpression = TEX_COMMAND_RE.test(trimmed);
  const isEquation = /^[A-Za-z][A-Za-z0-9_]*(?:\([^)]*\))?\s*=/.test(trimmed);
  const isCompactScientificNotation =
    !/\s/.test(trimmed) && /[_^{}]/.test(trimmed);
  if (
    !looksLikeMath(trimmed) ||
    (!isTexExpression && !isEquation && !isCompactScientificNotation)
  )
    return line;

  const leadingSpace = line.match(/^\s*/)?.[0] ?? "";
  const trailingSpace = line.match(/\s*$/)?.[0] ?? "";
  return `${leadingSpace}\\[${trimmed}\\]${trailingSpace}`;
}

function wrapStandaloneMath(value: string) {
  return value
    .split(EXPLICIT_MATH_SPLIT_RE)
    .map((part) => {
      if (!part || EXPLICIT_MATH_RE.test(part)) return part;
      return part.split("\n").map(wrapStandaloneMathLine).join("\n");
    })
    .join("");
}

export function normalizeLatexContent(value?: string | null) {
  if (!value) return "";

  const withoutFences = String(value)
    .replace(/\r\n?/g, "\n")
    .replace(CODE_FENCE_RE, (_match, content: string) => {
      const expression = content.trim();
      if (!expression) return "";
      return EXPLICIT_MATH_RE.test(expression)
        ? expression
        : `\\[${expression}\\]`;
    });

  const normalized = normalizeDuplicatedDelimiters(withoutFences).replace(
    BRACKETED_MATH_RE,
    (match, expression: string) => {
      const trimmed = expression.trim();
      return looksLikeMath(trimmed) ? `\\[${trimmed}\\]` : match;
    },
  );

  return wrapImplicitLatexAtoms(wrapStandaloneMath(normalized)).trim();
}

export function containsLatex(value?: string | null) {
  return EXPLICIT_MATH_RE.test(normalizeLatexContent(value));
}

export type LatexSegment = {
  kind: "text" | "inline-math" | "display-math";
  value: string;
};

export function splitLatexContent(value?: string | null): LatexSegment[] {
  const normalized = normalizeLatexContent(value);
  if (!normalized) return [];

  return normalized
    .split(EXPLICIT_MATH_SPLIT_RE)
    .filter(Boolean)
    .map((part) => {
      const isMath = EXPLICIT_MATH_RE.test(part);
      if (!isMath) return { kind: "text", value: part };

      const isDisplay =
        part.startsWith("$$") || part.startsWith(String.raw`\[`);
      return { kind: isDisplay ? "display-math" : "inline-math", value: part };
    });
}

export function escapeMathJaxHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const greekSymbols: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  phi: "φ",
  omega: "ω",
  Delta: "Δ",
  Omega: "Ω",
};

export function latexToPlainText(value?: string | null) {
  let normalized = normalizeLatexContent(value)
    .replace(/\$\$([\s\S]*?)\$\$/g, " $1 ")
    .replace(/\$([^$]*?)\$/g, " $1 ")
    .replace(/\\\[([\s\S]*?)\\\]/g, " $1 ")
    .replace(/\\\(([\s\S]*?)\\\)/g, " $1 ")
    .replace(/\\(?:dfrac|tfrac|frac)\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^{}]+)\}/g, "√($1)")
    .replace(/\\ce\{([^{}]+)\}/g, "$1")
    .replace(/\\(?:mathrm|text|operatorname)\{([^{}]+)\}/g, "$1")
    .replace(/\\left|\\right/g, "")
    .replace(/\\(?:,|;|:|quad|qquad)/g, " ")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\div/g, "÷")
    .replace(/\\pm/g, "±")
    .replace(/\\leq?/g, "≤")
    .replace(/\\geq?/g, "≥")
    .replace(/\\neq/g, "≠")
    .replace(/\\approx/g, "≈")
    .replace(/\\infty/g, "∞")
    .replace(/\\rightleftharpoons/g, "⇌")
    .replace(/\\leftrightarrow/g, "↔")
    .replace(/\\rightarrow|\\to/g, "→")
    .replace(/\\%/g, "%")
    .replace(/\\circ/g, "°");

  Object.entries(greekSymbols).forEach(([command, symbol]) => {
    normalized = normalized.replace(
      new RegExp(`\\\\${command}\\b`, "g"),
      symbol,
    );
  });

  return normalized
    .replace(/\^\{([^{}]+)\}/g, "^$1")
    .replace(/_\{([^{}]+)\}/g, "_$1")
    .replace(/[{}]/g, "")
    .replace(/\\([A-Za-z]+)/g, "$1")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
