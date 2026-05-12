---
date: 2026-05-12
completed: never
---

# Canvas Web Server — Shoggoth Service Plugin Port

## Summary

Port the [OpenClaw Canvas web server](https://github.com/haliphax-ai/openclaw-canvas-web) to Shoggoth's plugin and service registry system. The Canvas server becomes a `service`-kind plugin (`@shoggoth/service-canvas`) that registers its HTTP/WebSocket endpoints through the `ServiceGateway` and exposes canvas manipulation commands as direct in-process tools. All `openclaw` package scopes are renamed to `shoggoth`, OpenClaw-specific components (node client, agent proxy, MCP server) are removed, and documentation is fully ported.

## Motivation

The Canvas web server is a cross-platform canvas that agents control via WebSocket. It renders HTML content and A2UI (Agent-to-UI) surfaces in a Vue 3 SPA. Currently built for OpenClaw, it uses:

- **NodeClient** — Ed25519-authenticated gateway node registration to receive `node.invoke` commands
- **Agent proxy route** — HTTP proxy to the OpenClaw gateway's `/tools/invoke` for deep links
- **MCP server** — separate process exposing canvas commands via MCP

None of these exist in Shoggoth. Shoggoth's plugin system provides a cleaner model:

- **Service registration** — plugins declare themselves via the `service.register` hook; the daemon's `ServiceGateway` proxies HTTP and WebSocket traffic
- **Direct tools** — plugins register in-process tool handlers that agents call without HTTP overhead
- **Health probes** — plugins register liveness checks via the `health.register` hook
- **Lifecycle management** — startup and shutdown are handled through hooks, not manual signal handlers

Porting Canvas to this model eliminates ~500 lines of OpenClaw-specific glue (node client, proxy routes, MCP server) and makes Canvas a first-class Shoggoth service.

## Design

### Architecture

```
Shoggoth Agent ──tool call──▶ DirectServiceTool handler ──▶ Gateway (in-memory)
                                                              │
Shoggoth Agent ──HTTP request──▶ ServiceGateway ──proxy──▶ Express server
                                                              │
Browser ──WebSocket──▶ ServiceGateway ──proxy──▶ WS server (/ws, /ws/a2ui)
                                                              │
Browser ──HTTP──▶ ServiceGateway ──proxy──▶ Express (SPA, static files, API)
```

The plugin starts its own Express + WebSocket server on a configured port. The Shoggoth `ServiceGateway` proxies external HTTP and WebSocket traffic to it. Agent tool calls bypass HTTP entirely — they invoke the same in-memory `Gateway` object directly.

### Package Renaming

All `openclaw`-prefixed scopes become `shoggoth`:

| Old                                        | New                                 |
| ------------------------------------------ | ----------------------------------- |
| `@haliphax-openclaw/a2ui-sdk`              | `@shoggoth/a2ui-sdk`                |
| `@haliphax-openclaw/a2ui-catalog-basic`    | `@shoggoth/a2ui-catalog-basic`      |
| `@haliphax-openclaw/a2ui-catalog-extended` | `@shoggoth/a2ui-catalog-extended`   |
| `@haliphax-openclaw/a2ui-catalog-all`      | `@shoggoth/a2ui-catalog-all`        |
| `openclaw-canvas-web` (project)            | `@shoggoth/service-canvas` (plugin) |

### Removed Components

| Component                                            | Reason                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| `NodeClient`                                         | Shoggoth plugin system handles registration; no Ed25519 auth needed |
| `agent-proxy` route                                  | Agents use direct tools, not HTTP proxy to gateway                  |
| `file-spawn` route                                   | Same — agents use native Shoggoth session tools                     |
| MCP server                                           | Tools are natively exposed to Shoggoth agents                       |
| `OPENCLAW_GATEWAY_WS_URL` / `OPENCLAW_GATEWAY_TOKEN` | No gateway connection                                               |
| `openclaw.json` config reading                       | Replaced by Shoggoth config via `ctx.config`                        |

### Tool Surface

Eight direct tools replace the OpenClaw `NodeClient.executeCommand()` dispatch:

| Tool                    | Description                                |
| ----------------------- | ------------------------------------------ |
| `canvas.present`        | Show/present canvas content for a session  |
| `canvas.hide`           | Hide the canvas panel                      |
| `canvas.navigate`       | Navigate to a session/path or external URL |
| `canvas.eval`           | Execute JavaScript in the canvas iframe    |
| `canvas.snapshot`       | Capture canvas as base64 PNG               |
| `canvas.a2ui.push`      | Push A2UI surface commands (JSONL)         |
| `canvas.a2ui.pushJSONL` | Push raw JSONL A2UI payload                |
| `canvas.a2ui.reset`     | Clear A2UI surface state                   |

### Environment Variables

All `OPENCLAW_CANVAS_*` variables are renamed to `SHOGGOTH_CANVAS_*`. Gateway-related variables are removed.

### Service Registration

```ts
ctx.registerService({
  id: "canvas",
  label: "Canvas",
  capabilities: ["canvas", "a2ui", "web"],
  expose: "both",
  port: 3456,
  protocol: "http+ws",
  basePath: "/",
});
```

`expose: "both"` means the service is accessible via the `ServiceGateway` proxy (for browsers) and via direct tool handlers (for agents).

### Documentation

All Canvas project documentation is ported and updated:

- `README.md`, `AGENTS.md`, and all `docs/` files
- References to `openclaw` replaced with `shoggoth`
- Sections on node client, MCP, and gateway proxy removed
- New `docs/tools/canvas.md` created in the main Shoggoth docs

## Testing Strategy

- **Unit tests:** Each tool handler, service registration, health probe, and shutdown hook
- **Integration tests:** Plugin loads in the daemon, service appears in registry, tools are callable, SPA is accessible via gateway proxy
- **Existing tests:** Ported from the OpenClaw Canvas project, adapted for the plugin model (no mocks for gateway node client)
- **Regression:** Full Shoggoth test suite must pass unchanged

## Considerations

- The `Gateway` class (WebSocket server) is shared between the plugin's HTTP server and direct tool handlers — it must be a singleton within the plugin process
- `canvas.snapshot` is async and uses a pending promise map with a 30s timeout — the direct tool handler must await this
- The Vue SPA client code is unchanged; only server-side code is ported
- A2UI catalog packages (`a2ui-sdk`, `a2ui-catalog-basic`, `a2ui-catalog-extended`, `a2ui-catalog-all`) are ported as separate packages within the monorepo
- The `ServiceGateway` handles WebSocket upgrade proxying — no special config needed for `/ws` and `/ws/a2ui`
- Deep links (`openclaw://`) are handled client-side by the injected script; the server-side proxy to the gateway is removed. Deep link clicks in canvas content will need a new mechanism (TBD — possibly a Shoggoth session tool call from the client)
- The `openclaw-canvas://` URL scheme should be renamed to `shoggoth-canvas://` for consistency (TBD — may be deferred to avoid breaking existing canvas content)

## Migration

- No database schema changes in the core Shoggoth database
- Canvas's own SQLite database (A2UI cache) is unaffected
- Config gains a `{ "package": "@shoggoth/service-canvas" }` entry in the `plugins` array
- Existing Canvas deployments must update environment variable names (`OPENCLAW_CANVAS_*` → `SHOGGOTH_CANVAS_*`)
- No state migration needed — the A2UI SQLite cache is forward-compatible

## References

- [`spec.md`](spec.md) — Full type signatures, tool definitions, and file layout
- [`implementation.md`](implementation.md) — Phased implementation steps
- [Shoggoth plugins docs](../../docs/plugins.md) — Plugin system reference
- [Service demo package](../../packages/service-demo/) — Reference `service`-kind plugin implementation
- [Original Canvas project](https://github.com/haliphax-ai/openclaw-canvas-web) — Source of truth for server/client code being ported
