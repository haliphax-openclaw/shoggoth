---
completed: 2026-04-10
---

# Permission Elevation Tool

## Problem

The agent cannot inspect or debug the running Shoggoth daemon — no access to the state DB, logs, or container internals. Commands run in the agent container, not the daemon process.

## Design

### 1. Elevation State

A time-boxed boolean flag per session stored in `elevation_grants` table. You're either elevated or you're not — no scopes.

**DB schema** (`0013_elevation_grants.sql`):

```sql
CREATE TABLE IF NOT EXISTS elevation_grants (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_elevation_grants_session
  ON elevation_grants (session_id, revoked);
```

**Store** (`elevation-store.ts`):

- `grant(sessionId, durationMs)` → creates a grant row
- `revoke(grantId)` / `revokeAllForSession(sessionId)` → sets `revoked = 1`
- `isActive(sessionId)` → boolean check (non-revoked, not expired)
- `getStatus(sessionId)` → active flag + remaining time

### 2. Operator Interface

**Control ops** (operator-only, policy-enforced):

- `elevation_grant` — payload: `{ session_id, duration_ms? }`. Default 5 min, max 30 min.
- `elevation_revoke` — payload: `{ grant_id? }` or `{ session_id? }` (revoke all for session).

**CLI**: `shoggoth elevation grant <session-id> [--duration 5m]` / `shoggoth elevation revoke <session-id>`

**Platform command**: `/elevate grant [duration]` / `/elevate revoke` (in the session's bound channel)

### 3. Agent Tool

**`builtin-elevate`** — registered in the builtin handler index, but:

- Only included in the tool list when `isActive(sessionId)` returns true (checked during MCP context resolution / tool finalization)
- Added to `toolDiscovery.alwaysOn` equivalent — never collapsed by the discover tool
- Exposes a single action: run a command

**Tool schema:**

```
builtin-elevate {
  argv: string[]       // command + args, executed by the daemon process
  workdir?: string     // working directory (daemon filesystem)
  timeout?: number     // max ms, default 30s, cap 120s
}
```

**Execution:** The daemon runs `execFileSync(argv[0], argv.slice(1), ...)` in its own process context with full access to its filesystem, state DB, Docker socket, etc. Output (stdout + stderr) returned to the agent.

### 4. Safety

- Operator-only grant (agent cannot self-elevate)
- Time-boxed with automatic expiry (default 5 min, max 30 min)
- Tool is invisible to the agent when not elevated — not in the tool list at all
- All elevated commands audit-logged with grant ID
- Grant is per-session (subagents don't inherit)

### 5. Implementation Phases

**Phase 1: DB + store**

- Migration `0013_elevation_grants.sql`
- `elevation-store.ts` with grant/revoke/isActive/getStatus

**Phase 2: Control ops**

- `elevation_grant` and `elevation_revoke` in `integration-ops.ts`
- Operator-only policy enforcement

**Phase 3: Agent tool**

- `builtin-elevate` handler — executes argv in daemon process, checks active grant
- Conditional tool registration: only added to tool list when elevation is active
- Exempt from tool discovery collapse

**Phase 4: CLI + platform command**

- CLI: `shoggoth elevation grant|revoke`
- Platform command: `/elevate grant|revoke`
