# builtin-timer

Set, cancel, or list deferred timers. When a timer fires, its message is delivered to the session.

## Parameters

| Param     | Type   | Required | Notes                                                                           |
| --------- | ------ | -------- | ------------------------------------------------------------------------------- |
| `action`  | string | yes      | `set`, `cancel`, or `list`                                                      |
| `label`   | string | set      | Human-readable name for the timer                                               |
| `at`      | string | set      | When to fire — ISO 8601 datetime or relative duration (`30s`, `5m`, `2h`, `1d`) |
| `message` | string | no       | Message delivered on fire (defaults to `label`)                                 |
| `id`      | string | cancel   | Timer UUID to cancel                                                            |

## Constraints

- Duration: 2 minutes – 30 days.
- Max 50 active timers per session.
- Timers are session-scoped; you cannot cancel another session's timer.

## Examples

**Set a timer (relative):**

```json
{ "action": "set", "label": "check build", "at": "10m" }
```

**Set a timer (absolute):**

```json
{
  "action": "set",
  "label": "deploy reminder",
  "at": "2025-03-15T14:00:00Z",
  "message": "Time to deploy v2.1"
}
```

**Cancel a timer:**

```json
{ "action": "cancel", "id": "b3f1a2c4-..." }
```

**List active timers:**

```json
{ "action": "list" }
```

## Tips

- Relative durations accept flexible units: `s`/`sec`/`seconds`, `m`/`min`/`minutes`, `h`/`hr`/`hours`, `d`/`days`.
- A cancelled or non-existent timer returns `cancelled: false` (not an error).
