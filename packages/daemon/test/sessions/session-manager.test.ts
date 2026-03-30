import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, it } from "node:test";
import { SHOGGOTH_AGENT_TOKEN_ENV } from "@shoggoth/authn";
import { formatAgentSessionUrn, parseAgentSessionUrn } from "@shoggoth/shared";
import { migrate, defaultMigrationsDir } from "../../src/db/migrate";
import { createSqliteAgentTokenStore } from "../../src/auth/sqlite-agent-tokens";
import { createSessionStore } from "../../src/sessions/session-store";
import { createSessionManager } from "../../src/sessions/session-manager";

describe("createSessionManager", () => {
  it("spawn mints URN, workspace under workspacesRoot/agentId, credential persists", () => {
    const db = new Database(":memory:");
    migrate(db, defaultMigrationsDir());
    const sessions = createSessionStore(db);
    const agentTokens = createSqliteAgentTokenStore(db);
    const workspacesRoot = mkdtempSync(join(tmpdir(), "shoggoth-ws-"));
    const mgr = createSessionManager({
      db,
      sessions,
      agentTokens,
      workspacesRoot,
      agentId: "pytest",
      defaultSessionPlatform: "discord",
      mintToken: () => "fixed-test-token",
    });
    const out = mgr.spawn({});
    assert.strictEqual(out.agentTokenEnvName, SHOGGOTH_AGENT_TOKEN_ENV);
    assert.strictEqual(out.agentToken, "fixed-test-token");
    assert.ok(parseAgentSessionUrn(out.sessionId));
    assert.strictEqual(agentTokens.validate("fixed-test-token", out.sessionId), true);
    const row = sessions.getById(out.sessionId);
    assert.ok(row);
    assert.strictEqual(row!.workspacePath, join(workspacesRoot, "pytest"));
    mgr.kill(out.sessionId);
    assert.strictEqual(agentTokens.validate("fixed-test-token", out.sessionId), false);
  });

  it("spawn with parentSessionId mints subagent URN and reuses parent agent workspace", () => {
    const db = new Database(":memory:");
    migrate(db, defaultMigrationsDir());
    const sessions = createSessionStore(db);
    const agentTokens = createSqliteAgentTokenStore(db);
    const workspacesRoot = mkdtempSync(join(tmpdir(), "shoggoth-ws-"));
    const mgr = createSessionManager({
      db,
      sessions,
      agentTokens,
      workspacesRoot,
      agentId: "parent",
      mintToken: () => "sub-session-token",
    });
    const parent = formatAgentSessionUrn("parent", "discord", "20000000-0000-4000-8000-000000000001");
    sessions.create({
      id: parent,
      workspacePath: join(workspacesRoot, "parent"),
      status: "active",
    });
    agentTokens.register(parent, "parent-raw");
    const out = mgr.spawn({ parentSessionId: parent });
    const parsed = parseAgentSessionUrn(out.sessionId);
    assert.ok(parsed);
    assert.strictEqual(parsed!.uuidChain.length, 2);
    const row = sessions.getById(out.sessionId);
    assert.ok(row);
    assert.strictEqual(row!.workspacePath, join(workspacesRoot, "parent"));
  });
});
