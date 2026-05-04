import { describe, it, beforeEach } from "vitest";
import assert from "node:assert";
import { createGeminiProvider } from "../src/gemini";
import { StructuredOutputValidationError } from "../src/response-validation";
import { setResilienceGate, ModelResilienceGate } from "../src/resilience";

// Disable retries so error tests don't wait on real backoff delays
beforeEach(() => {
  setResilienceGate(new ModelResilienceGate({ maxRetries: 0 }));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    count: { type: "number" },
  },
  required: ["name", "count"],
  additionalProperties: false,
};

const RESPONSE_SCHEMA = { schema: TEST_SCHEMA };

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "Read a file",
      parameters: { type: "object", properties: { path: { type: "string" } } },
    },
  },
];

function geminiTextResponse(text: string) {
  return {
    candidates: [{ content: { parts: [{ text }], role: "model" }, finishReason: "STOP" }],
  };
}

// ---------------------------------------------------------------------------
// Structured output: responseSchema present (default mode = best-effort)
// ---------------------------------------------------------------------------

describe("Gemini structured output — responseSchema present", () => {
  it("includes responseMimeType and responseSchema in generationConfig when responseSchema is set", async () => {
    let capturedBody: string | undefined;
    const conformantJson = JSON.stringify({ name: "Alice", count: 5 });
    const fetchImpl = async (_url: string | URL, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify(geminiTextResponse(conformantJson)), { status: 200 });
    };

    const p = createGeminiProvider({ id: "g", fetchImpl });

    await p.completeWithTools({
      model: "gemini-pro",
      messages: [{ role: "user", content: "give me data" }],
      tools: TOOLS,
      responseSchema: RESPONSE_SCHEMA,
    });

    const body = JSON.parse(capturedBody ?? "{}") as Record<string, unknown>;
    const genConfig = body.generationConfig as Record<string, unknown>;
    assert.ok(genConfig, "generationConfig should be present");
    assert.equal(
      genConfig.responseMimeType,
      "application/json",
      "responseMimeType should be application/json",
    );
    assert.ok(genConfig.responseSchema, "responseSchema should be present in generationConfig");
  });

  it("sanitizes the schema for Gemini (removes additionalProperties)", async () => {
    let capturedBody: string | undefined;
    const conformantJson = JSON.stringify({ name: "Alice", count: 5 });
    const fetchImpl = async (_url: string | URL, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify(geminiTextResponse(conformantJson)), { status: 200 });
    };

    const p = createGeminiProvider({ id: "g", fetchImpl });

    await p.completeWithTools({
      model: "gemini-pro",
      messages: [{ role: "user", content: "give me data" }],
      tools: TOOLS,
      responseSchema: RESPONSE_SCHEMA,
    });

    const body = JSON.parse(capturedBody ?? "{}") as Record<string, unknown>;
    const genConfig = body.generationConfig as Record<string, unknown>;
    const schema = genConfig?.responseSchema as Record<string, unknown>;
    assert.ok(schema, "responseSchema should be present in generationConfig");
    assert.equal(
      "additionalProperties" in schema,
      false,
      "additionalProperties should be stripped by sanitizeSchemaForGemini",
    );
  });

  it("also sets responseMimeType and responseSchema in complete() (non-tool path)", async () => {
    let capturedBody: string | undefined;
    const conformantJson = JSON.stringify({ name: "Bob", count: 10 });
    const fetchImpl = async (_url: string | URL, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify(geminiTextResponse(conformantJson)), { status: 200 });
    };

    const p = createGeminiProvider({ id: "g", fetchImpl });

    await p.complete({
      model: "gemini-pro",
      messages: [{ role: "user", content: "give me data" }],
      responseSchema: RESPONSE_SCHEMA,
    });

    const body = JSON.parse(capturedBody ?? "{}") as Record<string, unknown>;
    const genConfig = body.generationConfig as Record<string, unknown>;
    assert.ok(genConfig, "generationConfig should be present");
    assert.equal(genConfig.responseMimeType, "application/json");
    assert.ok(genConfig.responseSchema, "responseSchema should be present in generationConfig");
  });
});

// ---------------------------------------------------------------------------
// Structured output: post-validation
// ---------------------------------------------------------------------------

