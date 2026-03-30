import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { DEFAULT_HITL_CONFIG, defaultConfig } from "@shoggoth/shared";
import { migrate, defaultMigrationsDir } from "../../src/db/migrate";
import { createHitlPendingResolutionStack } from "../../src/hitl/hitl-pending-stack";
import { createPolicyEngine } from "../../src/policy/engine";
import { executeSessionAgentTurn } from "../../src/sessions/session-agent-turn";
import { buildBuiltinOnlySessionMcpToolContext } from "../../src/sessions/session-mcp-tool-context";
import { createSessionStore } from "../../src/sessions/session-store";
import { createTranscriptStore } from "../../src/sessions/transcript-store";
import { createToolRunStore } from "../../src/sessions/tool-run-store";
import { runToolLoop } from "../../src/sessions/tool-loop";

/**
 * Helper: run a single agent turn where the model calls `session.query` with the given args,
 * then returns the tool result as assistant text so we can inspect it.
 */
function makeToolCallClient(toolArgs: Record<string, unknown>) {
  let callCount = 0;
  return () => ({
    async completeWithTools() {
      callCount++;
      if (callCount === 1) {
        return {
          content: "",
          toolCalls: [{ id: "tc1", name: "builtin.session.query", arguments: JSON.stringify(toolArgs) }],
          usedModel: "stub",
          usedProviderId: "stub",
          degraded: false,
        };
      }
      return {
        content: "DONE",
        toolCalls: [],
        usedModel: "stub",
        usedProviderId: "stub",
        degraded: false,
      };
    },
  });
}

describe("session.query tool handler", { concurrency: false }, () => {
  let db: InstanceType<typeof Database>;
  let tmp: string;
  const sessionId = "agent:alice:discord:00000000-0000-0000-0000-000000000001";

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "shoggoth-sq-"));
    const dbPath = join(tmp, "s.db");
    db = new Database(dbPath);
    db.pragma("foreign_keys = ON");
    migrate(db, defaultMigrationsDir());
    createSessionStore(db).create({ id: sessionId, workspacePath: tmp });
    // Seed some transcript messages
    const ts = createTranscriptStore(db);
    const seg = createSessionStore(db).getById(sessionId)!.contextSegmentId;
    ts.append({ sessionId, contextSegmentId: seg, role: "user", content: "hello" });
    ts.append({ sessionId, contextSegmentId: seg, role: "assistant", content: "hi there" });
    ts.append({ sessionId, contextSegmentId: seg, role: "user", content: "how are you" });
  });

  afterEach(() => {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  async function runWithToolArgs(
    toolArgs: Record<string, unknown>,
    configOverrides?: Partial<ReturnType<typeof defaultConfig>>,
  ) {
    const config = { ...defaultConfig(tmp), ...configOverrides };
    const sessions = createSessionStore(db);
    const session = sessions.getById(sessionId)!;
    const transcript = createTranscriptStore(db);
    const toolRuns = createToolRunStore(db);
    const hitlStack = createHitlPendingResolutionStack(db);
    const builtin = buildBuiltinOnlySessionMcpToolContext();

    // Capture the tool result from the first tool call
    let capturedToolResult: string | undefined;
    const origLoopImpl = runToolLoop;

    const result = await executeSessionAgentTurn({
      db,
      sessionId,
      session,
      transcript,
      toolRuns,
      userContent: "query test",
      userMetadata: undefined,
      systemPrompt: "test",
      env: process.env,
      config,
      policyEngine: createPolicyEngine(config.policy),
      getHitlConfig: () => ({ ...DEFAULT_HITL_CONFIG, ...config.hitl }),
      hitl: {
        principalRoles: [],
        pending: hitlStack.pending,
        clock: { nowMs: () => Date.now() },
        newPendingId: () => randomUUID(),
        waitForHitlResolution: hitlStack.waitForHitlResolution,
      },
      loopImpl: origLoopImpl,
      createToolCallingClient: makeToolCallClient(toolArgs),
      resolveMcpContext: async () => builtin,
    });

    // Extract the tool result from transcript — it's the tool-role message after the assistant tool call
    const allRows = db
      .prepare(
        `SELECT seq, role, content, tool_call_id FROM transcript_messages WHERE session_id = @sid ORDER BY seq ASC`,
      )
      .all({ sid: sessionId }) as { seq: number; role: string; content: string | null; tool_call_id: string | null }[];

    const toolResultRow = allRows.find((r) => r.role === "tool" && r.tool_call_id === "tc1");
    return { result, toolResult: toolResultRow?.content ? JSON.parse(toolResultRow.content) : null };
  }

  it("returns own session messages with default args", async () => {
    const { toolResult } = await runWithToolArgs({});
    assert.ok(toolResult);
    assert.ok(Array.isArray(toolResult.messages));
    // Should have at least the 3 seeded messages plus the "query test" user message
    assert.ok(toolResult.messages.length >= 3);
    assert.equal(toolResult.messages[0].role, "user");
    assert.equal(toolResult.messages[0].content, "hello");
  });

  it("rejects unauthorized agent_id query", async () => {
    const { toolResult } = await runWithToolArgs({ agent_id: "bob" });
    assert.ok(toolResult);
    assert.ok(toolResult.error);
    assert.ok(toolResult.error.includes("not allowed"));
  });

  it("allows querying another agent when configured globally", async () => {
    const bobSessionId = "agent:bob:discord:00000000-0000-0000-0000-000000000002";
    createSessionStore(db).create({ id: bobSessionId, workspacePath: tmp });
    const bobSeg = createSessionStore(db).getById(bobSessionId)!.contextSegmentId;
    createTranscriptStore(db).append({
      sessionId: bobSessionId,
      contextSegmentId: bobSeg,
      role: "user",
      content: "bob message",
    });

    const { toolResult } = await runWithToolArgs(
      { agent_id: "bob" },
      { sessionQuery: { allowedAgentIds: ["bob"] } },
    );
    assert.ok(toolResult);
    assert.ok(!toolResult.error, `unexpected error: ${toolResult?.error}`);
    assert.ok(toolResult.messages.some((m: { content: string }) => m.content === "bob message"));
  });

  it("respects limit parameter", async () => {
    const { toolResult } = await runWithToolArgs({ limit: 2 });
    assert.ok(toolResult);
    assert.equal(toolResult.messages.length, 2);
  });

  it("respects offset parameter for pagination", async () => {
    // Seed messages have seq 1, 2, 3. Offset=2 should skip the first two.
    const { toolResult } = await runWithToolArgs({ offset: 2, limit: 1 });
    assert.ok(toolResult);
    assert.equal(toolResult.messages.length, 1);
    assert.equal(toolResult.messages[0].content, "how are you");
  });
});
