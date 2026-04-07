# builtin-kv

Workspace-scoped key-value store backed by the state DB. Values are JSON-serialized.

## Parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `action` | string | yes | `get`, `set`, `delete`, or `list` |
| `key` | string | get/set/delete | Max 256 chars |
| `value` | any | set | Any JSON-serializable value. Max 64 KB serialized |
| `prefix` | string | no | Filter keys by prefix (list only) |
| `limit` | number | no | Max entries to return (list only, default 100, max 1000) |

## Examples

**Store a value:**
```json
{ "action": "set", "key": "build.lastHash", "value": "abc123" }
```

**Store a structured value:**
```json
{ "action": "set", "key": "config.retries", "value": { "max": 3, "delayMs": 500 } }
```

**Read a value:**
```json
{ "action": "get", "key": "build.lastHash" }
```
Returns `{ "ok": true, "key": "build.lastHash", "value": "abc123", "exists": true }`.
Missing keys return `"exists": false` with `"value": null`.

**Delete a key:**
```json
{ "action": "delete", "key": "build.lastHash" }
```
Returns `{ "ok": true, "key": "build.lastHash", "deleted": true }`. `deleted` is `false` if the key didn't exist.

**List all keys:**
```json
{ "action": "list" }
```

**List keys by prefix:**
```json
{ "action": "list", "prefix": "build.", "limit": 50 }
```
Returns `{ "ok": true, "entries": [{ "key": "...", "value": ..., "updatedAt": "..." }, ...], "truncated": false }`.

## Tips

- Values can be any JSON type — strings, numbers, objects, arrays, booleans, null.
- Use dot-delimited key conventions (e.g. `session.foo`, `cache.bar`) and `prefix` to namespace and query related keys.
- `truncated: true` in list results means more keys matched than the limit; increase `limit` or narrow the `prefix`.
