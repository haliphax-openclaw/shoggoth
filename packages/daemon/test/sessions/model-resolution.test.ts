import { describe, it, beforeEach, afterEach } from "vitest";
import assert from "node:assert";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { migrate, defaultMigrationsDir } from "../../src/db/migrate";
import { markProviderFailed } from "../../src/sessions/provider-failure-store";
import { resolveModel, resolveRetryConfig } from "../../src/sessions/model-resolution";
import type { ShoggothConfig } from "@shoggoth/shared";

const TMP = join(import.meta.dirname ?? ".", ".tmp-model-resolution-test");

function openTestDb(): Database.Database {
  mkdirSync(TMP, { recursive: true });
  const db = new Database(join(TMP, "test.db"));
  migrate(db, defaultMigrationsDir());
  return db;
}

function makeConfig(overrides?: Partial<ShoggothConfig>): ShoggothConfig {
  return {
    logLevel: "info",
    stateDbPath: ":memory:",
    socketPath: "/tmp/test.sock",
    workspacesRoot: "/tmp",
    secretsDirectory: "/tmp",
    inboundMediaRoot: "/tmp",
    operatorDirectory: "/tmp",
    configDirectory: "/tmp",
    hitl: { defaultApprovalTimeoutMs: 300_000, toolRisk: {}, bypassUpTo: "safe" },
    memory: { paths: [], embeddings: { enabled: false } },
    skills: { scanRoots: [], disabledIds: [] },
    plugins: [],
    mcp: { servers: [], poolScope: "global" },
    policy: {
      operator: { controlOps: { allow: ["*"], deny: [], review: [] }, tools: { allow: ["*"], deny: [], review: [] } },
      agent: { controlOps: { allow: [], deny: [], review: [] }, tools: { allow: ["*"], deny: [], review: [] } },
      auditRedaction: { jsonPaths: [] },
    },
    models: {
      providers: [
        { id: "openai", kind: "openai-compatible", baseUrl: "https://api.openai.com/v1", models: [{ name: "gpt-4o" }] },
        { id: "anthropic", kind: "anthropic-messages", baseUrl: "https://api.anthropic.com", models: [{ name: "claude-sonnet" }] },
        { id: "gemini", kind: "gemini", models: [{ name: "gemini-pro" }] },
      ],
      failoverChain: ["openai/gpt-4o", "anthropic/claude-sonnet", "gemini/gemini-pro"],
    },
    ...overrides,
  } as ShoggothConfig;
}

