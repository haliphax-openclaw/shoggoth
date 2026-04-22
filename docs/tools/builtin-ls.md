# builtin-ls

List directory contents. Returns structured JSON with entry paths, types, and optional stat info.

## Parameters

| Param       | Type    | Required | Notes                                        |
| ----------- | ------- | -------- | -------------------------------------------- |
| `path`      | string  | no       | Workspace-relative path (default: `.`)       |
| `all`       | boolean | no       | Include dotfiles (default: false)            |
| `recursive` | boolean | no       | Recurse into subdirectories (default: false) |
| `maxDepth`  | number  | no       | Max recursion depth, 1–20 (default: 5)       |
| `glob`      | string  | no       | Glob filter — supports `*`, `**`, `?`        |
| `stat`      | boolean | no       | Include `size` (bytes) and `mtime` per entry |
| `limit`     | number  | no       | Max entries returned, 1–500 (default: 500)   |

## Output

```json
{
  "entries": [{ "path": "src/index.ts", "type": "file" }],
  "truncated": false,
  "total": 1
}
```

Entry `type` is one of: `file`, `directory`, `symlink`, `other`.
When `stat` is true, entries also include `size` and `mtime`.
When results exceed `limit`, `truncated` is `true` and `total` reflects the full count.

## Examples

**List current directory:**

```json
{ "path": "." }
```

**List a subdirectory including dotfiles:**

```json
{ "path": "src", "all": true }
```

**Recursive listing with glob filter:**

```json
{ "path": ".", "recursive": true, "glob": "**/*.ts" }
```

**Shallow recursive with stat info:**

```json
{ "path": "src", "recursive": true, "maxDepth": 2, "stat": true }
```

**Limit results:**

```json
{ "path": ".", "recursive": true, "limit": 50 }
```

## Tips

- Dotfiles are hidden by default; pass `all: true` to reveal them.
- `glob` filters on the path relative to the listed directory, not the workspace root.
- Symlinks that escape the workspace are detected and not followed during recursion.
- Use `limit` to keep output small when you only need a sample of a large tree.
