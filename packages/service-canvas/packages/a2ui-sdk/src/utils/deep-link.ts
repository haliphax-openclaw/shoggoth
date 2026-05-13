export interface DeepLinkRequest {
  message: string;
  agentId?: string;
  model?: string;
  sessionKey?: string;
  thinking?: string;
  deliver?: string;
  to?: string;
  channel?: string;
  timeoutSeconds?: number;
  key?: string;
}

export function parseShoggothUrl(url: string): DeepLinkRequest | null {
  if (!url.startsWith("shoggoth://")) return null;

  try {
    const rest = url.slice("shoggoth://".length);
    const qIdx = rest.indexOf("?");
    const query = qIdx >= 0 ? rest.slice(qIdx + 1) : "";
    const params = new URLSearchParams(query);
    const message = params.get("message");
    if (!message) {
      console.warn('[deep-link] Missing required "message" param');
      return null;
    }

    const req: DeepLinkRequest = { message };
    if (params.has("agentId")) req.agentId = params.get("agentId")!;
    if (params.has("model")) req.model = params.get("model")!;
    if (params.has("sessionKey")) req.sessionKey = params.get("sessionKey")!;
    if (params.has("thinking")) req.thinking = params.get("thinking")!;
    if (params.has("deliver")) req.deliver = params.get("deliver")!;
    if (params.has("to")) req.to = params.get("to")!;
    if (params.has("channel")) req.channel = params.get("channel")!;
    if (params.has("timeoutSeconds"))
      req.timeoutSeconds = parseInt(params.get("timeoutSeconds")!, 10);
    if (params.has("key")) req.key = params.get("key")!;

    return req;
  } catch (err) {
    console.error("[deep-link] Failed to parse URL:", err);
    return null;
  }
}

export async function executeDeepLink(
  req: DeepLinkRequest,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const baseUrl =
      (typeof import.meta !== "undefined" && (import.meta as any).env?.BASE_URL)?.replace(
        /\/$/,
        "",
      ) ?? "";
    const res = await fetch(`${baseUrl}/api/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    const data = await res.json();
    return { ok: res.ok && data.ok !== false, error: data.error };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
