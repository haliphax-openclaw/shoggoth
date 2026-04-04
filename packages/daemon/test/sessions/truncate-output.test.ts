import { describe, it } from "vitest";
import assert from "node:assert";
import { truncateToolOutput } from "../../src/sessions/builtin-handlers/truncate-output";

describe("truncateToolOutput", () => {
  it("returns short text unchanged", () => {
    assert.equal(truncateToolOutput("hello"), "hello");
  });

  it("returns text at exactly 50k unchanged", () => {
    const text = "x".repeat(50_000);
    assert.equal(truncateToolOutput(text), text);
  });

  it("truncates text over 50k to first 10k + notice + last 10k", () => {
    const text = "A".repeat(10_000) + "B".repeat(40_001) + "C".repeat(10_000);
    const result = truncateToolOutput(text);
    assert.ok(result.startsWith("A".repeat(10_000)));
    assert.ok(result.includes("[... truncated"));
    assert.ok(result.endsWith("C".repeat(10_000)));
    assert.ok(result.length < text.length);
  });

  it("preserves first and last 10k characters exactly", () => {
    const head = "H".repeat(10_000);
    const tail = "T".repeat(10_000);
    const text = head + "M".repeat(50_000) + tail;
    const result = truncateToolOutput(text);
    assert.equal(result.slice(0, 10_000), head);
    assert.equal(result.slice(-10_000), tail);
  });
});
