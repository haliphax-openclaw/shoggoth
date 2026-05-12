# Deep Linking

The canvas service supports custom URL schemes for navigating between agents, spawning file-based prompts, and cross-session canvas references.

## URL Schemes

### `shoggoth://` — Agent Deep Links

Used to trigger agent interactions from within the canvas SPA.

**Format:**

```
shoggoth://agent?message=<encoded-message>&agentId=<agent>&model=<model>
```

| Parameter | Required | Description                    |
| --------- | -------- | ------------------------------ |
| `message` | yes      | URL-encoded message to send    |
| `agentId` | no       | Target agent ID                |
| `model`   | no       | Model override for the session |

**Example:**

```
shoggoth://agent?message=Explain%20this%20function&agentId=developer
```

When a canvas client encounters this scheme, it calls the `/api/agent` endpoint to spawn a session.

### `shoggoth-fileprompt://` — File Prompt Links

Used to spawn a session using a file's content as the prompt.

**Format:**

```
shoggoth-fileprompt:///path/to/file.md?agentId=<agent>
```

| Parameter | Required | Description             |
| --------- | -------- | ----------------------- |
| path      | yes      | File path (as URL path) |
| `agentId` | no       | Target agent ID         |
| `model`   | no       | Model override          |

**Example:**

```
shoggoth-fileprompt:///workspace/prompts/review.md?agentId=reviewer
```

The canvas client reads the file via `/api/file-spawn` and spawns a session with its content.

### `shoggoth-canvas://` — Cross-Session Canvas URLs

Used for URL rewriting when referencing canvas content across sessions.

**Format:**

```
shoggoth-canvas://<session-id>/path/to/resource
```

The canvas gateway rewrites these URLs to the appropriate session-scoped resource path at render time.

## Security

- All deep link parameters are URL-decoded before use
- Path traversal (`..`) is blocked in file prompt links
- Session spawning uses the plugin's trusted identity — no external tokens
- The canvas SPA validates scheme prefixes before dispatching
