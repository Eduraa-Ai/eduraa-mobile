import type { QuestionVisualPayload } from "../types";

export type QuestionVisualContext = "interactive" | "results";

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
