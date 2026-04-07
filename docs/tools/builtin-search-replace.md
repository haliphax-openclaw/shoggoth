# builtin-search-replace

Search files (via `rg`) and replace text. Two actions: `search` and `replace`.

## Common Parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `action` | string | yes | `"search"` or `"replace"` |

## Search Parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `pattern` | string | yes | Regex pattern (or literal if `fixedStrings`) |
| `path` | string | no | File or directory to search (default: `"."`) |
| `fixedStrings` | boolean | no | Literal string match instead of regex |
| `caseSensitive` | boolean | no | Set `false` for case-insensitive (default: true) |
| `multiline` | boolean | no | Enable multiline matching |
| `includeHidden` | boolean | no | Include hidden files |
| `fileType` | string | no | Ripgrep file type filter (e.g. `"ts"`) |
| `glob` | string | no | Glob pattern filter (e.g. `"*.json"`) |
| `contextLines` | number | no | Lines of context around each match |
| `maxCount` | number | no | Max matches per file |
| `maxResults` | number | no | Max output lines (default: 200) |

## Replace Parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `file` | string | yes | Workspace-relative path to modify |
| `match` | string | yes | Regex pattern (or literal if `fixedStrings`) |
| `replacement` | string | yes | Replacement text (supports `$1`–`$9` capture groups) |
| `fixedStrings` | boolean | no | Treat `match` as a literal string |
| `count` | number | no | Max replacements; omit or `0` for all |

## Examples

**Search for a pattern in the workspace:**
```json
{ "action": "search", "pattern": "TODO" }
```

**Search a specific file, case-insensitive:**
```json
{ "action": "search", "pattern": "error", "path": "src/app.ts", "caseSensitive": false }
```

**Search with literal string and glob filter:**
```json
{ "action": "search", "pattern": "console.log(", "fixedStrings": true, "glob": "*.ts" }
```

**Replace all occurrences in a file:**
```json
{ "action": "replace", "file": "src/foo.ts", "match": "oldName", "replacement": "newName", "fixedStrings": true }
```

**Regex replace with capture group:**
```json
{ "action": "replace", "file": "src/foo.ts", "match": "fn_(\\w+)", "replacement": "func_$1" }
```

**Replace only the first 2 occurrences:**
```json
{ "action": "replace", "file": "src/foo.ts", "match": "foo", "replacement": "bar", "fixedStrings": true, "count": 2 }
```

## Tips

- All paths are workspace-relative and cannot escape the workspace root.
- Search returns `rg`-formatted output (`file:line:content`). Output is truncated at `maxResults`.
- Replace returns `{ "replacements": N }` on success.
- Use `fixedStrings` when matching literal text that contains regex metacharacters.