describe("Gemini structured output — post-validation", () => {
  it("runs post-validation and does NOT throw on conformant response", async () => {
    const conformantJson = JSON.stringify({ name: "Alice", count: 5 });
    const fetchImpl = async () =>
      new Response(JSON.stringify(geminiTextResponse(conformantJson)), { status: 200 });

    const p = createGeminiProvider({ id: "g", fetchImpl });

    const out = await p.completeWithTools({
      model: "gemini-pro",
      messages: [{ role: "user", content: "give me data" }],
      tools: TOOLS,
      responseSchema: RESPONSE_SCHEMA,
    });
    assert.ok(out.content);
  });

  it("throws StructuredOutputValidationError on non-conformant response", async () => {
    // Missing required "count" field
    const nonConformantJson = JSON.stringify({ name: "Alice" });
    const fetchImpl = async () =>
      new Response(JSON.stringify(geminiTextResponse(nonConformantJson)), { status: 200 });

    const p = createGeminiProvider({ id: "g", fetchImpl });

    await assert.rejects(
      () =>
        p.completeWithTools({
          model: "gemini-pro",
          messages: [{ role: "user", content: "give me data" }],
          tools: TOOLS,
          responseSchema: RESPONSE_SCHEMA,
        }),
      (e: unknown) => {
        assert.ok(
          e instanceof StructuredOutputValidationError,
          `expected StructuredOutputValidationError, got ${(e as Error).constructor.name}`,
        );
        assert.equal(e.rawContent, nonConformantJson);
        assert.deepStrictEqual(e.schema, TEST_SCHEMA);
        return true;
      },
    );
  });

  it("throws StructuredOutputValidationError on non-conformant response in complete()", async () => {
    const nonConformantJson = JSON.stringify({ name: "Alice" });
    const fetchImpl = async () =>
      new Response(JSON.stringify(geminiTextResponse(nonConformantJson)), { status: 200 });

    const p = createGeminiProvider({ id: "g", fetchImpl });

    await assert.rejects(
      () =>
        p.complete({
          model: "gemini-pro",
          messages: [{ role: "user", content: "give me data" }],
          responseSchema: RESPONSE_SCHEMA,
        }),
      (e: unknown) => e instanceof StructuredOutputValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// Structured output: mode "none"
// ---------------------------------------------------------------------------

describe("Gemini structured output — mode none", () => {
  it("does NOT include responseMimeType or responseSchema in generationConfig when mode is none", async () => {
    let capturedBody: string | undefined;
    const fetchImpl = async (_url: string | URL, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify(geminiTextResponse("just text")), { status: 200 });
    };

    const p = createGeminiProvider({ id: "g", fetchImpl });

    await p.completeWithTools({
      model: "gemini-pro",
      messages: [{ role: "user", content: "give me data" }],
      tools: TOOLS,
      responseSchema: RESPONSE_SCHEMA,
      structuredOutputMode: "none",
    });

    const body = JSON.parse(capturedBody ?? "{}") as Record<string, unknown>;
    const genConfig = body.generationConfig as Record<string, unknown> | undefined;
    // generationConfig may or may not exist, but if it does, it should NOT have schema fields
    if (genConfig) {
      assert.equal(
        genConfig.responseMimeType,
        undefined,
        "responseMimeType should NOT be present when mode is none",
      );
      assert.equal(
        genConfig.responseSchema,
        undefined,
        "responseSchema should NOT be present when mode is none",
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Structured output: responseSchema absent
// ---------------------------------------------------------------------------

describe("Gemini structured output — no responseSchema", () => {
  it("does NOT include responseMimeType or responseSchema when responseSchema is absent", async () => {
    let capturedBody: string | undefined;
    const fetchImpl = async (_url: string | URL, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify(geminiTextResponse("just text")), { status: 200 });
    };

    const p = createGeminiProvider({ id: "g", fetchImpl });

    await p.completeWithTools({
      model: "gemini-pro",
      messages: [{ role: "user", content: "give me data" }],
      tools: TOOLS,
      // No responseSchema
    });

    const body = JSON.parse(capturedBody ?? "{}") as Record<string, unknown>;
    const genConfig = body.generationConfig as Record<string, unknown> | undefined;
    if (genConfig) {
      assert.equal(genConfig.responseMimeType, undefined);
      assert.equal(genConfig.responseSchema, undefined);
    }
  });
});

// ---------------------------------------------------------------------------
// Structured output: strict mode downgraded to best-effort
// ---------------------------------------------------------------------------

describe("Gemini structured output — strict downgrade", () => {
  it("strict mode is downgraded to best-effort (still sends schema and validates)", async () => {
    let capturedBody: string | undefined;
    const conformantJson = JSON.stringify({ name: "Alice", count: 5 });
    const fetchImpl = async (_url: string | URL, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify(geminiTextResponse(conformantJson)), { status: 200 });
    };

    const p = createGeminiProvider({ id: "g", fetchImpl });

    // Explicitly set "strict" — should be downgraded to "best-effort" by resolveStructuredOutputMode
    await p.completeWithTools({
      model: "gemini-pro",
      messages: [{ role: "user", content: "give me data" }],
      tools: TOOLS,
      responseSchema: RESPONSE_SCHEMA,
      structuredOutputMode: "strict",
    });

    // Schema should still be sent (downgraded to best-effort, not none)
    const body = JSON.parse(capturedBody ?? "{}") as Record<string, unknown>;
    const genConfig = body.generationConfig as Record<string, unknown>;
    assert.ok(genConfig, "generationConfig should be present");
    assert.equal(genConfig.responseMimeType, "application/json");
    assert.ok(genConfig.responseSchema, "responseSchema should be present");
  });

  it("strict mode downgraded to best-effort still throws on non-conformant response", async () => {
    const nonConformantJson = JSON.stringify({ name: "Alice" });
    const fetchImpl = async () =>
      new Response(JSON.stringify(geminiTextResponse(nonConformantJson)), { status: 200 });

    const p = createGeminiProvider({ id: "g", fetchImpl });

    // "strict" is downgraded to "best-effort" → post-validation still runs
    await assert.rejects(
      () =>
        p.completeWithTools({
          model: "gemini-pro",
          messages: [{ role: "user", content: "give me data" }],
          tools: TOOLS,
          responseSchema: RESPONSE_SCHEMA,
          structuredOutputMode: "strict",
        }),
      (e: unknown) => {
        assert.ok(
          e instanceof StructuredOutputValidationError,
          `expected StructuredOutputValidationError, got ${(e as Error).constructor.name}`,
        );
        return true;
      },
    );
  });
});
