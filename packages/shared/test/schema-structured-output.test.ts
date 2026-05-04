import { describe, it } from "vitest";
import assert from "node:assert";
import { shoggothModelsConfigSchema, shoggothConfigFragmentSchema } from "../src/schema";

// ---------------------------------------------------------------------------
// shoggothModelDefaultInvocationSchema — responseSchema & structuredOutputMode
// ---------------------------------------------------------------------------
describe("shoggothModelDefaultInvocationSchema — structured output fields", () => {
  it("accepts valid responseSchema with a schema object", () => {
    const r = shoggothModelsConfigSchema.safeParse({
      defaultInvocation: {
        responseSchema: {
          schema: {
            type: "object",
            properties: { name: { type: "string" }, age: { type: "number" } },
            required: ["name"],
          },
        },
      },
    });
    assert.ok(r.success, `Expected success but got: ${JSON.stringify((r as any).error?.issues)}`);
    assert.deepEqual(r.data!.defaultInvocation!.responseSchema, {
      schema: {
        type: "object",
        properties: { name: { type: "string" }, age: { type: "number" } },
        required: ["name"],
      },
    });
  });

  it("accepts responseSchema with an empty schema object", () => {
    const r = shoggothModelsConfigSchema.safeParse({
      defaultInvocation: {
        responseSchema: { schema: {} },
      },
    });
    assert.ok(r.success, `Expected success but got: ${JSON.stringify((r as any).error?.issues)}`);
  });

  it("rejects responseSchema without schema field", () => {
    const r = shoggothModelsConfigSchema.safeParse({
      defaultInvocation: {
        responseSchema: {},
      },
    });
    assert.ok(!r.success, "Expected failure for responseSchema without schema field");
  });

  it("rejects responseSchema with extra unknown fields (strict mode)", () => {
    const r = shoggothModelsConfigSchema.safeParse({
      defaultInvocation: {
        responseSchema: {
          schema: { type: "object" },
          extraField: "not allowed",
        },
      },
    });
    assert.ok(!r.success, "Expected failure for responseSchema with extra fields");
  });

  it("rejects responseSchema when schema is not a record/object", () => {
    const r = shoggothModelsConfigSchema.safeParse({
      defaultInvocation: {
        responseSchema: { schema: "not-an-object" },
      },
    });
    assert.ok(!r.success, "Expected failure for non-object schema");
  });

  it("accepts structuredOutputMode 'strict'", () => {
    const r = shoggothModelsConfigSchema.safeParse({
      defaultInvocation: {
        structuredOutputMode: "strict",
      },
    });
    assert.ok(r.success, `Expected success but got: ${JSON.stringify((r as any).error?.issues)}`);
    assert.equal(r.data!.defaultInvocation!.structuredOutputMode, "strict");
  });

  it("accepts structuredOutputMode 'best-effort'", () => {
    const r = shoggothModelsConfigSchema.safeParse({
      defaultInvocation: {
        structuredOutputMode: "best-effort",
      },
    });
    assert.ok(r.success, `Expected success but got: ${JSON.stringify((r as any).error?.issues)}`);
    assert.equal(r.data!.defaultInvocation!.structuredOutputMode, "best-effort");
  });

  it("accepts structuredOutputMode 'none'", () => {
    const r = shoggothModelsConfigSchema.safeParse({
      defaultInvocation: {
        structuredOutputMode: "none",
      },
    });
    assert.ok(r.success, `Expected success but got: ${JSON.stringify((r as any).error?.issues)}`);
    assert.equal(r.data!.defaultInvocation!.structuredOutputMode, "none");
  });

  it("rejects invalid structuredOutputMode value", () => {
    const r = shoggothModelsConfigSchema.safeParse({
      defaultInvocation: {
        structuredOutputMode: "invalid",
      },
    });
    assert.ok(!r.success, "Expected failure for invalid structuredOutputMode");
  });

  it("rejects non-string structuredOutputMode", () => {
    const r = shoggothModelsConfigSchema.safeParse({
      defaultInvocation: {
        structuredOutputMode: 42,
      },
    });
    assert.ok(!r.success, "Expected failure for non-string structuredOutputMode");
  });

  it("accepts both responseSchema and structuredOutputMode together", () => {
    const r = shoggothModelsConfigSchema.safeParse({
      defaultInvocation: {
        responseSchema: {
          schema: {
            type: "object",
            properties: { items: { type: "array" } },
            required: ["items"],
          },
        },
        structuredOutputMode: "best-effort",
      },
    });
    assert.ok(r.success, `Expected success but got: ${JSON.stringify((r as any).error?.issues)}`);
    assert.equal(r.data!.defaultInvocation!.structuredOutputMode, "best-effort");
    assert.ok(r.data!.defaultInvocation!.responseSchema);
  });

  it("accepts defaultInvocation without structured output fields (optional)", () => {
    const r = shoggothModelsConfigSchema.safeParse({
      defaultInvocation: {
        maxOutputTokens: 4096,
        temperature: 0.7,
      },
    });
    assert.ok(r.success, `Expected success but got: ${JSON.stringify((r as any).error?.issues)}`);
    assert.equal(r.data!.defaultInvocation!.responseSchema, undefined);
    assert.equal(r.data!.defaultInvocation!.structuredOutputMode, undefined);
  });

  it("accepts structured output fields alongside all other invocation fields", () => {
    const r = shoggothModelsConfigSchema.safeParse({
      defaultInvocation: {
        maxOutputTokens: 8192,
        temperature: 0.3,
        thinking: { enabled: true, budgetTokens: 10000 },
        reasoningEffort: "high",
        requestExtras: { custom: true },
        responseSchema: { schema: { type: "object" } },
        structuredOutputMode: "strict",
      },
    });
    assert.ok(r.success, `Expected success but got: ${JSON.stringify((r as any).error?.issues)}`);
  });
});

// ---------------------------------------------------------------------------
// Config fragment schema — structured output fields in models.defaultInvocation
// ---------------------------------------------------------------------------
describe("shoggothConfigFragmentSchema — structured output in defaultInvocation", () => {
  it("accepts fragment with responseSchema in models.defaultInvocation", () => {
    const r = shoggothConfigFragmentSchema.safeParse({
      models: {
        defaultInvocation: {
          responseSchema: {
            schema: { type: "object", properties: { result: { type: "string" } } },
          },
        },
      },
    });
    assert.ok(r.success, `Expected success but got: ${JSON.stringify((r as any).error?.issues)}`);
  });

  it("accepts fragment with structuredOutputMode in models.defaultInvocation", () => {
    const r = shoggothConfigFragmentSchema.safeParse({
      models: {
        defaultInvocation: {
          structuredOutputMode: "best-effort",
        },
      },
    });
    assert.ok(r.success, `Expected success but got: ${JSON.stringify((r as any).error?.issues)}`);
  });

  it("rejects fragment with invalid structuredOutputMode", () => {
    const r = shoggothConfigFragmentSchema.safeParse({
      models: {
        defaultInvocation: {
          structuredOutputMode: "turbo",
        },
      },
    });
    assert.ok(!r.success, "Expected failure for invalid structuredOutputMode in fragment");
  });
});
