---
date: 2026-05-18
completed: never
---

# Managed Process Service Lifecycle

## Summary

Wire procman-managed processes that declare a `service` block into the service registry, enabling automatic service registration on process start, deregistration on stop/failure, manifest fetching for dynamic tool registration, and health-driven tool lifecycle management.

This is a subset of the broader web services plugin system (PR #49). It focuses exclusively on the **managed process** tier — processes declared in `processes[]` with a `service` block that procman manages.

## Motivation

The service registry, tool registry, manifest fetcher, and HTTP tool dispatcher exist as standalone modules (designed in PR #49), but the daemon doesn't actually bridge procman lifecycle events to them. A managed process that starts up with a `service` block today is just a regular process — its service port, capabilities, and tools are invisible to agents.

This feature closes that gap: when procman starts a service-bearing process and it becomes healthy, the daemon registers it, fetches its manifest, and exposes its tools to agents. When the process stops or fails, tools are removed and the service is deregistered.

## Scope

### In scope

1. **Config schema extension** — Add optional `service` field to `processDeclarationSchema` (port, protocol, basePath, capabilities, expose, manifestPath, host)
2. **ServiceLifecycleManager** — Class that bridges procman events to the service registry and tool registry
3. **Procman event wiring** — Subscribe to `process-started`, `process-stopped`, `process-failed`, `health-changed` events in the daemon entrypoint
4. **Manifest fetching** — On service registration (process healthy), fetch `GET {serviceUrl}{manifestPath}` and register declared tools as HTTP proxy handlers
5. **Health-driven tool lifecycle** — When a service becomes unhealthy, deregister its tools; when it recovers, re-fetch manifest and re-register tools
6. **Config validation** — Detect port conflicts between managed services at config load time
7. **ServiceToolDispatcher wiring** — Connect the HTTP dispatch path so managed service tools actually proxy requests (with auth token injection placeholder)

### Out of scope (separate features)

- External service health polling and registration (separate tier)
- Plugin service registration (already works via hooks)
- Auth CLI commands (register, approve, rotate-key, etc.)
- Gateway auth enforcement
- Scoped control plane access for services
- Service demo plugin

## Design

### Procman Event Flow

```
procman emits "process-started" (processId, declaration)
  → ServiceLifecycleManager.onProcessStarted()
    → if declaration.service exists:
      → build ServiceEntry (tier: "managed", url from host:port)
      → registry.register(entry)
      → manifestFetcher.fetch(serviceUrl + manifestPath)
      → if manifest has tools: toolRegistry.registerServiceTools(id, manifest)

procman emits "process-stopped" or "process-failed" (processId)
  → ServiceLifecycleManager.onProcessStopped()
    → toolRegistry.deregisterServiceTools(id)
    → registry.deregister(id)

procman emits "health-changed" (processId, healthy)
  → ServiceLifecycleManager.onProcessHealthChanged()
    → if unhealthy: registry.markUnhealthy(id), toolRegistry.deregisterServiceTools(id)
    → if healthy: registry.markHealthy(id), re-fetch manifest, re-register tools
```

### Tool Dispatch (HTTP Proxy)

When an agent calls a tool registered from a managed service manifest:

1. Look up the tool in `ServiceToolRegistry` → get `{ kind: "http", serviceId, decl }`
2. Resolve service URL from `ServiceRegistry.get(serviceId).url`
3. Build HTTP request: `decl.method` to `${url}${decl.path}` with args as JSON body
4. Inject `Authorization: Bearer <token>` header (placeholder — full auth is a separate feature)
5. Return response body as `resultJson`

### Integration Points

- **`@shoggoth/shared` schema** — `processDeclarationSchema` gains optional `service` field
- **Daemon entrypoint** — Instantiates `ServiceLifecycleManager`, subscribes to procman events
- **Session tool executor** — Routes service tool calls through `ServiceToolRegistry.invokeTool()`
- **Session context finalizer** — Injects service tools into agent tool catalogs

## Testing Strategy

- Unit tests for `ServiceRegistry` (register, deregister, health transitions, lookup)
- Unit tests for `ServiceToolRegistry` (both dispatch modes, deregistration)
- Unit tests for `ServiceToolDispatcher` (HTTP proxy with mocked fetch)
- Unit tests for `ManifestFetcher` (success, failure, invalid manifest)
- Unit tests for `ServiceLifecycleManager` (event handling, manifest fetch, tool lifecycle)
- Unit tests for config schema validation (valid service blocks, port conflicts)
- Integration test for full lifecycle: procman start → register → manifest → tools → stop → cleanup

## Considerations

- **Port conflicts** — Services declare their ports in config. The registry should detect conflicts at config validation time, not at runtime.
- **Manifest fetch timing** — The service may not be ready to serve its manifest immediately on process start. The lifecycle manager should wait for the health check to pass before fetching.
- **Manifest fetch failures** — If the manifest endpoint is unreachable or returns invalid data, the service is still registered (healthy) but has no tools. A warning is logged.
- **Tool name collisions** — If two services declare tools with the same name, the second registration should fail with a clear error. Builtin tools take precedence.
- **Hot reload** — If a service's config changes (port, basePath), the lifecycle manager should deregister and re-register. Ties into existing config hot-reload.
- **Auth placeholder** — The HTTP dispatcher injects a placeholder token header. Full age-encrypted auth is a separate feature; services that don't validate auth will work immediately.

## References

- [`spec.md`](spec.md) — type signatures, interfaces, and code examples
- [`implementation.md`](implementation.md) — phased implementation steps
- [PR #49: Web Services Plugin System](https://github.com/haliphax-ai/shoggoth/pull/49) — original design docs
- [Procman plan](plans/done/2026-03-31_process-manager/README.md) — existing process manager design
