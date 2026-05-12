# Specification

## Interfaces

### Plugin Service (in-process, hooks-based)

```ts
/**
 * Context provided to the `service.register` hook.
 * Plugin services use this to register themselves, their tools, and access daemon deps.
 */
interface ServiceRegisterCtx {
  /** Register this plugin as a service in the ServiceRegistry. */
  registerService(entry: PluginServiceEntry): void;

  /**
   * Register tools with direct handler functions (no HTTP dispatch).
   * Tools registered here are invoked in-process — no network hop, no auth tokens.
   */
  registerTools(tools: DirectServiceTool[]): void;

  /** Shared daemon dependencies (same as PlatformStartCtx.deps). */
  deps: ServiceDeps;

  /** Resolved config (after daemon.configure waterfall). */
  config: Readonly<ShoggothConfig>;
}

/** A service entry for plugin services (no URL, no manifest fetch). */
interface PluginServiceEntry {
  /** Unique service ID. */
  id: string;
  /** Human-readable label. */
  label?: string;
  /** Named capabilities this service provides (for discovery). */
  capabilities?: string[];
  /**
   * How the service is exposed externally.
   * Plugin services that don't bind a port should use "direct" (default).
   * Plugin services that also run an HTTP listener can use "gateway" or "both".
   */
  expose?: "gateway" | "direct" | "both";
  /** Optional port if the plugin also binds an HTTP listener. */
  port?: number;
  /** Optional protocol (default "http"). */
  protocol?: "http" | "ws" | "http+ws";
  /** Optional base path for gateway routing. */
  basePath?: string;
}

/**
 * A tool provided by a plugin service with a direct handler function.
 * No HTTP dispatch — the handler runs in-process.
 */
interface DirectServiceTool {
  /** Tool name as exposed to agents (e.g. "canvas.push"). */
  name: string;
  /** Human-readable description for the tool descriptor. */
  description: string;
  /** JSON Schema for the tool's parameters. */
  parameters: JSONSchema;
  /** Direct handler function invoked when an agent calls this tool. */
  handler(args: Record<string, unknown>, ctx: DirectToolContext): Promise<{ resultJson: string }>;
}

/** Context passed to a direct tool handler at invocation time. */
interface DirectToolContext {
  /** Agent ID that invoked the tool. */
  agentId: string;
  /** Session URN of the invoking session. */
  sessionUrn: string;
  /** Service entry from the registry. */
  serviceEntry: ServiceEntry;
}

/** Dependencies available to plugin services via ServiceRegisterCtx. */
interface ServiceDeps {
  /** Run a model turn on a session. */
  runSessionModelTurn: SubagentRuntimeExtension["runSessionModelTurn"];
  /** Service registry instance (for querying other services). */
  serviceRegistry: ServiceRegistry;
  /** Logger scoped to the service. */
  logger: Logger;
}
```

### Plugin Service package.json

```json
{
  "name": "@shoggoth/service-canvas",
  "version": "1.0.0",
  "shoggothPlugin": {
    "kind": "service",
    "entrypoint": "./src/plugin.ts"
  }
}
```

### Plugin Service Example

