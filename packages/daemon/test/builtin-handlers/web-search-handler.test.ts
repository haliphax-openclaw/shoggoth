import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BuiltinToolContext } from "../../src/sessions/builtin-tool-registry";
import { BuiltinToolRegistry } from "../../src/sessions/builtin-tool-registry";
import { register } from "../../src/sessions/builtin-handlers/web-search-handler";
import { defaultConfig, type ShoggothConfig } from "@shoggoth/shared";

function makeConfig(searxng?: ShoggothConfig["searxng"]): ShoggothConfig {
  return { ...defaultConfig("/tmp/cfg"), searxng } as ShoggothConfig;
}

function makeCtx(config: ShoggothConfig): BuiltinToolContext {
  return {
    sessionId: "agent:test:discord:channel:123",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: {} as any,
    config,
    env: process.env,
    workspacePath: "/tmp",
    creds: { uid: 1000, gid: 1000 },
    orchestratorEnv: process.env,
    getAgentIntegrationInvoker: () => undefined,
    getProcessManager: () => undefined,
    messageToolCtx: undefined,
    memoryConfig: config.memory,
    runtimeOpenaiBaseUrl: undefined,
    isSubagentSession: false,
  };
}

describe("web-search-handler", () => {
  let registry: BuiltinToolRegistry;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    registry = new BuiltinToolRegistry();
    register(registry);
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns error when SearXNG is not configured", async () => {
    const ctx = makeCtx(makeConfig(undefined));
    const result = await registry.execute("web-search", { query: "test" }, ctx);
    expect(JSON.parse(result.resultJson)).toEqual({
      error: "SearXNG not configured",
    });
  });

  it("returns error when query is missing", async () => {
    const ctx = makeCtx(makeConfig({ baseUrl: "http://searxng:8080" }));
    const result = await registry.execute("web-search", {}, ctx);
    expect(JSON.parse(result.resultJson)).toEqual({
      error: "query is required and must be a string",
    });
  });

  it("returns error when query is not a string", async () => {
    const ctx = makeCtx(makeConfig({ baseUrl: "http://searxng:8080" }));
    const result = await registry.execute("web-search", { query: 123 }, ctx);
    expect(JSON.parse(result.resultJson)).toEqual({
      error: "query is required and must be a string",
    });
  });

  it("returns formatted results on successful search", async () => {
    const ctx = makeCtx(makeConfig({ baseUrl: "http://searxng:8080" }));
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              title: "Example",
              url: "https://example.com",
              content: "An example snippet",
              engine: "google",
              publishedDate: "2024-01-01",
            },
            {
              title: "Another",
              url: "https://another.com",
              content: "Another snippet",
              engine: "bing",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await registry.execute("web-search", { query: "test" }, ctx);
    const parsed = JSON.parse(result.resultJson);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({
      title: "Example",
      url: "https://example.com",
      snippet: "An example snippet",
      engine: "google",
      publishedDate: "2024-01-01",
    });
    expect(parsed[1]).toEqual({
      title: "Another",
      url: "https://another.com",
      snippet: "Another snippet",
      engine: "bing",
    });
  });

  it("returns note when results are empty", async () => {
    const ctx = makeCtx(makeConfig({ baseUrl: "http://searxng:8080" }));
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }));

    const result = await registry.execute("web-search", { query: "obscure query" }, ctx);
    const parsed = JSON.parse(result.resultJson);
    expect(parsed).toEqual({
      results: [],
      note: "No results found. Try refining your query.",
    });
  });

  it("handles HTTP 429 rate limiting", async () => {
    const ctx = makeCtx(makeConfig({ baseUrl: "http://searxng:8080" }));
    fetchSpy.mockResolvedValueOnce(new Response("", { status: 429 }));

    const result = await registry.execute("web-search", { query: "test" }, ctx);
    expect(JSON.parse(result.resultJson)).toEqual({
      error: "Rate limited by SearXNG, try again shortly",
    });
  });

  it("handles HTTP 500 server error", async () => {
    const ctx = makeCtx(makeConfig({ baseUrl: "http://searxng:8080" }));
    fetchSpy.mockResolvedValueOnce(new Response("", { status: 500 }));

    const result = await registry.execute("web-search", { query: "test" }, ctx);
    expect(JSON.parse(result.resultJson)).toEqual({
      error: "SearXNG returned HTTP 500",
    });
  });

  it("handles timeout (AbortError)", async () => {
    const ctx = makeCtx(makeConfig({ baseUrl: "http://searxng:8080" }));
    const abortError = new DOMException("The operation was aborted", "AbortError");
    fetchSpy.mockRejectedValueOnce(abortError);

    const result = await registry.execute("web-search", { query: "test" }, ctx);
    expect(JSON.parse(result.resultJson)).toEqual({
      error: "SearXNG request timed out after 10s",
    });
  });

  it("handles generic fetch errors", async () => {
    const ctx = makeCtx(makeConfig({ baseUrl: "http://searxng:8080" }));
    fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await registry.execute("web-search", { query: "test" }, ctx);
    expect(JSON.parse(result.resultJson)).toEqual({
      error: "Search failed: Error: ECONNREFUSED",
    });
  });

  it("respects count parameter and limits results", async () => {
    const ctx = makeCtx(makeConfig({ baseUrl: "http://searxng:8080" }));
    const manyResults = Array.from({ length: 10 }, (_, i) => ({
      title: `Result ${i}`,
      url: `https://example.com/${i}`,
      content: `Snippet ${i}`,
      engine: "google",
    }));
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: manyResults }), { status: 200 }),
    );

    const result = await registry.execute("web-search", { query: "test", count: 3 }, ctx);
    const parsed = JSON.parse(result.resultJson);
    expect(parsed).toHaveLength(3);
  });

  it("passes config defaults to SearXNG request", async () => {
    const ctx = makeCtx(
      makeConfig({
        baseUrl: "http://searxng:8080",
        defaultLanguage: "de",
        defaultTimeRange: "week",
        engines: ["google", "bing"],
        apiKey: "secret-key",
      }),
    );
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }));

    await registry.execute("web-search", { query: "test" }, ctx);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("language")).toBe("de");
    expect(parsed.searchParams.get("time_range")).toBe("week");
    expect(parsed.searchParams.get("engines")).toBe("google,bing");
    expect((opts.headers as Record<string, string>)["Authorization"]).toBe("Bearer secret-key");
  });
});
