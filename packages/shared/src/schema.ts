import { z } from "zod";
import { LAYOUT } from "./paths";

// ---------------------------------------------------------------------------
// Context Levels
// ---------------------------------------------------------------------------

export const CONTEXT_LEVELS = ["none", "minimal", "light", "full"] as const;

export const contextLevelSchema = z.enum(CONTEXT_LEVELS);

export type ContextLevel = z.infer<typeof contextLevelSchema>;

export const THINKING_DISPLAY_MODES = ["full", "indicator", "none"] as const;

export const thinkingDisplaySchema = z.enum(THINKING_DISPLAY_MODES);

export type ThinkingDisplay = z.infer<typeof thinkingDisplaySchema>;

export const contextLevelToolOverrideSchema = z
  .object({
    allow: z.array(z.string().min(1)).optional(),
    exclude: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type ContextLevelToolOverride = z.infer<typeof contextLevelToolOverrideSchema>;

export const contextLevelToolsConfigSchema = z
  .object({
    none: contextLevelToolOverrideSchema.optional(),
    minimal: contextLevelToolOverrideSchema.optional(),
    light: contextLevelToolOverrideSchema.optional(),
    full: contextLevelToolOverrideSchema.optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Model Resolution & Provider Failover - Phase 1 Schema
// ---------------------------------------------------------------------------

/** Model definition within a provider's models array. */
export const providerModelSchema = z.object({
  name: z.string().min(1),
  contextWindowTokens: z.number().int().positive().optional(),
  thinkingFormat: z.enum(["native", "xml-tags", "none"]).optional(),
});

export type ProviderModel = z.infer<typeof providerModelSchema>;

/** Unified provider schema with models array and retry/failure config. */
export const providerSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["openai-compatible", "anthropic-messages", "gemini"]),
  baseUrl: z.string().url().optional(),
  apiKeyEnv: z.string().optional(),
  apiKey: z.string().optional(),
  apiVersion: z.string().optional(),
  models: z.array(providerModelSchema).optional(),
  // Retry/failure config (per-provider, overrides global)
  maxRetries: z.number().int().min(0).optional(),
  retryDelayMs: z.number().int().min(0).optional(),
  retryBackoffMultiplier: z.number().positive().optional(),
  markFailedDurationMs: z.number().int().positive().optional(),
});

export type Provider = z.infer<typeof providerSchema>;

/** Simplified failover chain entry - either a string ref "providerId/model" or object with ref. */
export const failoverChainEntrySchema = z.union([
  z.string().min(1), // "providerId/model"
  z.object({ ref: z.string().min(1) }),
]);

export type FailoverChainEntry = z.infer<typeof failoverChainEntrySchema>;

/** Global retry/failure configuration for model resolution. */
export const modelsRetrySchema = z.object({
  maxRetries: z.number().int().min(0).optional(), // default 2
  retryDelayMs: z.number().int().min(0).optional(), // default 1000
  retryBackoffMultiplier: z.number().positive().optional(), // default 2
  markFailedDurationMs: z.number().int().positive().optional(), // default 60000
});

export type ModelsRetry = z.infer<typeof modelsRetrySchema>;

// ---------------------------------------------------------------------------
// End Model Resolution & Provider Failover - Phase 1 Schema
// ---------------------------------------------------------------------------

const shoggothModelThinkingSchema = z
  .object({
    enabled: z.boolean(),
    budgetTokens: z.number().int().positive().optional(),
  })
  .strict();

const shoggothModelDefaultInvocationSchema = z
  .object({
    maxOutputTokens: z.number().int().positive().optional(),
    temperature: z.number().optional(),
    thinking: shoggothModelThinkingSchema.optional(),
    reasoningEffort: z.string().min(1).optional(),
    requestExtras: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/** Legacy failover hop schema - kept for backward compatibility */
export const shoggothModelFailoverHopSchema = z
  .object({
    providerId: z.string().min(1),
    model: z.string().min(1),
    contextWindowTokens: z.number().int().positive().optional(),
    thinkingFormat: z.enum(["native", "xml-tags", "none"]).optional(),
    capabilities: z.object({
      imageInput: z.boolean().optional(),
      thinkingFormat: z.enum(["native", "xml-tags", "none"]).optional(),
    }).strict().optional(),
  })
  .strict();

export type ShoggothModelFailoverHop = z.infer<typeof shoggothModelFailoverHopSchema>;

export const shoggothModelsCompactionSchema = z
  .object({
    maxContextChars: z.number().int().positive(),
    preserveRecentMessages: z.number().int().nonnegative(),
    summaryMaxOutputTokens: z.number().int().positive().optional(),
    contextWindowReserveTokens: z.number().int().positive().optional(),
    compactionAbortTimeoutMs: z.number().int().positive().optional(),
  })
  .strict();

export type ShoggothModelsCompaction = z.infer<typeof shoggothModelsCompactionSchema>;

const shoggothModelsCompactionPartialSchema = shoggothModelsCompactionSchema.partial();

/** Per-agent model stack / invocation / compaction overrides (merged with global `models`). */
export const shoggothAgentModelsOverrideSchema = z
  .object({
    /** New format: array of "providerId/model" string refs or {ref: "providerId/model"} objects. */
    failoverChain: z.array(failoverChainEntrySchema).min(1).optional(),
    /** Legacy format: array of failover hop objects (for backward compatibility). */
    failoverChainLegacy: z.array(shoggothModelFailoverHopSchema).min(1).optional(),
    primary: shoggothModelFailoverHopSchema.optional(),
    defaultInvocation: shoggothModelDefaultInvocationSchema.optional(),
    compaction: shoggothModelsCompactionPartialSchema.optional(),
  })
  .strict()
  .refine((v) => !(v.primary != null && v.failoverChain != null && v.failoverChain.length > 0), {
    message: "agent models: set only one of primary or failoverChain",
  });

export type ShoggothAgentModelsOverride = z.infer<typeof shoggothAgentModelsOverrideSchema>;

export const shoggothModelsConfigSchema = z
  .object({
    /** Array of providers with model definitions. */
    providers: z.array(providerSchema).optional(),
    /** Failover chain - array of "providerId/model" string refs or {ref: "providerId/model"} objects. */
    failoverChain: z.array(failoverChainEntrySchema).optional(),
    /** Legacy failover chain format (for backward compatibility). */
    failoverChainLegacy: z.array(shoggothModelFailoverHopSchema).optional(),
    /** Global retry/failure configuration for model resolution. */
    modelsRetry: modelsRetrySchema.optional(),
    /** Default model call parameters; per-session `model_selection` JSON overrides by field. */
    defaultInvocation: shoggothModelDefaultInvocationSchema.optional(),
    compaction: shoggothModelsCompactionSchema.optional(),
  })
  .strict();

export type ShoggothModelsConfig = z.infer<typeof shoggothModelsConfigSchema>;

// ---------------------------------------------------------------------------
// Retention Config
// ---------------------------------------------------------------------------

export const shoggothRetentionConfigSchema = z
  .object({
    inboundMediaMaxAgeDays: z.number().int().positive().optional(),
    inboundMediaMaxTotalBytes: z.number().int().positive().optional(),
    transcriptMessageMaxAgeDays: z.number().int().positive().optional(),
    transcriptMaxMessagesPerSession: z.number().int().positive().optional(),
    kvMaxEntries: z.number().int().positive().optional(),
  })
  .strict();

export type ShoggothRetentionConfig = z.infer<typeof shoggothRetentionConfigSchema>;

// ---------------------------------------------------------------------------
// Reactions Config
// ---------------------------------------------------------------------------

const shoggothReactionsConfigSchema = z.object({
  globalPassthrough: z.array(z.string().min(1)).optional(),
  maxAgeMinutes: z.number().int().positive().optional(),
}).strict();
type ShoggothReactionsConfig = z.infer<typeof shoggothReactionsConfigSchema>;

// ---------------------------------------------------------------------------
// HITL Config
// ---------------------------------------------------------------------------

export const hitlRiskTierSchema = z.enum(["safe", "caution", "critical", "never"]);

export type HitlRiskTier = z.infer<typeof hitlRiskTierSchema>;

export const shoggothHitlConfigSchema = z
  .object({
    defaultApprovalTimeoutMs: z.number().int().positive(),
    toolRisk: z.record(z.string(), hitlRiskTierSchema),
    bypassUpTo: hitlRiskTierSchema,
  })
  .strict();

export type ShoggothHitlConfig = z.infer<typeof shoggothHitlConfigSchema>;

// ---------------------------------------------------------------------------
// Memory Config
// ---------------------------------------------------------------------------

export const shoggothMemoryEmbeddingsConfigSchema = z
  .object({
    enabled: z.boolean(),
    modelId: z.string().min(1).optional(),
    openaiBaseUrl: z.string().min(1).optional(),
    apiKey: z.string().min(1).optional(),
    apiKeyEnv: z.string().min(1).optional(),
  })
  .strict();

export type ShoggothMemoryEmbeddingsConfig = z.infer<typeof shoggothMemoryEmbeddingsConfigSchema>;

export const shoggothMemoryConfigSchema = z
  .object({
    paths: z.array(z.string().min(1)),
    embeddings: shoggothMemoryEmbeddingsConfigSchema,
  })
  .strict();

export type ShoggothMemoryConfig = z.infer<typeof shoggothMemoryConfigSchema>;

// ---------------------------------------------------------------------------
// Tool Rules
// ---------------------------------------------------------------------------

export const shoggothToolRulesSchema = z
  .object({
    allow: z.array(z.string()),
    deny: z.array(z.string()),
    review: z.array(z.string()).default([]),
  })
  .strict();

export type ShoggothToolRules = z.infer<typeof shoggothToolRulesSchema>;

// ---------------------------------------------------------------------------
// Policy Config
// ---------------------------------------------------------------------------

export const shoggothPolicyConfigSchema = z
  .object({
    operator: z
      .object({
        controlOps: shoggothToolRulesSchema,
        tools: shoggothToolRulesSchema,
      })
      .strict(),
    agent: z
      .object({
        controlOps: shoggothToolRulesSchema,
        tools: shoggothToolRulesSchema,
      })
      .strict(),
    auditRedaction: z
      .object({
        jsonPaths: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

export type ShoggothPolicyConfig = z.infer<typeof shoggothPolicyConfigSchema>;

export const shoggothPolicyFragmentSchema = z
  .object({
    operator: z
      .object({
        controlOps: shoggothToolRulesSchema.partial().optional(),
        tools: shoggothToolRulesSchema.partial().optional(),
      })
      .strict()
      .optional(),
    agent: z
      .object({
        controlOps: shoggothToolRulesSchema.partial().optional(),
        tools: shoggothToolRulesSchema.partial().optional(),
      })
      .strict()
      .optional(),
    auditRedaction: z
      .object({
        jsonPaths: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .optional();

export type ShoggothPolicyFragment = z.infer<typeof shoggothPolicyFragmentSchema>;

export const DEFAULT_POLICY_CONFIG: ShoggothPolicyConfig = {
  operator: {
    controlOps: {
      allow: ["*"],
      deny: [],
      review: [],
    },
    tools: { allow: ["*"], deny: [], review: [] },
  },
  agent: {
    controlOps: {
      allow: [
        "agent_ping",
        "acpx_bind_get",
        "subagent_spawn",
        "subagent_result",
        "subagent_wait",
        "session_compact",
        "session_context_status",
        "session_inspect",
        "session_list",
        "session_stats",
        "session_send",
        "session_steer",
        "session_abort",
        "session_kill",
        "config_request",
        "config_show",
      ],
      deny: [],
      review: [],
    },
    tools: { allow: ["*"], deny: [], review: [] },
  },
  auditRedaction: {
    jsonPaths: ["password", "token", "apiKey", "api_key", "authorization", "secret"],
  },
};

export const DEFAULT_MEMORY_CONFIG: ShoggothMemoryConfig = {
  paths: [],
  embeddings: { enabled: false },
};

/** Default tool call timeout: 10 minutes. */
export const DEFAULT_TOOL_CALL_TIMEOUT_MS = 600_000;

// ---------------------------------------------------------------------------
// Plugin Entry
// ---------------------------------------------------------------------------

export const shoggothPluginEntrySchema = z
  .object({
    id: z.string().min(1).optional(),
    path: z.string().min(1).optional(),
    package: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const n = Number(Boolean(p.path)) + Number(Boolean(p.package));
    if (n !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "each plugin entry must specify exactly one of path or package",
      });
    }
  });

export type ShoggothPluginEntry = z.infer<typeof shoggothPluginEntrySchema>;

// ---------------------------------------------------------------------------
// Skills Config
// ---------------------------------------------------------------------------

export const shoggothSkillsConfigSchema = z
  .object({
    scanRoots: z.array(z.string().min(1)),
    disabledIds: z.array(z.string().min(1)),
  })
  .strict();

export type ShoggothSkillsConfig = z.infer<typeof shoggothSkillsConfigSchema>;

// ---------------------------------------------------------------------------
// MCP Config
// ---------------------------------------------------------------------------

const mcpSourceIdSchema = z
  .string()
  .min(1)
  .refine((s) => !s.includes("."), { message: "MCP server id must not contain '.' (used as source id)" });

export const shoggothMcpServerPoolScopeSchema = z.enum(["inherit", "global", "per_session"]);

export type ShoggothMcpServerPoolScope = z.infer<typeof shoggothMcpServerPoolScopeSchema>;

export const shoggothMcpStdioServerSchema = z
  .object({
    id: mcpSourceIdSchema,
    transport: z.literal("stdio"),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    cwd: z.string().min(1).optional(),
    env: z.record(z.string()).optional(),
    poolScope: shoggothMcpServerPoolScopeSchema.optional(),
  })
  .strict();

export const shoggothMcpTcpServerSchema = z
  .object({
    id: mcpSourceIdSchema,
    transport: z.literal("tcp"),
    host: z.string().min(1),
    port: z.number().int().positive(),
    poolScope: shoggothMcpServerPoolScopeSchema.optional(),
  })
  .strict();

export const shoggothMcpHttpServerSchema = z
  .object({
    id: mcpSourceIdSchema,
    transport: z.literal("http"),
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
    poolScope: shoggothMcpServerPoolScopeSchema.optional(),
  })
  .strict();

export const shoggothMcpServerEntrySchema = z.discriminatedUnion("transport", [
  shoggothMcpStdioServerSchema,
  shoggothMcpTcpServerSchema,
  shoggothMcpHttpServerSchema,
]);

export type ShoggothMcpServerEntry = z.infer<typeof shoggothMcpServerEntrySchema>;

export type ShoggothMcpHttpServerEntry = z.infer<typeof shoggothMcpHttpServerSchema>;

export const SHOGGOTH_DEFAULT_PER_SESSION_MCP_IDLE_MS = 30 * 60 * 1000;

export const shoggothMcpConfigSchema = z
  .object({
    servers: z.array(shoggothMcpServerEntrySchema),
    poolScope: z.enum(["global", "per_session"]).default("global"),
    perSessionIdleTimeoutMs: z.number().int().nonnegative().optional(),
  })
  .strict();

export type ShoggothMcpConfig = z.infer<typeof shoggothMcpConfigSchema>;

// ---------------------------------------------------------------------------
// ACPX Config
// ---------------------------------------------------------------------------

const shoggothAcpxConfigSchema = z
  .object({
    binary: z.string().min(1).optional(),
    defaultArgs: z.array(z.string()).optional(),
  })
  .strict();

type ShoggothAcpxConfig = z.infer<typeof shoggothAcpxConfigSchema>;

// ---------------------------------------------------------------------------
// Platform Common Config
// ---------------------------------------------------------------------------

export const platformCommonConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    routes: z.unknown().optional(),
    streamResponses: z.boolean().optional(),
    streamMinIntervalMs: z.number().optional(),
    appendModelTagFooter: z.boolean().optional(),
    hitlReplyInSession: z.boolean().optional(),
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Runtime Config
// ---------------------------------------------------------------------------

export const shoggothRuntimeConfigSchema = z
  .object({
    agentId: z
      .string()
      .min(1)
      .refine((s) => !s.includes(":"), "must not contain ':'")
      .optional(),
    drainTimeoutMs: z.number().int().positive().optional(),
    bootStaleClaimMs: z.number().int().nonnegative().optional(),
    heartbeatIntervalMs: z.number().int().positive().optional(),
    cronTickIntervalMs: z.number().int().positive().optional(),
    heartbeatBatchSize: z.number().int().positive().optional(),
    heartbeatConcurrency: z.number().int().positive().optional(),
    retentionScheduleIntervalMs: z.number().int().nonnegative().optional(),
    configHotReload: z.boolean().optional(),
    mcpLogServerMessages: z.boolean().optional(),
    openaiBaseUrl: z.string().min(1).optional(),
    ollamaHost: z.string().min(1).optional(),
    suppressContextWindowMismatchNotice: z.boolean().optional(),
    minimalContext: z.object({
      transcriptTailMessages: z.number().int().nonnegative().optional(),
    }).strict().optional(),
    turnQueue: z
      .object({
        starvationThreshold: z.number().int().positive().optional(),
        maxDepth: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    toolCallTimeoutMs: z.number().int().positive().optional(),
    modelResilience: z
      .object({
        maxRetries: z.number().int().nonnegative().optional(),
        baseDelayMs: z.number().int().positive().optional(),
        maxDelayMs: z.number().int().positive().optional(),
        jitterMs: z.number().int().nonnegative().optional(),
        defaultConcurrency: z.number().int().positive().optional(),
        providers: z
          .record(
            z.string(),
            z
              .object({
                maxRetries: z.number().int().nonnegative().optional(),
                baseDelayMs: z.number().int().positive().optional(),
                maxDelayMs: z.number().int().positive().optional(),
                jitterMs: z.number().int().nonnegative().optional(),
                concurrency: z.number().int().positive().optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ShoggothRuntimeConfig = z.infer<typeof shoggothRuntimeConfigSchema>;

// ---------------------------------------------------------------------------
// Agent to Agent Config
// ---------------------------------------------------------------------------

export const shoggothAgentToAgentAllowSchema = z
  .object({
    allow: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const shoggothAgentToAgentConfigSchema = z
  .object({
    allow: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type ShoggothAgentToAgentConfig = z.infer<typeof shoggothAgentToAgentConfigSchema>;

// ---------------------------------------------------------------------------
// Session Query Config
// ---------------------------------------------------------------------------

export const shoggothSessionQueryAllowSchema = z
  .object({
    allowedAgentIds: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const shoggothSessionQueryConfigSchema = z
  .object({
    allowedAgentIds: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type ShoggothSessionQueryConfig = z.infer<typeof shoggothSessionQueryConfigSchema>;

// ---------------------------------------------------------------------------
// Subagent Spawn Allow Config
// ---------------------------------------------------------------------------

export const shoggothSubagentSpawnAllowSchema = z
  .object({
    allow: z.array(z.string().min(1)),
  })
  .strict();

export type ShoggothSubagentSpawnAllowConfig = z.infer<typeof shoggothSubagentSpawnAllowSchema>;

// ---------------------------------------------------------------------------
// Tool Discovery
// ---------------------------------------------------------------------------

const toolDiscoveryTriggerSchema = z
  .object({
    match: z.string().min(1),
    tools: z.array(z.string().min(1)),
  })
  .strict();

export const shoggothToolDiscoveryConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    alwaysOn: z.array(z.string().min(1)).default([
      "builtin-read", "builtin-write", "builtin-exec", "builtin-memory-search", "builtin-session-query",
      "builtin-poll", "builtin-skills", "builtin-show", "builtin-fs", "builtin-ls", "builtin-fetch", "builtin-kv", "builtin-timer",
      "builtin-search-replace", "builtin-cd",
    ]),
    triggers: z.array(toolDiscoveryTriggerSchema).optional(),
  })
  .strict();

export type ShoggothToolDiscoveryConfig = z.infer<typeof shoggothToolDiscoveryConfigSchema>;

export const shoggothAgentToolDiscoveryConfigSchema = z
  .object({
    alwaysOn: z.array(z.string().min(1)).optional(),
    triggers: z.array(toolDiscoveryTriggerSchema).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export type ShoggothAgentToolDiscoveryConfig = z.infer<typeof shoggothAgentToolDiscoveryConfigSchema>;

// ---------------------------------------------------------------------------
// Agent Entry
// ---------------------------------------------------------------------------

const shoggothAgentIdKeySchema = z
  .string()
  .min(1)
  .refine((s) => !s.includes(":"), "must not contain ':'");

export const shoggothAgentEntrySchema = z
  .object({
    displayName: z.string().min(1).optional(),
    emoji: z.string().min(1).optional(),
    models: shoggothAgentModelsOverrideSchema.optional(),
    platforms: z.record(z.string(), z.object({
      routes: z.unknown().optional(),
    }).passthrough()).optional(),
    memory: z
      .object({
        paths: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
    agentToAgent: shoggothAgentToAgentAllowSchema.optional(),
    subagentSpawnAllow: shoggothSubagentSpawnAllowSchema.optional(),
    spawnSubagents: z.boolean().optional(),
    sessionQuery: shoggothSessionQueryAllowSchema.optional(),
    policy: z
      .object({
        tools: shoggothToolRulesSchema.partial().optional(),
      })
      .strict()
      .optional(),
    hitl: z
      .object({
        bypassUpTo: hitlRiskTierSchema.optional(),
        toolAutoApprove: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
    reactions: shoggothReactionsConfigSchema.partial().optional(),
    toolCallTimeoutMs: z.number().int().positive().optional(),
    contextLevel: contextLevelSchema.optional(),
    subagentContextLevel: contextLevelSchema.optional(),
    toolDiscovery: shoggothAgentToolDiscoveryConfigSchema.optional(),
    thinkingDisplay: thinkingDisplaySchema.optional(),
  })
  .strict();

export type ShoggothAgentEntry = z.infer<typeof shoggothAgentEntrySchema>;

// ---------------------------------------------------------------------------
// Agents Config
// ---------------------------------------------------------------------------

export const shoggothAgentsConfigSchema = z
  .object({
    list: z.record(shoggothAgentIdKeySchema, shoggothAgentEntrySchema).optional(),
    contextLevel: contextLevelSchema.optional(),
    subagentContextLevel: contextLevelSchema.optional(),
    internalStreaming: z.boolean().optional(),
  })
  .strict();

export type ShoggothAgentsConfig = z.infer<typeof shoggothAgentsConfigSchema>;

export const DEFAULT_SKILLS_CONFIG: ShoggothSkillsConfig = {
  scanRoots: [],
  disabledIds: [],
};

// ---------------------------------------------------------------------------
// Process Declaration
// ---------------------------------------------------------------------------

const processDeclarationHealthSchema = z
  .object({
    kind: z.enum(["tcp", "http", "stdout-match"]),
    target: z.string().min(1),
    timeoutMs: z.number().int().positive().optional(),
  })
  .strict();

export const processDeclarationSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    startPolicy: z.enum(["boot", "on-demand"]),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    cwd: z.string().min(1).optional(),
    env: z.record(z.string()).optional(),
    restartMode: z.enum(["never", "on-failure", "always"]).optional(),
    maxRetries: z.number().int().nonnegative().optional(),
    health: processDeclarationHealthSchema.optional(),
  })
  .strict();

export type ProcessDeclaration = z.infer<typeof processDeclarationSchema>;

// ---------------------------------------------------------------------------
// SearXNG Config
// ---------------------------------------------------------------------------

export const shoggothSearxngConfigSchema = z
  .object({
    baseUrl: z.string(),
    apiKey: z.string().optional(),
    defaultCount: z.number().int().min(1).max(20).optional(),
    defaultLanguage: z.string().optional(),
    defaultTimeRange: z.enum(["day", "week", "month", "year"]).optional(),
    engines: z.array(z.string()).optional(),
  })
  .strict();

export type ShoggothSearxngConfig = z.infer<typeof shoggothSearxngConfigSchema>;

// ---------------------------------------------------------------------------
// Config Schema
// ---------------------------------------------------------------------------

export const shoggothConfigFragmentSchema = z
  .object({
    logLevel: z.enum(["debug", "info", "warn", "error"]).optional(),
    stateDbPath: z.string().min(1).optional(),
    socketPath: z.string().min(1).optional(),
    controlSocketMode: z.number().int().optional(),
    controlSocketUid: z.number().int().nonnegative().optional(),
    controlSocketGid: z.number().int().nonnegative().optional(),
    operatorTokenPath: z.string().min(1).optional(),
    workspacesRoot: z.string().min(1).optional(),
    secretsDirectory: z.string().min(1).optional(),
    inboundMediaRoot: z.string().min(1).optional(),
    operatorDirectory: z.string().min(1).optional(),
    globalInstructionsPath: z.string().min(1).optional(),
    configDirectory: z.string().min(1).optional(),
    models: shoggothModelsConfigSchema.optional(),
    hitl: shoggothHitlConfigSchema.partial().optional(),
    memory: z
      .object({
        paths: z.array(z.string().min(1)).optional(),
        embeddings: shoggothMemoryEmbeddingsConfigSchema.partial().optional(),
      })
      .strict()
      .optional(),
    skills: z
      .object({
        scanRoots: z.array(z.string().min(1)).optional(),
        disabledIds: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
    plugins: z.array(shoggothPluginEntrySchema).optional(),
    retention: shoggothRetentionConfigSchema.optional(),
    reactions: shoggothReactionsConfigSchema.partial().optional(),
    mcp: shoggothMcpConfigSchema.optional(),
    acpx: shoggothAcpxConfigSchema.partial().optional(),
    platforms: z.record(z.string(), platformCommonConfigSchema).optional(),
    runtime: shoggothRuntimeConfigSchema.optional(),
    agents: shoggothAgentsConfigSchema.optional(),
    agentToAgent: shoggothAgentToAgentConfigSchema.optional(),
    spawnSubagents: z.boolean().optional(),
    subagentSpawnAllow: shoggothSubagentSpawnAllowSchema.optional(),
    sessionQuery: shoggothSessionQueryConfigSchema.optional(),
    policy: shoggothPolicyFragmentSchema,
    contextLevelTools: contextLevelToolsConfigSchema.optional(),
    processes: z.array(processDeclarationSchema).optional(),
    dynamicConfigDirectory: z.string().min(1).optional(),
    searxng: shoggothSearxngConfigSchema.optional(),
    toolDiscovery: shoggothToolDiscoveryConfigSchema.optional(),
    thinkingDisplay: thinkingDisplaySchema.optional(),
  })
  .strict();

export type ShoggothConfigFragment = z.infer<typeof shoggothConfigFragmentSchema>;

export const shoggothConfigSchema = z
  .object({
    logLevel: z.enum(["debug", "info", "warn", "error"]),
    stateDbPath: z.string().min(1),
    socketPath: z.string().min(1),
    controlSocketMode: z.number().int().optional(),
    controlSocketUid: z.number().int().nonnegative().optional(),
    controlSocketGid: z.number().int().nonnegative().optional(),
    operatorTokenPath: z.string().min(1).optional(),
    workspacesRoot: z.string().min(1),
    secretsDirectory: z.string().min(1),
    inboundMediaRoot: z.string().min(1),
    operatorDirectory: z.string().min(1),
    globalInstructionsPath: z.string().min(1).optional(),
    configDirectory: z.string(),
    models: shoggothModelsConfigSchema.optional(),
    hitl: shoggothHitlConfigSchema,
    memory: shoggothMemoryConfigSchema,
    skills: shoggothSkillsConfigSchema,
    plugins: z.array(shoggothPluginEntrySchema),
    retention: shoggothRetentionConfigSchema.optional(),
    reactions: shoggothReactionsConfigSchema.optional(),
    mcp: shoggothMcpConfigSchema,
    acpx: shoggothAcpxConfigSchema.optional(),
    platforms: z.record(z.string(), platformCommonConfigSchema).optional(),
    runtime: shoggothRuntimeConfigSchema.optional(),
    agents: shoggothAgentsConfigSchema.optional(),
    agentToAgent: shoggothAgentToAgentConfigSchema.optional(),
    spawnSubagents: z.boolean().optional(),
    subagentSpawnAllow: shoggothSubagentSpawnAllowSchema.optional(),
    sessionQuery: shoggothSessionQueryConfigSchema.optional(),
    policy: shoggothPolicyConfigSchema,
    contextLevelTools: contextLevelToolsConfigSchema.optional(),
    processes: z.array(processDeclarationSchema).optional(),
    dynamicConfigDirectory: z.string().min(1).optional(),
    searxng: shoggothSearxngConfigSchema.optional(),
    toolDiscovery: shoggothToolDiscoveryConfigSchema.optional(),
    thinkingDisplay: thinkingDisplaySchema.optional(),
  })
  .strict();

export type ShoggothConfig = z.infer<typeof shoggothConfigSchema>;

// ---------------------------------------------------------------------------
// Default Config
// ---------------------------------------------------------------------------

export const DEFAULT_HITL_CONFIG: ShoggothHitlConfig = {
  defaultApprovalTimeoutMs: 300_000,
  toolRisk: {
    "builtin-read": "safe",
    "builtin-write": "caution",
    "builtin-exec": "critical",
    "builtin-memory-search": "safe",
    "builtin-memory-ingest": "caution",
    "builtin-session-list": "safe",
    "builtin-session-send": "caution",
    "builtin-session-query": "safe",
    "builtin-subagent": "caution",
    "builtin-message": "caution",
    "builtin-config-request": "never",
  },
  bypassUpTo: "safe",
};

export function defaultConfig(configDirectory: string): ShoggothConfig {
  return {
    logLevel: "info",
    stateDbPath: LAYOUT.stateDbFile,
    socketPath: LAYOUT.controlSocket,
    workspacesRoot: LAYOUT.workspacesRoot,
    secretsDirectory: LAYOUT.secretsDir,
    inboundMediaRoot: LAYOUT.inboundMediaRoot,
    operatorDirectory: LAYOUT.operatorDir,
    configDirectory,
    dynamicConfigDirectory: "/etc/shoggoth/config.d/dynamic",
    hitl: DEFAULT_HITL_CONFIG,
    memory: DEFAULT_MEMORY_CONFIG,
    skills: DEFAULT_SKILLS_CONFIG,
    plugins: [],
    mcp: { servers: [], poolScope: "global" },
    policy: DEFAULT_POLICY_CONFIG,
    platforms: { discord: { enabled: true } },
  };
}