# builtin-memory

Search and ingest markdown documents from configured memory roots.

---

## memory-ingest

Scan configured memory paths and index new or changed documents. Optionally filter by glob patterns.

### Parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `paths` | string[] | no | Include globs for selective ingest |
| `exclude` | string[] | no | Exclude globs |
| `report` | boolean | no | Include per-file list in response (capped at 200 entries) |

### Examples

**Ingest everything:**
```json
{}
```

**Ingest only a subdirectory:**
```json
{ "paths": ["docs/**"] }
```

**Ingest with exclusions and report:**
```json
{ "paths": ["src/**"], "exclude": ["src/vendor/**"], "report": true }
```

---

## memory-search

Full-text (and optional embedding) search over ingested documents.

### Parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `query` | string | yes | Search query text |
| `limit` | number | no | Max results, 1–25 (default 10) |
| `path_prefix` | string | no | Filter results to paths starting with this prefix |
| `after` | string | no | ISO 8601 date — only docs modified after this |
| `before` | string | no | ISO 8601 date — only docs modified before this |
| `min_score` | number | no | Minimum relevance score, 0–1 (default 0) |
| `include_scores` | boolean | no | Include `score` field on each hit |
| `snippet` | boolean | no | Return a short snippet instead of full body |
| `snippet_chars` | number | no | Snippet length, 20–1000 (default 200) |
| `highlight_tag` | string | no | Wrap matched terms with this tag (default `**`) |
| `include_body` | boolean | no | Include full body when snippet mode is on (default false in snippet mode) |

### Examples

**Basic search:**
```json
{ "query": "authentication flow" }
```

**Scoped search with date range:**
```json
{ "query": "rate limiting", "path_prefix": "docs/api/", "after": "2025-01-01", "limit": 5 }
```

**Snippet mode with scores:**
```json
{ "query": "error handling", "snippet": true, "snippet_chars": 300, "include_scores": true }
```

## Tips

- `memory-ingest` must run before `memory-search` will return results.
- Body text is truncated to 1500 chars per hit; use `snippet` mode for lighter responses.
- Embedding-based ranking activates automatically when the server has embeddings enabled; no extra params needed.
- `after` must be earlier than `before` when both are specified.