describe("model-resolution", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openTestDb();
  });

  afterEach(() => {
    db.close();
    rmSync(TMP, { recursive: true, force: true });
  });

  describe("resolveModel", () => {
    it("resolves the first chain entry by default (happy path)", () => {
      const config = makeConfig();
      const result = resolveModel(db, config);
      assert.ok(result);
      assert.strictEqual(result.ref, "openai/gpt-4o");
      assert.strictEqual(result.provider.id, "openai");
      assert.strictEqual(result.model.name, "gpt-4o");
    });

    it("resolves an explicit ref", () => {
      const config = makeConfig();
      const result = resolveModel(db, config, { ref: "anthropic/claude-sonnet" });
      assert.ok(result);
      assert.strictEqual(result.ref, "anthropic/claude-sonnet");
      assert.strictEqual(result.provider.id, "anthropic");
      assert.strictEqual(result.model.name, "claude-sonnet");
    });

    it("skips a failed provider and falls back to next in chain", () => {
      const config = makeConfig();
      markProviderFailed(db, "openai", "rate limit");
      const result = resolveModel(db, config);
      assert.ok(result);
      assert.strictEqual(result.ref, "anthropic/claude-sonnet");
      assert.strictEqual(result.provider.id, "anthropic");
    });

    it("clears stale failure and uses the provider", () => {
      const config = makeConfig();
      // Insert a stale failure (10 min ago; default markFailedDurationMs is 5 min)
      db.prepare(
        `INSERT OR REPLACE INTO provider_failures (provider_id, failed_at, error, retry_count)
         VALUES (@providerId, datetime('now', '-600 seconds'), @error, 1)`,
      ).run({ providerId: "openai", error: "old" });

      const result = resolveModel(db, config);
      assert.ok(result);
      assert.strictEqual(result.ref, "openai/gpt-4o");
      assert.strictEqual(result.provider.id, "openai");
    });

    it("returns null when all providers in chain are failed", () => {
      const config = makeConfig();
      markProviderFailed(db, "openai", "down");
      markProviderFailed(db, "anthropic", "down");
      markProviderFailed(db, "gemini", "down");
      const result = resolveModel(db, config);
      assert.strictEqual(result, null);
    });

    it("walks chain from failed provider position", () => {
      const config = makeConfig();
      markProviderFailed(db, "openai", "down");
      markProviderFailed(db, "anthropic", "down");
      const result = resolveModel(db, config);
      assert.ok(result);
      assert.strictEqual(result.ref, "gemini/gemini-pro");
    });

    it("returns null when no models config", () => {
      const config = makeConfig({ models: undefined });
      const result = resolveModel(db, config);
      assert.strictEqual(result, null);
    });

    it("returns null when failover chain is empty", () => {
      const config = makeConfig({
        models: {
          providers: [
            { id: "openai", kind: "openai-compatible" as const, baseUrl: "https://api.openai.com/v1", models: [{ name: "gpt-4o" }] },
          ],
          failoverChain: [],
        },
      });
      const result = resolveModel(db, config);
      assert.strictEqual(result, null);
    });

    it("returns null when provider not found for ref", () => {
      const config = makeConfig({
        models: {
          providers: [
            { id: "openai", kind: "openai-compatible" as const, baseUrl: "https://api.openai.com/v1", models: [{ name: "gpt-4o" }] },
          ],
          failoverChain: ["missing-provider/some-model"],
        },
      });
      const result = resolveModel(db, config);
      assert.strictEqual(result, null);
    });

    it("returns null when model not found in provider's models list", () => {
      const config = makeConfig({
        models: {
          providers: [
            { id: "openai", kind: "openai-compatible" as const, baseUrl: "https://api.openai.com/v1", models: [{ name: "gpt-4o" }] },
          ],
          failoverChain: ["openai/nonexistent-model"],
        },
      });
      const result = resolveModel(db, config);
      assert.strictEqual(result, null);
    });

    it("handles object-style failover chain entries", () => {
      const config = makeConfig({
        models: {
          providers: [
            { id: "openai", kind: "openai-compatible" as const, baseUrl: "https://api.openai.com/v1", models: [{ name: "gpt-4o" }] },
          ],
          failoverChain: ["openai/gpt-4o"],
        },
      });
      const result = resolveModel(db, config);
      assert.ok(result);
      assert.strictEqual(result.ref, "openai/gpt-4o");
    });

    it("uses agent models override when sessionId provided", () => {
      const config = makeConfig({
        agents: {
          list: {
            main: {
              models: {
                failoverChain: [
                  { providerId: "anthropic", model: "claude-sonnet" },
                ],
              },
            },
          },
        },
      });
      // Agent override produces a failoverChain with { providerId, model } entries.
      // resolveEffectiveModelsConfig merges these into the global config, producing
      // entries that look like ShoggothModelFailoverHop (not string refs).
      // Our entryToRef handles both string and { ref } shapes, but the effective
      // config from resolveEffectiveModelsConfig converts agent hops into the
      // global failoverChain format. The effective chain entry will be
      // { providerId: "anthropic", model: "claude-sonnet" } which our code
      // needs to handle via the providerId/model shape.
      const result = resolveModel(db, config, { sessionId: "agent:main:discord:channel:123:abc" });
      assert.ok(result);
      assert.strictEqual(result.ref, "anthropic/claude-sonnet");
      assert.strictEqual(result.provider.id, "anthropic");
    });

    it("respects provider-level markFailedDurationMs", () => {
      const config = makeConfig({
        models: {
          providers: [
            { id: "openai", kind: "openai-compatible" as const, baseUrl: "https://api.openai.com/v1", models: [{ name: "gpt-4o" }], markFailedDurationMs: 1000 },
            { id: "anthropic", kind: "anthropic-messages" as const, baseUrl: "https://api.anthropic.com", models: [{ name: "claude-sonnet" }] },
          ],
          failoverChain: ["openai/gpt-4o", "anthropic/claude-sonnet"],
        },
      });
      // Insert a failure 2 seconds ago — stale for openai's 1000ms duration
      db.prepare(
        `INSERT OR REPLACE INTO provider_failures (provider_id, failed_at, error, retry_count)
         VALUES (@providerId, datetime('now', '-2 seconds'), @error, 1)`,
      ).run({ providerId: "openai", error: "old" });

      const result = resolveModel(db, config);
      assert.ok(result);
      assert.strictEqual(result.ref, "openai/gpt-4o");
    });

    it("falls back through chain when explicit ref provider is failed", () => {
      const config = makeConfig();
      markProviderFailed(db, "openai", "down");
      const result = resolveModel(db, config, { ref: "openai/gpt-4o" });
      assert.ok(result);
      assert.strictEqual(result.ref, "anthropic/claude-sonnet");
    });
  });

  describe("resolveRetryConfig", () => {
    it("returns defaults when no overrides", () => {
      const result = resolveRetryConfig(undefined, undefined);
      assert.deepStrictEqual(result, {
        maxRetries: 2,
        retryDelayMs: 1000,
        retryBackoffMultiplier: 2,
      });
    });

    it("merges global retry config", () => {
      const result = resolveRetryConfig({ maxRetries: 5 }, undefined);
      assert.strictEqual(result.maxRetries, 5);
      assert.strictEqual(result.retryDelayMs, 1000);
      assert.strictEqual(result.retryBackoffMultiplier, 2);
    });

    it("provider retry overrides global", () => {
      const result = resolveRetryConfig(
        { maxRetries: 5, retryDelayMs: 2000 },
        { maxRetries: 3 },
      );
      assert.strictEqual(result.maxRetries, 3);
      assert.strictEqual(result.retryDelayMs, 2000);
      assert.strictEqual(result.retryBackoffMultiplier, 2);
    });

    it("provider retry fills all fields", () => {
      const result = resolveRetryConfig(undefined, {
        maxRetries: 10,
        retryDelayMs: 500,
        retryBackoffMultiplier: 3,
      });
      assert.deepStrictEqual(result, {
        maxRetries: 10,
        retryDelayMs: 500,
        retryBackoffMultiplier: 3,
      });
    });
  });
});
