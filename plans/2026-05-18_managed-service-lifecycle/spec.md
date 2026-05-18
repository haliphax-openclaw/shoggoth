# Specification

## Interfaces

### Service Declaration (config extension for managed processes)

```ts
/** Extension to ProcessDeclaration for managed web service processes. */
interface ServiceDeclaration {
  /** Port the service listens on. */
  port: number;
  /** Protocol spoken by the service. */
  protocol: "http" | "ws" | "http+ws";
  /** Base path prefix for routing (default "/"). */
  basePath?: string;
  /** Named capabilities this service provides (for discovery). */
  capabilities?: string[];
  /** How the service is exposed externally. */
  expose?: "gateway" | "direct" | "both";
  /** Manifest endpoint path (default "/manifest"). Required for tool registration. */
  manifestPath?: string;
  /** Bind address override (default "127.0.0.1"). */
  host?: string;
}
```

### Service Registry

```ts
interface ServiceEntry {
  /** Service ID (matches the process ID). */
  id: string;
  /** Human-readable label. */
  label?: string;
  /** How this service was loaded. */
  tier: "plugin" | "managed" | "external";
  /**
   * Resolved base URL (e.g. "http://127.0.0.1:3100").
   * Null for plugin services that don't bind a port.
   */
  url: string | null;
  /** WebSocket URL if protocol includes ws. */
  wsUrl?: string;
  /** Current health state. */
  healthy: boolean;
  /** Declared capabilities. */
  capabilities: string[];
  /** Exposure mode. */
  expose: "gateway" | "direct" | "both";
  /** Fetched manifest (null if fetch failed or not yet fetched). */
  manifest: ServiceManifest | null;
  /** Tools currently registered for this service. */
  registeredTools: string[];
}

class ServiceRegistry extends EventEmitter {
  /** Register a service. Throws if ID already exists. */
  register(entry: ServiceEntry): void;

  /** Deregister a service by ID. */
  deregister(id: string): void;

  /** Mark a service as unhealthy. Emits "health-changed". */
  markUnhealthy(id: string): void;

  /** Mark a service as healthy. Emits "health-changed". */
  markHealthy(id: string): void;

  /** Look up a service by ID. */
  get(id: string): ServiceEntry | undefined;

  /** Find services by capability. */
  findByCapability(capability: string): ServiceEntry[];

  /** List all registered services. */
  list(): ServiceEntry[];

  // Events: "registered", "deregistered", "health-changed"
}
```

### Service Tool Registry

```ts
/** A tool declared by a managed service in its manifest. */
interface ServiceToolDeclaration {
  /** Tool name as exposed to agents (e.g. "canvas.push"). */
  name: string;
  /** Human-readable description for the tool descriptor. */
  description: string;
  /** JSON Schema for the tool's parameters. */
  parameters: JSONSchema;
  /** HTTP method to use when dispatching to the service. */
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Path on the service to dispatch to (e.g. "/api/a2ui/push"). */
  path: string;
  /** How to map tool args to the request. Default: "body". */
  dispatch?: "body" | "query" | "path";
}

type RegisteredServiceTool =
  | { kind: "http"; serviceId: string; decl: ServiceToolDeclaration }
  | { kind: "direct"; serviceId: string; tool: DirectServiceTool };

interface ServiceToolRegistry {
  /**
   * Register tools from a service manifest (HTTP proxy dispatch).
   * Each tool in the manifest becomes an HTTP proxy handler.
   */
  registerServiceTools(serviceId: string, manifest: ServiceManifest): void;

  /**
   * Register tools with direct dispatch (plugin services).
   * Handler functions are called in-process.
   */
  registerDirectTools(serviceId: string, tools: DirectServiceTool[]): void;

  /** Deregister all tools for a service. */
  deregisterServiceTools(serviceId: string): void;

  /** Look up a registered service tool by name. */
  get(toolName: string): RegisteredServiceTool | undefined;

  /** List all registered service tools (for injection into agent catalogs). */
  listTools(): RegisteredServiceTool[];

  /** Invoke a tool by name. Routes to direct handler or HTTP proxy. */
  invokeTool(
    toolName: string,
    args: Record<string, unknown>,
    ctx: { agentId: string; sessionUrn: string },
  ): Promise<{ resultJson: string }>;
}
```

