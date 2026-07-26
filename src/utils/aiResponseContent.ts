import {
  normalizeLatexContent,
  splitLatexContent,
} from "./latex";

const MATH_MARKER_OPEN = "\uE000EDURAA_MATH_";
const MATH_MARKER_CLOSE = "\uE001";
const INLINE_CODE_MARKER_OPEN = "\uE002EDURAA_CODE_";
const INLINE_CODE_MARKER_CLOSE = "\uE003";

export interface PreparedAIResponse {
  markdown: string;
  math: string[];
}

interface ResponseSection {
  kind: "prose" | "code";
  value: string;
  language?: string;
  closed?: boolean;
}

function splitFencedSections(value: string): ResponseSection[] {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const sections: ResponseSection[] = [];
  let prose: string[] = [];
  let fence: string[] | null = null;
  let fenceCharacter = "";
  let fenceLength = 0;
  let fenceLanguage = "";

  const flushProse = () => {
    if (prose.length) {
      sections.push({ kind: "prose", value: prose.join("\n") });
      prose = [];
    }
  };

  lines.forEach((line) => {
    if (!fence) {
      const opening = line.match(/^[ \t]{0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)?.*$/);
      if (!opening) {
        prose.push(line);
        return;
      }

      flushProse();
      fence = [line];
      fenceCharacter = opening[1][0];
      fenceLength = opening[1].length;
      fenceLanguage = (opening[2] || "").toLowerCase();
      return;
    }

    fence.push(line);
    const closing = line.match(/^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/);
    if (
      closing &&
      closing[1][0] === fenceCharacter &&
      closing[1].length >= fenceLength
    ) {
      sections.push({
        kind: "code",
        value: fence.join("\n"),
        language: fenceLanguage,
        closed: true,
      });
      fence = null;
      fenceCharacter = "";
      fenceLength = 0;
      fenceLanguage = "";
    }
  });

  const trailingFence = fence as string[] | null;
  if (trailingFence) {
    sections.push({
      kind: "code",
      value: trailingFence.join("\n"),
      language: fenceLanguage,
      closed: false,
    });
  }
  flushProse();

  return sections;
}

function protectInlineCode(value: string) {
  const code: string[] = [];
  let markdown = "";
  let index = 0;

  while (index < value.length) {
    if (value[index] !== "`") {
      markdown += value[index];
      index += 1;
      continue;
    }

    let delimiterLength = 1;
    while (value[index + delimiterLength] === "`") delimiterLength += 1;
    const delimiter = "`".repeat(delimiterLength);
    const closingIndex = value.indexOf(delimiter, index + delimiterLength);

    if (closingIndex === -1) {
      const marker = `${INLINE_CODE_MARKER_OPEN}${code.length}${INLINE_CODE_MARKER_CLOSE}`;
      code.push(value.slice(index));
      markdown += marker;
      break;
    }

    const end = closingIndex + delimiterLength;
    const marker = `${INLINE_CODE_MARKER_OPEN}${code.length}${INLINE_CODE_MARKER_CLOSE}`;
    code.push(value.slice(index, end));
    markdown += marker;
    index = end;
  }

  return { markdown, code };
}

function restoreInlineCode(value: string, code: string[]) {
  return value.replace(
    new RegExp(`${INLINE_CODE_MARKER_OPEN}(\\d+)${INLINE_CODE_MARKER_CLOSE}`, "g"),
    (_match, index: string) => code[Number(index)] ?? _match,
  );
}

function keepPunctuationWithEmphasis(value: string) {
  return value.replace(
    /(\*\*|__)([^*\n]+?)\1([,.;:!?])/g,
    (_match, delimiter: string, content: string, punctuation: string) =>
      `${delimiter}${content}${punctuation}${delimiter}`,
  );
}

function keepPunctuationWithMath(value: string, punctuation: string) {
  if (value.startsWith("$$")) {
    return `${value.slice(0, -2)}\\text{${punctuation}}$$`;
  }
  if (value.startsWith("$")) {
    return `${value.slice(0, -1)}\\text{${punctuation}}$`;
  }
  return `${value.slice(0, -2)}\\text{${punctuation}}${value.slice(-2)}`;
}

function preserveOuterWhitespace(value: string) {
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const end = trailing ? value.length - trailing.length : value.length;
  return {
    leading,
    core: value.slice(leading.length, end),
    trailing,
  };
}

