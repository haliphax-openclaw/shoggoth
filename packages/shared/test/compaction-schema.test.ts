import { describe, it } from "vitest";
import assert from "node:assert";
import { shoggothModelsCompactionSchema } from "../src/schema";

describe("shoggothModelsCompactionSchema contextWindowReserveTokens", () => {
  it("accepts valid contextWindowReserveTokens", () => {
    const result = shoggothModelsCompactionSchema.safeParse({
      contextWindowReserveTokens: 20_000,
    });
    assert.ok(result.success);
    assert.equal(result.data!.contextWindowReserveTokens, 20_000);
  });

  it("accepts config without contextWindowReserveTokens", () => {
    const result = shoggothModelsCompactionSchema.safeParse({});
    assert.ok(result.success);
    assert.equal(result.data!.contextWindowReserveTokens, undefined);
  });

  it("rejects contextWindowReserveTokens of 0", () => {
    const result = shoggothModelsCompactionSchema.safeParse({
      contextWindowReserveTokens: 0,
    });
    assert.ok(!result.success);
  });
});

describe("shoggothModelsCompactionSchema model", () => {
  it("accepts optional model string", () => {
    const result = shoggothModelsCompactionSchema.safeParse({
      model: "local/gemma4",
    });
    assert.ok(result.success);
    assert.equal(result.data!.model, "local/gemma4");
  });

  it("accepts config without model", () => {
    const result = shoggothModelsCompactionSchema.safeParse({});
    assert.ok(result.success);
    assert.equal(result.data!.model, undefined);
  });

  it("rejects empty model string", () => {
    const result = shoggothModelsCompactionSchema.safeParse({
      model: "",
    });
    assert.ok(!result.success);
  });
});

describe("shoggothModelsCompactionSchema compactionAbortTimeoutMs", () => {
  it("accepts valid compactionAbortTimeoutMs", () => {
    const result = shoggothModelsCompactionSchema.safeParse({
      compactionAbortTimeoutMs: 30_000,
    });
    assert.ok(result.success);
    assert.equal(result.data!.compactionAbortTimeoutMs, 30_000);
  });

  it("accepts config without compactionAbortTimeoutMs", () => {
    const result = shoggothModelsCompactionSchema.safeParse({});
    assert.ok(result.success);
    assert.equal(result.data!.compactionAbortTimeoutMs, undefined);
  });

  it("rejects compactionAbortTimeoutMs of 0", () => {
    const result = shoggothModelsCompactionSchema.safeParse({
      compactionAbortTimeoutMs: 0,
    });
    assert.ok(!result.success);
  });

  it("rejects negative compactionAbortTimeoutMs", () => {
    const result = shoggothModelsCompactionSchema.safeParse({
      compactionAbortTimeoutMs: -1,
    });
    assert.ok(!result.success);
  });
});

describe("shoggothModelsCompactionSchema preserveRecentMessages", () => {
  it("accepts optional preserveRecentMessages", () => {
    const result = shoggothModelsCompactionSchema.safeParse({
      preserveRecentMessages: 4,
    });
    assert.ok(result.success);
    assert.equal(result.data!.preserveRecentMessages, 4);
  });

  it("accepts empty config (all fields optional)", () => {
    const result = shoggothModelsCompactionSchema.safeParse({});
    assert.ok(result.success);
  });

  it("does not accept maxContextChars (removed)", () => {
    const result = shoggothModelsCompactionSchema.safeParse({
      maxContextChars: 80_000,
    });
    assert.ok(!result.success);
  });
});
