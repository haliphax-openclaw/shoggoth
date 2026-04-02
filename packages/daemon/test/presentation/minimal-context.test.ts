import { describe, it } from "vitest";
import assert from "node:assert";
import {
  buildMinimalContextMessages,
  formatGlobalReactionEventContext,
  formatAdhocReactionEventContext,
} from "../../src/presentation/minimal-context";
import type { ChatMessage } from "@shoggoth/models";

// ---------------------------------------------------------------------------
// buildMinimalContextMessages
// ---------------------------------------------------------------------------

const SYSTEM = "You are a helpful assistant.";
const EVENT = "User reacted 👍";

function transcript(n: number): ChatMessage[] {
  const msgs: ChatMessage[] = [];
  for (let i = 0; i < n; i++) {
    msgs.push({ role: i % 2 === 0 ? "user" : "assistant", content: `msg-${i}` });
  }
  return msgs;
}

describe("buildMinimalContextMessages", () => {
  it("tailMessages=0 returns only system + event", () => {
    const result = buildMinimalContextMessages({
      systemPrompt: SYSTEM,
      fullTranscript: transcript(5),
      tailMessages: 0,
      eventContext: EVENT,
    });
    assert.equal(result.length, 2);
    assert.equal(result[0]!.role, "system");
    assert.equal(result[0]!.content, SYSTEM);
    assert.equal(result[1]!.role, "user");
    assert.equal(result[1]!.content, EVENT);
  });

  it("tailMessages=2 returns system + last 2 transcript msgs + event", () => {
    const full = transcript(5);
    const result = buildMinimalContextMessages({
      systemPrompt: SYSTEM,
      fullTranscript: full,
      tailMessages: 2,
      eventContext: EVENT,
    });
    assert.equal(result.length, 4); // system + 2 tail + event
    assert.equal(result[0]!.role, "system");
    assert.equal(result[1]!.content, "msg-3");
    assert.equal(result[2]!.content, "msg-4");
    assert.equal(result[3]!.content, EVENT);
  });

  it("tailMessages > transcript length includes entire transcript", () => {
    const full = transcript(3);
    const result = buildMinimalContextMessages({
      systemPrompt: SYSTEM,
      fullTranscript: full,
      tailMessages: 100,
      eventContext: EVENT,
    });
    assert.equal(result.length, 5); // system + 3 transcript + event
    assert.equal(result[1]!.content, "msg-0");
    assert.equal(result[2]!.content, "msg-1");
    assert.equal(result[3]!.content, "msg-2");
  });
});

// ---------------------------------------------------------------------------
// formatGlobalReactionEventContext
// ---------------------------------------------------------------------------

describe("formatGlobalReactionEventContext", () => {
  it("includes emoji and message content", () => {
    const ctx = formatGlobalReactionEventContext("👍", "Great job!");
    assert.ok(ctx.includes("👍"));
    assert.ok(ctx.includes("Great job!"));
  });

  it("truncates long messages at 500 chars", () => {
    const long = "x".repeat(600);
    const ctx = formatGlobalReactionEventContext("👍", long);
    // Should contain exactly 500 x's followed by ellipsis
    assert.ok(ctx.includes("x".repeat(500) + "\u2026"));
    assert.ok(!ctx.includes("x".repeat(501)));
  });

  it("does not truncate messages at exactly 500 chars", () => {
    const exact = "y".repeat(500);
    const ctx = formatGlobalReactionEventContext("👍", exact);
    assert.ok(ctx.includes(exact));
    assert.ok(!ctx.includes("\u2026"));
  });
});

// ---------------------------------------------------------------------------
// formatAdhocReactionEventContext
// ---------------------------------------------------------------------------

describe("formatAdhocReactionEventContext", () => {
  const legend = [
    { emoji: "✅", label: "Approve" },
    { emoji: "❌", label: "Deny" },
  ];

  it("marks the selected entry", () => {
    const ctx = formatAdhocReactionEventContext("✅", legend, "Pick one");
    assert.ok(ctx.includes("✅ Approve ← selected"));
    // Non-selected entry should NOT have the marker
    assert.ok(ctx.includes("❌ Deny"));
    assert.ok(!ctx.includes("❌ Deny ← selected"));
  });

  it("includes original message content", () => {
    const ctx = formatAdhocReactionEventContext("✅", legend, "Pick one");
    assert.ok(ctx.includes("Pick one"));
  });

  it("truncates long original message at 500 chars", () => {
    const long = "z".repeat(600);
    const ctx = formatAdhocReactionEventContext("✅", legend, long);
    assert.ok(ctx.includes("z".repeat(500) + "\u2026"));
    assert.ok(!ctx.includes("z".repeat(501)));
  });
});
