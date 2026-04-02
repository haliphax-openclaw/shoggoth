# Tiered Turn Queue — Implementation Plan

## Overview
Replace the simple per-session mutex (`SessionTurnLock`) with a two-tier priority queue that serializes model turns per session. System messages (heartbeats, cron, subagent completions, workflow tasks) are processed at high priority; user messages at normal priority. An anti-starvation mechanism ensures normal-priority messages aren't permanently blocked.

Expose per-tier queue depths in `/status` and the agent's system prompt stats. Add a control op and slash command for queue management (remove entries by index, range, count, or clear).

## Tier Definitions

| Tier | Label | Sources |
|------|-------|---------|
| High | `system` | Heartbeats, cron jobs, subagent completions, workflow tasks |
| Normal | `user` | Regular user messages |

Abort signals are out of scope — they already bypass the queue via `TurnAbortedError`.

## Architecture

### TieredTurnQueue (replaces SessionTurnLock)

Location: `packages/daemon/src/sessions/session-turn-queue.ts`

```ts
type TurnPriority = "system" | "user";

interface QueueEntry {
  id: string;           // unique entry id (for removal)
  priority: TurnPriority;
  label: string;        // human-readable description (e.g. "heartbeat", "cron:daily-check", "user message")
  enqueuedAt: number;   // Date.now()
  execute: () => Promise<void>;
}

interface QueueDepth {
  system: number;
  user: number;
}
```

**Core behavior:**
- Per-session queue: `Map<sessionId, { high: QueueEntry[], normal: QueueEntry[], running: boolean }>`
- When a turn completes, the queue picks the next entry:
  1. If the high-priority queue is non-empty, dequeue from it
  2. **Anti-starvation:** every N high-priority turns (configurable, default 3), dequeue one normal-priority entry instead (if available)
  3. Otherwise dequeue from normal
- Only one turn runs at a time per session (same serialization guarantee as current mutex)

**Anti-starvation counter:**
- Per-session counter tracks consecutive high-priority turns since last normal-priority turn
- When counter reaches threshold N, next dequeue pulls from normal (if non-empty), then resets counter
- If normal queue is empty when starvation check fires, skip and continue with high
- N is configurable via `runtime.turnQueue.starvationThreshold` (default: 3)

### Public API

```ts
class TieredTurnQueue {
  /** Enqueue a turn. Returns a promise that resolves when the turn completes. */
  enqueue(sessionId: string, priority: TurnPriority, label: string, fn: () => Promise<void>): Promise<void>;

  /** Get current queue depths for a session. */
  getDepth(sessionId: string): QueueDepth;

  /** List queued entries for a session (does not include the currently running entry). */
  listQueued(sessionId: string, priority?: TurnPriority): ReadonlyArray<{ id: string; priority: TurnPriority; label: string; enqueuedAt: number }>;

  /** Remove entries by id(s). Returns count removed. */
  removeById(sessionId: string, ids: string[]): number;

  /** Remove entries by index range (0-based, within a priority tier or across all). */
  removeByRange(sessionId: string, priority: TurnPriority | "all", start: number, end: number): number;

  /** Remove the first `count` entries from a priority tier (or all). */
  removeByCount(sessionId: string, priority: TurnPriority | "all", count: number): number;

  /** Clear all queued entries for a session (optionally filtered by priority). */
  clear(sessionId: string, priority?: TurnPriority): number;
}
```

Removed entries have their promises rejected with a `TurnDroppedError` so callers don't hang.

### Singleton Access

Same pattern as the logger — export `getTurnQueue()` / `setTurnQueue()` so any module can access it.

## Integration Points

### Callers (enqueue with priority)

| Caller | Priority | Label |
|--------|----------|-------|
| `platform.ts` — user inbound message | `user` | `"user message"` |
| `platform.ts` — heartbeat delivery | `system` | `"heartbeat"` |
| `platform.ts` — cron delivery | `system` | `"cron:<jobName>"` |
| `integration-ops.ts` — subagent one_shot | `system` | `"subagent:one_shot"` |
| `workflow-adapters.ts` — workflow task | `system` | `"workflow:<taskType>"` |