```ts
import type { Plugin } from "hooks-plugin";
import type { ShoggothHooks } from "@shoggoth/plugins";

export default function createCanvasServicePlugin(): Plugin<ShoggothHooks> {
  let server: HttpServer | undefined;

  return {
    name: "service-canvas",
    hooks: {
      // Self-configure: inject defaults if no user override exists
      "daemon.configure"(ctx) {
        const existing = ctx.config.services?.find((s) => s.id === "canvas");
        if (!existing) {
          ctx.config = {
            ...ctx.config,
            services: [
              ...(ctx.config.services ?? []),
              {
                id: "canvas",
                label: "Canvas",
                port: 3100,
                protocol: "http+ws",
                capabilities: ["canvas", "a2ui"],
                expose: "gateway",
              },
            ],
          };
        }
        return ctx;
      },

      // Register service and tools directly — no manifest fetch needed
      async "service.register"(ctx) {
        const serviceConfig = ctx.config.services?.find((s) => s.id === "canvas");
        const port = serviceConfig?.port ?? 3100;

        // Start HTTP listener (for WebSocket clients, static assets, etc.)
        server = await startCanvasServer(port);

        ctx.registerService({
          id: "canvas",
          label: "Canvas",
          capabilities: ["canvas", "a2ui"],
          expose: "gateway",
          port,
          protocol: "http+ws",
          basePath: "/",
        });

        ctx.registerTools([
          {
            name: "canvas.push",
            description: "Push an A2UI surface to the canvas for rendering",
            parameters: {
              type: "object",
              properties: {
                surface: { type: "string", description: "Surface ID" },
                nodes: { type: "array", description: "A2UI node tree" },
              },
              required: ["surface", "nodes"],
            },
            async handler(args, toolCtx) {
              // Direct in-process call — no HTTP, no token
              const result = await canvasEngine.push(
                args.surface as string,
                args.nodes as unknown[],
                { agent: toolCtx.agentId, session: toolCtx.sessionUrn },
              );
              return { resultJson: JSON.stringify(result) };
            },
          },
          {
            name: "canvas.show",
            description: "Navigate the canvas to a specific URL or file",
            parameters: {
              type: "object",
              properties: {
                url: { type: "string", description: "URL to display" },
              },
              required: ["url"],
            },
            async handler(args) {
              const result = await canvasEngine.show(args.url as string);
              return { resultJson: JSON.stringify(result) };
            },
          },
        ]);
      },

      "health.register"(ctx) {
        ctx.registerProbe({
          name: "canvas",
          check: async () => ({
            status: server?.listening ? "pass" : "fail",
          }),
        });
      },

      async "daemon.shutdown"() {
        await server?.close();
        server = undefined;
      },
    },
  };
}
```

### Service Declaration (config extension for managed services)

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

### External Service Declaration (top-level `services[]`)

```ts
/** Declaration for an external service not managed by procman. */
interface ExternalServiceDeclaration {
  /** Unique ID for this service. */
  id: string;
  /** Human-readable label. */
  label?: string;
  /** Host where the service is running. */
  host: string;
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
  /** Health check configuration. */
  health: ExternalServiceHealthCheck;
  /** Health check polling interval (ms). Default 30000. */
  healthIntervalMs?: number;
}

type ExternalServiceHealthCheck =
  | { kind: "tcp"; port?: number; timeoutMs?: number }
  | { kind: "http"; url: string; expectedStatus?: number; timeoutMs?: number };
```

### Service Manifest (served by managed/external services at their manifest endpoint)

```ts
/** Returned by GET /manifest on a Shoggoth-managed service. */
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

/** A tool declared by a managed/external service, registered dynamically with the daemon. */
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

interface ManifestWsEndpoint {
  path: string;
  description?: string;
  /** Message protocol (e.g. "jsonl", "json", "binary"). */
  protocol?: string;
}
```

### Service Registry

```ts
interface ServiceEntry {
  /** Service ID. */
  id: string;
  /** Human-readable label. */
  label?: string;
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
  /** Fetched manifest (null for plugin services or if fetch failed). */
  manifest: ServiceManifest | null;
  /** Tools currently registered for this service. */
  registeredTools: string[];
  /** Service tier — how this service was loaded. */
  tier: "plugin" | "managed" | "external";
}

class ServiceRegistry extends EventEmitter {
  /** Register a service (called by plugin hook, procman events, or health poller). */
  register(entry: ServiceEntry): void;

  /** Deregister a service (called on process stop/fail or plugin shutdown). */
  deregister(id: string): void;

  /** Mark a service as unhealthy; deregisters its tools. */
  markUnhealthy(id: string): void;

  /** Mark healthy and re-register tools from manifest (managed/external) or direct handlers (plugin). */
  markHealthy(id: string): void;

  /** Look up a service by ID. */
  get(id: string): ServiceEntry | undefined;

  /** Find services by capability. */
  findByCapability(capability: string): ServiceEntry[];

  /** List all registered services. */
  list(): ServiceEntry[];

  // Events: "registered", "deregistered", "health-changed", "tools-registered", "tools-deregistered"
}
```

