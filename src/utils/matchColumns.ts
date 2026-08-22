import type { MatchColumnsOptions } from "../types";

export type MatchColumnsRow = {
  /** Short label a student types when pairing, e.g. "1" or "A". */
  key: string;
  /** Item text with its list marker removed so the UI can supply its own. */
  label: string;
};

export type MatchColumnsRows = {
  left: MatchColumnsRow[];
  right: MatchColumnsRow[];
};

/**
 * Matches a leading list marker such as "1. ", "A) ", "iv) " or "3 - ".
 *
 * The marker is capped at three letters or two digits, and a hyphen separator
 * must be followed by whitespace, so ordinary text like "Non-metals are
 * brittle" keeps its first word.
 */
const PREFIX_RE = /^\s*([A-Za-z]{1,3}|\d{1,2})\s*(?:[.):]\s*|-\s+)/;

function normalizeKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .toUpperCase();
}

export function matchItemKey(item: string, fallback: string) {
  return normalizeKey(item.match(PREFIX_RE)?.[1] || fallback);
}

export function stripMatchPrefix(item: string) {
  return item.replace(PREFIX_RE, "").trim();
}

/**
 * Match-the-columns questions carry their options as {left, right} lists rather
 * than the {id, text} rows used by MCQs.
 */
export function isMatchColumnsOptions(
  options: unknown,
): options is MatchColumnsOptions {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return false;
  }
  const candidate = options as { left?: unknown; right?: unknown };
  return Array.isArray(candidate.left) || Array.isArray(candidate.right);
}

export function buildMatchColumnsRows(options: unknown): MatchColumnsRows {
  if (!isMatchColumnsOptions(options)) {
    return { left: [], right: [] };
  }
  const left = Array.isArray(options.left) ? options.left : [];
  const right = Array.isArray(options.right) ? options.right : [];
  return {
    left: left.map((item, index) => ({
      key: matchItemKey(String(item), String(index + 1)),
      label: stripMatchPrefix(String(item)),
    })),
    right: right.map((item, index) => ({
      key: matchItemKey(String(item), String.fromCharCode(65 + index)),
      label: stripMatchPrefix(String(item)),
    })),
  };
}
