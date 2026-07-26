import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAiStreamRequest,
  decodeStreamEvent,
  eventDelta,
  streamEventError,
} from "../src/api/aiStream";

test("ordinary AI Studio chat uses the same v2 stream as production web", () => {
  assert.deepEqual(
    buildAiStreamRequest({
      message: "Tell me about my profile and my name",
      conversation_id: "conversation-1",
    }),
    {
      path: "/api/v2/ai/chat/stream",
      body: {
        message: "Tell me about my profile and my name",
        conversation_id: "conversation-1",
      },
    },
  );
});

test("v1-only paper context remains on the endpoint that supports paper_id", () => {
  const payload = {
    message: "Explain question five",
    conversation_id: "conversation-1",
    paper_id: "paper-1",
  };

  assert.deepEqual(buildAiStreamRequest(payload), {
    path: "/api/v1/ai/chat/stream",
    body: payload,
  });
});

test("v2 token and error events are parsed without rendering error text", () => {
  const token = decodeStreamEvent(
    '{"type":"token","content":"Your name is JEE Tester."}',
  );
  const error = decodeStreamEvent(
    '{"type":"error","content":"LLM generation failed"}',
  );

  assert.equal(token && eventDelta(token), "Your name is JEE Tester.");
  assert.equal(error && eventDelta(error), "");
  assert.equal(error && streamEventError(error), "LLM generation failed");
});
