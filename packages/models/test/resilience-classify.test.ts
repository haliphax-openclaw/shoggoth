import { describe, it, expect } from "vitest";
import { classifyModelError } from "../src/resilience/classify.js";

describe("classifyModelError", () => {
  it("should classify FETCH_FAILED as retryable", () => {
    const result = classifyModelError(0, "FETCH_FAILED");
    expect(result).toBe("retryable");
  });

  it("should still classify known retryable network codes as retryable", () => {
    expect(classifyModelError(0, "ECONNRESET")).toBe("retryable");
    expect(classifyModelError(0, "ETIMEDOUT")).toBe("retryable");
    expect(classifyModelError(0, "ECONNREFUSED")).toBe("retryable");
  });

  it("should classify rate limiting as rate_limited", () => {
    expect(classifyModelError(429)).toBe("rate_limited");
  });

  it("should classify retryable HTTP statuses as retryable", () => {
    expect(classifyModelError(500)).toBe("retryable");
    expect(classifyModelError(502)).toBe("retryable");
    expect(classifyModelError(503)).toBe("retryable");
    expect(classifyModelError(504)).toBe("retryable");
  });

  it("should classify unknown errors as non_retryable", () => {
    expect(classifyModelError(400)).toBe("non_retryable");
    expect(classifyModelError(401)).toBe("non_retryable");
    expect(classifyModelError(404)).toBe("non_retryable");
  });
});
