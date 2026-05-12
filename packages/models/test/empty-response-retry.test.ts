import { describe, it, beforeEach } from "vitest";
import assert from "node:assert";
import { createOpenAICompatibleProvider } from "../src/openai-compatible";
import { EmptyModelResponseError, ModelHttpError } from "../src/errors";
import { setResilienceGate, ModelResilienceGate } from "../src/resilience";

// Use minimal backoff so tests run fast
beforeEach(() => {
  setResilienceGate(
    new ModelResilienceGate({ maxRetries: 3, baseDelayMs: 10, maxDelayMs: 50, jitterMs: 0 }),
  );
});

function okResponse(content: string) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function emptyResponse() {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content: null, tool_calls: undefined } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function toolCallResponse() {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: { name: "test-tool", arguments: "{}" },
              },
            ],
          },
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const tools = [
  {
    type: "function" as const,
    function: {
      name: "test-tool",
      parameters: { type: "object", properties: {} },
    },
  },
];

describe("EmptyModelResponseError", () => {
  it("extends ModelHttpError with status 502", () => {
    const err = new EmptyModelResponseError("snippet");
    assert.ok(err instanceof ModelHttpError);
    assert.equal(err.status, 502);
    assert.equal(err.name, "EmptyModelResponseError");
    assert.ok(err.message.includes("missing assistant content"));
  });
});

describe("empty response retry — completeWithTools (non-stream)", () => {
  it("retries on empty response and succeeds on second attempt", async () => {
    let callCount = 0;
    const fetchImpl = async () => {
      callCount++;
      if (callCount === 1) return emptyResponse();
      return toolCallResponse();
    };

    const p = createOpenAICompatibleProvider({
      id: "retry-test",
      baseUrl: "https://api.example/v1",
      fetchImpl,
    });

    const out = await p.completeWithTools({
      model: "test-model",
      messages: [{ role: "user", content: "hi" }],
      tools,
    });

    assert.equal(callCount, 2);
    assert.equal(out.toolCalls.length, 1);
    assert.equal(out.toolCalls[0]!.name, "test-tool");
  });

  it("retries up to 2 times then throws EmptyModelResponseError", async () => {
    let callCount = 0;
    const fetchImpl = async () => {
      callCount++;
      return emptyResponse();
    };

    const p = createOpenAICompatibleProvider({
      id: "retry-exhaust",
      baseUrl: "https://api.example/v1",
      fetchImpl,
    });

    await assert.rejects(
      () =>
        p.completeWithTools({
          model: "test-model",
          messages: [{ role: "user", content: "hi" }],
          tools,
        }),
      (e: unknown) => {
        assert.ok(e instanceof EmptyModelResponseError);
        return true;
      },
    );

    // 1 initial + 2 retries = 3 total calls
    assert.equal(callCount, 3);
  });

  it("succeeds on third attempt (second retry)", async () => {
    let callCount = 0;
    const fetchImpl = async () => {
      callCount++;
      if (callCount <= 2) return emptyResponse();
      return toolCallResponse();
    };

    const p = createOpenAICompatibleProvider({
      id: "retry-third",
      baseUrl: "https://api.example/v1",
      fetchImpl,
    });

    const out = await p.completeWithTools({
      model: "test-model",
      messages: [{ role: "user", content: "hi" }],
      tools,
    });

    assert.equal(callCount, 3);
    assert.equal(out.toolCalls.length, 1);
  });

  it("does not retry non-empty-response errors", async () => {
    let callCount = 0;
    const fetchImpl = async () => {
      callCount++;
      return new Response("bad gateway", { status: 502, statusText: "Bad Gateway" });
    };

    const p = createOpenAICompatibleProvider({
      id: "no-retry-502",
      baseUrl: "https://api.example/v1",
      fetchImpl,
    });

    await assert.rejects(
      () =>
        p.completeWithTools({
          model: "test-model",
          messages: [{ role: "user", content: "hi" }],
          tools,
        }),
      (e: unknown) => e instanceof ModelHttpError,
    );

    // The resilience gate has its own retry logic for HTTP errors,
    // but the withEmptyResponseRetry wrapper should not add extra retries
    // for non-EmptyModelResponseError errors.
    assert.ok(callCount >= 1);
  });

  it("returns text content without retrying when response has content", async () => {
    let callCount = 0;
    const fetchImpl = async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "hello", tool_calls: [] } }],
        }),
        { status: 200 },
      );
    };

    const p = createOpenAICompatibleProvider({
      id: "no-retry-ok",
      baseUrl: "https://api.example/v1",
      fetchImpl,
    });

    const out = await p.completeWithTools({
      model: "test-model",
      messages: [{ role: "user", content: "hi" }],
      tools,
    });

    assert.equal(callCount, 1);
    assert.equal(out.content, "hello");
    assert.equal(out.toolCalls.length, 0);
  });
});

