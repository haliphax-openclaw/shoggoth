// RED Phase 5: Write failing tests for dry-run mode
// This file contains tests that will FAIL until the implementation is complete

import { describe, it, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Import the actual implementation - but we'll call it in a way that will fail
import { builtinReplace } from "../builtin-replace";

interface BuiltinToolContext {
  workspacePath: string;
}

function stubCtx(workspacePath: string): BuiltinToolContext {
  return {
    workspacePath,
  };
}

describe("builtin-replace dry-run mode (RED PHASE)", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "builtin-replace-test-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  describe("dry-run mode does NOT modify file", () => {
    it("should not modify file when dryRun is true", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      const originalContent =
        "line 1: TODO: fix this\nline 2: regular text\nline 3: TODO: improve that\n";
      writeFileSync(testFile, originalContent);

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "TODO:.*", replacement: "DONE: $&", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // Verify dry-run reports changes would be made
      assert.ok(parsed.changesMade > 0, "Should report changes would be made");

      // RED PHASE: This should fail - expecting file NOT to be modified
      const currentContent = readFileSync(testFile, "utf-8");
      assert.strictEqual(
        currentContent,
        originalContent,
        "RED PHASE: This should fail - expecting file NOT to be modified in dry-run mode",
      );
    });

    it("should modify file when dryRun is false (normal mode)", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      const originalContent =
        "line 1: TODO: fix this\nline 2: regular text\nline 3: TODO: improve that\n";
      writeFileSync(testFile, originalContent);

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "TODO:.*", replacement: "DONE: $&", dryRun: false },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // Verify changes were reported
      assert.ok(parsed.changesMade > 0, "Should report changes were made");

      // GREEN PHASE: This should pass - expecting file TO be modified
      const currentContent = readFileSync(testFile, "utf-8");
      assert.notStrictEqual(
        currentContent,
        originalContent,
        "GREEN PHASE: This should pass - expecting file TO be modified when dryRun is false",
      );
    });

    it("should modify file when dryRun is omitted (defaults to false)", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      const originalContent = "line 1: TODO: fix this\nline 2: regular text\n";
      writeFileSync(testFile, originalContent);

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "TODO:.*", replacement: "DONE: $&" },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // Verify changes were reported (default is dryRun: false)
      assert.ok(parsed.changesMade > 0, "Should report changes were made");

      // GREEN PHASE: This should pass - expecting file TO be modified
      const currentContent = readFileSync(testFile, "utf-8");
      assert.notStrictEqual(
        currentContent,
        originalContent,
        "GREEN PHASE: This should pass - expecting file TO be modified when dryRun defaults to false",
      );
    });
  });

  describe("dry-run output shows proposed changes", () => {
    it("should include preview in output when dryRun is true", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "line 1: TODO: fix this\nline 2: regular text\n");

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "TODO:.*", replacement: "DONE: $&", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // RED PHASE: This should fail - expecting preview to exist
      assert.ok(
        parsed.preview,
        "RED PHASE: This should fail - expecting preview in dry-run output",
      );
      assert.ok(
        parsed.preview.length > 0,
        "RED PHASE: This should fail - expecting non-empty preview",
      );
    });

    it("should not include preview when dryRun is false", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "line 1: TODO: fix this\n");

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "TODO:.*", replacement: "DONE: $&", dryRun: false },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // RED PHASE: This should fail - expecting no preview
      assert.strictEqual(
        parsed.preview,
        undefined,
        "RED PHASE: This should fail - expecting no preview in normal mode",
      );
    });

    it("should not include preview when no matches found", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "line 1: regular text\n");

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "TODO:.*", replacement: "DONE: $&", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // RED PHASE: This should fail - expecting no preview
      assert.strictEqual(
        parsed.preview,
        undefined,
        "RED PHASE: This should fail - expecting no preview when no matches found",
      );
    });
  });

  describe("output includes line numbers and before/after", () => {
    it("should include line numbers in preview", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(
        testFile,
        "line 1: TODO: fix this\nline 2: regular text\nline 3: TODO: improve that\n",
      );

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "TODO:.*", replacement: "DONE: $&", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.ok(parsed.preview, "Should have preview");
      // RED PHASE: This should fail - expecting line numbers in preview
      assert.ok(
        parsed.preview.includes("Line 1") || parsed.preview.includes("line 1"),
        "RED PHASE: This should fail - expecting line numbers in preview",
      );
      assert.ok(
        parsed.preview.includes("Line 3") || parsed.preview.includes("line 3"),
        "RED PHASE: This should fail - expecting line numbers in preview",
      );
    });

    it("should include before/after text in preview", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "line 1: TODO: fix this\nline 2: regular text\n");

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "TODO:.*", replacement: "DONE: $&", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.ok(parsed.preview, "Should have preview");
      // RED PHASE: This should fail - expecting before/after text
      assert.ok(
        parsed.preview.includes("Before") || parsed.preview.includes("before"),
        "RED PHASE: This should fail - expecting 'Before' text in preview",
      );
      assert.ok(
        parsed.preview.includes("After") || parsed.preview.includes("after"),
        "RED PHASE: This should fail - expecting 'After' text in preview",
      );
      // Check for actual content
      assert.ok(
        parsed.preview.includes("TODO: fix this"),
        "RED PHASE: This should fail - expecting original text in preview",
      );
      assert.ok(
        parsed.preview.includes("DONE:"),
        "RED PHASE: This should fail - expecting replacement text in preview",
      );
    });

    it("should show multiple changes in preview", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "line 1: TODO: fix\nline 2: TODO: improve\nline 3: TODO: enhance\n");

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "TODO:.*", replacement: "DONE: $&", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.ok(parsed.preview, "Should have preview");
      // RED PHASE: This should fail - expecting all three changes in preview
      assert.ok(
        parsed.preview.includes("line 1") || parsed.preview.includes("Line 1"),
        "RED PHASE: This should fail - expecting line 1 in preview",
      );
      assert.ok(
        parsed.preview.includes("line 2") || parsed.preview.includes("Line 2"),
        "RED PHASE: This should fail - expecting line 2 in preview",
      );
      assert.ok(
        parsed.preview.includes("line 3") || parsed.preview.includes("Line 3"),
        "RED PHASE: This should fail - expecting line 3 in preview",
      );
    });
  });

  describe("test with multiple matches and no matches", () => {
    it("should handle multiple matches correctly in dry-run", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "match1\nmatch2\nmatch3\nmatch4\nmatch5\n");

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "match\\d+", replacement: "REPLACED", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // RED PHASE: This should fail - expecting 5 changes
      assert.strictEqual(
        parsed.changesMade,
        5,
        "RED PHASE: This should fail - expecting 5 changes reported",
      );

      // Verify file wasn't modified
      const currentContent = readFileSync(testFile, "utf-8");
      assert.ok(
        currentContent.includes("match1"),
        "RED PHASE: This should fail - expecting file NOT modified",
      );
    });

    it("should handle no matches correctly in dry-run", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "no matches here\njust regular text\n");

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "NONEXISTENT", replacement: "REPLACED", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // RED PHASE: This should fail - expecting 0 changes
      assert.strictEqual(
        parsed.changesMade,
        0,
        "RED PHASE: This should fail - expecting 0 changes when no matches found",
      );

      // Verify file wasn't modified
      const currentContent = readFileSync(testFile, "utf-8");
      assert.strictEqual(
        currentContent,
        "no matches here\njust regular text\n",
        "RED PHASE: This should fail - expecting file unchanged",
      );
    });

    it("should handle single match correctly in dry-run", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "only one match here\n");

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "match", replacement: "FOUND", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // RED PHASE: This should fail - expecting 1 change
      assert.strictEqual(
        parsed.changesMade,
        1,
        "RED PHASE: This should fail - expecting 1 change reported",
      );

      // Verify file wasn't modified
      const currentContent = readFileSync(testFile, "utf-8");
      assert.strictEqual(
        currentContent,
        "only one match here\n",
        "RED PHASE: This should fail - expecting file NOT modified",
      );
    });
  });

  describe("test dry-run output format is clear", () => {
    it("should include dry-run mode message in preview", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "TODO: fix this\n");

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "TODO:.*", replacement: "DONE: $&", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.ok(parsed.preview, "Should have preview");
      // RED PHASE: This should fail - expecting dry-run mode message
      assert.ok(
        parsed.preview.includes("dry-run") ||
          parsed.preview.includes("Dry-run") ||
          parsed.preview.includes("DRY-RUN"),
        "RED PHASE: This should fail - expecting dry-run mode indication in preview",
      );
    });

    it("should include replacement count in preview", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "TODO: fix\nTODO: improve\nTODO: enhance\n");

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "TODO:.*", replacement: "DONE: $&", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.ok(parsed.preview, "Should have preview");
      // RED PHASE: This should fail - expecting replacement count
      assert.ok(
        parsed.preview.includes("3") || parsed.preview.includes("three"),
        "RED PHASE: This should fail - expecting replacement count in preview",
      );
    });

    it("should use clear formatting for before/after", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "line with TODO\n");

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "TODO", replacement: "DONE", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.ok(parsed.preview, "Should have preview");
      // RED PHASE: This should fail - expecting clear before/after separation
      assert.ok(
        parsed.preview.includes("Before") ||
          parsed.preview.includes("before") ||
          parsed.preview.includes("Line"),
        "RED PHASE: This should fail - expecting clear before/after formatting",
      );
    });
  });

  describe("test safety limit (> 1000 matches warning)", () => {
    it("should warn when matches exceed 1000", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      // Create a file with 1500 matches
      const content = Array.from({ length: 1500 }, () => "match").join("\n");
      writeFileSync(testFile, content);

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "match", replacement: "REPLACED", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // RED PHASE: This should fail - expecting warning
      assert.ok(
        parsed.changesMade === 0 || parsed.warning,
        "RED PHASE: This should fail - expecting warning when matches exceed 1000",
      );

      // Verify file wasn't modified
      const currentContent = readFileSync(testFile, "utf-8");
      assert.ok(
        currentContent.includes("match"),
        "RED PHASE: This should fail - expecting file NOT modified when warning triggered",
      );
    });

    it("should allow exactly 1000 matches without warning", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      // Create a file with exactly 1000 matches
      const content = Array.from({ length: 1000 }, () => "match").join("\n");
      writeFileSync(testFile, content);

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "match", replacement: "REPLACED", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // RED PHASE: This should fail - expecting no warning for exactly 1000
      assert.strictEqual(
        parsed.changesMade,
        1000,
        "RED PHASE: This should fail - expecting exactly 1000 changes",
      );
      assert.strictEqual(
        parsed.warning,
        undefined,
        "RED PHASE: This should fail - expecting no warning for exactly 1000 matches",
      );
    });

    it("should allow 999 matches without warning", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      // Create a file with 999 matches
      const content = Array.from({ length: 999 }, () => "match").join("\n");
      writeFileSync(testFile, content);

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "match", replacement: "REPLACED", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // RED PHASE: This should fail - expecting no warning for 999
      assert.strictEqual(
        parsed.changesMade,
        999,
        "RED PHASE: This should fail - expecting 999 changes",
      );
      assert.strictEqual(
        parsed.warning,
        undefined,
        "RED PHASE: This should fail - expecting no warning for 999 matches",
      );
    });

    it("should warn for 1001 matches", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      // Create a file with 1001 matches
      const content = Array.from({ length: 1001 }, () => "match").join("\n");
      writeFileSync(testFile, content);

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "match", replacement: "REPLACED", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // RED PHASE: This should fail - expecting warning for 1001
      assert.ok(parsed.warning, "RED PHASE: This should fail - expecting warning for 1001 matches");
      assert.ok(
        parsed.warning.includes("1001") ||
          parsed.warning.includes("large") ||
          parsed.warning.includes("Large"),
        "RED PHASE: This should fail - expecting warning message about large number",
      );
    });
  });

  describe("dry-run with different replacement types", () => {
    it("should work with simple string replacement in dry-run", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "hello world\n");

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "world", replacement: "universe", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.strictEqual(parsed.changesMade, 1, "Should report 1 change");
      assert.ok(parsed.preview, "Should have preview");

      // Verify file wasn't modified
      const currentContent = readFileSync(testFile, "utf-8");
      assert.strictEqual(
        currentContent,
        "hello world\n",
        "RED PHASE: This should fail - expecting file NOT modified",
      );
    });

    it("should work with regex capture groups in dry-run", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "prefix-123-suffix\n");

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        { path: "test.txt", pattern: "(\\d+)", replacement: "[$1]", dryRun: true },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      assert.strictEqual(parsed.changesMade, 1, "Should report 1 change");
      assert.ok(parsed.preview, "Should have preview");
      assert.ok(
        parsed.preview.includes("123"),
        "RED PHASE: This should fail - expecting original number in preview",
      );

      // Verify file wasn't modified
      const currentContent = readFileSync(testFile, "utf-8");
      assert.strictEqual(
        currentContent,
        "prefix-123-suffix\n",
        "RED PHASE: This should fail - expecting file NOT modified",
      );
    });

    it("should work with case-insensitive replacement in dry-run", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "FOO bar\nfoo baz\nFoo qux\n");

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        {
          path: "test.txt",
          pattern: "foo",
          replacement: "BAR",
          caseSensitive: false,
          dryRun: true,
        },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // RED PHASE: This should fail - expecting 3 changes
      assert.strictEqual(
        parsed.changesMade,
        3,
        "RED PHASE: This should fail - expecting 3 case-insensitive changes",
      );

      // Verify file wasn't modified
      const currentContent = readFileSync(testFile, "utf-8");
      assert.strictEqual(
        currentContent,
        "FOO bar\nfoo baz\nFoo qux\n",
        "RED PHASE: This should fail - expecting file NOT modified",
      );
    });
  });

  describe("dry-run with maxOccurrences limit", () => {
    it("should respect maxOccurrences in dry-run", async () => {
      const ctx = stubCtx(workspace);
      const testFile = join(workspace, "test.txt");
      writeFileSync(testFile, "match1\nmatch2\nmatch3\nmatch4\nmatch5\n");

      // RED PHASE: This will fail because we're expecting wrong behavior
      const result = await builtinReplace(
        {
          path: "test.txt",
          pattern: "match\\d+",
          replacement: "REPLACED",
          maxOccurrences: 2,
          dryRun: true,
        },
        ctx,
      );
      const parsed = JSON.parse(result.resultJson);

      // RED PHASE: This should fail - expecting only 2 changes
      assert.strictEqual(
        parsed.changesMade,
        2,
        "RED PHASE: This should fail - expecting only 2 changes due to maxOccurrences",
      );

      // Verify file wasn't modified
      const currentContent = readFileSync(testFile, "utf-8");
      assert.ok(
        currentContent.includes("match3") ||
          currentContent.includes("match4") ||
          currentContent.includes("match5"),
        "RED PHASE: This should fail - expecting file NOT modified",
      );
    });
  });
});