### Tool Registry Extension

```ts
/**
 * Extended tool registry supporting two dispatch modes.
 */
interface ServiceToolRegistry {
  /**
   * Register a tool with HTTP proxy dispatch (managed/external services).
   * The dispatcher mints auth tokens and proxies HTTP requests.
   */
  registerHttpTool(serviceId: string, toolDecl: ServiceToolDeclaration): void;

  /**
   * Register a tool with direct dispatch (plugin services).
   * The handler function is called in-process with no network hop.
   */
  registerDirectTool(serviceId: string, tool: DirectServiceTool): void;

  /** Deregister all tools for a service. */
  deregisterServiceTools(serviceId: string): void;

  /** Look up a registered service tool by name. */
  get(toolName: string): RegisteredServiceTool | undefined;
}

type RegisteredServiceTool =
  | { kind: "http"; serviceId: string; decl: ServiceToolDeclaration }
  | { kind: "direct"; serviceId: string; tool: DirectServiceTool };
```

### Auth & Control Plane Access

```ts
interface ServiceTokenPayload {
  /** Agent ID (subject). */
  sub: string;
  /** Target service ID. */
  scope: string;
  /** Issued-at (unix seconds). */
  iat: number;
  /** Expiry (unix seconds). */
  exp: number;
  /** Originating session URN (optional). */
  session?: string;
}

interface ServiceRegistration {
  /** Service ID. */
  id: string;
  /** Age recipient / public key (provided to the service). */
  publicKey: AgeRecipient;
  /** Approved control plane operations. */
  approvedOps: string[];
  /** Whether the service has been approved by the operator. */
  approved: boolean;
}

interface ServiceKeyStore {
  /** Get the private key for signing tokens destined for a service. */
  getPrivateKey(serviceId: string): AgeIdentity | null;

  /** Generate and store a new key pair for a service. Returns the public key. */
  generateKeyPair(serviceId: string): AgeRecipient;

  /** Rotate a service's key pair. Returns the new public key. */
  rotateKey(serviceId: string): AgeRecipient;

  /** Check if a service has been approved (has a key pair). */
  isApproved(serviceId: string): boolean;

  /** Get the approved control plane operations for a service. */
  getApprovedOps(serviceId: string): string[];

  /** Set the approved operations (called during operator approval). */
  setApprovedOps(serviceId: string, ops: string[]): void;
}

interface TokenMinter {
  /** Mint a short-lived age-encrypted token for agent→service communication.
   *  Encrypts the payload to the service's recipient (public key). Only the service can decrypt it. */
  mint(agentId: string, serviceId: string, sessionUrn?: string): Promise<string>;
}

interface TokenValidator {
  /** Validate and decode a service token by decrypting with the service's identity (private key).
   *  Returns null if decryption fails or token is expired. */
  validate(token: string, identity: string): Promise<ServiceTokenPayload | null>;
}
```

### Service Tool Dispatcher

```ts
/**
 * Unified dispatcher that handles both direct and HTTP tool calls.
 */
interface ServiceToolDispatcher {
  /**
   * Dispatch a tool call. Routes to direct handler or HTTP proxy based on tool registration kind.
   */
  dispatch(
    toolName: string,
    args: Record<string, unknown>,
    ctx: { agentId: string; sessionUrn: string },
  ): Promise<{ resultJson: string }>;
}
```

### Gateway Configuration

