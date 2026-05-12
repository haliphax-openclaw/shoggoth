# Canvas Service Plugin — Specification

Type signatures, interfaces, schemas, and code examples for porting the OpenClaw Canvas web server to Shoggoth's plugin and service registry system.

---

## 1. Package Renaming

All `openclaw`-prefixed packages and scopes become `shoggoth`-prefixed.

| Current name                               | New name                                    |
| ------------------------------------------ | ------------------------------------------- |
| `@haliphax-openclaw/a2ui-sdk`              | `@shoggoth/a2ui-sdk`                        |
| `@haliphax-openclaw/a2ui-catalog-basic`    | `@shoggoth/a2ui-catalog-basic`              |
| `@haliphax-openclaw/a2ui-catalog-extended` | `@shoggoth/a2ui-catalog-extended`           |
| `@haliphax-openclaw/a2ui-catalog-all`      | `@shoggoth/a2ui-catalog-all`                |
| `openclaw-canvas` (project)                | `@shoggoth/service-canvas` (plugin package) |

Internal imports referencing `@haliphax-openclaw/*` are updated to `@shoggoth/*`.

---

## 2. Plugin Manifest

The plugin's `package.json` declares the `shoggothPlugin` property bag:

```json
{
  "name": "@shoggoth/service-canvas",
  "version": "0.1.0",
  "type": "module",
  "shoggothPlugin": {
    "kind": "service",
    "entrypoint": "./src/plugin.ts"
  },
  "dependencies": {
    "@shoggoth/plugins": "*",
    "@shoggoth/shared": "*",
    "express": "^5.1.0",
    "ws": "^8.18.0",
    "better-sqlite3": "^12.8.0",
    "chokidar": "^4.0.0",
    "mime-types": "^2.1.35"
  }
}
```

---

## 3. Plugin Entrypoint

The entrypoint exports a factory function returning `Plugin<ShoggothHooks>`:

```ts
import type { Plugin } from "hooks-plugin";
import type { ShoggothHooks } from "@shoggoth/plugins";
import type { DirectServiceTool } from "@shoggoth/plugins";

export default function createCanvasPlugin(): Plugin<ShoggothHooks> {
  return {
    name: "service-canvas",
    hooks: {
      "service.register"(ctx) {
        /* ... */
      },
      "health.register"(ctx) {
        /* ... */
      },
      "daemon.shutdown"(ctx) {
        /* ... */
      },
    },
  };
}
```

---

## 4. Service Registration

In the `service.register` hook, the plugin:

1. Starts the Express + WebSocket server on a configured port
2. Calls `ctx.registerService()` to register with the `ServiceRegistry`
3. Calls `ctx.registerTools()` to register direct tool handlers

### Service Entry

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

`expose: "both"` means:

- The Express HTTP server is proxied through Shoggoth's `ServiceGateway` at `/svc/canvas/...`
- The WebSocket endpoints (`/ws`, `/ws/a2ui`) are proxied at `/svc/canvas/ws` and `/svc/canvas/ws/a2ui`
- Direct tools are invocable in-process without HTTP overhead

---

## 5. Direct Tool Definitions

Eight tools replace the OpenClaw `NodeClient.executeCommand()` dispatch. All are `DirectServiceTool` entries registered via `ctx.registerTools()`.

### 5.1 `canvas.present`

Show/present canvas content for a session.

```ts
{
  name: "canvas.present",
  description: "Show the canvas panel for a given session. If the session has a URL or file path, navigates to it.",
  parameters: {
    type: "object",
    properties: {
      session: { type: "string", description: "Session ID (e.g. 'developer'). Defaults to 'main'." },
      target: { type: "string", description: "URL or file path to present." },
      surface: { type: "string", description: "Optional A2UI surface to activate." },
    },
  },
  async handler(args, ctx) { /* ... */ },
}
```

### 5.2 `canvas.hide`

Hide the canvas panel.

