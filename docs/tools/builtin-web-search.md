# builtin-web-search

Search the web via SearXNG. Returns an array of results with title, URL, snippet, engine, and optional published date.

## Parameters

| Param        | Type   | Required | Notes                                                     |
| ------------ | ------ | -------- | --------------------------------------------------------- |
| `query`      | string | yes      | Search query                                              |
| `count`      | number | no       | Max results to return (1–20, default: 5)                  |
| `categories` | string | no       | SearXNG categories (default: `"general"`)                 |
| `language`   | string | no       | Language code (default: `"en"`)                           |
| `timeRange`  | string | no       | Time filter (e.g. `"day"`, `"week"`, `"month"`, `"year"`) |

## Examples

**Basic search:**

```json
{ "query": "rust async runtime comparison" }
```

**Limit to 3 results:**

```json
{ "query": "node.js stream backpressure", "count": 3 }
```

**Search with time filter and category:**

```json
{ "query": "CVE linux kernel", "timeRange": "month", "categories": "it" }
```

## Result Shape

Each result object:

```json
{
  "title": "…",
  "url": "…",
  "snippet": "…",
  "engine": "…",
  "publishedDate": "…"
}
```

Returns `{ "results": [], "note": "No results found. Try refining your query." }` when empty.

## Tips

- Requires SearXNG to be configured on the daemon (`config.searxng`).
- Requests time out after 10 seconds.
- A 429 response returns a rate-limit error — back off and retry.