```ts
interface GatewayConfig {
  /** Whether the gateway is enabled. */
  enabled: boolean;
  /** Port the gateway listens on. */
  port: number;
  /** Bind address (default "0.0.0.0"). */
  host?: string;
  /** Path prefix for service routes (default "/svc"). */
  prefix?: string;
  /** CORS configuration. */
  cors?: {
    origins: string[];
    credentials?: boolean;
  };
  /** Rate limiting. */
  rateLimit?: {
    windowMs: number;
    maxRequests: number;
  };
}
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

### Config Schema (Zod — external services, top-level `services[]`)

```ts
const externalServiceHealthSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tcp"),
    port: z.number().int().min(1).max(65535).optional(),
    timeoutMs: z.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal("http"),
    url: z.string().url(),
    expectedStatus: z.number().int().optional(),
    timeoutMs: z.number().int().positive().optional(),
  }),
]);

const externalServiceDeclarationSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    protocol: z.enum(["http", "ws", "http+ws"]),
    basePath: z.string().optional().default("/"),
    capabilities: z.array(z.string().min(1)).optional(),
    expose: z.enum(["gateway", "direct", "both"]).optional().default("direct"),
    manifestPath: z.string().optional().default("/manifest"),
    health: externalServiceHealthSchema,
    healthIntervalMs: z.number().int().positive().optional().default(30000),
  })
  .strict();

// Top-level config key: "services"
// services: z.array(externalServiceDeclarationSchema).optional()
```

### Config Schema (Zod — plugin service overrides in `services[]`)

```ts
// Plugin services inject their own defaults via daemon.configure.
// Users can override specific fields by adding a matching entry in services[].
// The schema is permissive — only `id` is required; all other fields are optional overrides.
const pluginServiceOverrideSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    protocol: z.enum(["http", "ws", "http+ws"]).optional(),
    basePath: z.string().optional(),
    capabilities: z.array(z.string().min(1)).optional(),
    expose: z.enum(["gateway", "direct", "both"]).optional(),
  })
  .strict();

// The top-level services[] array accepts both external declarations and plugin overrides.
// Discrimination: entries with a `health` field are external; entries without are plugin overrides.
```

### Plugin Kind Extension

```ts
// Extended shoggothPlugin.kind enum:
type PluginKind = "messaging-platform" | "observability" | "general" | "service";

// Service plugins must implement:
// - daemon.configure (waterfall) — inject default config
// - service.register (async) — register service entry and tools
// - health.register (sync) — register health probe
// - daemon.shutdown (async) — clean up resources
```

### Gateway Config Schema

```ts
const gatewayConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    port: z.number().int().min(1).max(65535).default(8800),
    host: z.string().default("0.0.0.0"),
    prefix: z.string().default("/svc"),
    cors: z
      .object({
        origins: z.array(z.string()),
        credentials: z.boolean().optional(),
      })
      .optional(),
    rateLimit: z
      .object({
        windowMs: z.number().int().positive(),
        maxRequests: z.number().int().positive(),
      })
      .optional(),
  })
  .strict()
  .optional();

// Top-level config key: "gateway"
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

const serviceManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  tools: z.array(serviceToolDeclarationSchema).optional(),
  ops: z.array(z.string().min(1)).optional(),
  wsEndpoints: z
    .array(
      z.object({
        path: z.string().min(1),
        description: z.string().optional(),
        protocol: z.string().optional(),
      }),
    )
    .optional(),
});
```

## Code Examples

### Plugin service (minimal)

```ts
import type { Plugin } from "hooks-plugin";
import type { ShoggothHooks } from "@shoggoth/plugins";