```ts
{
  name: "canvas.hide",
  description: "Hide the canvas panel.",
  parameters: { type: "object", properties: {} },
  async handler(args, ctx) { /* ... */ },
}
```

### 5.3 `canvas.navigate`

Navigate to a session/path or external URL.

```ts
{
  name: "canvas.navigate",
  description: "Navigate the canvas to a session file path or external URL. For external URLs, only http/https are allowed.",
  parameters: {
    type: "object",
    properties: {
      session: { type: "string", description: "Session ID. Defaults to 'main'." },
      path: { type: "string", description: "File path within the session directory." },
      url: { type: "string", description: "External URL (http/https) or openclaw-canvas:// URL." },
    },
  },
  async handler(args, ctx) { /* ... */ },
}
```

### 5.4 `canvas.eval`

Execute JavaScript in the canvas iframe.

```ts
{
  name: "canvas.eval",
  description: "Execute JavaScript in the canvas iframe context.",
  parameters: {
    type: "object",
    properties: {
      js: { type: "string", description: "JavaScript code to execute." },
      session: { type: "string", description: "Session ID. Defaults to 'main'." },
    },
    required: ["js"],
  },
  async handler(args, ctx) { /* ... */ },
}
```

### 5.5 `canvas.snapshot`

Capture the current canvas as a base64 PNG.

```ts
{
  name: "canvas.snapshot",
  description: "Capture the current canvas content as a base64 PNG image. Works for same-origin content and A2UI surfaces. Cross-origin iframes cannot be captured.",
  parameters: {
    type: "object",
    properties: {
      session: { type: "string", description: "Session ID. Defaults to 'main'." },
    },
  },
  async handler(args, ctx) { /* ... */ },
}
```

### 5.6 `canvas.a2ui.push`

Push A2UI surface commands as JSONL.

```ts
{
  name: "canvas.a2ui.push",
  description: "Push A2UI surface commands to a canvas session. The payload is a JSONL string where each line is an A2UI command object.",
  parameters: {
    type: "object",
    properties: {
      payload: { type: "string", description: "JSONL string of A2UI commands." },
      session: { type: "string", description: "Session ID. Defaults to 'main'." },
    },
    required: ["payload"],
  },
  async handler(args, ctx) { /* ... */ },
}
```

### 5.7 `canvas.a2ui.pushJSONL`

Alias for `canvas.a2ui.push` — accepts a raw JSONL string.

```ts
{
  name: "canvas.a2ui.pushJSONL",
  description: "Push a raw JSONL A2UI payload string to a canvas session. Alias for canvas.a2ui.push.",
  parameters: {
    type: "object",
    properties: {
      payload: { type: "string", description: "Raw JSONL string." },
      session: { type: "string", description: "Session ID. Defaults to 'main'." },
    },
    required: ["payload"],
  },
  async handler(args, ctx) { /* ... */ },
}
```

### 5.8 `canvas.a2ui.reset`

Clear A2UI surface state.

```ts
{
  name: "canvas.a2ui.reset",
  description: "Clear all A2UI surfaces for a session, or all sessions if no session is specified.",
  parameters: {
    type: "object",
    properties: {
      session: { type: "string", description: "Session ID. If omitted, clears all sessions." },
    },
  },
  async handler(args, ctx) { /* ... */ },
}
```

---

## 6. Tool Handler Implementation Pattern

Each handler follows the same pattern as the existing `NodeClient.executeCommand()` cases, adapted to the `DirectServiceTool` interface:

```ts
async handler(args, ctx) {
  const session = (args.session as string) || "main";

  // Dispatch to the in-memory Gateway instance (same object the WS server uses)
  gateway.broadcastSpaSession(session, {
    type: "canvas.show",
    session,
  });

  return {
    resultJson: JSON.stringify({ ok: true, session }),
  };
}
```

The `gateway` object is the same `Gateway` instance created during `service.register` — no HTTP round-trip needed.

For `canvas.snapshot`, the handler uses `gateway.requestSnapshot()` which returns a promise that resolves when the SPA sends the image back via WebSocket.

