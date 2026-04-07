# builtin-read

Read file content (text or image) from the workspace. Supports line ranges, multi-file globs, and stat-only mode. This tool is permitted special access to read from the Shoggoth app directory for inspecting system source code and documentation.

## Parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `path` | string | one of `path`/`paths` | Single file path (workspace-relative) |
| `paths` | string[] | one of `path`/`paths` | Multiple paths or glob patterns |
| `maxFiles` | number | no | Cap on files returned for `paths` (default: 20) |
| `fromLine` | number | no | First line to include, 1-indexed. Mutually exclusive with `offset` |
| `toLine` | number | no | Last line to include, 1-indexed inclusive. Mutually exclusive with `limit` |
| `offset` | number | no | Starting line, 1-indexed. Mutually exclusive with `fromLine` |
| `limit` | number | no | Max lines to read. Mutually exclusive with `toLine` |
| `stat` | boolean | no | Return metadata only (size, mtime, type, permissions, line count) — no content |

`path` and `paths` are mutually exclusive. `fromLine`/`toLine` and `offset`/`limit` are mutually exclusive.

## Examples

**Read a file:**
```json
{ "path": "src/foo.ts" }
```

**Read lines 10–25:**
```json
{ "path": "src/foo.ts", "fromLine": 10, "toLine": 25 }
```

**Read 50 lines starting at line 100:**
```json
{ "path": "src/foo.ts", "offset": 100, "limit": 50 }
```

**Read multiple files:**
```json
{ "paths": ["src/foo.ts", "src/bar.ts"] }
```

**Glob pattern:**
```json
{ "paths": ["src/**/*.test.ts"], "maxFiles": 10 }
```

**Stat a file (no content):**
```json
{ "path": "src/foo.ts", "stat": true }
```

**Stat multiple files:**
```json
{ "paths": ["src/*.ts"], "stat": true }
```

## Tips

- Image files (jpg, png, gif, webp) are returned as image content parts — no special params needed.
- Multi-file reads are capped at 2000 lines / 50 KB per file; excess is truncated.
- Binary files are detected and skipped in multi-file mode.
- Use `stat` to check file size and line count before reading large files.
