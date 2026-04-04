import { describe, it } from "vitest";
import assert from "node:assert";
import { createFailoverModelClient } from "../src/failover";
import type { ModelProvider, ModelCapabilities } from "../src/types";
import { ModelHttpError } from "../src/errors";

function mockProvider(
  id: string,
  behavior: "ok" | "503" | "429",
  content?: string,
  capabilities?: ModelCapabilities,
): ModelProvider {
  return {
    id,
    capabilities,
    async complete() {
      if (behavior === "ok") return { content: content ?? "ok" };
      if (behavior === "503") throw new ModelHttpError(503, "down");
      throw new ModelHttpError(429, "rate");
    },
    async completeWithTools() {
      if (behavior === "ok") return { content: content ?? "ok", toolCalls: [] };
      if (behavior === "503") throw new ModelHttpError(503, "down");
      throw new ModelHttpError(429, "rate");
    },
  };
}

describe("createFailoverModelClient", () => {
  it("uses first healthy entry in the chain", async () => {
    const c = createFailoverModelClient([
      { provider: mockProvider("a", "ok", "first"), model: "m1" },
      { provider: mockProvider("b", "ok", "second"), model: "m2" },
    ]);
    const r = await c.complete({ messages: [{ role: "user", content: "x" }] });
    assert.equal(r.content, "first");
    assert.equal(r.usedProviderId, "a");
    assert.equal(r.usedModel, "m1");
    assert.equal(r.degraded, false);
  });

  it("failovers on eligible errors and records degraded when not first", async () => {
    const c = createFailoverModelClient([
      { provider: mockProvider("a", "503"), model: "m1" },
      { provider: mockProvider("b", "ok", "backup"), model: "m2" },
    ]);
    const r = await c.complete({ messages: [{ role: "user", content: "x" }] });
    assert.equal(r.content, "backup");
    assert.equal(r.usedProviderId, "b");
    assert.equal(r.degraded, true);
  });

  it("uses explicit per-entry model override", async () => {
    const c = createFailoverModelClient([
      { provider: mockProvider("a", "ok", "x"), model: "custom" },
    ]);
    const r = await c.complete({
      model: "ignored",
      messages: [{ role: "user", content: "u" }],
    });
    assert.equal(r.usedModel, "custom");
  });

  it("throws after chain exhaustion", async () => {
    const c = createFailoverModelClient([
      { provider: mockProvider("a", "503"), model: "m1" },
      { provider: mockProvider("b", "503"), model: "m2" },
    ]);
    await assert.rejects(() =>
      c.complete({ messages: [{ role: "user", content: "x" }] }),
    );
  });

  it("does not failover on 401", async () => {
    const c = createFailoverModelClient([
      {
        provider: {
          id: "a",
          async complete() {
            throw new ModelHttpError(401, "bad key");
          },
          async completeWithTools() {
            throw new ModelHttpError(401, "bad key");
          },
        },
        model: "m1",
      },
      { provider: mockProvider("b", "ok", "never"), model: "m2" },
    ]);
    await assert.rejects(
      () => c.complete({ messages: [{ role: "user", content: "x" }] }),
      (e: unknown) => e instanceof ModelHttpError && e.status === 401,
    );
  });

  describe("capabilities", () => {
    it("exposes capabilities from the first hop's provider", () => {
      const c = createFailoverModelClient([
        {
          provider: mockProvider("a", "ok", "x", { imageInput: true }),
          model: "m1",
        },
      ]);
      assert.deepEqual(c.capabilities, { imageInput: true });
    });

    it("returns undefined capabilities when provider has none", () => {
      const c = createFailoverModelClient([
        { provider: mockProvider("a", "ok", "x"), model: "m1" },
      ]);
      assert.equal(c.capabilities, undefined);
    });

    it("merges hop capabilities with provider capabilities", () => {
      const c = createFailoverModelClient([
        {
          provider: mockProvider("a", "ok", "x", { imageInput: true }),
          model: "m1",
          capabilities: { imageInput: false },
        },
      ]);
      assert.deepEqual(c.capabilities, { imageInput: false });
    });

    it("hop capabilities override provider defaults", () => {
      const c = createFailoverModelClient([
        {
          provider: mockProvider("a", "ok", "x", { imageInput: true }),
          model: "m1",
          capabilities: { imageInput: false },
        },
      ]);
      assert.equal(c.capabilities?.imageInput, false);
    });

    it("uses hop capabilities when provider has none", () => {
      const c = createFailoverModelClient([
        {
          provider: mockProvider("a", "ok", "x"),
          model: "m1",
          capabilities: { imageInput: false },
        },
      ]);
      assert.deepEqual(c.capabilities, { imageInput: false });
    });

    it("uses provider capabilities when hop has none", () => {
      const c = createFailoverModelClient([
        {
          provider: mockProvider("a", "ok", "x", { imageInput: true }),
          model: "m1",
        },
      ]);
      assert.deepEqual(c.capabilities, { imageInput: true });
    });

    it("exposes capabilities from first hop (primary)", () => {
      const c = createFailoverModelClient([
        {
          provider: mockProvider("a", "ok", "x", { imageInput: true }),
          model: "m1",
        },
        {
          provider: mockProvider("b", "ok", "y", { imageInput: false }),
          model: "m2",
        },
      ]);
      assert.deepEqual(c.capabilities, { imageInput: true });
    });
  });
});