---

## 7. Health Probe

```ts
"health.register"(ctx) {
  ctx.registerProbe({
    name: "canvas",
    check: async () => ({
      status: server?.listening ? "pass" : "fail",
      detail: server?.listening ? `Listening on port ${port}` : "Server not running",
    }),
  });
},
```

---

## 8. Shutdown

```ts
async "daemon.shutdown"() {
  // Stop accepting new connections
  nodeClient?.stop();       // if any WS client connections exist
  gateway.broadcastSpa({ type: "server.shutdown" });
  jsonlWatcher.close();
  await fileWatcher.close();
  gateway.close();
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
},
```

---

## 9. Environment Variable Renaming

All `OPENCLAW_CANVAS_*` variables are renamed to `SHOGGOTH_CANVAS_*`:

| Old                            | New                            |
| ------------------------------ | ------------------------------ |
| `OPENCLAW_CANVAS_HOST`         | `SHOGGOTH_CANVAS_HOST`         |
| `OPENCLAW_CANVAS_PORT`         | `SHOGGOTH_CANVAS_PORT`         |
| `OPENCLAW_CANVAS_BASE_PATH`    | `SHOGGOTH_CANVAS_BASE_PATH`    |
| `OPENCLAW_CANVAS_SKIP_CONFIRM` | `SHOGGOTH_CANVAS_SKIP_CONFIRM` |
| `OPENCLAW_CANVAS_A2UI_DB`      | `SHOGGOTH_CANVAS_A2UI_DB`      |
| `OPENCLAW_CANVAS_ROOT`         | `SHOGGOTH_CANVAS_ROOT`         |
| `OPENCLAW_CANVAS_IGNORE_DIRS`  | `SHOGGOTH_CANVAS_IGNORE_DIRS`  |

`OPENCLAW_GATEWAY_WS_URL` and `OPENCLAW_GATEWAY_TOKEN` are **removed** — the plugin no longer connects to an OpenClaw gateway.

---

## 10. Removed Components

These OpenClaw-specific components are deleted entirely:

| Component                                                     | Reason                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------- |
| `NodeClient`                                                  | Shoggoth plugin system handles registration; no Ed25519 auth needed |
| `agent-proxy` route (`POST /api/agent`)                       | Agents use direct tools, not HTTP proxy to gateway                  |
| `file-spawn` route (`POST /api/file-spawn`)                   | Same — agents use native Shoggoth session tools                     |
| MCP server (`mcp/`)                                           | Tools are natively exposed to Shoggoth agents                       |
| `OPENCLAW_GATEWAY_WS_URL` / `OPENCLAW_GATEWAY_TOKEN` env vars | No gateway connection                                               |
| `openclaw.json` config reading                                | Replaced by Shoggoth config (`ctx.config`)                          |

---

## 11. Workspace Resolution

OpenClaw reads agent workspace paths from `~/.openclaw/openclaw.json`. The Shoggoth plugin reads them from `ctx.config.agents.list` at `service.register` time:

```ts
const agentsList = ctx.config.agents?.list ?? [];
const agentWorkspaceMap = new Map<string, string>();
for (const agent of agentsList) {
  const ws = agent.workspace ?? defaultWorkspace;
  const canvasDir = path.join(ws, "canvas");
  fs.mkdirSync(canvasDir, { recursive: true });
  agentWorkspaceMap.set(agent.id, canvasDir);
}
```

---

## 12. Config Schema

The plugin is activated by adding an entry to the Shoggoth config's `plugins` array:

```json
{
  "plugins": [{ "package": "@shoggoth/service-canvas" }]
}
```

Or for local development:

```json
{
  "plugins": [{ "path": "./packages/service-canvas" }]
}
```

---

## 13. File Layout (Final)

