# builtin-config

View or request changes to the agent's runtime configuration.

## config-show

Returns the current configuration for this session. Takes no parameters.

### Example

```json
{}
```

Returns the full config object as JSON.

## config-request

Request a configuration change by submitting a fragment. The host decides whether to apply it.

### Parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `fragment` | any | yes | Configuration fragment to apply |

### Examples

**Request a model change:**
```json
{ "fragment": { "model": "claude-sonnet-4-20250514" } }
```

**Request a temperature tweak:**
```json
{ "fragment": { "temperature": 0.5 } }
```

## Tips

- `config-show` is read-only and safe to call at any time.
- `config-request` is advisory — the host may reject or modify the fragment before applying.
- Both tools return `{ "error": "..." }` when the integration layer is unavailable.
