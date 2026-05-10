---
date: 2026-05-10
completed: null
---

# Inline Subagent Result Delivery

## Summary

Add a `delivery_mode` parameter to subagent spawns that controls how completed turn results are delivered back to the parent session: inline into the active tool loop (`inline`), queued as a new turn (`queue`), or not delivered at all (`drop`). Default is `inline`. Also deliver all persistent subagent turn responses (not just the first).

## Motivation

Background subagent results currently arrive as new messages in the parent's turn queue. This means:

1. The parent's current turn finishes without the result.
2. A new turn starts just to process the subagent's output.
3. Context is fragmented — the model loses continuity between spawning the subagent and receiving its result.

Additionally, persistent (non-thread-bound) subagents only deliver their first turn's result to the parent. Subsequent turns are silently dropped, leaving the parent unaware of ongoing work.

Inline delivery keeps results in the same conversational turn where the subagent was spawned, giving the model immediate access. The `delivery_mode` parameter gives agents explicit control over this behavior.

## Design

### Delivery Mode Parameter

A new `delivery_mode` field on spawn actions (`spawn_one_shot`, `spawn_persistent`):

| Value              | Behavior                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| `inline` (default) | Inject result into parent's active tool loop via steer channel. Falls back to `queue` if no active loop. |
| `queue`            | Always deliver as a new turn in the parent's turn queue (current behavior).                              |
| `drop`             | Don't deliver. Parent must use `wait` or `result` actions to retrieve output.                            |

### Delivery Matrix

| Spawn Type                               | `delivery_mode` | Parent Turn Active? | Behavior                                     |
| ---------------------------------------- | --------------- | ------------------- | -------------------------------------------- |
| Foreground one-shot (`background=false`) | any             | Yes (blocked)       | Tool call result returned inline (unchanged) |
| Background one-shot (`background=true`)  | `inline`        | Yes                 | Inject via steer channel                     |
| Background one-shot (`background=true`)  | `inline`        | No                  | Fall back to `queue`                         |
| Background one-shot (`background=true`)  | `queue`         | any                 | New turn in parent queue                     |
| Background one-shot (`background=true`)  | `drop`          | any                 | No delivery                                  |
| Persistent (non-thread-bound)            | `inline`        | Yes                 | Inject via steer channel (all turns)         |
| Persistent (non-thread-bound)            | `inline`        | No                  | Fall back to `queue`                         |
| Persistent (non-thread-bound)            | `queue`         | any                 | New turn in parent queue (all turns)         |
| Persistent (non-thread-bound)            | `drop`          | any                 | No delivery                                  |
| Persistent (thread-bound)                | any             | N/A                 | Communicates via platform thread (unchanged) |

### All-Turn Delivery for Persistent Subagents

Currently only the first turn result is delivered to the parent. This changes: every turn completion for a non-thread-bound persistent subagent delivers its result according to `delivery_mode`. This requires hooking into the turn completion path for persistent subagent sessions beyond just the initial spawn.

### System Context Framing

Results delivered to the parent (both inline and queued) are wrapped in the trusted system context envelope, consistent with timer messages and other system-injected content:

```
--- BEGIN TRUSTED SYSTEM CONTEXT [token:<session_token>] ---
[subagent.result]
Result delivered from subagent <childSessionId>.

{
  "child_session_id": "<childSessionId>",
  "mode": "one_shot" | "persistent"
}
--- END TRUSTED SYSTEM CONTEXT [token:<session_token>] ---

[Subagent completed] session_id: <childSessionId>

<assistantText (truncated to max_chars)>
```

### Max-Char Cap

Results delivered via inline or queue paths are truncated to 8000 characters (matching the `result` action's default). This prevents large subagent outputs from overwhelming the parent's context.

### Inline Injection Mechanism

The steer channel (`steer-channel.ts`) provides the inline injection path:

- `pushSteer(sessionId, message)` returns `true` if the target session has an active tool loop.
- `drainSteers(sessionId)` is called between every model iteration in the tool loop.
- If no active loop exists, `pushSteer()` returns `false` — falls back to `queue` behavior.

### Surfaces

The `delivery_mode` parameter must be exposed in:

1. **Tool descriptor** (`packages/mcp-integration/src/builtin-shoggoth-tools.ts`) — add to `subagentToolArgs.properties`
2. **CLI** (`packages/cli/src/run-subagent.ts`) — add `--delivery-mode` flag
3. **Control plane op** (`packages/daemon/src/control/integration-ops.ts`) — read from payload, store on session, pass to delivery function

## Testing Strategy

- **Unit test:** `delivery_mode=inline` + active parent loop → result injected via steer, `runSessionModelTurn` NOT called.
- **Unit test:** `delivery_mode=inline` + no active parent loop → falls back to `runSessionModelTurn`.
- **Unit test:** `delivery_mode=queue` → always calls `runSessionModelTurn` regardless of loop state.
- **Unit test:** `delivery_mode=drop` → neither steer nor `runSessionModelTurn` called.
- **Unit test:** result text exceeding 8000 chars is truncated.
- **Integration test:** persistent subagent multiple turns → all results delivered to parent.
- **Integration test:** foreground one-shot ignores `delivery_mode` (result is always the tool call response).

## Considerations

- Reusing the steer channel means subagent results appear as user-role messages, same as operator steers. The system context framing differentiates them for the model.
- Multiple subagents completing between iterations are drained FIFO in completion order.
- For persistent subagents, delivering all turns means the parent could receive many messages. The `drop` mode gives agents an escape hatch.
- Foreground one-shot spawns ignore `delivery_mode` entirely — the result is always returned as the tool call response since the parent is blocked.
- The `wait` and `result` tool actions remain useful for `drop` mode and for retrieving results after the fact.

## Migration

No migration needed. The new parameter defaults to `inline`, which is a behavioral change from the current `queue` behavior. Agents that rely on the current queued-turn behavior can explicitly set `delivery_mode: "queue"`.

## References

- [`spec.md`](spec.md) — type signatures, interfaces, and code examples
- [`implementation.md`](implementation.md) — phased implementation steps
