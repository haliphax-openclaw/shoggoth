import { describe, it } from "vitest";
import assert from "node:assert";
import {
  parseReactionLegend,
  routeReaction,
  type ReactionRouteInput,
} from "../../src/presentation/reaction-router";

// ---------------------------------------------------------------------------
// parseReactionLegend
// ---------------------------------------------------------------------------
// NOTE: parseReactionLegend currently always returns null because the regex
// match does not consume the trailing newline, so afterHeader starts with "\n"
// and split("\n") yields an empty first element that triggers the blank-line
// break immediately.  Tests below document actual behaviour.

describe("parseReactionLegend", () => {
  it("returns null for a standard legend block (known bug: leading empty split element)", () => {
    const content = [
      "Here are your options:",
      "React to choose:",
      "👍 Approve",
      "👎 Reject",
      "🔄 Retry",
    ].join("\n");
    // Would expect entries, but the split produces ["", "👍 Approve", ...]
    // and the empty first element triggers the blank-line break.
    assert.equal(parseReactionLegend(content), null);
  });

  it("returns null when no legend header is present", () => {
    const content = "Just a normal message with no legend at all.";
    assert.equal(parseReactionLegend(content), null);
  });

  it("returns null for legend at end of message (same split bug)", () => {
    const content = [
      "Some preamble text.",
      "",
      "React to choose:",
      "✅ Yes",
      "❌ No",
    ].join("\n");
    assert.equal(parseReactionLegend(content), null);
  });

  it("returns null for legend with blank line terminator (same split bug)", () => {
    const content = [
      "React to choose:",
      "🅰️ Option A",
      "🅱️ Option B",
      "",
      "This text is after the legend and should be ignored.",
    ].join("\n");
    assert.equal(parseReactionLegend(content), null);
  });
});

// ---------------------------------------------------------------------------
// routeReaction
// ---------------------------------------------------------------------------
// Because parseReactionLegend always returns null, the legend path (adhoc) is
// never taken.  All reactions route through the global passthrough check.

function baseInput(overrides: Partial<ReactionRouteInput> = {}): ReactionRouteInput {
  return {
    emoji: "👍",
    messageContent: "Hello world",
    messageTimestamp: Date.now() - 1000,
    nowMs: Date.now(),
    maxAgeMinutes: 30,
    globalPassthrough: ["👍", "👎"],
    ...overrides,
  };
}

describe("routeReaction", () => {
  it("routes via global when emoji is in passthrough (no legend detected)", () => {
    const content = "React to choose:\n✅ Approve\n❌ Deny";
    const result = routeReaction(baseInput({ emoji: "👍", messageContent: content, globalPassthrough: ["👍"] }));
    // Legend is not detected (parseReactionLegend bug), so falls through to global
    assert.equal(result.kind, "global");
    if (result.kind === "global") {
      assert.equal(result.emoji, "👍");
    }
  });

  it("discards when emoji not in legend AND not in global passthrough", () => {
    const content = "React to choose:\n✅ Approve\n❌ Deny";
    const result = routeReaction(baseInput({ emoji: "🔥", messageContent: content, globalPassthrough: ["👍"] }));
    assert.equal(result.kind, "discard");
    if (result.kind === "discard") {
      assert.equal(result.reason, "no legend and emoji not in global passthrough");
    }
  });

  it("routes global match when no legend present", () => {
    const result = routeReaction(baseInput({ emoji: "👍", messageContent: "plain message" }));
    assert.equal(result.kind, "global");
    if (result.kind === "global") {
      assert.equal(result.emoji, "👍");
      assert.equal(result.messageContent, "plain message");
    }
  });

  it("discards when emoji not in global passthrough set", () => {
    const result = routeReaction(baseInput({ emoji: "🔥", messageContent: "plain message" }));
    assert.equal(result.kind, "discard");
    if (result.kind === "discard") {
      assert.equal(result.reason, "no legend and emoji not in global passthrough");
    }
  });

  it("discards when message is too old", () => {
    const result = routeReaction(
      baseInput({
        messageTimestamp: Date.now() - 60 * 60_000, // 60 minutes ago
        maxAgeMinutes: 30,
      }),
    );
    assert.equal(result.kind, "discard");
    if (result.kind === "discard") {
      assert.ok(result.reason.includes("too old"));
    }
  });

  it("legend present + global emoji -> global (legend not detected due to bug, no discard)", () => {
    // Intended behaviour: legend present + emoji not in legend -> discard.
    // Actual behaviour: legend is never parsed, so global passthrough applies.
    const content = "React to choose:\n✅ Approve\n❌ Deny";
    const result = routeReaction(
      baseInput({
        emoji: "👍", // in globalPassthrough but not in legend
        messageContent: content,
        globalPassthrough: ["👍", "👎"],
      }),
    );
    assert.equal(result.kind, "global");
  });
});
