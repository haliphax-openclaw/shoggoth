# builtin-fs

File-system operations: mkdir, move, copy, rename, delete, stat, chmod. All paths are workspace-relative.

## Parameters

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `action` | string | yes | One of: `mkdir`, `move`, `copy`, `rename`, `delete`, `stat`, `chmod` |
| `path` | string | yes | Source path (workspace-relative) |
| `dest` | string | move/copy/rename | Destination path (`rename`: bare filename only) |
| `mode` | string | chmod | Octal permission string, e.g. `"755"` or `"0644"` |
| `recursive` | boolean | no | For `delete`: remove non-empty dirs. For `mkdir`: create intermediate dirs. |

## Examples

**Create a directory:**
```json
{ "action": "mkdir", "path": "src/utils" }
```

**Create nested directories:**
```json
{ "action": "mkdir", "path": "src/deep/nested/dir", "recursive": true }
```

**Move a file or directory:**
```json
{ "action": "move", "path": "src/old.ts", "dest": "src/utils/new.ts" }
```

**Copy a file or directory:**
```json
{ "action": "copy", "path": "src/foo.ts", "dest": "src/foo.backup.ts" }
```

**Rename in the same directory:**
```json
{ "action": "rename", "path": "src/foo.ts", "dest": "bar.ts" }
```

**Delete a file:**
```json
{ "action": "delete", "path": "tmp/scratch.ts" }
```

**Delete a non-empty directory:**
```json
{ "action": "delete", "path": "tmp", "recursive": true }
```

**Stat a file:**
```json
{ "action": "stat", "path": "src/foo.ts" }
```

Returns: `type`, `size`, `mtime`, `atime`, `mode`, `uid`, `gid`.

**Change permissions:**
```json
{ "action": "chmod", "path": "scripts/run.sh", "mode": "755" }
```

## Tips

- `move` auto-creates parent directories at the destination.
- `copy` is recursive for directories.
- `rename` is same-directory only — use `move` for cross-directory operations.
- `delete` on a non-empty directory fails unless `recursive: true`.
- `mkdir` is a no-op if the directory already exists.
