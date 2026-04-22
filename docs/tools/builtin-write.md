# builtin-write

Write, append, replace, or insert file content. Auto-creates parent directories.

## Parameters

| Param         | Type    | Required | Notes                                                     |
| ------------- | ------- | -------- | --------------------------------------------------------- |
| `path`        | string  | yes      | Workspace-relative path                                   |
| `content`     | string  | yes      | Content to write                                          |
| `append`      | boolean | no       | Append to end of file                                     |
| `startLine`   | number  | no       | First line to replace (1-indexed)                         |
| `endLine`     | number  | no       | Last line to replace (inclusive, defaults to `startLine`) |
| `insertAfter` | number  | no       | Insert after this line (0 = before first line)            |
| `mkdirp`      | boolean | no       | Create parent dirs (default: true)                        |

Modes are **mutually exclusive** — use only one of: `append`, `startLine`/`endLine`, or `insertAfter`.

## Examples

**Create/overwrite a file:**

```json
{ "path": "src/foo.ts", "content": "export const x = 1;\n" }
```

**Append to a file:**

```json
{ "path": "src/foo.ts", "content": "\nexport const y = 2;\n", "append": true }
```

**Replace lines 3–5:**

```json
{ "path": "src/foo.ts", "content": "// replaced", "startLine": 3, "endLine": 5 }
```

**Replace a single line (line 10):**

```json
{ "path": "src/foo.ts", "content": "// new line 10", "startLine": 10 }
```

**Insert after line 2:**

```json
{ "path": "src/foo.ts", "content": "// inserted line", "insertAfter": 2 }
```

**Insert before first line:**

```json
{ "path": "src/foo.ts", "content": "// file header\n", "insertAfter": 0 }
```

## Tips

- For large files, write a small initial block then `append` the rest in follow-up calls.
- `startLine`/`endLine` and `insertAfter` require the file to already exist.
- Empty `content` with `startLine`/`endLine` deletes that line range.
