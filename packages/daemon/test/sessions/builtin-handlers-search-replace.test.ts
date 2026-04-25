import { describe, it } from "vitest";
import assert from "node:assert";
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  BuiltinToolRegistry,
  type BuiltinToolContext,
} from "../../src/sessions/builtin-tool-registry";
import { register as registerSearchReplace } from "../../src/sessions/builtin-handlers/search-replace-handler";

function makeTmpWorkspace(): string {
  const dir = join(tmpdir(), `shog-sr-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function stubCtx(workspacePath: string): BuiltinToolContext {
  return {
    sessionId: "agent:test:discord:channel:123",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: {} as any,
    env: {},
    workspacePath,
    creds: { uid: process.getuid!(), gid: process.getgid!() },
    orchestratorEnv: {},
    getAgentIntegrationInvoker: () => undefined,
    getProcessManager: () => undefined,
    messageToolCtx: undefined,
    memoryConfig: { paths: [], embeddings: { enabled: false } },
    runtimeOpenaiBaseUrl: undefined,
    isSubagentSession: false,
  };
}

async function exec(
  ws: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const reg = new BuiltinToolRegistry();
  registerSearchReplace(reg);
  const result = await reg.execute("search-replace", args, stubCtx(ws));
  return JSON.parse(result.resultJson);
}

// ---------------------------------------------------------------------------
// Search tests
// ---------------------------------------------------------------------------

describe("search-replace: search", () => {
  it("basic pattern search returns matches", async () => {
    const ws = makeTmpWorkspace();
    try {
      writeFileSync(join(ws, "hello.txt"), "hello world\nhello there\ngoodbye");
      const result = await exec(ws, { action: "search", pattern: "hello" });
      assert.ok(!result.error, `unexpected error: ${result.error}`);
      const output = result.output as string;
      assert.ok(output.includes("hello world"));
      assert.ok(output.includes("hello there"));
      assert.ok(!output.includes("goodbye"));
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("fixedStrings mode works", async () => {
    const ws = makeTmpWorkspace();
    try {
      writeFileSync(join(ws, "regex.txt"), "foo.bar\nfooXbar\n");
      const result = await exec(ws, {
        action: "search",
        pattern: "foo.bar",
        fixedStrings: true,
      });
      const output = result.output as string;
      // literal "foo.bar" matches only the first line
      assert.ok(output.includes("foo.bar"));
      assert.ok(!output.includes("fooXbar"));
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("fileType filter works", async () => {
    const ws = makeTmpWorkspace();
    try {
      writeFileSync(join(ws, "a.ts"), "needle");
      writeFileSync(join(ws, "b.json"), "needle");
      const result = await exec(ws, {
        action: "search",
        pattern: "needle",
        fileType: "ts",
      });
      const output = result.output as string;
      assert.ok(output.includes("a.ts"));
      assert.ok(!output.includes("b.json"));
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("glob filter works", async () => {
    const ws = makeTmpWorkspace();
    try {
      writeFileSync(join(ws, "keep.ts"), "needle");
      writeFileSync(join(ws, "skip.test.ts"), "needle");
      const result = await exec(ws, {
        action: "search",
        pattern: "needle",
        glob: "!*.test.ts",
      });
      const output = result.output as string;
      assert.ok(output.includes("keep.ts"));
      assert.ok(!output.includes("skip.test.ts"));
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("case-insensitive search works", async () => {
    const ws = makeTmpWorkspace();
    try {
      writeFileSync(join(ws, "case.txt"), "Hello HELLO hello");
      const result = await exec(ws, {
        action: "search",
        pattern: "hello",
        caseSensitive: false,
      });
      const output = result.output as string;
      assert.ok(output.includes("Hello HELLO hello"));
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("rejects paths outside workspace", async () => {
    const ws = makeTmpWorkspace();
    try {
      const result = await exec(ws, {
        action: "search",
        pattern: "x",
        path: "../../etc/passwd",
      });
      assert.ok(result.error);
      assert.ok((result.error as string).includes("escapes workspace"));
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("maxResults truncation", async () => {
    const ws = makeTmpWorkspace();
    try {
      const lines = Array.from({ length: 500 }, (_, i) => `match${i}`).join(
        "\n",
      );
      writeFileSync(join(ws, "big.txt"), lines);
      const result = await exec(ws, {
        action: "search",
        pattern: "match",
        maxResults: 10,
      });
      const output = result.output as string;
      const outputLines = output.trimEnd().split("\n");
      assert.ok(outputLines.length <= 11); // 10 results + possible truncation notice
      assert.ok(result.truncated === true);
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("search with direct file path (not directory)", async () => {
    const ws = makeTmpWorkspace();
    try {
      writeFileSync(join(ws, "target.txt"), "alpha\nbeta\ngamma\n");
      const result = await exec(ws, {
        action: "search",
        pattern: "beta",
        path: join(ws, "target.txt"),
      });
      assert.ok(!result.error, `unexpected error: ${result.error}`);
      const output = result.output as string;
      assert.ok(output.includes("beta"), "should find match in file");
      assert.ok(
        !output.includes("alpha"),
        "should not include non-matching lines",
      );
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});

// ---------------------------------------------------------------------------
// Replace tests
// ---------------------------------------------------------------------------

describe("search-replace: replace", () => {
  it("regex replacement replaces all occurrences by default", async () => {
    const ws = makeTmpWorkspace();
    try {
      writeFileSync(join(ws, "file.txt"), "foo bar foo baz");
      const result = await exec(ws, {
        action: "replace",
        file: "file.txt",
        match: "foo",
        replacement: "qux",
      });
      assert.ok(!result.error, `unexpected error: ${result.error}`);
      assert.strictEqual(result.replacements, 2);
      const content = readFileSync(join(ws, "file.txt"), "utf8");
      assert.strictEqual(content, "qux bar qux baz");
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("regex capture groups work", async () => {
    const ws = makeTmpWorkspace();
    try {
      writeFileSync(join(ws, "file.txt"), "hello world\nhello there");
      const result = await exec(ws, {
        action: "replace",
        file: "file.txt",
        match: "hello (\\w+)",
        replacement: "hi $1",
      });
      assert.ok(!result.error);
      const content = readFileSync(join(ws, "file.txt"), "utf8");
      assert.strictEqual(content, "hi world\nhi there");
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("returns error for invalid regex", async () => {
    const ws = makeTmpWorkspace();
    try {
      writeFileSync(join(ws, "file.txt"), "hello");
      const result = await exec(ws, {
        action: "replace",
        file: "file.txt",
        match: "(unclosed",
        replacement: "x",
      });
      assert.ok(result.error);
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("count parameter limits replacements (literal fallback)", async () => {
    const ws = makeTmpWorkspace();
    try {
      writeFileSync(join(ws, "file.txt"), "aaa aaa aaa");
      const result = await exec(ws, {
        action: "replace",
        file: "file.txt",
        match: "aaa",
        replacement: "bbb",
        count: 2,
      });
      assert.strictEqual(result.replacements, 2);
      const content = readFileSync(join(ws, "file.txt"), "utf8");
      assert.strictEqual(content, "bbb bbb aaa");
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("rejects paths outside workspace", async () => {
    const ws = makeTmpWorkspace();
    try {
      const result = await exec(ws, {
        action: "replace",
        file: "../../etc/passwd",
        match: "root",
        replacement: "hacked",
      });
      assert.ok(result.error);
      assert.ok((result.error as string).includes("escapes workspace"));
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("returns error when match not found", async () => {
    const ws = makeTmpWorkspace();
    try {
      writeFileSync(join(ws, "file.txt"), "hello world");
      const result = await exec(ws, {
        action: "replace",
        file: "file.txt",
        match: "nonexistent",
        replacement: "x",
      });
      assert.ok(result.error);
      assert.ok((result.error as string).includes("not found"));
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("returns error for non-existent file", async () => {
    const ws = makeTmpWorkspace();
    try {
      const result = await exec(ws, {
        action: "replace",
        file: "nope.txt",
        match: "x",
        replacement: "y",
      });
      assert.ok(result.error);
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("fixedStrings mode treats match as literal string in replace", async () => {
    const ws = makeTmpWorkspace();
    try {
      writeFileSync(join(ws, "file.txt"), "call foo() and foo.bar[0] here");
      const result = await exec(ws, {
        action: "replace",
        file: "file.txt",
        match: "foo()",
        replacement: "bar()",
        fixedStrings: true,
      });
      assert.ok(!result.error, `unexpected error: ${result.error}`);
      assert.strictEqual(result.replacements, 1);
      const content = readFileSync(join(ws, "file.txt"), "utf8");
      assert.strictEqual(content, "call bar() and foo.bar[0] here");
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("multiline replace with fixedStrings", async () => {
    const ws = makeTmpWorkspace();
    try {
      writeFileSync(join(ws, "file.txt"), "line one\nline two\nline three\n");
      const result = await exec(ws, {
        action: "replace",
        file: "file.txt",
        match: "line one\nline two",
        replacement: "replaced block",
        fixedStrings: true,
        multiline: true,
      });
      assert.ok(!result.error, `unexpected error: ${result.error}`);
      assert.strictEqual(result.replacements, 1);
      const content = readFileSync(join(ws, "file.txt"), "utf8");
      assert.strictEqual(content, "replaced block\nline three\n");
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("multiline replace with regex and count limit", async () => {
    const ws = makeTmpWorkspace();
    try {
      writeFileSync(join(ws, "file.txt"), "start\nend\nstart\nend\n");
      const result = await exec(ws, {
        action: "replace",
        file: "file.txt",
        match: "start\\nend",
        replacement: "REPLACED",
        multiline: true,
        count: 1,
      });
      assert.ok(!result.error, `unexpected error: ${result.error}`);
      assert.strictEqual(result.replacements, 1);
      const content = readFileSync(join(ws, "file.txt"), "utf8");
      assert.strictEqual(content, "REPLACED\nstart\nend\n");
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("multiline replace fails without multiline flag", async () => {
    const ws = makeTmpWorkspace();
    try {
      writeFileSync(join(ws, "file.txt"), "line one\nline two\n");
      const result = await exec(ws, {
        action: "replace",
        file: "file.txt",
        match: "line one\nline two",
        replacement: "nope",
        fixedStrings: true,
      });
      assert.ok(
        result.error,
        "should error when multiline match attempted without multiline flag",
      );
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });

  it("fixedStrings mode with count-limited replace", async () => {
    const ws = makeTmpWorkspace();
    try {
      writeFileSync(join(ws, "file.txt"), "a.b a.b a.b");
      const result = await exec(ws, {
        action: "replace",
        file: "file.txt",
        match: "a.b",
        replacement: "x",
        fixedStrings: true,
        count: 2,
      });
      assert.ok(!result.error, `unexpected error: ${result.error}`);
      assert.strictEqual(result.replacements, 2);
      const content = readFileSync(join(ws, "file.txt"), "utf8");
      assert.strictEqual(content, "x x a.b");
    } finally {
      rmSync(ws, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  });
});
