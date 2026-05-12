# Canvas Components

The canvas service is composed of several internal modules that work together to provide the full canvas experience.

## Server Core (`src/server/`)

### `index.ts` — Server Factory

`createCanvasServer(config)` creates and starts the Express + HTTP server with WebSocket support:

- Mounts JSON body parsing middleware
- Registers `/api/agent` and `/api/file-spawn` route handlers
- Creates an HTTP server and attaches the Gateway for WebSocket upgrade
- Returns `{ server, gateway, app, close }` for lifecycle management

### `config.ts` — Configuration

Defines `CanvasConfig` interface and `DEFAULT_CANVAS_CONFIG` with sensible defaults. All configuration comes from the plugin context at startup — no environment variables.

### `routes/agent-proxy.ts` — Agent Proxy

Handles `POST /api/agent` requests from the canvas SPA. Validates the message field, builds spawn options, and calls `sessionsSpawn` directly (in-process, trusted identity).

### `routes/file-spawn.ts` — File Spawn

Handles `POST /api/file-spawn` requests. Reads a file from disk and spawns a session with its content. Includes:

- URL decoding of file paths
- Path traversal detection (`..` blocking)
- Optional `canvasRoot` boundary enforcement for absolute paths

### `services/gateway.ts` — WebSocket Gateway

Manages WebSocket connections from canvas SPA clients:

- `broadcastSpa(message)` — broadcast to all connected clients
- `broadcastSpaSession(session, message)` — broadcast to clients subscribed to a specific session
- `requestSnapshot(session)` — request a screenshot from a session's client
- `close()` — graceful shutdown of all connections

### `shared/url-schemes.ts` — URL Schemes

Defines the three custom URL schemes and provides parsing/generation utilities:

| Constant        | Value                    |
| --------------- | ------------------------ |
| `SCHEME_AGENT`  | `shoggoth://`            |
| `SCHEME_FILE`   | `shoggoth-fileprompt://` |
| `SCHEME_CANVAS` | `shoggoth-canvas://`     |

## Plugin Entrypoint (`src/plugin.ts`)

The default export is a factory function `createCanvasPlugin()` that returns a `Plugin<ShoggothHooks>` with three hooks:

1. **`service.register`** — starts the server, registers the service entry and 8 tools
2. **`health.register`** — registers the `canvas` health probe
3. **`daemon.shutdown`** — gracefully closes the server and gateway

Tool handlers delegate directly to the Gateway instance — no HTTP round-trip.

## A2UI System

The Agent-to-User Interface (A2UI) system enables agents to push reactive UI components to connected clients:

- **Catalogs** define available components (charts, tables, forms, etc.)
- **SDK** (`@shoggoth/a2ui-sdk`) provides the base types and registration API
- **Push** sends component data to a session's connected clients via WebSocket
- **Reset** clears accumulated A2UI state for a session

### Catalog Packages

| Package                           | Contents                        |
| --------------------------------- | ------------------------------- |
| `@shoggoth/a2ui-catalog-basic`    | Core components (text, list)    |
| `@shoggoth/a2ui-catalog-extended` | Rich components (chart, table)  |
| `@shoggoth/a2ui-catalog-all`      | Meta-package bundling all above |
