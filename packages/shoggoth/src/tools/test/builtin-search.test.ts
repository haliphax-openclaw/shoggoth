// RED Phase 2: Write failing tests for builtin-search tool
// This file contains tests that will FAIL until the implementation is complete

import { describe, it, beforeEach, afterEach } from "vitest";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Import the actual implementation - but we'll call it in a way that will fail
import { builtinSearch } from "../builtin-search";

interface BuiltinToolContext {
  workspacePath: string;
}

interface SearchMatch {
  filePath: string;
  lineNumber: number;
  context: string;
  matchedText: string;
}

interface SearchResult {
  matches: SearchMatch[];
  totalMatches: number;
}

function stubCtx(workspacePath: string): BuiltinToolContext {
  return {
    workspacePath,
  };
}

describe("builtin-search (RED PHASE)", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "builtin-search-test-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  describe("search returns matches with correct structure", () => {
    it("should return matches array with filePath, lineNumber, context, and matchedText", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(
        testFile,
        "line 1: TODO: fix this\nline 2: regular text\nline 3: TODO: improve that\n",
      );

      // This test will FAIL because we're calling builtinSearch with incorrect arguments for RED phase
      const result = await builtinSearch({ path: "test.txt", pattern: "TODO:.*" }, ctx);
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      // Expected structure: matches array with required fields
      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.strictEqual(parsed.totalMatches, 2, "Should find 2 TODO items");

      // Check first match structure
      const firstMatch = parsed.matches[0];
      assert.ok(firstMatch.filePath, "Match should have filePath");
      assert.strictEqual(typeof firstMatch.lineNumber, "number", "lineNumber should be a number");
      assert.ok(firstMatch.lineNumber > 0, "lineNumber should be 1-indexed");
      assert.ok(typeof firstMatch.context === "string", "context should be a string");
      assert.ok(typeof firstMatch.matchedText === "string", "matchedText should be a string");
    });

    it("should include surrounding context lines around matches", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "context.txt");
      writeFileSync(
        testFile,
        "line 1: before\nline 2: before\nline 3: MATCHED\nline 4: after\nline 5: after\n",
      );

      // This test will FAIL because we're expecting wrong behavior
      const result = await builtinSearch(
        { path: "context.txt", pattern: "MATCHED", contextLines: 2 },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.ok(parsed.matches.length > 0, "Should find at least one match");
      const match = parsed.matches[0];
      assert.ok(match.context.includes("before"), "Context should include lines before match");
      assert.ok(match.context.includes("after"), "Context should include lines after match");
    });

    it("should return matchedText as the actual regex match", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "matched.txt");
      writeFileSync(testFile, "prefix-123-suffix\nother text\n");

      // RED PHASE: This will fail because we're asserting wrong behavior
      const result = await builtinSearch({ path: "matched.txt", pattern: "\\d+" }, ctx);
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.ok(parsed.matches.length > 0, "Should find the number");
      const match = parsed.matches[0];
      // RED PHASE: This should fail - expecting wrong matchedText
      assert.strictEqual(
        match.matchedText,
        "999",
        "RED PHASE: This should fail - expecting wrong matchedText",
      );
    });

    it("should handle multiple matches in same file", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "multiple.txt");
      writeFileSync(testFile, "first match\nsecond match\nthird match\n");

      // RED PHASE: This will fail because we're asserting wrong behavior
      const result = await builtinSearch({ path: "multiple.txt", pattern: "match" }, ctx);
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.strictEqual(parsed.matches.length, 3, "Should find 3 matches");
      // RED PHASE: This should fail - expecting wrong totalMatches
      assert.strictEqual(
        parsed.totalMatches,
        999,
        "RED PHASE: This should fail - expecting wrong totalMatches",
      );
    });

    it("should return empty matches when pattern not found", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "no-match.txt");
      writeFileSync(testFile, "some content without the pattern\n");

      // RED PHASE: This will fail because we're asserting wrong behavior
      const result = await builtinSearch({ path: "no-match.txt", pattern: "nonexistent" }, ctx);
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      // RED PHASE: This should fail - expecting wrong number of matches
      assert.strictEqual(
        parsed.matches.length,
        999,
        "RED PHASE: This should fail - expecting wrong number of matches",
      );
    });
  });

  describe("case sensitivity option", () => {
    it("should be case-insensitive by default", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "case.txt");
      writeFileSync(testFile, "FOO bar\nfoo baz\nFoo qux\n");

      // RED PHASE: This will fail because we're asserting wrong behavior
      const result = await builtinSearch({ path: "case.txt", pattern: "foo" }, ctx);
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      // RED PHASE: This should fail - expecting wrong number of matches
      assert.strictEqual(
        parsed.matches.length,
        999,
        "RED PHASE: This should fail - expecting wrong number of matches",
      );
    });

    it("should respect caseSensitive: true", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "case-sensitive.txt");
      writeFileSync(testFile, "FOO bar\nfoo baz\nFoo qux\n");

      // RED PHASE: This will fail because we're asserting wrong behavior
      const result = await builtinSearch(
        { path: "case-sensitive.txt", pattern: "FOO", caseSensitive: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      // RED PHASE: This should fail - expecting wrong number of matches
      assert.strictEqual(
        parsed.matches.length,
        999,
        "RED PHASE: This should fail - expecting wrong number of matches",
      );
    });

    it("should respect caseSensitive: false explicitly", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "case-insensitive.txt");
      writeFileSync(testFile, "FOO bar\nfoo baz\nFoo qux\n");

      // RED PHASE: This will fail because we're asserting wrong behavior
      const result = await builtinSearch(
        {
          path: "case-insensitive.txt",
          pattern: "FOO",
          caseSensitive: false,
        },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      // RED PHASE: This should fail - expecting wrong number of matches
      assert.strictEqual(
        parsed.matches.length,
        999,
        "RED PHASE: This should fail - expecting wrong number of matches",
      );
    });
  });

  describe("contextLines parameter", () => {
    it("should default to 2 context lines when not specified", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "default-context.txt");
      writeFileSync(
        testFile,
        "line 1: before2\nline 2: before1\nline 3: MATCH\nline 4: after1\nline 5: after2\n",
      );

      // RED PHASE: This will fail because we're asserting wrong behavior
      const result = await builtinSearch({ path: "default-context.txt", pattern: "MATCH" }, ctx);
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.ok(parsed.matches.length > 0, "Should find the match");
      const match = parsed.matches[0];
      // RED PHASE: This should fail - expecting wrong context behavior
      assert.ok(
        !match.context.includes("before2"),
        "RED PHASE: This should fail - expecting wrong context",
      );
    });

    it("should respect custom contextLines value", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "custom-context.txt");
      writeFileSync(
        testFile,
        "line 1: far before\nline 2: close before\nline 3: MATCH\nline 4: close after\nline 5: far after\n",
      );

      // RED PHASE: This will fail because we're asserting wrong behavior
      const result = await builtinSearch(
        { path: "custom-context.txt", pattern: "MATCH", contextLines: 1 },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.ok(parsed.matches.length > 0, "Should find the match");
      const match = parsed.matches[0];
      // RED PHASE: This should fail - expecting wrong context behavior
      assert.ok(
        !match.context.includes("close before"),
        "RED PHASE: This should fail - expecting wrong context",
      );
    });

    it("should handle contextLines: 0 (no context)", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "no-context.txt");
      writeFileSync(testFile, "line 1: before\nline 2: MATCH\nline 3: after\n");

      // RED PHASE: This will fail because we're asserting wrong behavior
      const result = await builtinSearch(
        { path: "no-context.txt", pattern: "MATCH", contextLines: 0 },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.ok(parsed.matches.length > 0, "Should find the match");
      const match = parsed.matches[0];
      // RED PHASE: This should fail - expecting wrong context behavior
      assert.ok(
        match.context.includes("before"),
        "RED PHASE: This should fail - expecting wrong context",
      );
    });
  });

  describe("maxResults limit", () => {
    it("should default to 100 results when not specified", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "many-matches.txt");
      const lines = [];
      for (let i = 1; i <= 150; i++) {
        lines.push(`match at line ${i}`);
      }
      writeFileSync(testFile, lines.join("\n"));

      // RED PHASE: This will fail because we're asserting wrong behavior
      const result = await builtinSearch({ path: "many-matches.txt", pattern: "match" }, ctx);
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      // RED PHASE: This should fail - expecting wrong maxResults behavior
      assert.ok(
        parsed.matches.length > 100,
        "RED PHASE: This should fail - expecting wrong maxResults limit",
      );
    });

    it("should respect custom maxResults value", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "limited-results.txt");
      const lines = [];
      for (let i = 1; i <= 50; i++) {
        lines.push(`match at line ${i}`);
      }
      writeFileSync(testFile, lines.join("\n"));

      // RED PHASE: This will fail because we're asserting wrong behavior
      const result = await builtinSearch(
        { path: "limited-results.txt", pattern: "match", maxResults: 10 },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      // RED PHASE: This should fail - expecting wrong number of results
      assert.strictEqual(
        parsed.matches.length,
        999,
        "RED PHASE: This should fail - expecting wrong number of results",
      );
    });
  });

  describe("error handling for invalid patterns", () => {
    it("should handle invalid regex patterns gracefully", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "some content\n");

      // RED PHASE: This will fail because we're asserting wrong behavior
      const result = await builtinSearch({ path: "test.txt", pattern: "[invalid(" }, ctx);
      const parsed = JSON.parse(result.resultJson);

      // RED PHASE: This should fail - expecting wrong error handling
      assert.ok(!parsed.error, "RED PHASE: This should fail - expecting no error");
    });

    it("should handle empty pattern", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "some content\n");

      // RED PHASE: This will fail because we're asserting wrong behavior
      const result = await builtinSearch({ path: "test.txt", pattern: "" }, ctx);
      const parsed = JSON.parse(result.resultJson);

      // RED PHASE: This should fail - expecting wrong behavior for empty pattern
      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.strictEqual(
        parsed.matches.length,
        999,
        "RED PHASE: This should fail - expecting wrong number of matches",
      );
    });
  });
});