### Service Tool Dispatcher

```ts
/**
 * HTTP proxy dispatcher for managed/external service tools.
 * Builds and sends HTTP requests based on tool declarations.
 */
interface ServiceToolDispatcher {
  /**
   * Dispatch a tool call to a managed/external service via HTTP.
   * Resolves service URL from registry, mints placeholder auth token,
   * sends request, returns response body.
   */
  dispatch(
    serviceId: string,
    decl: ServiceToolDeclaration,
    args: Record<string, unknown>,
    ctx: { agentId: string; sessionUrn: string },
  ): Promise<{ resultJson: string }>;
}
```

### Manifest Fetcher

```ts
/** Returned by GET /manifest on a managed service. */
interface ServiceManifest {
  /** Service name. */
  name: string;
  /** Semantic version. */
  version: string;
  /** Tools this service provides to agents. */
  tools?: ServiceToolDeclaration[];
  /** Control plane operations this service requests access to. */
  ops?: string[];
  /** WebSocket endpoints (informational). */
  wsEndpoints?: ManifestWsEndpoint[];
}

interface ManifestWsEndpoint {
  path: string;
  description?: string;
  /** Message protocol (e.g. "jsonl", "json", "binary"). */
  protocol?: string;
}

interface ManifestFetcher {
  /**
   * Fetch and validate a service manifest.
   * Returns null on failure (logs warning).
   * On success, stores the manifest on the registry entry.
   */
  fetchAndStore(serviceId: string, manifestPath?: string): Promise<ServiceManifest | null>;
}
```

### Service Lifecycle Manager

```ts
interface ServiceLifecycleManagerOpts {
  registry: ServiceRegistry;
  manifestFetcher: ManifestFetcher;
  toolRegistry: ServiceToolRegistry;
}

class ServiceLifecycleManager {
  constructor(opts: ServiceLifecycleManagerOpts);

  /**
   * Called when a process starts. If the process declares a service,
   * registers it, fetches its manifest, and registers any tools.
   */
  onProcessStarted(processId: string, declaration: ProcessDeclaration): Promise<void>;

  /**
   * Called when a process stops or fails.
   * Deregisters tools and the service entry.
   */
  onProcessStopped(processId: string): Promise<void>;

  /**
   * Called when a process health status changes.
   * Unhealthy: deregister tools. Healthy: re-fetch manifest, re-register tools.
   */
  onProcessHealthChanged(processId: string, healthy: boolean): Promise<void>;

  /** Shutdown: deregister all managed services. */
  shutdown(): Promise<void>;
}
```

### Context Finalizer (Agent Integration)

```ts
/**
 * Session context finalizer that injects service tools into the agent's
 * tool catalog. Called during session context resolution.
 */
function serviceToolFinalizer(ctx: SessionMcpContext): SessionMcpContext;
```

## Data Structures / Schemas

### Config Schema (Zod — managed service extension to ProcessDeclaration)

```ts
const serviceDeclarationSchema = z
  .object({
    port: z.number().int().min(1).max(65535),
    protocol: z.enum(["http", "ws", "http+ws"]),
    basePath: z.string().optional().default("/"),
    capabilities: z.array(z.string().min(1)).optional(),
    expose: z.enum(["gateway", "direct", "both"]).optional().default("direct"),
    manifestPath: z.string().optional().default("/manifest"),
    host: z.string().optional().default("127.0.0.1"),
  })
  .strict();

// Added as optional field on processDeclarationSchema:
// service: serviceDeclarationSchema.optional()
```

### Service Manifest Response Schema

