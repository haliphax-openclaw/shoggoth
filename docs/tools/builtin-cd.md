# builtin-cd

Change the session's working directory. Paths are sandboxed to the workspace root.

## Parameters

| Param  | Type   | Required | Notes                                                                 |
| ------ | ------ | -------- | --------------------------------------------------------------------- |
| `path` | string | no       | Relative or absolute directory path. Omit to reset to workspace root. |

## Examples

**Move into a subdirectory:**

```json
{ "path": "src/components" }
```

**Go up one level:**

```json
{ "path": ".." }
```

**Absolute path (must be within workspace):**

```json
{ "path": "/workspace/project/src" }
```

**Reset to workspace root:**

```json
{}
```

## Tips

- Relative paths resolve from the current working directory, not the workspace root.
- The target must exist and be a directory.
- Paths that escape the workspace (e.g. `../../etc`) are rejected.
- Symlinks are resolved; the real path must also be within the workspace.