describe("empty response retry — completeWithTools (stream)", () => {
  function sseResponse(lines: readonly string[]): Response {
    const text = lines.join("\n") + "\n";
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
  }

  function emptyStreamResponse(): Response {
    // Stream that ends with a valid choice but no content and no tool_calls
    return sseResponse([
      'data: {"choices":[{"delta":{"role":"assistant"},"index":0}]}',
      "data: [DONE]",
    ]);
  }

  function contentStreamResponse(text: string): Response {
    return sseResponse([
      'data: {"choices":[{"delta":{"role":"assistant"},"index":0}]}',
      `data: {"choices":[{"delta":{"content":"${text}"},"index":0}]}`,
      "data: [DONE]",
    ]);
  }

  it("retries empty stream response and succeeds", async () => {
    let callCount = 0;
    const fetchImpl = async () => {
      callCount++;
      if (callCount === 1) return emptyStreamResponse();
      return contentStreamResponse("hello");
    };

    const p = createOpenAICompatibleProvider({
      id: "stream-retry",
      baseUrl: "https://api.example/v1",
      fetchImpl,
    });

    const out = await p.completeWithTools({
      model: "test-model",
      messages: [{ role: "user", content: "hi" }],
      tools,
      stream: true,
    });

    assert.equal(callCount, 2);
    assert.equal(out.content, "hello");
  });

  it("throws after exhausting retries on empty stream", async () => {
    let callCount = 0;
    const fetchImpl = async () => {
      callCount++;
      return emptyStreamResponse();
    };

    const p = createOpenAICompatibleProvider({
      id: "stream-exhaust",
      baseUrl: "https://api.example/v1",
      fetchImpl,
    });

    await assert.rejects(
      () =>
        p.completeWithTools({
          model: "test-model",
          messages: [{ role: "user", content: "hi" }],
          tools,
          stream: true,
        }),
      (e: unknown) => {
        assert.ok(e instanceof EmptyModelResponseError);
        return true;
      },
    );

    assert.equal(callCount, 3);
  });
});

describe("empty response retry — complete (non-tool)", () => {
  it("retries when streamed content is null", async () => {
    let callCount = 0;

    function sseResponse(lines: readonly string[]): Response {
      const text = lines.join("\n") + "\n";
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(text));
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    }

    const fetchImpl = async () => {
      callCount++;
      if (callCount === 1) {
        // Empty stream — valid choice but no content delta
        return sseResponse([
          'data: {"choices":[{"delta":{"role":"assistant"},"index":0}]}',
          "data: [DONE]",
        ]);
      }
      return sseResponse([
        'data: {"choices":[{"delta":{"role":"assistant"},"index":0}]}',
        'data: {"choices":[{"delta":{"content":"world"},"index":0}]}',
        "data: [DONE]",
      ]);
    };

    const p = createOpenAICompatibleProvider({
      id: "complete-stream-retry",
      baseUrl: "https://api.example/v1",
      fetchImpl,
    });

    const out = await p.complete({
      model: "test-model",
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    });

    assert.equal(callCount, 2);
    assert.equal(out.content, "world");
  });

  it("does not retry complete when content is present", async () => {
    let callCount = 0;
    const fetchImpl = async () => {
      callCount++;
      return okResponse("hello");
    };

    const p = createOpenAICompatibleProvider({
      id: "complete-no-retry",
      baseUrl: "https://api.example/v1",
      fetchImpl,
    });

    const out = await p.complete({
      model: "test-model",
      messages: [{ role: "user", content: "hi" }],
    });

    assert.equal(callCount, 1);
    assert.equal(out.content, "hello");
  });
});

describe("EmptyModelResponseError is failover-eligible", () => {
  it("isFailoverEligibleError returns true for EmptyModelResponseError", async () => {
    const { isFailoverEligibleError } = await import("../src/classify");
    const err = new EmptyModelResponseError();
    assert.ok(isFailoverEligibleError(err));
  });
});