```
packages/service-canvas/
├── package.json                    # shoggothPlugin manifest
├── tsconfig.json
├── src/
│   ├── plugin.ts                   # Plugin entrypoint (factory + hooks)
│   ├── server/
│   │   ├── index.ts                # Express app, startup, shutdown (adapted)
│   │   ├── services/
│   │   │   ├── gateway.ts          # WebSocket server (/gateway, /ws, /ws/a2ui)
│   │   │   ├── session-manager.ts  # Active session tracking
│   │   │   ├── file-resolver.ts    # Path resolution with traversal guard
│   │   │   ├── file-watcher.ts     # chokidar live reload
│   │   │   ├── jsonl-watcher.ts    # JSONL A2UI auto-push
│   │   │   ├── a2ui-manager.ts     # A2UI surface state
│   │   │   ├── a2ui-store.ts       # SQLite persistence
│   │   │   ├── a2ui-pipeline.ts    # A2UI command processing
│   │   │   ├── a2ui-commands.ts    # v0.8 → v0.9 normalization
│   │   │   └── catalog-registry.ts # Catalog package discovery
│   │   ├── shared/
│   │   │   ├── deep-link-script.ts
│   │   │   └── snapshot-script.ts
│   │   ├── commands/
│   │   │   ├── canvas.ts           # show, hide, navigate, eval, snapshot
│   │   │   └── a2ui.ts             # push, reset
│   │   └── routes/
│   │       ├── canvas.ts           # GET /:session/:path
│   │       ├── catalogs.ts         # GET /api/catalogs
│   │       ├── canvas-config.ts    # GET /api/canvas-config
│   │       └── scaffold.ts         # GET /scaffold
│   └── client/                     # Vue 3 SPA (unchanged)
│       ├── main.ts
│       ├── router.ts
│       ├── views/
│       ├── components/
│       ├── store/
│       ├── services/
│       ├── utils/
│       └── styles/
├── packages/
│   ├── a2ui-sdk/                   # @shoggoth/a2ui-sdk
│   ├── a2ui-catalog-basic/         # @shoggoth/a2ui-catalog-basic
│   ├── a2ui-catalog-extended/      # @shoggoth/a2ui-catalog-extended
│   └── a2ui-catalog-all/           # @shoggoth/a2ui-catalog-all
└── test/                           # vitest tests (adapted)
```

---

## 14. Documentation Files

The following docs are ported and updated:

| Source                                                  | Target                                                      | Changes                                                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `openclaw-canvas-web/README.md`                         | `packages/service-canvas/README.md`                         | Rename all `openclaw` → `shoggoth`, update env vars, remove node client / MCP sections         |
| `openclaw-canvas-web/AGENTS.md`                         | `packages/service-canvas/AGENTS.md`                         | Rename all `openclaw` → `shoggoth`, update architecture diagram, remove node client references |
| `openclaw-canvas-web/docs/components.md`                | `packages/service-canvas/docs/components.md`                | Rename scope references                                                                        |
| `openclaw-canvas-web/docs/creating-catalog-packages.md` | `packages/service-canvas/docs/creating-catalog-packages.md` | Rename scope references                                                                        |
| `openclaw-canvas-web/docs/deep-linking.md`              | `packages/service-canvas/docs/deep-linking.md`              | Remove gateway proxy section, update env vars                                                  |
| `openclaw-canvas-web/docs/a2ui-reactive.md`             | `packages/service-canvas/docs/a2ui-reactive.md`             | Rename scope references                                                                        |
| `openclaw-canvas-web/docs/jsonl-watcher.md`             | `packages/service-canvas/docs/jsonl-watcher.md`             | Rename scope references                                                                        |
| —                                                       | `docs/tools/canvas.md`                                      | **NEW** — tool reference for all 8 canvas tools                                                |

---

## 15. New Tool Reference Doc

A new `docs/tools/canvas.md` is created in the main Shoggoth docs, following the same format as other tool docs. It documents all 8 canvas tools with:

- Tool name and description
- Parameter schema
- Example invocations
- Notes on session scoping, A2UI catalogs, and snapshot limitations
