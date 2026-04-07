# builtin-procman

Query managed processes. Read-only — cannot start, stop, or restart processes.

## Parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `action` | string | yes | `list` or `inspect` |
| `id` | string | inspect only | Process id to inspect |

## Examples

**List all managed processes:**
```json
{ "action": "list" }
```

Returns an array of `{ id, label, state, pid, uptimeMs, restartCount, owner }`.

**Inspect a specific process:**
```json
{ "action": "inspect", "id": "my-server" }
```

Returns the same fields as list plus `lastExitCode`, `lastSignal`, `recentStdout`, and `recentStderr`.

## Tips

- Use `list` first to discover process ids, then `inspect` for details and recent output.
- `recentStdout`/`recentStderr` contain only the tail of the output buffer, not the full history.
