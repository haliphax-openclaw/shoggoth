import { describe, it } from "vitest";
import assert from "node:assert";
import { shoggothModelsCompactionSchema } from "../src/schema";

describe("shoggothModelsCompactionSchema contextWindowThresholdPercent", () => {
  it("accepts valid contextWindowThresholdPercent", () => {
    const result = shoggothModelsCompactionSchema.safeParse({
      maxContextChars: 80_000,
      preserveRecentMessages: 8,
      contextWindowThresholdPercent: 75,
    });
    assert.ok(result.success);
    assert.equal(result.data!.contextWindowThresholdPercent, 75);
  });

  it("accepts config without contextWindowThresholdPercent", () => {
    const result = shoggothModelsCompactionSchema.safeParse({
      maxContextChars: 80_000,
      preserveRecentMessages: 8,
    });
    assert.ok(result.success);
    assert.equal(result.data!.contextWindowThresholdPercent, undefined);
  });

  it("rejects contextWindowThresholdPercent below 1", () => {
    const result = shoggothModelsCompactionSchema.safeParse({
      maxContextChars: 80_000,
      preserveRecentMessages: 8,
      contextWindowThresholdPercent: 0,
    });
    assert.ok(!result.success);
  });

  it("rejects contextWindowThresholdPercent above 100", () => {
    const result = shoggothModelsCompactionSchema.safeParse({
      maxContextChars: 80_000,
      preserveRecentMessages: 8,
      contextWindowThresholdPercent: 101,
    });
    assert.ok(!result.success);
  });
});
