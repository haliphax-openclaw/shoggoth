# Canvas Service Plugin — Implementation Steps

Phased implementation plan. Each phase is a logical unit that can be committed independently. Phases should be executed in order.

---

## Phase 1: Create feature branch and scaffold plugin package

**Branch:** `feat/canvas-service-plugin`

1. Create `packages/service-canvas/` directory
2. Write `package.json` with `shoggothPlugin` manifest, dependencies on `@shoggoth/plugins`, `@shoggoth/shared`, `express`, `ws`, `better-sqlite3`, `chokidar`, `mime-types`
3. Write `tsconfig.json` extending the project base config
4. Verify the package is recognized by the monorepo (npm workspace or equivalent)

**Commit:** `feat(canvas): scaffold @shoggoth/service-canvas plugin package`

---

## Phase 2: Port A2UI catalog packages with renamed scopes

For each of the four catalog packages:

1. Copy from the `openclaw-canvas-web` source (or create fresh)
2. Rename package from `@haliphax-openclaw/a2ui-*` to `@shoggoth/a2ui-*`
3. Update all internal imports referencing `@haliphax-openclaw/*` to `@shoggoth/*`
4. Update `catalog.json` metadata fields that reference `openclaw`
5. Verify each package typechecks independently

Packages to port:

- `packages/a2ui-sdk/` → `@shoggoth/a2ui-sdk`
- `packages/a2ui-catalog-basic/` → `@shoggoth/a2ui-catalog-basic`
- `packages/a2ui-catalog-extended/` → `@shoggoth/a2ui-catalog-extended`
- `packages/a2ui-catalog-all/` → `@shoggoth/a2ui-catalog-all`

**Commit:** `feat(canvas): port A2UI catalog packages with @shoggoth scope`

---

## Phase 3: Port server core (Express + WebSocket + services)

Port the server infrastructure, stripping OpenClaw-specific components:

1. Copy and adapt `src/server/index.ts`:
   - Remove `NodeClient` instantiation
   - Remove `agent-proxy` and `file-spawn` route registration
   - Remove `OPENCLAW_GATEWAY_WS_URL` / `OPENCLAW_GATEWAY_TOKEN` env var reads
   - Rename all `OPENCLAW_CANVAS_*` env vars to `SHOGGOTH_CANVAS_*`
   - Replace `openclaw.json` config reading with Shoggoth config (passed in at construction time)
   - Replace agent workspace map resolution to read from Shoggoth `agents.list`
2. Copy `src/server/services/` (all files unchanged except `node-client.ts` which is deleted)
3. Copy `src/server/shared/` (unchanged)
4. Copy `src/server/commands/` (unchanged — handlers are reused by plugin tools)
5. Copy `src/server/routes/` minus `agent-proxy.ts` and `file-spawn.ts`:
   - Keep: `canvas.ts`, `catalogs.ts`, `canvas-config.ts`, `scaffold.ts`
   - Delete: `agent-proxy.ts`, `file-spawn.ts`
6. Copy `src/client/` entirely unchanged (Vue SPA)
7. Copy `test/` — will be updated in Phase 7

**Commit:** `feat(canvas): port server core — Express, WS, services, routes`

---

## Phase 4: Write plugin entrypoint

Create `packages/service-canvas/src/plugin.ts`:

1. Import `Plugin` from `hooks-plugin` and `ShoggothHooks`, `DirectServiceTool` from `@shoggoth/plugins`
2. Export default factory function `createCanvasPlugin(): Plugin<ShoggothHooks>`
3. In `service.register` hook:
   - Start the Express + WebSocket server (from Phase 3)
   - Call `ctx.registerService()` with `id: "canvas"`, `expose: "both"`, `port`, `protocol: "http+ws"`
   - Call `ctx.registerTools()` with all 8 canvas tool definitions
4. In `health.register` hook: register probe checking `server.listening`
5. In `daemon.shutdown` hook: graceful shutdown (close watchers, gateway, server)
6. Each tool handler delegates to the same `Gateway` instance used by the WebSocket server — no HTTP dispatch

**Commit:** `feat(canvas): implement plugin entrypoint with service + tool registration`

---

## Phase 5: Port and rename documentation

For each doc file:

1. Copy from `openclaw-canvas-web/docs/` to `packages/service-canvas/docs/`
2. Replace all `openclaw` references with `shoggoth` (scope names, env vars, config paths)
3. Remove or rewrite sections that reference:
   - OpenClaw gateway node registration
   - Ed25519 device identity
   - MCP server
   - Agent proxy / file-spawn routes
   - `openclaw.json` config
4. Update architecture diagrams / descriptions to show Shoggoth plugin model
5. Update `README.md` with new env vars, removed features, and Shoggoth config setup

Docs to port:

- `README.md`
- `AGENTS.md`
- `docs/components.md`
- `docs/creating-catalog-packages.md`
- `docs/deep-linking.md`
- `docs/a2ui-reactive.md`
- `docs/jsonl-watcher.md`

**Commit:** `docs(canvas): port and rename all documentation to shoggoth conventions`

---

## Phase 6: Create tool reference doc

Create `docs/tools/canvas.md` in the main Shoggoth docs directory:

1. Follow the existing format from other tool docs in `docs/tools/`
2. Document all 8 canvas tools: `canvas.present`, `canvas.hide`, `canvas.navigate`, `canvas.eval`, `canvas.snapshot`, `canvas.a2ui.push`, `canvas.a2ui.pushJSONL`, `canvas.a2ui.reset`
3. Include parameter tables, example invocations, and notes on:
   - Session scoping (composite key: surfaceId + session)
   - A2UI catalog system
   - Snapshot limitations (same-origin only)
   - Deep link behavior

**Commit:** `docs(canvas): add tool reference doc for canvas tools`

---

## Phase 7: Adapt tests

1. Copy test files from `openclaw-canvas-web/test/`
2. Remove tests for deleted components:
   - `NodeClient` tests
   - `agent-proxy` tests
   - `file-spawn` tests
   - MCP server tests
3. Update tests for renamed env vars (`SHOGGOTH_CANVAS_*`)
4. Update tests that mock OpenClaw gateway to mock Shoggoth plugin context instead
5. Add new tests for:
   - Plugin `service.register` hook (service entry created, tools registered)
   - Plugin `health.register` hook (probe registered, reports pass/fail)
   - Plugin `daemon.shutdown` hook (server stops, resources released)
   - Each of the 8 direct tool handlers
6. Verify all tests pass with `vitest run`

**Commit:** `test(canvas): adapt tests for shoggoth plugin model`

---

## Phase 8: Integration verification

1. Add `{ "package": "@shoggoth/service-canvas" }` to the Shoggoth config's `plugins` array
2. Build the full monorepo
3. Start the daemon — verify:
   - Plugin loads without errors
   - Service appears in `ServiceRegistry` (check `/health` or logs)
   - All 8 tools appear in `ServiceToolRegistry`
   - Canvas SPA is accessible via the gateway proxy
   - WebSocket connections work through the gateway proxy
4. Run the full test suite — verify no regressions
5. Run typecheck across all affected packages

**Commit:** `feat(canvas): integrate plugin with daemon and verify end-to-end`

---

## Phase 9: Update main project docs

1. Update `docs/plugins.md` to mention the Canvas service as a reference `service` kind plugin
2. Update `docs/daemon.md` if the service registry or gateway sections need a Canvas example
3. Update the project `AGENTS.md` or `README.md` if Canvas is listed as a component

**Commit:** `docs: reference canvas service plugin in main project docs`
