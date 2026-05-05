// RED Phase 2: Write failing tests for builtin-search tool
// This file contains tests that will FAIL until the implementation is complete

import { describe, it, beforeEach, afterEach } from "vitest";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock implementation - this will fail until builtin-search is implemented
// For now, we'll simulate what the API should look like
interface BuiltinSearchParams {
  path: string;
  pattern: string;
  caseSensitive?: boolean;
  contextLines?: number;
  maxResults?: number;
}

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

// Mock registry and handler - this will be replaced with actual implementation
class MockBuiltinToolRegistry {
  async execute(
    _tool: string,
    args: Record<string, unknown>,
    _ctx: BuiltinToolContext,
  ): Promise<{ resultJson: string }> {
    // This mock implementation will fail the tests until real builtin-search is implemented
    // For now, simulate basic functionality that will fail the tests
    const _path = String(args.path ?? "");
    const _pattern = String(args.pattern ?? "");
    const _caseSensitive = args.caseSensitive === true;
    const _contextLines = Number(args.contextLines ?? 2);
    const _maxResults = Number(args.maxResults ?? 100);

    // This mock will return empty results or wrong format to ensure tests fail
    // Real implementation should use ripgrep or similar to find matches
    return {
      resultJson: JSON.stringify({
        matches: [],
        totalMatches: 0,
      }),
    };
  }
}

function stubCtx(workspacePath: string): BuiltinToolContext {
  return {
    workspacePath,
  };
}