function incompleteMathStart(value: string) {
  const candidates: number[] = [];
  const delimiterPairs = [
    [String.raw`\(`, String.raw`\)`],
    [String.raw`\[`, String.raw`\]`],
  ] as const;

  delimiterPairs.forEach(([opening, closing]) => {
    const openingIndex = value.lastIndexOf(opening);
    if (openingIndex > value.lastIndexOf(closing)) candidates.push(openingIndex);
  });

  let singleDollarOpening = -1;
  let doubleDollarOpening = -1;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "$" || value[index - 1] === "\\") continue;
    if (value[index + 1] === "$") {
      doubleDollarOpening =
        doubleDollarOpening === -1 ? index : -1;
      index += 1;
    } else {
      singleDollarOpening =
        singleDollarOpening === -1 ? index : -1;
    }
  }
  if (singleDollarOpening !== -1) candidates.push(singleDollarOpening);
  if (doubleDollarOpening !== -1) candidates.push(doubleDollarOpening);

  return candidates.length ? Math.min(...candidates) : -1;
}

function prepareProse(value: string, math: string[]) {
  const { leading, core, trailing } = preserveOuterWhitespace(value);
  if (!core) return value;

  const protectedCode = protectInlineCode(core);
  let unstableMathIndex = incompleteMathStart(protectedCode.markdown);
  while (
    unstableMathIndex > 0 &&
    /\s/.test(protectedCode.markdown[unstableMathIndex - 1])
  ) {
    unstableMathIndex -= 1;
  }
  const stableMarkdown =
    unstableMathIndex === -1
      ? protectedCode.markdown
      : protectedCode.markdown.slice(0, unstableMathIndex);
  const unstableMath =
    unstableMathIndex === -1
      ? ""
      : protectedCode.markdown.slice(unstableMathIndex);
  const normalized = normalizeLatexContent(
    keepPunctuationWithEmphasis(stableMarkdown),
  );
  const latexSegments = splitLatexContent(normalized);
  const prepared = latexSegments
    .map((segment, index) => {
      if (segment.kind === "text") return segment.value;
      const nextSegment = latexSegments[index + 1];
      const punctuation =
        nextSegment?.kind === "text"
          ? nextSegment.value.match(/^[,.;:!?]/)?.[0]
          : undefined;
      const mathValue = punctuation
        ? keepPunctuationWithMath(segment.value, punctuation)
        : segment.value;
      if (punctuation && nextSegment?.kind === "text") {
        nextSegment.value = nextSegment.value.slice(punctuation.length);
      }
      const marker = `${MATH_MARKER_OPEN}${math.length}${MATH_MARKER_CLOSE}`;
      math.push(mathValue);
      return marker;
    })
    .join("") + unstableMath;

  return `${leading}${restoreInlineCode(prepared, protectedCode.code)}${trailing}`;
}

function latexFenceContent(section: ResponseSection) {
  const lines = section.value.split("\n");
  return lines.slice(1, -1).join("\n").trim();
}

export function prepareAIResponseContent(value?: string | null): PreparedAIResponse {
  const math: string[] = [];
  if (!value) return { markdown: "", math };

  const markdown = splitFencedSections(String(value))
    .map((section) => {
      const isCompletedMathFence =
        section.kind === "code" &&
        section.closed &&
        ["latex", "tex", "math"].includes(section.language || "");

      if (isCompletedMathFence) {
        const expression = latexFenceContent(section);
        if (!expression) return "";
        const marker = `${MATH_MARKER_OPEN}${math.length}${MATH_MARKER_CLOSE}`;
        math.push(`\\[${expression}\\]`);
        return marker;
      }

      return section.kind === "code"
        ? section.value
        : prepareProse(section.value, math);
    })
    .join("\n");

  return { markdown, math };
}

export function restoreAIResponseMath(
  value: string,
  math: readonly string[],
) {
  return value.replace(
    new RegExp(`${MATH_MARKER_OPEN}(\\d+)${MATH_MARKER_CLOSE}`, "g"),
    (_match, index: string) => math[Number(index)] ?? _match,
  );
}

export function containsAIResponseMathMarker(value: string) {
  return value.includes(MATH_MARKER_OPEN);
}
