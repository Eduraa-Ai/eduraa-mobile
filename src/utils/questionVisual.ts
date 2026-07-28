import type { QuestionVisualPayload } from "../types";

export type QuestionVisualContext = "interactive" | "results";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as UnknownRecord;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as UnknownRecord)
      : null;
  } catch {
    return null;
  }
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function textList(value: unknown) {
  return Array.isArray(value)
    ? value.map(text).filter((item): item is string => Boolean(item))
    : [];
}

function firstText(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return null;
}

function firstTextList(record: UnknownRecord, keys: string[]) {
  for (const key of keys) {
    const value = textList(record[key]);
    if (value.length) return value;
  }
  return [];
}

function assignText(
  target: UnknownRecord,
  key: string,
  source: UnknownRecord,
  sourceKeys: string[],
) {
  const value = firstText(source, sourceKeys);
  if (value) target[key] = value;
}

export function normalizeQuestionVisualPayload(
  questionValue: unknown,
): QuestionVisualPayload | null {
  const question = asRecord(questionValue);
  if (!question) return null;

  const looksLikeVisual = Boolean(
    firstText(question, [
      "kind",
      "asset_url",
      "image_url",
      "diagram_url",
      "url",
      "src",
    ]) || firstTextList(question, ["asset_urls", "image_urls", "urls"]).length,
  );
  const visual =
    (looksLikeVisual ? question : null) ||
    asRecord(question.visual_payload) ||
    asRecord(question.question_visual) ||
    asRecord(question.question_image) ||
    {};

  const urls = [
    firstText(visual, [
      "asset_url",
      "image_url",
      "question_image_url",
      "diagram_url",
      "url",
      "src",
    ]),
    ...firstTextList(visual, ["asset_urls", "image_urls", "urls"]),
    firstText(question, [
      "visual_asset_url",
      "question_image_url",
      "diagram_url",
    ]),
  ].filter((item): item is string => Boolean(item));
  const assetUrls = Array.from(new Set(urls));
  if (!assetUrls.length) return null;

  const result: UnknownRecord = {
    kind: firstText(visual, ["kind"]) || "generated_diagram",
    asset_url: assetUrls[0],
    asset_urls: assetUrls,
    alt_text:
      firstText(visual, ["alt_text", "alt", "caption", "description"]) ||
      firstText(question, ["visual_alt_text", "question_image_alt"]) ||
      "Question reference visual",
    captions: firstTextList(visual, ["captions"]),
  };

  assignText(result, "source_figure_id", visual, ["source_figure_id"]);
  const sourceFigureIds = firstTextList(visual, ["source_figure_ids"]);
  if (sourceFigureIds.length) result.source_figure_ids = sourceFigureIds;
  assignText(result, "placement", visual, ["placement"]);
  assignText(result, "layout", visual, ["layout"]);
  assignText(result, "figure_type", visual, ["figure_type"]);
  if (typeof visual.page_number === "number") {
    result.page_number = visual.page_number;
  }

  return result as unknown as QuestionVisualPayload;
}

export function resolveQuestionVisualUrl(
  assetUrl: string | null | undefined,
  apiBaseUrl: string,
) {
  const raw = String(assetUrl || "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;

  const baseUrl = apiBaseUrl.replace(/\/$/, "");
  if (raw.startsWith("/api/")) return `${baseUrl}${raw}`;

  const path = raw.split(/[?#]/, 1)[0];
  const fileName = path.split("/").pop()?.trim();
  if (!fileName) return null;
  return `${baseUrl}/api/v1/documents/visuals/${encodeURIComponent(fileName)}`;
}

export function getQuestionVisualAssetUrls(
  visualPayload: QuestionVisualPayload | null | undefined,
) {
  const urls = [
    ...(visualPayload?.asset_urls ?? []),
    visualPayload?.asset_url ?? "",
  ]
    .map((url) => url.trim())
    .filter(Boolean);

  return Array.from(new Set(urls));
}

export function isQuestionCropVisual(
  visualPayload: QuestionVisualPayload | null | undefined,
) {
  return (visualPayload?.kind ?? "") === "question_crop";
}

export function shouldShowQuestionStemText(
  visualPayload: QuestionVisualPayload | null | undefined,
  context: QuestionVisualContext,
) {
  if (!isQuestionCropVisual(visualPayload)) return true;
  if (getQuestionVisualAssetUrls(visualPayload).length === 0) return true;
  return context === "results";
}
