/**
 * Discord REST: current bot user (`GET /users/@me`).
 */
export async function fetchDiscordBotUserId(options: {
  readonly botToken: string;
  readonly fetchFn?: typeof fetch;
  readonly apiBase?: string;
}): Promise<string> {
  const base = (options.apiBase ?? "https://discord.com/api/v10").replace(/\/$/, "");
  const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  const res = await fetchFn(`${base}/users/@me`, {
    headers: { Authorization: `Bot ${options.botToken}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Discord REST users/@me ${res.status}: ${text}`);
  }
  let j: unknown;
  try {
    j = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Discord REST users/@me: invalid JSON");
  }
  const o = j as { id?: unknown };
  if (typeof o.id !== "string" || !o.id.trim()) {
    throw new Error("Discord REST users/@me: missing id");
  }
  return o.id;
}