export default function createMyServicePlugin(): Plugin<ShoggothHooks> {
  return {
    name: "service-my-api",
    hooks: {
      "daemon.configure"(ctx) {
        if (!ctx.config.services?.find((s) => s.id === "my-api")) {
          ctx.config = {
            ...ctx.config,
            services: [
              ...(ctx.config.services ?? []),
              { id: "my-api", label: "My API", capabilities: ["my-api"] },
            ],
          };
        }
        return ctx;
      },

      async "service.register"(ctx) {
        ctx.registerService({
          id: "my-api",
          label: "My API",
          capabilities: ["my-api"],
        });

        ctx.registerTools([
          {
            name: "my_api.hello",
            description: "Returns a greeting",
            parameters: {
              type: "object",
              properties: { name: { type: "string" } },
              required: ["name"],
            },
            async handler(args) {
              return { resultJson: JSON.stringify({ greeting: `Hello, ${args.name}!` }) };
            },
          },
        ]);
      },

      "health.register"(ctx) {
        ctx.registerProbe({
          name: "my-api",
          check: async () => ({ status: "pass" }),
        });
      },

      async "daemon.shutdown"() {
        // nothing to clean up for this simple example
      },
    },
  };
}
```

### Declaring a managed service in config

```jsonc
{
  "gateway": {
    "enabled": true,
    "port": 8800,
    "cors": { "origins": ["http://localhost:*"] },
  },
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

### Service manifest response (served by managed/external Canvas Web)

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
    },
    {
      "name": "canvas.show",
      "description": "Navigate the canvas to a specific URL or file",
      "parameters": {
        "type": "object",
        "properties": {
          "url": { "type": "string", "description": "URL to display" }
        },
        "required": ["url"]
      },
      "method": "POST",
      "path": "/api/canvas/show"
    },
    {
      "name": "canvas.reset",
      "description": "Clear the current A2UI surface",
      "parameters": {
        "type": "object",
        "properties": {
          "surface": { "type": "string", "description": "Surface ID to clear" }
        },
        "required": ["surface"]
      },
      "method": "POST",
      "path": "/api/a2ui/reset"
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

### Agent using a service-provided tool

```
// These tools appear in the agent's tool list automatically when the service is healthy.
// The agent doesn't know (or care) whether it's a plugin, managed, or external service.

canvas.push { surface: "main", nodes: [{ type: "text", content: "Hello world" }] }
// → { ok: true, surface: "main", nodeCount: 1 }

canvas.show { url: "/dashboard.html" }
// → { ok: true }

canvas.reset { surface: "main" }
// → { ok: true }
```

### Service validating a Shoggoth token (managed/external service-side code)

```ts
import * as age from "age-encryption";
import { readFileSync } from "node:fs";

// Age identity (private key) provided once during operator-approved registration
const IDENTITY = readFileSync("./shoggoth-service.key", "utf8").trim();

async function validateToken(authHeader: string): Promise<ServiceTokenPayload | null> {
  const token = authHeader.replace("Bearer ", "");
  // Token is an age-encrypted payload — only this service can decrypt it
  const encrypted = Buffer.from(token, "base64url");
  const decrypter = new age.Decrypter();
  decrypter.addIdentity(IDENTITY);
  try {
    const decrypted = await decrypter.decrypt(encrypted);
    const payload: ServiceTokenPayload = JSON.parse(new TextDecoder().decode(decrypted));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null; // decryption failed — invalid or forged token
  }
}
```

### Tool dispatch flow (daemon internals — unified dispatcher)

```ts
// When agent calls "canvas.push { surface: "main", nodes: [...] }":

// 1. Look up registered tool
const registered = serviceToolRegistry.get("canvas.push");

if (registered.kind === "direct") {
  // Plugin service — direct function call, no network
  const result = await registered.tool.handler(args, {
    agentId: ctx.agentId,
    sessionUrn: ctx.sessionUrn,
    serviceEntry: serviceRegistry.get(registered.serviceId)!,
  });
  return result;
}

if (registered.kind === "http") {
  // Managed/external service — HTTP proxy with auth
  const entry = serviceRegistry.get(registered.serviceId)!;
  const token = await tokenMinter.mint(ctx.agentId, entry.id, ctx.sessionUrn);

  const response = await fetch(`${entry.url}${registered.decl.path}`, {
    method: registered.decl.method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

  return { resultJson: await response.text() };
}
```
