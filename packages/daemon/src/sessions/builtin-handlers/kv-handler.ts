// ---------------------------------------------------------------------------
// builtin-kv — structured key-value store (workspace-scoped, state DB backed)
// ---------------------------------------------------------------------------

import type { BuiltinToolRegistry, BuiltinToolContext } from "../builtin-tool-registry";

const MAX_KEY_LENGTH = 256;
const MAX_VALUE_BYTES = 64 * 1024; // 64 KB serialized
const DEFAULT_LIST_LIMIT = 100;
const MAX_LIST_LIMIT = 1000;

export function register(registry: BuiltinToolRegistry): void {
  registry.register("kv", kvHandler);
}

async function kvHandler(
  args: Record<string, unknown>,
  ctx: BuiltinToolContext,
): Promise<{ resultJson: string }> {
  const action = String(args.action ?? "");
  switch (action) {
    case "get":
      return kvGet(args, ctx);
    case "set":
      return kvSet(args, ctx);
    case "delete":
      return kvDelete(args, ctx);
    case "list":
      return kvList(args, ctx);
    default:
      return {
        resultJson: JSON.stringify({ error: `unknown action: ${action}` }),
      };
  }
}

function kvGet(args: Record<string, unknown>, ctx: BuiltinToolContext): { resultJson: string } {
  const key = String(args.key ?? "");
  if (!key) return { resultJson: JSON.stringify({ error: "key is required" }) };

  const row = ctx.db
    .prepare("SELECT value FROM kv_store WHERE workspace = ? AND key = ?")
    .get(ctx.workspacePath, key) as { value: string } | undefined;

  if (!row) {
    return {
      resultJson: JSON.stringify({ ok: true, key, value: null, exists: false }),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    parsed = row.value;
  }
  return {
    resultJson: JSON.stringify({ ok: true, key, value: parsed, exists: true }),
  };
}

function kvSet(args: Record<string, unknown>, ctx: BuiltinToolContext): { resultJson: string } {
  const key = String(args.key ?? "");
  if (!key) return { resultJson: JSON.stringify({ error: "key is required" }) };
  if (key.length > MAX_KEY_LENGTH) {
    return {
      resultJson: JSON.stringify({
        error: `key exceeds max length of ${MAX_KEY_LENGTH} chars`,
      }),
    };
  }
  if (args.value === undefined) {
    return { resultJson: JSON.stringify({ error: "value is required" }) };
  }

  const serialized = JSON.stringify(args.value);
  if (Buffer.byteLength(serialized, "utf8") > MAX_VALUE_BYTES) {
    return {
      resultJson: JSON.stringify({
        error: `value exceeds max size of ${MAX_VALUE_BYTES} bytes when serialized`,
      }),
    };
  }

  ctx.db
    .prepare(
      `INSERT INTO kv_store (workspace, key, value, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT (workspace, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .run(ctx.workspacePath, key, serialized);

  return { resultJson: JSON.stringify({ ok: true, key, written: true }) };
}

function kvDelete(args: Record<string, unknown>, ctx: BuiltinToolContext): { resultJson: string } {
  const key = String(args.key ?? "");
  if (!key) return { resultJson: JSON.stringify({ error: "key is required" }) };

  const info = ctx.db
    .prepare("DELETE FROM kv_store WHERE workspace = ? AND key = ?")
    .run(ctx.workspacePath, key);

  return {
    resultJson: JSON.stringify({ ok: true, key, deleted: info.changes > 0 }),
  };
}

function kvList(args: Record<string, unknown>, ctx: BuiltinToolContext): { resultJson: string } {
  const prefix = typeof args.prefix === "string" ? args.prefix : "";
  const rawLimit = typeof args.limit === "number" ? args.limit : DEFAULT_LIST_LIMIT;
  const limit = Math.max(1, Math.min(rawLimit, MAX_LIST_LIMIT));

  // Fetch one extra to detect truncation
  let rows: { key: string; value: string; updated_at: string }[];
  if (prefix) {
    rows = ctx.db
      .prepare(
        `SELECT key, value, updated_at FROM kv_store
         WHERE workspace = ? AND key LIKE ? ESCAPE '\\'
         ORDER BY key ASC LIMIT ?`,
      )
      .all(ctx.workspacePath, likeEscape(prefix) + "%", limit + 1) as typeof rows;
  } else {
    rows = ctx.db
      .prepare(
        "SELECT key, value, updated_at FROM kv_store WHERE workspace = ? ORDER BY key ASC LIMIT ?",
      )
      .all(ctx.workspacePath, limit + 1) as typeof rows;
  }

  const truncated = rows.length > limit;
  if (truncated) rows = rows.slice(0, limit);

  const entries = rows.map((r) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(r.value);
    } catch {
      parsed = r.value;
    }
    return { key: r.key, value: parsed, updatedAt: r.updated_at };
  });

  return { resultJson: JSON.stringify({ ok: true, entries, truncated }) };
}

/** Escape `%` and `_` for LIKE with `\` as escape char. */
function likeEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
