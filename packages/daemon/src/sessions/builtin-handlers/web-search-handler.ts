// ---------------------------------------------------------------------------
// web-search handler — SearXNG-backed web search
// ---------------------------------------------------------------------------

import type { BuiltinToolRegistry, BuiltinToolContext } from "../builtin-tool-registry";

export function register(registry: BuiltinToolRegistry): void {
  registry.register("web-search", webSearchHandler);
}

async function webSearchHandler(
  args: Record<string, unknown>,
  ctx: BuiltinToolContext,
): Promise<{ resultJson: string }> {
  const config = ctx.config.searxng;
  if (!config) {
    return { resultJson: JSON.stringify({ error: "SearXNG not configured" }) };
  }

  const query = args.query as string;
  if (!query || typeof query !== "string") {
    return { resultJson: JSON.stringify({ error: "query is required and must be a string" }) };
  }

  const count = Math.min(Math.max((args.count as number) ?? config.defaultCount ?? 5, 1), 20);
  const categories = (args.categories as string) ?? "general";
  const language = (args.language as string) ?? config.defaultLanguage ?? "en";
  const timeRange = (args.timeRange as string) ?? config.defaultTimeRange;

  const params = new URLSearchParams({
    q: query,
    format: "json",
    categories,
    language,
  });
  if (timeRange) params.set("time_range", timeRange);
  if (config.engines?.length) params.set("engines", config.engines.join(","));

  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${config.baseUrl}/search?${params}`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      if (res.status === 429) {
        return { resultJson: JSON.stringify({ error: "Rate limited by SearXNG, try again shortly" }) };
      }
      return { resultJson: JSON.stringify({ error: `SearXNG returned HTTP ${res.status}` }) };
    }

    const data = (await res.json()) as { results?: any[] };
    const results = (data.results ?? []).slice(0, count).map((r: any) => ({
      title: r.title,
      url: r.url,
      snippet: r.content ?? "",
      engine: r.engine,
      publishedDate: r.publishedDate ?? undefined,
    }));

    return {
      resultJson: JSON.stringify(
        results.length
          ? results
          : { results: [], note: "No results found. Try refining your query." },
      ),
    };
  } catch (err: unknown) {
    if ((err as Error).name === "AbortError") {
      return { resultJson: JSON.stringify({ error: "SearXNG request timed out after 10s" }) };
    }
    return { resultJson: JSON.stringify({ error: `Search failed: ${String(err)}` }) };
  }
}
