import apiClient, { API_BASE_URL, getAccessToken } from "./client";
import { fetch } from "expo/fetch";
import type {
  ChatConversation,
  ChatConversationMemory,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  UserMemoryItem,
} from "../types";
import {
  buildAiStreamRequest,
  decodeStreamEvent,
  eventDelta,
  streamEventError,
} from "./aiStream";

export const aiApi = {
  /** List all conversations for the current user, newest first */
  listConversations: async (): Promise<ChatConversation[]> => {
    const res = await apiClient.get<ChatConversation[]>("/ai/conversations");
    return res.data;
  },

  /** Get all messages in a conversation */
  getMessages: async (conversationId: string): Promise<ChatMessage[]> => {
    const res = await apiClient.get<ChatMessage[]>(
      `/ai/conversations/${conversationId}/messages`,
    );
    return res.data;
  },

  getConversationMemory: async (
    conversationId: string,
  ): Promise<ChatConversationMemory> => {
    const res = await apiClient.get<ChatConversationMemory>(
      `/ai/conversations/${conversationId}/memory`,
    );
    return res.data;
  },

  listUserMemory: async (): Promise<UserMemoryItem[]> => {
    const res = await apiClient.get<UserMemoryItem[]>("/ai/memory/profile");
    return res.data;
  },

  deleteConversation: async (conversationId: string): Promise<void> => {
    await apiClient.delete(`/ai/conversations/${conversationId}`);
  },

  /** Send a chat message */
  chat: async (
    payload: ChatRequest,
    signal?: AbortSignal,
  ): Promise<ChatResponse> => {
    const res = await apiClient.post<ChatResponse>("/ai/chat", payload, {
      signal,
    });
    return res.data;
  },

  chatStream: async (
    payload: ChatRequest,
    onUpdate: (content: string) => void,
    signal?: AbortSignal,
  ): Promise<ChatResponse> => {
    const token = await getAccessToken();
    const streamRequest = buildAiStreamRequest(payload);
    const response = await fetch(`${API_BASE_URL}${streamRequest.path}`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(streamRequest.body),
      signal,
    });

    if (!response.ok) {
      let detail = `AI request failed (${response.status}).`;
      try {
        const body = await response.json();
        detail = body?.detail || detail;
      } catch {
        // Keep the status-based fallback when the server returns a non-JSON error.
      }
      throw new Error(detail);
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let streamedContent = "";
    let finalContent = "";
    let conversationId = payload.conversation_id || "";
    let messageId = "";
    let timestamp = new Date().toISOString();

    const consumeLine = (rawLine: string) => {
      const line = rawLine.trim();
      if (!line || line.startsWith(":") || line.startsWith("event:")) return;
      const event = decodeStreamEvent(
        line.startsWith("data:") ? line.slice(5) : line,
      );
      if (!event) return;

      const eventError = streamEventError(event);
      if (eventError) throw new Error(eventError);

      conversationId = event.conversation_id || conversationId;
      messageId = event.message_id || messageId;
      timestamp = event.timestamp || timestamp;

      const eventType = (event.type || event.event || "").toLowerCase();
      const isFinalEvent =
        eventType.includes("done") ||
        eventType.includes("final") ||
        eventType.includes("complete");
      if (isFinalEvent) {
        finalContent =
          event.response || event.content || event.text || finalContent;
      } else {
        const delta = eventDelta(event);
        if (delta) {
          streamedContent += delta;
          onUpdate(streamedContent);
        }
      }
      if (event.response) finalContent = event.response;
    };

    if (response.body?.getReader) {
      const reader = response.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        lines.forEach(consumeLine);
        if (done) break;
      }
      if (buffer.trim()) consumeLine(buffer);
    } else {
      const rawBody = await response.text();
      rawBody.split(/\r?\n/).forEach(consumeLine);
    }

    const content = finalContent || streamedContent;
    if (finalContent && finalContent !== streamedContent)
      onUpdate(finalContent);
    if (!content)
      throw new Error("Eduraa returned an empty response. Please try again.");

    return {
      response: content,
      timestamp,
      conversation_id: conversationId,
      message_id: messageId,
    };
  },
};