```ts
const serviceToolDeclarationSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)*$/), // dotted namespace
  description: z.string().min(1),
  parameters: z.record(z.unknown()), // JSON Schema object
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().min(1),
  dispatch: z.enum(["body", "query", "path"]).optional().default("body"),
});

const manifestWsEndpointSchema = z.object({
  path: z.string().min(1),
  description: z.string().optional(),
  protocol: z.string().optional(),
});

const serviceManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  tools: z.array(serviceToolDeclarationSchema).optional(),
  ops: z.array(z.string().min(1)).optional(),
  wsEndpoints: z.array(manifestWsEndpointSchema).optional(),
});
```

### Port Conflict Validation

```ts
/**
 * Validates that no two managed services declare the same port on the same host.
 * Called during config loading. Throws with a descriptive error on conflict.
 */
function validateServicePortConflicts(processes: ProcessDeclaration[]): void;
```

## Code Examples

### Declaring a managed service in config

```jsonc
{
  "processes": [
    {
      "id": "canvas-web",
      "label": "Canvas Web",
      "startPolicy": "boot",
      "command": "node",
      "args": ["dist/server/index.js"],
      "cwd": "/opt/canvas-web",
      "env": { "PORT": "3100" },
      "restartMode": "on-failure",
      "health": { "kind": "http", "target": "http://localhost:3100/health" },
      "service": {
        "port": 3100,
        "protocol": "http+ws",
        "basePath": "/",
        "capabilities": ["canvas", "a2ui"],
        "expose": "gateway",
      },
    },
  ],
}
```

### Service manifest response (served by the managed process)

```json
{
  "name": "canvas-web",
  "version": "1.0.0",
  "tools": [
    {
      "name": "canvas.push",
      "description": "Push an A2UI surface to the canvas for rendering",
      "parameters": {
        "type": "object",
        "properties": {
          "surface": { "type": "string", "description": "Surface ID" },
          "nodes": { "type": "array", "description": "A2UI node tree" }
        },
        "required": ["surface", "nodes"]
      },
      "method": "POST",
      "path": "/api/a2ui/push"
    }
  ],
  "wsEndpoints": [
    {
      "path": "/ws",
      "description": "Client WebSocket for live UI updates",
      "protocol": "json"
    }
  ]
}
```

### Tool dispatch flow (daemon internals)

```ts
// When agent calls "canvas.push { surface: "main", nodes: [...] }":

// 1. Look up registered tool
const registered = serviceToolRegistry.get("canvas.push");
if (!registered) throw new Error("unknown tool");

if (registered.kind === "http") {
  // Managed service — HTTP proxy
  const entry = serviceRegistry.get(registered.serviceId)!;
  if (!entry.healthy) throw new Error("service unhealthy");

  const response = await fetch(`${entry.url}${registered.decl.path}`, {
    method: registered.decl.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${placeholderToken}`,
    },
    body: JSON.stringify(args),
  });

  return { resultJson: await response.text() };
}
```

### Daemon wiring (procman event subscription)

```ts
// In daemon index.ts, after procman is initialized:

const serviceLifecycle = new ServiceLifecycleManager({
  registry: serviceRegistry,
  manifestFetcher,
  toolRegistry: serviceToolRegistry,
});

// Map process declarations by ID for lookup on events
const processDeclarations = new Map((config.processes ?? []).map((d) => [d.id, d]));

procman.on("process-started", (processId: string) => {
  const decl = processDeclarations.get(processId);
  if (decl) void serviceLifecycle.onProcessStarted(processId, decl);
});

procman.on("process-stopped", (processId: string) => {
  void serviceLifecycle.onProcessStopped(processId);
});

procman.on("process-failed", (processId: string) => {
  void serviceLifecycle.onProcessStopped(processId);
});

procman.on("health-changed", (processId: string, healthy: boolean) => {
  void serviceLifecycle.onProcessHealthChanged(processId, healthy);
});

rt.shutdown.registerDrain("service-lifecycle", () => serviceLifecycle.shutdown());
```
