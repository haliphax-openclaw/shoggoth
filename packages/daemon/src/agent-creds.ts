/**
 * Resolve the agent UID/GID from the SHOGGOTH_AGENT_UID environment variable.
 * Falls back to 900 (the default build-time value) when unset.
 * The agent user always has matching UID and GID.
 */
export function resolveAgentCreds(env: NodeJS.ProcessEnv = process.env): {
  uid: number;
  gid: number;
} {
  const raw = env.SHOGGOTH_AGENT_UID;
  const id = raw ? Number.parseInt(raw, 10) : 900;
  const resolved = Number.isFinite(id) && id > 0 ? id : 900;
  return { uid: resolved, gid: resolved };
}
