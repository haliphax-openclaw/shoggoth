import { describe, it } from "vitest";
import assert from "node:assert";
import {
  mergeModelInvocationParams,
  mergeModelInvocationOverlay,
  mergeSubagentSpawnModelSelection,
  parseModelInvocationFromUnknown,
} from "../src/invocation-merge";
import type { ShoggothModelsConfig } from "@shoggoth/shared";

// ---------------------------------------------------------------------------
// parseModelInvocationFromUnknown — responseSchema & structuredOutputMode
// ---------------------------------------------------------------------------
describe("parseModelInvocationFromUnknown — structured output fields", () => {
  it("parses responseSchema from raw JSON", () => {
    const p = parseModelInvocationFromUnknown({
      responseSchema: {
        schema: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
        },
      },
    });
    assert.ok(p.responseSchema, "responseSchema should be defined");
    assert.deepEqual(p.responseSchema.schema, {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    });
  });

  it("parses structuredOutputMode 'strict'", () => {
    const p = parseModelInvocationFromUnknown({ structuredOutputMode: "strict" });
    assert.equal(p.structuredOutputMode, "strict");
  });

  it("parses structuredOutputMode 'best-effort'", () => {
    const p = parseModelInvocationFromUnknown({ structuredOutputMode: "best-effort" });
    assert.equal(p.structuredOutputMode, "best-effort");
  });

  it("parses structuredOutputMode 'none'", () => {
    const p = parseModelInvocationFromUnknown({ structuredOutputMode: "none" });
    assert.equal(p.structuredOutputMode, "none");
  });

  it("ignores invalid structuredOutputMode values", () => {
    const p = parseModelInvocationFromUnknown({ structuredOutputMode: "invalid" });
    assert.equal(p.structuredOutputMode, undefined);
  });

  it("ignores non-string structuredOutputMode", () => {
    const p = parseModelInvocationFromUnknown({ structuredOutputMode: 123 });
    assert.equal(p.structuredOutputMode, undefined);
  });

  it("ignores non-object responseSchema", () => {
    const p = parseModelInvocationFromUnknown({ responseSchema: "not-an-object" });
    assert.equal(p.responseSchema, undefined);
  });

  it("ignores null responseSchema", () => {
    const p = parseModelInvocationFromUnknown({ responseSchema: null });
    assert.equal(p.responseSchema, undefined);
  });

  it("parses both fields together with other invocation params", () => {
    const p = parseModelInvocationFromUnknown({
      maxOutputTokens: 4096,
      temperature: 0.7,
      responseSchema: { schema: { type: "object" } },
      structuredOutputMode: "best-effort",
    });
    assert.equal(p.maxOutputTokens, 4096);
    assert.equal(p.temperature, 0.7);
    assert.deepEqual(p.responseSchema, { schema: { type: "object" } });
    assert.equal(p.structuredOutputMode, "best-effort");
  });
});

// ---------------------------------------------------------------------------
// mergeInvocations — overlay-wins semantics for structured output fields
// ---------------------------------------------------------------------------
describe("mergeInvocations — structured output overlay-wins", () => {
  it("overlay responseSchema wins over base", () => {
    const base: ShoggothModelsConfig = {
      defaultInvocation: {
        responseSchema: { schema: { type: "object", properties: { a: { type: "string" } } } },
      } as any,
    };
    const merged = mergeModelInvocationParams(base, {
      responseSchema: { schema: { type: "object", properties: { b: { type: "number" } } } },
    });
    assert.deepEqual(merged.responseSchema, {
      schema: { type: "object", properties: { b: { type: "number" } } },
    });
  });

  it("base responseSchema is used when overlay does not set it", () => {
    const base: ShoggothModelsConfig = {
      defaultInvocation: {
        responseSchema: { schema: { type: "object" } },
      } as any,
    };
    const merged = mergeModelInvocationParams(base, { temperature: 0.5 });
    assert.deepEqual(merged.responseSchema, { schema: { type: "object" } });
  });

  it("overlay structuredOutputMode wins over base", () => {
    const base: ShoggothModelsConfig = {
      defaultInvocation: {
        structuredOutputMode: "strict",
      } as any,
    };
    const merged = mergeModelInvocationParams(base, { structuredOutputMode: "best-effort" });
    assert.equal(merged.structuredOutputMode, "best-effort");
  });

  it("base structuredOutputMode is used when overlay does not set it", () => {
    const base: ShoggothModelsConfig = {
      defaultInvocation: {
        structuredOutputMode: "none",
      } as any,
    };
    const merged = mergeModelInvocationParams(base, { maxOutputTokens: 2048 });
    assert.equal(merged.structuredOutputMode, "none");
  });

  it("mergeModelInvocationOverlay applies overlay-wins for responseSchema", () => {
    const base = {
      responseSchema: { schema: { type: "string" } },
      temperature: 0.5,
    } as any;
    const overlay = {
      responseSchema: { schema: { type: "number" } },
    } as any;
    const merged = mergeModelInvocationOverlay(base, overlay);
    assert.deepEqual(merged.responseSchema, { schema: { type: "number" } });
    assert.equal(merged.temperature, 0.5);
  });

  it("mergeModelInvocationOverlay applies overlay-wins for structuredOutputMode", () => {
    const base = { structuredOutputMode: "strict" } as any;
    const overlay = { structuredOutputMode: "none" } as any;
    const merged = mergeModelInvocationOverlay(base, overlay);
    assert.equal(merged.structuredOutputMode, "none");
  });
});

// ---------------------------------------------------------------------------
// SESSION_INVOCATION_KEYS — responseSchema and structuredOutputMode are handled
// ---------------------------------------------------------------------------
describe("SESSION_INVOCATION_KEYS includes structured output fields", () => {
  it("mergeSubagentSpawnModelSelection strips and re-merges responseSchema", () => {
    const parent = {
      model: "provider/model",
      responseSchema: { schema: { type: "object", properties: { x: { type: "number" } } } },
    };
    const overlay = {
      responseSchema: { schema: { type: "object", properties: { y: { type: "string" } } } },
    };
    const merged = mergeSubagentSpawnModelSelection(parent, overlay) as Record<string, unknown>;
    // Overlay responseSchema should win
    assert.deepEqual(merged.responseSchema, {
      schema: { type: "object", properties: { y: { type: "string" } } },
    });
  });

  it("mergeSubagentSpawnModelSelection strips and re-merges structuredOutputMode", () => {
    const parent = {
      model: "provider/model",
      structuredOutputMode: "strict",
    };
    const overlay = {
      structuredOutputMode: "best-effort",
    };
    const merged = mergeSubagentSpawnModelSelection(parent, overlay) as Record<string, unknown>;
    assert.equal(merged.structuredOutputMode, "best-effort");
  });

  it("mergeSubagentSpawnModelSelection preserves parent responseSchema when overlay omits it", () => {
    const parent = {
      model: "provider/model",
      responseSchema: { schema: { type: "array" } },
    };
    const merged = mergeSubagentSpawnModelSelection(parent, {}) as Record<string, unknown>;
    assert.deepEqual(merged.responseSchema, { schema: { type: "array" } });
  });

  it("mergeSubagentSpawnModelSelection preserves parent structuredOutputMode when overlay omits it", () => {
    const parent = {
      model: "provider/model",
      structuredOutputMode: "none",
    };
    const merged = mergeSubagentSpawnModelSelection(parent, {}) as Record<string, unknown>;
    assert.equal(merged.structuredOutputMode, "none");
  });
});
