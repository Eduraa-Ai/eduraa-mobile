import type { ChatRequest } from "../types";

export interface StreamEvent {
  type?: string;
  event?: string;
  delta?: string;
  token?: string;
  text?: string;
  content?: string;
  response?: string;
  conversation_id?: string;
  message_id?: string;
  timestamp?: string;
  detail?: string;
  error?: string;
}

export function decodeStreamEvent(raw: string): StreamEvent | null {
  const value = raw.trim();
  if (!value || value === "[DONE]") return null;
  try {
    return JSON.parse(value) as StreamEvent;
  } catch {
    return { delta: value };
  }
}

export function eventDelta(event: StreamEvent) {
  const eventType = (event.type || event.event || "").toLowerCase();
  if (event.delta) return event.delta;
  if (event.token) return event.token;
  if (
    eventType.includes("token") ||
    eventType.includes("delta") ||
    eventType.includes("chunk") ||
    eventType === "content" ||
    eventType === "message" ||
    (!eventType && Boolean(event.content || event.text))
  ) {
    return event.content || event.text || "";
  }
  return "";
}

export function streamEventError(event: StreamEvent) {
  const eventType = (event.type || event.event || "").toLowerCase();
  if (event.error || event.detail) return event.error || event.detail || "";
  if (eventType === "error") {
    return event.content || event.text || "The AI response could not be completed.";
  }
  return "";
}

export function buildAiStreamRequest(payload: ChatRequest) {
  const requiresLegacyContext = Boolean(
    payload.paper_id || payload.question_id || payload.history?.length,
  );

  if (requiresLegacyContext) {
    return {
      path: "/api/v1/ai/chat/stream",
      body: payload,
    };
  }

  return {
    path: "/api/v2/ai/chat/stream",
    body: {
      message: payload.message,
      ...(payload.conversation_id
        ? { conversation_id: payload.conversation_id }
        : {}),
    },
  };
}
