# Specification

## Interfaces

### New: `SubagentDeliveryMode`

```ts
/** Controls how subagent turn results are delivered to the parent session. */
type SubagentDeliveryMode = "inline" | "queue" | "drop";
```

### Modified: Session Store Row

```ts
// session-store.ts — add delivery_mode to the subagent metadata
interface SessionRow {
  // ... existing fields ...
  subagentDeliveryMode: SubagentDeliveryMode | null;
  subagentRespondTo: string | null; // already tracked implicitly; make explicit for all-turn delivery
}
```

### Existing Interfaces (unchanged)

```ts
// steer-channel.ts — reused as-is
function pushSteer(sessionId: string, message: string): boolean;
function drainSteers(sessionId: string): string[];
```

## API / Function Signatures

### Modified: `deliverSubagentResult` (integration-ops.ts)

```ts
/**
 * Deliver a subagent's completed turn result to the respond_to session.
 * Respects delivery_mode: inline attempts steer injection first, queue always
 * enqueues a new turn, drop does nothing.
 * Truncates result text to maxChars (default 8000).
 */
async function deliverSubagentResult(
  ext: NonNullable<typeof subagentRuntimeExtensionRef.current>,
  opts: {
    childSessionId: string;
    respondTo: string;
    internalDelivery: boolean;
    mode: "one_shot" | "persistent";
    deliveryMode: SubagentDeliveryMode;
    assistantText: string;
    subLog: ReturnType<typeof getLogger>;
    maxChars?: number; // default 8000
  },
): Promise<void>;
```

### Modified: Tool Descriptor (builtin-shoggoth-tools.ts)

```ts
// Add to subagentToolArgs.properties:
delivery_mode: {
  type: "string",
  enum: ["inline", "queue", "drop"],
  description:
    "spawn_one_shot, spawn_persistent: how the subagent's completed result is delivered to the parent. " +
    "'inline' (default) injects into the parent's active tool loop; falls back to 'queue' if no active loop. " +
    "'queue' always delivers as a new turn. " +
    "'drop' does not deliver; use 'result' action to retrieve manually.",
},
```

### Modified: CLI (run-subagent.ts)

```
shoggoth subagent spawn [--model-options <json>] [--delivery-mode inline|queue|drop] one_shot <parentUrn|agentId> <prompt...>
shoggoth subagent spawn [--model-options <json>] [--delivery-mode inline|queue|drop] persistent <parentUrn|agentId> [threadId] <prompt...>
```

### Modified: Session Handler (session-handlers.ts)

```ts
// In spawn_one_shot and spawn_persistent action blocks:
const deliveryMode = args.delivery_mode;
if (deliveryMode === "inline" || deliveryMode === "queue" || deliveryMode === "drop") {
  payload.delivery_mode = deliveryMode;
}
```

### Modified: Control Plane Op (integration-ops.ts)

```ts
// In subagent_spawn case, read delivery_mode from payload:
const deliveryModeRaw = pl.delivery_mode;
const deliveryMode: SubagentDeliveryMode =
  deliveryModeRaw === "queue" || deliveryModeRaw === "drop" ? deliveryModeRaw : "inline";
```

## Data Structures / Schemas

### Session Store Schema Change

```sql
-- Add column to sessions table (or equivalent in-memory store)
ALTER TABLE sessions ADD COLUMN subagent_delivery_mode TEXT DEFAULT NULL;
ALTER TABLE sessions ADD COLUMN subagent_respond_to TEXT DEFAULT NULL;
```

These columns store the delivery preferences so that subsequent persistent subagent turns can look up how to deliver results without the spawn payload being available.

### System Context Envelope Format

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

<assistantText>
```

## Code Examples

### Modified `deliverSubagentResult`

```ts
import { pushSteer } from "../sessions/steer-channel";

const DEFAULT_MAX_CHARS = 8000;

async function deliverSubagentResult(
  ext: NonNullable<typeof subagentRuntimeExtensionRef.current>,
  opts: {
    childSessionId: string;
    respondTo: string;
    internalDelivery: boolean;
    mode: "one_shot" | "persistent";
    deliveryMode: SubagentDeliveryMode;
    assistantText: string;
    subLog: ReturnType<typeof getLogger>;
    maxChars?: number;
  },
): Promise<void> {
  const {
    childSessionId,
    respondTo,
    internalDelivery,
    mode,
    deliveryMode,
    assistantText,
    subLog,
    maxChars = DEFAULT_MAX_CHARS,
  } = opts;

  // drop mode: do nothing
  if (deliveryMode === "drop") {
    subLog.info("subagent result delivery skipped (drop mode)", {
      childSessionId,
      respondTo,
      mode,
    });
    return;
  }

  const truncatedText =
    assistantText.length > maxChars ? assistantText.slice(0, maxChars) : assistantText;
  const content = `[Subagent completed] session_id: ${childSessionId}\n\n${truncatedText}`;

  // inline mode: attempt steer injection first
  if (deliveryMode === "inline" && pushSteer(respondTo, content)) {
    subLog.info("subagent result injected inline via steer channel", {
      childSessionId,
      respondTo,
      mode,
      internal: internalDelivery,
    });
    return;
  }

  // queue mode (or inline fallback): enqueue a new model turn
  try {
    await ext.runSessionModelTurn({
      sessionId: respondTo,
      userContent: content,
      userMetadata: {
        subagent_result: true,
        child_session_id: childSessionId,
        mode,
      },
      systemContext: {
        kind: "subagent.result",
        summary: `Result delivered from subagent ${childSessionId}.`,
        data: { child_session_id: childSessionId, mode },
      },
      delivery: { kind: "internal" },
    });
    subLog.info("subagent result delivered to respond_to session", {
      childSessionId,
      respondTo,
      mode,
      internal: internalDelivery,
    });
  } catch (err) {
    subLog.warn("failed to deliver subagent result to respond_to session", {
      childSessionId,
      respondTo,
      mode,
      error: String(err),
    });
  }
}
```

### All-Turn Delivery Hook for Persistent Subagents

```ts
// After each persistent subagent turn completes (in the platform message handler
// or wherever subsequent turns are processed):
const row = sessions.getById(childSessionId);
if (
  row?.subagentMode === "persistent" &&
  !row.subagentPlatformThreadId &&
  row.subagentDeliveryMode !== "drop" &&
  row.subagentRespondTo
) {
  await deliverSubagentResult(ext, {
    childSessionId,
    respondTo: row.subagentRespondTo,
    internalDelivery: true,
    mode: "persistent",
    deliveryMode: row.subagentDeliveryMode ?? "inline",
    assistantText: turn.latestAssistantText,
    subLog,
  });
}
```
