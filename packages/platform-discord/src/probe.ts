import type { DependencyProbe, DependencyCheck } from "./daemon-types";

const DISCORD_USERS_ME = "https://discord.com/api/v10/users/@me";
const PROBE_TIMEOUT_MS = 5000;

/** Discord token reachability via `GET /users/@me`. */
export function createDiscordProbe(options: {
  getToken: () => string | undefined;
}): DependencyProbe {
  return {
    name: "discord",
    async check(): Promise<DependencyCheck> {
      const t = options.getToken()?.trim();
      if (!t) {
        return { name: "discord", status: "skipped", detail: "not configured" };
      }
      try {
        const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS);
        const res = await fetch(DISCORD_USERS_ME, {
          headers: { Authorization: `Bot ${t}` },
          signal,
        });
        if (res.status === 200) {
          let detail = "ok";
          try {
            const j = (await res.json()) as { username?: string; id?: string };
            if (j.username && j.id) detail = `${j.username} (${j.id})`;
            else if (j.username) detail = j.username;
            else if (j.id) detail = `id ${j.id}`;
          } catch {
            /* ignore malformed body */
          }
          return { name: "discord", status: "pass", detail };
        }
        if (res.status === 401 || res.status === 403) {
          return {
            name: "discord",
            status: "fail",
            detail: `invalid or unauthorized token (HTTP ${res.status})`,
          };
        }
        return {
          name: "discord",
          status: "fail",
          detail: `unexpected HTTP ${res.status}`,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { name: "discord", status: "fail", detail: msg };
      }
    },
  };
}
