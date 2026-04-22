# builtin-exec

Run shell commands and poll background processes.

## exec

Execute a command via `/bin/sh -c`. Returns combined or split stdout/stderr.

### Parameters

| Param          | Type     | Required | Notes                                                                    |
| -------------- | -------- | -------- | ------------------------------------------------------------------------ |
| `argv`         | string[] | yes      | Command + arguments                                                      |
| `timeout`      | number   | no       | Max seconds before SIGTERM → SIGKILL                                     |
| `stdin`        | string   | no       | Written to stdin, then closed                                            |
| `workdir`      | string   | no       | Working directory (absolute or workspace-relative)                       |
| `env`          | object   | no       | Key-value pairs merged into process env                                  |
| `splitStreams` | boolean  | no       | Return `stdout`/`stderr` separately (default: false → combined `output`) |
| `maxOutput`    | number   | no       | Max characters per stream. System cap: ~1 MB, default: ~200 KB           |
| `truncation`   | string   | no       | `"head"`, `"tail"` (default), or `"both"` — which end to keep            |
| `background`   | boolean  | no       | Start in background immediately, return a handle                         |
| `yieldMs`      | number   | no       | Wait up to N ms; if still running, background it and return a handle     |

When none of the extended params are present, `argv` is executed directly and the response always contains split `stdout`/`stderr` fields.

### Examples

**Simple command:**

```json
{ "argv": ["ls", "-la"] }
```

**With timeout and stdin:**

```json
{
  "argv": ["grep", "error"],
  "stdin": "line1\nerror here\nline3\n",
  "timeout": 5
}
```

**Background a long-running process:**

```json
{ "argv": ["make", "-j4"], "background": true }
```

→ `{ "status": "running", "sessionId": "...", "pid": 1234 }`

**Yield — wait briefly, background if slow:**

```json
{ "argv": ["npm", "test"], "yieldMs": 10000 }
```

→ Returns full result if done within 10 s, otherwise backgrounds and returns `{ "sessionId": "...", "pid": ..., "yielded": true, "partialOutput": "..." }`.

**Split streams with truncation:**

```json
{
  "argv": ["sh", "-c", "echo ok; echo fail >&2"],
  "splitStreams": true,
  "truncation": "tail"
}
```

---

## poll

Check status and read output of a backgrounded `exec` process.

### Parameters

| Param     | Type    | Required | Notes                                                                   |
| --------- | ------- | -------- | ----------------------------------------------------------------------- |
| `pid`     | number  | yes      | PID from the background exec result                                     |
| `timeout` | number  | no       | Max ms to wait for exit before returning current status (0 = immediate) |
| `streams` | boolean | no       | Split `stdout`/`stderr` (default: false → combined `output`)            |
| `tail`    | number  | no       | Return only the last N lines                                            |
| `since`   | number  | no       | Return output after this byte offset (incremental reads)                |

### Examples

**Check immediately:**

```json
{ "pid": 1234 }
```

→ `{ "pid": 1234, "status": "running", "output": "...", "outputBytes": 512, "runtimeMs": 3200 }`

**Wait up to 5 s for completion:**

```json
{ "pid": 1234, "timeout": 5000 }
```

**Incremental output (read only new bytes):**

```json
{ "pid": 1234, "since": 512 }
```

**Tail last 20 lines, split streams:**

```json
{ "pid": 1234, "tail": 20, "streams": true }
```

## Tips

- Use `yieldMs` for commands that _usually_ finish fast but _might_ be slow — avoids unnecessary backgrounding.
- `background: true` and `yieldMs: 0` are equivalent (immediate background).
- Poll with `since` to stream incremental output without re-reading everything.
- `tail` is useful for watching build/test progress without pulling full logs.
- When a backgrounded process finishes, `poll` returns `"status": "exited"` with `exitCode`.
