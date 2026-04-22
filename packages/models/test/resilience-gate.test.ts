import { describe, it, expect } from "vitest";
import { ModelResilienceGate } from "../src/resilience/gate.js";

describe("ModelResilienceGate with TypeError fetch failures", () => {
  it("should retry TypeError('fetch failed') and eventually succeed", async () => {
    const gate = new ModelResilienceGate({
      maxRetries: 2,
      baseDelayMs: 10,
      maxDelayMs: 50,
    });

    let callCount = 0;
    const fn = async () => {
      callCount++;
      if (callCount === 1) {
        throw new TypeError("fetch failed");
      }
      return "success";
    };

    const result = await gate.executeWithResilience("test-provider", fn);
    expect(result).toBe("success");
    expect(callCount).toBe(2); // initial + 1 retry
  });

  it("should eventually throw TypeError('fetch failed') after all retries exhausted", async () => {
    const gate = new ModelResilienceGate({
      maxRetries: 2,
      baseDelayMs: 10,
      maxDelayMs: 50,
    });

    const fn = async () => {
      throw new TypeError("fetch failed");
    };

    await expect(
      gate.executeWithResilience("test-provider", fn),
    ).rejects.toThrow("fetch failed");
  });

  it("should not retry non-fetch TypeErrors", async () => {
    const gate = new ModelResilienceGate({
      maxRetries: 2,
      baseDelayMs: 10,
      maxDelayMs: 50,
    });

    let callCount = 0;
    const fn = async () => {
      callCount++;
      throw new TypeError("some other error");
    };

    await expect(
      gate.executeWithResilience("test-provider", fn),
    ).rejects.toThrow("some other error");
    expect(callCount).toBe(1); // no retries for non-fetch errors
  });
});
