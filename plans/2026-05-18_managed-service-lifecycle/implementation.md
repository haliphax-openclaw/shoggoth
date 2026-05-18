# Implementation

## Phase 1: Config Schema

Extend the shared config schema to support the `service` block on process declarations and validate port conflicts.

- Add `serviceDeclarationSchema` to `@shoggoth/shared`
- Add optional `service` field to `processDeclarationSchema`
- Add `serviceManifestSchema` and `serviceToolDeclarationSchema` (needed by manifest fetcher)
- Add `validateServicePortConflicts()` utility called during config loading
- Export new types: `ServiceDeclaration`, `ServiceManifest`, `ServiceToolDeclaration`
- Unit tests for schema validation (valid, invalid, port conflicts)

**Files:**

- `packages/shared/src/schema.ts` — add schemas, extend `processDeclarationSchema`
- `packages/shared/src/index.ts` — export new types/schemas
- `packages/daemon/test/service-schema.test.ts` — unit tests

## Phase 2: Service Registry & Tool Registry

Build the core runtime data structures that track services and their tools.

- Implement `ServiceRegistry` class extending `EventEmitter`
  - `register(entry)` — throws on duplicate ID
  - `deregister(id)` — emits "deregistered"
  - `markHealthy(id)` / `markUnhealthy(id)` — emits "health-changed"
  - `get(id)` / `findByCapability(cap)` / `list()`
- Implement `ServiceToolRegistry` class
  - `registerServiceTools(serviceId, manifest)` — registers HTTP proxy tools from manifest
  - `registerDirectTools(serviceId, tools)` — registers in-process handlers (for plugin tier compatibility)
  - `deregisterServiceTools(serviceId)` — removes all tools for a service
  - `get(toolName)` — returns `RegisteredServiceTool | undefined`
  - `listTools()` — returns all registered tools (for context finalizer)
  - `invokeTool(name, args, ctx)` — routes to direct handler or HTTP dispatcher
- Implement `ServiceToolDispatcher` class
  - `dispatch(serviceId, decl, args, ctx)` — builds HTTP request, sends to service URL, returns response
  - Placeholder auth: injects `Authorization: Bearer shoggoth-placeholder` header
  - Handles non-2xx responses gracefully (returns error JSON)
- Unit tests for all three classes

**Files:**

- `packages/daemon/src/service-registry.ts` — `ServiceRegistry` class
- `packages/daemon/src/service-tool-registry.ts` — `ServiceToolRegistry` class
- `packages/daemon/src/service-tool-dispatcher.ts` — `ServiceToolDispatcher` class
- `packages/daemon/test/service-registry.test.ts` — unit tests
- `packages/daemon/test/service-tool-registry.test.ts` — unit tests
- `packages/daemon/test/service-tool-dispatcher.test.ts` — unit tests

## Phase 3: Manifest Fetcher

Fetch and validate service manifests from running managed processes.

- Implement `ManifestFetcher` class
  - `fetchAndStore(serviceId, manifestPath?)` — fetches `GET {serviceUrl}{manifestPath}`
  - Validates response against `serviceManifestSchema`
  - On success: stores manifest on the registry entry, returns it
  - On failure: logs warning, returns null (service remains registered but toolless)
- Configurable timeout (default 5s) for manifest fetch
- Retry logic: single retry with 1s delay on network error (service may still be starting)
- Unit tests with mocked HTTP responses (success, 404, invalid JSON, timeout, network error)

**Files:**

- `packages/daemon/src/manifest-fetcher.ts` — `ManifestFetcher` class
- `packages/daemon/test/manifest-fetcher.test.ts` — unit tests

## Phase 4: ServiceLifecycleManager & Daemon Wiring

Bridge procman lifecycle events to the service registry and tool registry. Wire everything together in the daemon entrypoint.

- Implement `ServiceLifecycleManager` class
  - Constructor takes `{ registry, manifestFetcher, toolRegistry }`
  - `onProcessStarted(processId, declaration)`:
    - Skip if no `declaration.service`
    - Build `ServiceEntry` with tier "managed", URL from host:port
    - `registry.register(entry)`
    - `manifestFetcher.fetchAndStore(processId, manifestPath)`
    - If manifest has tools: `toolRegistry.registerServiceTools(processId, manifest)`
  - `onProcessStopped(processId)`:
    - `toolRegistry.deregisterServiceTools(processId)`
    - `registry.deregister(processId)`
  - `onProcessHealthChanged(processId, healthy)`:
    - If unhealthy: `registry.markUnhealthy(id)`, `toolRegistry.deregisterServiceTools(id)`
    - If healthy: `registry.markHealthy(id)`, re-fetch manifest, re-register tools
  - `shutdown()`: deregister all tracked services
- Wire into daemon `index.ts`:
  - Instantiate `ManifestFetcher`, `ServiceToolDispatcher`, `ServiceToolRegistry`, `ServiceLifecycleManager`
  - Subscribe to procman events: `process-started`, `process-stopped`, `process-failed`, `health-changed`
  - Map process declarations by ID for lookup
  - Register shutdown drain
- Unit tests for `ServiceLifecycleManager` with mocked dependencies

**Files:**

- `packages/daemon/src/service-lifecycle.ts` — `ServiceLifecycleManager` class + factory helpers
- `packages/daemon/src/index.ts` — wire lifecycle manager to procman events
- `packages/daemon/test/service-lifecycle.test.ts` — unit tests

## Phase 5: Agent Integration

Make service tools visible to agents and route tool calls through the service tool registry.

- Implement `serviceToolFinalizer` context finalizer
  - Reads all tools from `ServiceToolRegistry.listTools()`
  - Converts each to a tool descriptor (name, description, parameters schema)
  - Appends to the session's aggregated tool list
  - Registered via `registerContextFinalizer()` in daemon entrypoint
- Create `service-tool-registry-ref.ts` singleton ref
  - Allows the finalizer and tool executor to access the registry without circular imports
- Extend session tool executor (`session-agent-turn.ts`)
  - After checking builtin tools and MCP tools, check `serviceToolRegistryRef.current`
  - If tool is found there, invoke via `serviceToolRegistry.invokeTool()`
  - Return result to agent
- End-to-end integration test:
  - Start a mock HTTP server (simulating a managed service)
  - Configure a process declaration with a `service` block
  - Simulate procman "process-started" event
  - Verify tools appear in agent context
  - Call a tool, verify HTTP request reaches mock server
  - Simulate "process-stopped", verify tools removed

**Files:**

- `packages/daemon/src/sessions/service-tool-finalizer.ts` — context finalizer
- `packages/daemon/src/sessions/service-tool-registry-ref.ts` — singleton ref
- `packages/daemon/src/sessions/session-agent-turn.ts` — extend tool executor routing
- `packages/daemon/src/sessions/session-mcp-runtime.ts` — register finalizer
- `packages/daemon/src/index.ts` — set singleton ref, register finalizer
- `packages/daemon/test/service-integration.test.ts` — end-to-end test