Each caller currently calls `turnLock.acquire(sessionId)` → replace with `turnQueue.enqueue(sessionId, priority, label, fn)`.

### Queue Depth in Stats

**System prompt** (`buildSessionStatsSection` in `session-system-prompt.ts`):
- Import `getTurnQueue()`, call `getDepth(sessionId)`
- Append to stats line: `Queue: {system}S / {user}U`

**`/status` slash command** (via `session_context_status` control op):
- Control op returns `queueDepth: { system: number, user: number }` alongside existing stats
- Slash command formats: `Queue: {system} system / {user} user`

### Queue Management Control Op

**Op:** `session_queue_manage`

**Payload:**
```json
{
  "session_id": "agent:main:discord:...",
  "action": "list" | "remove" | "clear",
  "priority": "system" | "user" | "all",
  // For "remove" action:
  "by": "index" | "range" | "count",
  "index": 0,
  "start": 0,
  "end": 5,
  "count": 3
}
```

**Responses:**
- `list`: returns array of `{ id, priority, label, enqueuedAt, index }`
- `remove`: returns `{ removed: number }`
- `clear`: returns `{ removed: number }`

### Slash Command

**`/queue`** — new slash command

Options:
- `action` (required): `list`, `remove`, `clear`
- `priority` (optional, default `all`): `system`, `user`, `all`
- `index` (optional): single index to remove
- `range` (optional): `start-end` (e.g. `0-4`)
- `count` (optional): remove first N entries
- `session_id` (optional): defaults to channel-bound session

Examples:
- `/queue list` — show all queued entries
- `/queue list priority:system` — show only system entries
- `/queue clear` — clear all queues
- `/queue clear priority:user` — clear only user queue
- `/queue remove index:2 priority:system` — remove entry at index 2 from system queue
- `/queue remove range:0-4` — remove entries 0 through 4 from all queues
- `/queue remove count:3 priority:user` — remove first 3 user entries

## Config

```json
{
  "runtime": {
    "turnQueue": {
      "starvationThreshold": 3
    }
  }
}
```

### Operator CLI

**`shoggoth queue`** subcommand group:

```
shoggoth queue list [--session <id>] [--priority system|user|all]
shoggoth queue remove [--session <id>] [--priority system|user|all] [--index N] [--range N-M] [--count N]
shoggoth queue clear [--session <id>] [--priority system|user|all]
```

All commands go through the control socket → `session_queue_manage` op. `--session` defaults to the main session if omitted.

## Files to Create/Modify

1. **NEW** `packages/daemon/src/sessions/session-turn-queue.ts` — TieredTurnQueue class
2. **NEW** `packages/daemon/src/sessions/session-turn-queue-singleton.ts` — singleton get/set
3. **DELETE** `packages/daemon/src/sessions/session-turn-lock.ts` — replaced by turn queue
4. `packages/platform-discord/src/platform.ts` — replace turnLock.acquire with turnQueue.enqueue
5. `packages/daemon/src/control/integration-ops.ts` — add `session_queue_manage` op, add queueDepth to `session_context_status`
6. `packages/daemon/src/sessions/session-system-prompt.ts` — add queue depth to stats section
7. `packages/daemon/src/sessions/session-stats-store.ts` — add queue depth to `FormattedSessionStats`
8. `packages/platform-discord/src/slash-commands.ts` — add `/queue` command, update `/status` display
9. `packages/daemon/src/index.ts` — instantiate and wire TieredTurnQueue
10. Config schema update for `runtime.turnQueue.starvationThreshold`
11. `packages/cli/src/` — add `shoggoth queue list|remove|clear` subcommands
12. Tests for TieredTurnQueue (priority ordering, anti-starvation, removal ops, edge cases)