describe("builtin-search", () => {
  let workspace: string;
  let registry: MockBuiltinToolRegistry;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "builtin-search-test-"));
    registry = new MockBuiltinToolRegistry();
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

      // This test will FAIL until builtin-search returns proper match structure
      const result = await registry.execute(
        "builtin-search",
        { path: "test.txt", pattern: "TODO:.*" } as BuiltinSearchParams,
        ctx,
      );
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

      // This test will FAIL until builtin-search includes context
      const result = await registry.execute(
        "builtin-search",
        { path: "context.txt", pattern: "MATCHED", contextLines: 2 } as BuiltinSearchParams,
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

      // This test will FAIL until builtin-search returns correct matchedText
      const result = await registry.execute(
        "builtin-search",
        { path: "matched.txt", pattern: "\\d+" } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.ok(parsed.matches.length > 0, "Should find the number");
      const match = parsed.matches[0];
      assert.strictEqual(match.matchedText, "123", "matchedText should be the actual regex match");
    });

    it("should handle multiple matches in same file", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "multiple.txt");
      writeFileSync(testFile, "first match\nsecond match\nthird match\n");

      // This test will FAIL until builtin-search handles multiple matches
      const result = await registry.execute(
        "builtin-search",
        { path: "multiple.txt", pattern: "match" } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.strictEqual(parsed.matches.length, 3, "Should find 3 matches");
      assert.strictEqual(parsed.totalMatches, 3, "totalMatches should be 3");
    });

    it("should return empty matches when pattern not found", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "no-match.txt");
      writeFileSync(testFile, "some content without the pattern\n");

      // This test will FAIL until builtin-search handles no-match case
      const result = await registry.execute(
        "builtin-search",
        { path: "no-match.txt", pattern: "nonexistent" } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.strictEqual(parsed.matches.length, 0, "Should return empty matches");
      assert.strictEqual(parsed.totalMatches, 0, "totalMatches should be 0");
    });
  });

  describe("case sensitivity option", () => {
    it("should be case-insensitive by default", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "case.txt");
      writeFileSync(testFile, "FOO bar\nfoo baz\nFoo qux\n");

      // This test will FAIL until builtin-search defaults to case-insensitive
      const result = await registry.execute(
        "builtin-search",
        { path: "case.txt", pattern: "foo" } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.strictEqual(parsed.matches.length, 3, "Should find all case variants");
    });

    it("should respect caseSensitive: true", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "case-sensitive.txt");
      writeFileSync(testFile, "FOO bar\nfoo baz\nFoo qux\n");

      // This test will FAIL until builtin-search respects caseSensitive flag
      const result = await registry.execute(
        "builtin-search",
        { path: "case-sensitive.txt", pattern: "FOO", caseSensitive: true } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.strictEqual(parsed.matches.length, 1, "Should find only exact case match");
      assert.strictEqual(parsed.matches[0].matchedText, "FOO", "Should match exact case");
    });

    it("should respect caseSensitive: false explicitly", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "case-insensitive.txt");
      writeFileSync(testFile, "FOO bar\nfoo baz\nFoo qux\n");

      // This test will FAIL until builtin-search respects caseSensitive: false
      const result = await registry.execute(
        "builtin-search",
        {
          path: "case-insensitive.txt",
          pattern: "FOO",
          caseSensitive: false,
        } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.strictEqual(parsed.matches.length, 3, "Should find all case variants");
    });

    it("should handle regex patterns with case-insensitive flag", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "regex-case.txt");
      writeFileSync(testFile, "VERSION 1.0\nversion 2.0\nVersion 3.0\n");

      // This test will FAIL until builtin-search handles regex case-insensitivity
      const result = await registry.execute(
        "builtin-search",
        { path: "regex-case.txt", pattern: "version", caseSensitive: false } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.strictEqual(parsed.matches.length, 3, "Should find all case variants with regex");
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

      // This test will FAIL until builtin-search defaults to 2 context lines
      const result = await registry.execute(
        "builtin-search",
        { path: "default-context.txt", pattern: "MATCH" } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.ok(parsed.matches.length > 0, "Should find the match");
      const match = parsed.matches[0];
      assert.ok(match.context.includes("before2"), "Should include 2 lines before");
      assert.ok(match.context.includes("before1"), "Should include 1 line before");
      assert.ok(match.context.includes("after1"), "Should include 1 line after");
      assert.ok(match.context.includes("after2"), "Should include 2 lines after");
    });

    it("should respect custom contextLines value", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "custom-context.txt");
      writeFileSync(
        testFile,
        "line 1: far before\nline 2: close before\nline 3: MATCH\nline 4: close after\nline 5: far after\n",
      );

      // This test will FAIL until builtin-search respects contextLines parameter
      const result = await registry.execute(
        "builtin-search",
        { path: "custom-context.txt", pattern: "MATCH", contextLines: 1 } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.ok(parsed.matches.length > 0, "Should find the match");
      const match = parsed.matches[0];
      assert.ok(match.context.includes("close before"), "Should include 1 line before");
      assert.ok(match.context.includes("close after"), "Should include 1 line after");
      assert.ok(!match.context.includes("far before"), "Should not include 2 lines before");
      assert.ok(!match.context.includes("far after"), "Should not include 2 lines after");
    });

    it("should handle contextLines: 0 (no context)", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "no-context.txt");
      writeFileSync(testFile, "line 1: before\nline 2: MATCH\nline 3: after\n");

      // This test will FAIL until builtin-search handles contextLines: 0
      const result = await registry.execute(
        "builtin-search",
        { path: "no-context.txt", pattern: "MATCH", contextLines: 0 } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.ok(parsed.matches.length > 0, "Should find the match");
      const match = parsed.matches[0];
      // Context might still include the matched line itself, but not surrounding lines
      assert.ok(!match.context.includes("before"), "Should not include lines before");
      assert.ok(!match.context.includes("after"), "Should not include lines after");
    });

    it("should handle large context values gracefully", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "large-context.txt");
      const lines = [];
      for (let i = 1; i <= 20; i++) {
        lines.push(`line ${i}`);
      }
      lines[10] = "MATCH"; // line 11 is the match
      writeFileSync(testFile, lines.join("\n"));

      // This test will FAIL until builtin-search handles large context values
      const result = await registry.execute(
        "builtin-search",
        { path: "large-context.txt", pattern: "MATCH", contextLines: 10 } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.ok(parsed.matches.length > 0, "Should find the match");
      const match = parsed.matches[0];
      assert.ok(match.context.includes("line 1"), "Should include lines far before");
      assert.ok(match.context.includes("line 20"), "Should include lines far after");
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

      // This test will FAIL until builtin-search defaults to 100 results
      const result = await registry.execute(
        "builtin-search",
        { path: "many-matches.txt", pattern: "match" } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.ok(parsed.matches.length <= 100, "Should not exceed default 100 results");
      assert.strictEqual(parsed.totalMatches, 150, "totalMatches should show actual count");
    });

    it("should respect custom maxResults value", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "limited-results.txt");
      const lines = [];
      for (let i = 1; i <= 50; i++) {
        lines.push(`match at line ${i}`);
      }
      writeFileSync(testFile, lines.join("\n"));

      // This test will FAIL until builtin-search respects maxResults parameter
      const result = await registry.execute(
        "builtin-search",
        { path: "limited-results.txt", pattern: "match", maxResults: 10 } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.strictEqual(parsed.matches.length, 10, "Should return exactly 10 results");
      assert.strictEqual(parsed.totalMatches, 50, "totalMatches should show actual count");
    });

    it("should handle maxResults larger than actual matches", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "few-matches.txt");
      writeFileSync(testFile, "match 1\nmatch 2\nmatch 3\n");

      // This test will FAIL until builtin-search handles maxResults larger than matches
      const result = await registry.execute(
        "builtin-search",
        { path: "few-matches.txt", pattern: "match", maxResults: 100 } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.strictEqual(parsed.matches.length, 3, "Should return all matches");
      assert.strictEqual(parsed.totalMatches, 3, "totalMatches should be 3");
    });

    it("should return empty array when maxResults is 0", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "zero-results.txt");
      writeFileSync(testFile, "match 1\nmatch 2\n");

      // This test will FAIL until builtin-search handles maxResults: 0
      const result = await registry.execute(
        "builtin-search",
        { path: "zero-results.txt", pattern: "match", maxResults: 0 } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.strictEqual(parsed.matches.length, 0, "Should return no matches");
      assert.strictEqual(parsed.totalMatches, 2, "totalMatches should still show actual count");
    });
  });

  describe("error handling for invalid patterns", () => {
    it("should handle invalid regex patterns gracefully", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "some content\n");

      // This test will FAIL until builtin-search handles invalid regex patterns
      const result = await registry.execute(
        "builtin-search",
        { path: "test.txt", pattern: "[invalid(" } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // Should return an error in the result, not throw
      assert.ok(parsed.error, "Should return an error message");
      assert.ok(
        parsed.error.includes("invalid"),
        "Error message should mention the invalid pattern",
      );
    });

    it("should handle empty pattern", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "some content\n");

      // This test will FAIL until builtin-search handles empty pattern
      const result = await registry.execute(
        "builtin-search",
        { path: "test.txt", pattern: "" } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // Should handle empty pattern gracefully (either error or empty results)
      assert.ok(
        parsed.error || parsed.matches !== undefined,
        "Should return either error or results",
      );
    });

    it("should handle non-existent file path", async () => {
      const ctx = stubCtx(workspace);

      // This test will FAIL until builtin-search handles non-existent files
      const result = await registry.execute(
        "builtin-search",
        { path: "nonexistent.txt", pattern: "test" } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.ok(parsed.error, "Should return an error for non-existent file");
      assert.ok(
        parsed.error.includes("not found") || parsed.error.includes("ENOENT"),
        "Error should indicate file not found",
      );
    });

    it("should handle directory as path (search in directory)", async () => {
      const ctx = stubCtx(workspace);
      const testFile1 = join(workspace, "file1.txt");
      const testFile2 = join(workspace, "file2.txt");
      writeFileSync(testFile1, "content with match\n");
      writeFileSync(testFile2, "other content\n");

      // This test will FAIL until builtin-search supports directory paths
      const result = await registry.execute(
        "builtin-search",
        { path: ".", pattern: "match" } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.ok(parsed.matches.length > 0, "Should find matches in directory");
      assert.ok(
        parsed.matches[0].filePath.includes("file1.txt"),
        "Should identify file with match",
      );
    });

    it("should handle regex special characters in pattern", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "special.txt");
      writeFileSync(testFile, "price: $100.00\n");

      // This test will FAIL until builtin-search handles special regex characters
      const result = await registry.execute(
        "builtin-search",
        { path: "special.txt", pattern: "\\$\\d+\\.\\d+" } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.ok(parsed.matches.length > 0, "Should find the price");
      assert.strictEqual(
        parsed.matches[0].matchedText,
        "$100.00",
        "Should match special characters",
      );
    });
  });

  describe("edge cases", () => {
    it("should handle empty file", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "empty.txt");
      writeFileSync(testFile, "");

      // This test will FAIL until builtin-search handles empty files
      const result = await registry.execute(
        "builtin-search",
        { path: "empty.txt", pattern: "test" } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.strictEqual(parsed.matches.length, 0, "Should return no matches");
      assert.strictEqual(parsed.totalMatches, 0, "totalMatches should be 0");
    });

    it("should handle file with only newlines", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "newlines.txt");
      writeFileSync(testFile, "\n\n\n");

      // This test will FAIL until builtin-search handles files with only newlines
      const result = await registry.execute(
        "builtin-search",
        { path: "newlines.txt", pattern: "test" } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.strictEqual(parsed.matches.length, 0, "Should return no matches");
    });

    it("should handle binary files gracefully", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "binary.bin");
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
      writeFileSync(testFile, binaryData);

      // This test will FAIL until builtin-search handles binary files
      const result = await registry.execute(
        "builtin-search",
        { path: "binary.bin", pattern: "test" } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // Should either skip binary files or handle them gracefully
      assert.ok(
        parsed.error || parsed.matches !== undefined,
        "Should return error or handle binary file",
      );
    });

    it("should handle very long lines", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "longline.txt");
      const longLine = "a".repeat(10000) + "MATCH" + "b".repeat(10000);
      writeFileSync(testFile, longLine);

      // This test will FAIL until builtin-search handles very long lines
      const result = await registry.execute(
        "builtin-search",
        { path: "longline.txt", pattern: "MATCH" } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.ok(parsed.matches.length > 0, "Should find match in long line");
    });

    it("should handle multiple files in directory", async () => {
      const ctx = stubCtx(workspace);
      const file1 = join(workspace, "file1.txt");
      const file2 = join(workspace, "file2.txt");
      writeFileSync(file1, "pattern in file1\n");
      writeFileSync(file2, "pattern in file2\n");

      // This test will FAIL until builtin-search handles multiple files
      const result = await registry.execute(
        "builtin-search",
        { path: ".", pattern: "pattern" } as BuiltinSearchParams,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson) as SearchResult;

      assert.ok(Array.isArray(parsed.matches), "Should return matches array");
      assert.ok(parsed.matches.length >= 2, "Should find matches in multiple files");
      const filePaths = parsed.matches.map((m: SearchMatch) => m.filePath);
      assert.ok(
        filePaths.some((p: string) => p.includes("file1.txt")),
        "Should find file1.txt",
      );
      assert.ok(
        filePaths.some((p: string) => p.includes("file2.txt")),
        "Should find file2.txt",
      );
    });
  });
});
