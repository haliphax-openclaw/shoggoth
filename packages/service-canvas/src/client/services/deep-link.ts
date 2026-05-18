/**
 * Deep link handler for shoggoth:// URLs
 *
 * Intercepts shoggoth:// navigations and routes them through the local
 * /api/agent proxy (which forwards to the gateway).
 *
 * Supported URL forms:
 *   shoggoth://message=...&sessionKey=...&thinking=...&deliver=...&to=...&channel=...&timeoutSeconds=...&key=...
 */

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

export interface CanvasConfig {
  skipConfirmation: boolean;
  agents: string[];
  allowedAgentIds: string[];
}

let cachedConfig: CanvasConfig | null = null;

export async function fetchCanvasConfig(): Promise<CanvasConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const res = await fetch(`${baseUrl}/api/canvas-config`);
    if (res.ok) {
      cachedConfig = await res.json();
      return cachedConfig!;
    }
  } catch {
    /* fall through */
  }
  return { skipConfirmation: false, agents: [], allowedAgentIds: [] };
}

export function parseShoggothUrl(url: string): DeepLinkRequest | null {
  if (!url.startsWith("shoggoth://")) return null;

  try {
    // Strip scheme, split path and query string
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
    const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
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

/**
 * Check if a URL is a shoggoth:// deep link
 */
export function isShoggothDeepLink(url: string): boolean {
  return url.startsWith("shoggoth://");
}

/**
 * Truncate message for display in confirmation dialog
 */
export function truncateMessage(msg: string, maxLen = 200): string {
  if (msg.length <= maxLen) return msg;
  return msg.slice(0, maxLen) + "…";
}
