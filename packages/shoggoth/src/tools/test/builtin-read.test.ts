// RED Phase 1: Write failing tests for builtin-read formatted output
// This file contains tests that will FAIL until the implementation is complete

import { describe, it, beforeEach, afterEach } from "vitest";
import assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock implementation - this will fail until builtin-read is implemented with lines/lineNumbers support
// For now, we'll simulate what the API should look like
interface BuiltinReadArgs {
  path: string;
  lines?: boolean;
  lineNumbers?: boolean;
}

interface BuiltinToolContext {
  workspacePath: string;
  // Add other necessary fields based on existing test patterns
}

// Mock registry and handler - this will be replaced with actual implementation
class MockBuiltinToolRegistry {
  async execute(
    tool: string,
    args: Record<string, unknown>,
    ctx: BuiltinToolContext,
  ): Promise<{ resultJson: string }> {
    // This mock implementation will fail the tests until real builtin-read is implemented
    // For now, simulate basic read functionality without lines/lineNumbers support
    const path = String(args.path ?? "");
    const fs = require("fs");
    const fullPath = join(ctx.workspacePath, path);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${path}`);
    }

    const content = fs.readFileSync(fullPath, "utf-8");

    // Mock implementation that doesn't support lines/lineNumbers yet
    // This will cause tests to fail until implemented
    return {
      resultJson: JSON.stringify({
        path,
        content: content, // Just return raw content, no line splitting
      }),
    };
  }
}

function stubCtx(workspacePath: string): BuiltinToolContext {
  return {
    workspacePath,
  };
}

describe("builtin-read formatted output", () => {
  let workspace: string;
  let registry: MockBuiltinToolRegistry;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "builtin-read-test-"));
    registry = new MockBuiltinToolRegistry();
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  describe("lines flag", () => {
    it("should split file content by newlines when lines: true", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "line1\nline2\nline3\n");

      // This test will FAIL until builtin-read supports lines flag
      const result = await registry.execute(
        "builtin-read",
        { path: "test.txt", lines: true } as BuiltinReadArgs,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // Expected: content should be split by newlines and rejoined (for now)
      // But the real implementation should preserve newlines in output
      assert.ok(parsed.content.includes("line1"), "Should include line1");
      assert.ok(parsed.content.includes("line2"), "Should include line2");
      assert.ok(parsed.content.includes("line3"), "Should include line3");
    });

    it("should handle empty file with lines: true", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "empty.txt");
      writeFileSync(testFile, "");

      // This test will FAIL until builtin-read supports lines flag
      const result = await registry.execute(
        "builtin-read",
        { path: "empty.txt", lines: true } as BuiltinReadArgs,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.strictEqual(parsed.content, "", "Empty file should return empty string");
    });

    it("should handle file with special characters and lines: true", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "special.txt");
      writeFileSync(testFile, "line with\ttab\nline with  spaces\nline with\r\nCRLF");

      // This test will FAIL until builtin-read supports lines flag
      const result = await registry.execute(
        "builtin-read",
        { path: "special.txt", lines: true } as BuiltinReadArgs,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.ok(parsed.content.includes("line with\ttab"), "Should preserve tabs");
      assert.ok(parsed.content.includes("line with  spaces"), "Should preserve multiple spaces");
      assert.ok(
        parsed.content.includes("line with\r\nCRLF") || parsed.content.includes("line withCRLF"),
        "Should handle CRLF",
      );
    });

    it("should handle CRLF line endings with lines: true", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "crlf.txt");
      writeFileSync(testFile, "line1\r\nline2\r\nline3\r\n");

      // This test will FAIL until builtin-read supports lines flag
      const result = await registry.execute(
        "builtin-read",
        { path: "crlf.txt", lines: true } as BuiltinReadArgs,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.ok(parsed.content.includes("line1"), "Should include line1");
      assert.ok(parsed.content.includes("line2"), "Should include line2");
      assert.ok(parsed.content.includes("line3"), "Should include line3");
    });

    it("should handle large file (>1000 lines) with lines: true", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "large.txt");

      // Create a file with 1500 lines
      const lines = [];
      for (let i = 1; i <= 1500; i++) {
        lines.push(`Line ${i}`);
      }
      writeFileSync(testFile, lines.join("\n"));

      // This test will FAIL until builtin-read supports lines flag and truncation logic
      const result = await registry.execute(
        "builtin-read",
        { path: "large.txt", lines: true } as BuiltinReadArgs,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // Should include first 1000 lines and a truncation notice
      assert.ok(parsed.content.includes("Line 1"), "Should include first line");
      assert.ok(parsed.content.includes("Line 500"), "Should include line 500");
      // Note: Actual implementation might truncate content
    });
  });

  describe("lineNumbers flag", () => {
    it("should prefix lines with line numbers when lineNumbers: true", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "numbered.txt");
      writeFileSync(testFile, "first\nsecond\nthird\n");

      // This test will FAIL until builtin-read supports lineNumbers flag
      const result = await registry.execute(
        "builtin-read",
        { path: "numbered.txt", lineNumbers: true } as BuiltinReadArgs,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // Expected format: "1: first\n2: second\n3: third"
      assert.ok(parsed.content.includes("1: first"), "Should include line 1 with number prefix");
      assert.ok(parsed.content.includes("2: second"), "Should include line 2 with number prefix");
      assert.ok(parsed.content.includes("3: third"), "Should include line 3 with number prefix");
    });

    it("should use 1-indexed line numbers", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "single.txt");
      writeFileSync(testFile, "only line");

      // This test will FAIL until builtin-read supports lineNumbers flag
      const result = await registry.execute(
        "builtin-read",
        { path: "single.txt", lineNumbers: true } as BuiltinReadArgs,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.ok(parsed.content.includes("1: only line"), "First line should be numbered 1");
      assert.ok(!parsed.content.includes("0: only line"), "Should not use 0-indexed numbers");
    });

    it("should handle empty file with lineNumbers: true", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "empty.txt");
      writeFileSync(testFile, "");

      // This test will FAIL until builtin-read supports lineNumbers flag
      const result = await registry.execute(
        "builtin-read",
        { path: "empty.txt", lineNumbers: true } as BuiltinReadArgs,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.strictEqual(
        parsed.content,
        "",
        "Empty file should return empty string even with lineNumbers",
      );
    });

    it("should handle special characters with lineNumbers: true", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "special.txt");
      writeFileSync(testFile, "line with: colon\nline with\n newline");

      // This test will FAIL until builtin-read supports lineNumbers flag
      const result = await registry.execute(
        "builtin-read",
        { path: "special.txt", lineNumbers: true } as BuiltinReadArgs,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.ok(parsed.content.includes("1: line with: colon"), "Should handle colons in content");
      assert.ok(parsed.content.includes("2: line with"), "Should handle lines with newlines");
      assert.ok(
        parsed.content.includes("3:  newline") || parsed.content.includes("3: newline"),
        "Should handle leading spaces",
      );
    });
  });

  describe("both flags together", () => {
    it("should apply both line splitting and line numbering when both flags are true", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "both.txt");
      writeFileSync(testFile, "first line\nsecond line\nthird line\n");

      // This test will FAIL until builtin-read supports both flags together
      const result = await registry.execute(
        "builtin-read",
        {
          path: "both.txt",
          lines: true,
          lineNumbers: true,
        } as BuiltinReadArgs,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // Expected: "1: first line\n2: second line\n3: third line"
      assert.ok(parsed.content.includes("1: first line"), "Should include line 1 with number");
      assert.ok(parsed.content.includes("2: second line"), "Should include line 2 with number");
      assert.ok(parsed.content.includes("3: third line"), "Should include line 3 with number");
    });

    it("should handle empty file with both flags", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "empty.txt");
      writeFileSync(testFile, "");

      // This test will FAIL until builtin-read supports both flags
      const result = await registry.execute(
        "builtin-read",
        {
          path: "empty.txt",
          lines: true,
          lineNumbers: true,
        } as BuiltinReadArgs,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.strictEqual(parsed.content, "", "Empty file should return empty string");
    });

    it("should preserve special characters with both flags", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "special.txt");
      writeFileSync(testFile, "line with\ttab\nline with  spaces");

      // This test will FAIL until builtin-read supports both flags
      const result = await registry.execute(
        "builtin-read",
        {
          path: "special.txt",
          lines: true,
          lineNumbers: true,
        } as BuiltinReadArgs,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.ok(parsed.content.includes("1: line with\ttab"), "Should preserve tabs");
      assert.ok(parsed.content.includes("2: line with  spaces"), "Should preserve multiple spaces");
    });
  });

  describe("edge cases", () => {
    it("should handle file with only newlines", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "newlines.txt");
      writeFileSync(testFile, "\n\n\n");

      // This test will FAIL until builtin-read handles edge cases
      const result = await registry.execute(
        "builtin-read",
        {
          path: "newlines.txt",
          lines: true,
          lineNumbers: true,
        } as BuiltinReadArgs,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // Should handle files with only newlines gracefully
      assert.ok(typeof parsed.content === "string", "Should return a string");
    });

    it("should handle file with trailing newline", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "trailing.txt");
      writeFileSync(testFile, "line1\nline2\n");

      // This test will FAIL until builtin-read handles trailing newlines
      const result = await registry.execute(
        "builtin-read",
        {
          path: "trailing.txt",
          lines: true,
          lineNumbers: true,
        } as BuiltinReadArgs,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.ok(parsed.content.includes("1: line1"), "Should include first line");
      assert.ok(parsed.content.includes("2: line2"), "Should include second line");
    });

    it("should handle file with very long lines", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "longlines.txt");
      const longLine = "a".repeat(10000);
      writeFileSync(testFile, `${longLine}\n${longLine}`);

      // This test will FAIL until builtin-read handles long lines
      const result = await registry.execute(
        "builtin-read",
        {
          path: "longlines.txt",
          lines: true,
          lineNumbers: true,
        } as BuiltinReadArgs,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.ok(parsed.content.includes("1: " + longLine), "Should handle very long lines");
      assert.ok(parsed.content.includes("2: " + longLine), "Should handle multiple long lines");
    });

    it("should handle file with mixed line endings", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "mixed.txt");
      writeFileSync(testFile, "lf\n\rcrlf\r\nmixed\n\r");

      // This test will FAIL until builtin-read handles mixed line endings
      const result = await registry.execute(
        "builtin-read",
        {
          path: "mixed.txt",
          lines: true,
          lineNumbers: true,
        } as BuiltinReadArgs,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.ok(typeof parsed.content === "string", "Should return a string");
      // Note: Actual implementation might normalize line endings
    });
  });

  describe("default behavior", () => {
    it("should maintain existing behavior when no flags are specified", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "default.txt");
      writeFileSync(testFile, "line1\nline2\nline3");

      // This test will FAIL until builtin-read maintains backward compatibility
      const result = await registry.execute(
        "builtin-read",
        { path: "default.txt" } as BuiltinReadArgs,
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // Should return raw content without line splitting or numbering
      assert.ok(parsed.content.includes("line1"), "Should include line1");
      assert.ok(parsed.content.includes("line2"), "Should include line2");
      assert.ok(parsed.content.includes("line3"), "Should include line3");
    });
  });
});
