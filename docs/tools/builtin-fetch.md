# builtin-fetch

Make HTTP requests. Supports SSRF protection with private-IP blocking and an optional allowlist.

## Parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `url` | string | yes | Absolute HTTP or HTTPS URL |
| `method` | string | no | `GET` `POST` `PUT` `PATCH` `DELETE` `HEAD` `OPTIONS` (default: `GET`) |
| `headers` | object | no | Key-value header map |
| `body` | string \| object | no | Request body; objects are JSON-serialized and `Content-Type: application/json` is set automatically |
| `maxResponseBytes` | number | no | Cap on response body size in bytes (default: 1 048 576 / 1 MB) |
| `timeoutMs` | number | no | Request timeout in milliseconds (default: 30 000) |
| `binary` | boolean | no | Return body as base64 instead of UTF-8 text (default: false) |

## Response Shape

```json
{ "status": 200, "statusText": "OK", "headers": {}, "body": "...", "truncated": false, "bodyBytes": 1234 }
```

- `body` — UTF-8 text (or base64 when `binary: true`). JSON responses are pretty-printed automatically.
- `truncated` — `true` when the response exceeded `maxResponseBytes`.

## Examples

**Simple GET:**
```json
{ "url": "https://api.example.com/health" }
```

**POST with JSON body:**
```json
{ "url": "https://api.example.com/items", "method": "POST", "body": { "name": "widget" } }
```

**Custom headers and timeout:**
```json
{ "url": "https://api.example.com/data", "headers": { "Authorization": "Bearer tok_xxx" }, "timeoutMs": 5000 }
```

**Download binary content:**
```json
{ "url": "https://example.com/image.png", "binary": true, "maxResponseBytes": 5242880 }
```

## SSRF Protection

Hostnames are resolved before the request is made. If any resolved IP is private/internal, the request is blocked unless:

- `fetch.allowPrivateIps` is `true` in the daemon config, or
- the hostname or CIDR range is listed in `fetch.privateIpAllowlist`.

## Tips

- Redirects are **not** followed (redirect mode is `manual`). Check for 3xx status and the `location` header.
- Object `body` values get `Content-Type: application/json` automatically; string bodies do not.
- For large downloads, set `maxResponseBytes` explicitly to avoid silent truncation at 1 MB.
