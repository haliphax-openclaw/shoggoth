import { describe, it } from "vitest";
import assert from "node:assert";
import { estimateTokensFromContent } from "../../src/sessions/session-stats-store";

describe("estimateTokensFromContent", () => {
  it("returns 0 for empty string", () => {
    assert.equal(estimateTokensFromContent(""), 0);
  });

  it("counts pure alphanumeric text at 4 chars/token", () => {
    // 40 alpha chars → 40/4 = 10
    assert.equal(estimateTokensFromContent("a".repeat(40)), 10);
  });

  it("counts JSON structural characters at 2 chars/token", () => {
    // {}[],:\" are structural → 8 chars / 2 = 4
    assert.equal(estimateTokensFromContent('{}[],:""'), 4);
  });

  it("handles mixed content correctly", () => {
    // {"key":"value"} → structural: { " " : " " } = 7, other: key + value = 8
    const input = '{"key":"value"}';
    const structural = 7;
    const other = input.length - structural;
    const expected = structural / 2 + other / 4;
    assert.equal(estimateTokensFromContent(input), expected);
  });

  it("treats whitespace, paths, and punctuation as non-structural", () => {
    const input = "hello world /usr/bin/node";
    // All non-structural → 24/4 = 6
    assert.equal(estimateTokensFromContent(input), input.length / 4);
  });

  it("handles a realistic tool result (JSON envelope around text)", () => {
    // Simulates a tool result: thin JSON wrapper around readable text
    const text = "The quick brown fox jumped over the lazy dog";
    const wrapped = `{"output":"${text}"}`;
    // structural chars: { " " : " " } → 7
    const structural = 7;
    const other = wrapped.length - structural;
    assert.equal(estimateTokensFromContent(wrapped), structural / 2 + other / 4);
  });
});
