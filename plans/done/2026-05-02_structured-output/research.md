# Structured Output Support — Research Findings

**Date:** 2026-05-02

## Overview

This document covers the changes required for Shoggoth to support structured output (JSON schema-constrained responses) from LLMs. The primary use case is passing a response schema as an optional parameter for subagent spawns (workflows and other programmatic interactions) rather than relying on prompt instructions to shape output.

Structured output coexists with tool use — a workflow subagent may use tools normally throughout its turn, and the schema constraint applies to the **final** model response after the tool loop completes.

## Provider Landscape

### OpenAI (chat completions)

Native support via `response_format` on the request body:

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "my_schema",
      "schema": { ... },
      "strict": true
    }
  }
}
```

Works alongside `tools` — the model uses tools when needed and produces schema-conformant text on its final response. `strict: true` guarantees conformance.

### Anthropic (Messages API)

**No native structured output parameter.** The recommended workaround is a synthetic tool:

1. Inject a fake tool whose `input_schema` matches the desired output schema.
2. Force `tool_choice: { type: "tool", name: "<synthetic>" }` on the final call (or detect when the model is done with real tools).
3. Extract the tool call arguments as the structured content.

This is complex when real tools are also present — the adapter must distinguish "model called the synthetic schema tool to give its final answer" from "model is calling real tools." If the model returns the synthetic tool alongside real tools, the adapter holds the synthetic result, feeds back real tool results, and continues the loop. When the model returns _only_ the synthetic tool call, that's the terminal response.

### Gemini (generateContent)

Native support via `generationConfig`:

```json
{
  "generationConfig": {
    "responseMimeType": "application/json",
    "responseSchema": { ... }
  }
}
```

Works alongside `tools` (same behavior as OpenAI). The existing `sanitizeSchemaForGemini` function must also be applied to the response schema (strips `additionalProperties`, normalizes `const`/`enum`, etc.).

## Current State

There is **zero** structured output support in the codebase. The term doesn't appear in the models package, config schemas, or invocation types.

The closest escape hatch is `requestExtras` on `ModelInvocationParams`, which shallow-merges arbitrary keys into the provider request body. You could pass `response_format` through it today, but it's untyped, provider-specific, and wouldn't work cross-provider.

## Affected Layers

The full call chain from subagent spawn to HTTP request, and what each layer needs:

### 1. Core types — `packages/models/src/types.ts`

Add a `responseSchema` field to `ModelInvocationParams`:

```ts
export interface ModelInvocationParams {
  // ... existing fields ...
  readonly responseSchema?: {
    readonly name: string;
    readonly schema: Record<string, unknown>;
    readonly strict?: boolean;
  };
}
```

This flows into `ModelCompleteInput` and `ModelToolCompleteInput` since they both extend `ModelInvocationParams`.

### 2. OpenAI adapter — `packages/models/src/openai-compatible.ts`

In `applyOpenAICompatibleRequestExtensions` (or the body-building sections of `complete`/`completeWithTools`), map `responseSchema` to:

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "...",
      "schema": { ... },
      "strict": true
    }
  }
}
```

Straightforward — ~20 lines.

### 3. Anthropic adapter — `packages/models/src/anthropic-messages.ts`

Implement the synthetic tool workaround. The adapter must:

- Inject a synthetic tool definition derived from `responseSchema` into the tools list.
- Detect when the model returns only the synthetic tool call (terminal response) vs. alongside real tools (continue loop).
- When terminal: extract the synthetic tool's arguments as the response `content`, return empty `toolCalls`.
- When mixed with real tools: strip the synthetic call from `toolCalls`, hold its result, feed back real tool results, continue.

This is the heaviest lift — ~100-150 lines for the workaround + response reshaping.

**Alternative:** Skip Anthropic structured output entirely in v1 and document it as unsupported. Callers using Anthropic would get best-effort JSON via prompt instructions. This avoids the complexity and can be revisited.

### 4. Gemini adapter — `packages/models/src/gemini.ts`

Map `responseSchema` to `generationConfig.responseSchema` + `responseMimeType`:

```ts
if (input.responseSchema) {
  genConfig.responseMimeType = "application/json";
  genConfig.responseSchema = sanitizeSchemaForGemini(input.responseSchema.schema);
}
```

~20 lines.

### 5. Parameter merging — `packages/models/src/invocation-merge.ts`

- `parseModelInvocationFromUnknown`: Recognize `responseSchema` from raw JSON (subagent `model_options`, session `model_selection`).
- `mergeInvocations`: Overlay wins when set (same as other fields).
- Add `"responseSchema"` to the `SESSION_INVOCATION_KEYS` set so `mergeSubagentSpawnModelSelection` strips/reattaches it correctly.

~30 lines.

### 6. Failover clients — `packages/models/src/failover.ts`, `tool-failover.ts`

These already spread `...input` or forward all `ModelInvocationParams` fields. As long as the type is updated, they pass through automatically. **No structural changes needed.**

Worth noting: failover between providers with different structured output mechanisms (e.g., OpenAI → Anthropic) means the Anthropic adapter must handle the schema even if the request originally targeted OpenAI. Each adapter must independently handle `responseSchema`.

### 7. Config schema — `packages/shared/src/schema.ts`

Add `responseSchema` to `shoggothModelDefaultInvocationSchema`:

```ts
responseSchema: z.object({
  name: z.string().min(1),
  schema: z.record(z.string(), z.unknown()),
  strict: z.boolean().optional(),
}).strict().optional(),
```

Unlikely to be used in global config, but keeps the schema consistent with the runtime type.

### 8. Workflow task types — `packages/workflow/src/types.ts`

Add optional `responseSchema` to `AgentTaskDef`:

```ts
export interface AgentTaskDef extends TaskDefBase {
  kind: "agent";
  prompt: string;
  responseSchema?: {
    name: string;
    schema: Record<string, unknown>;
    strict?: boolean;
  };
}
```

### 9. Workflow tool descriptor — `packages/workflow/src/tool-descriptor.ts`

Add `response_schema` to the task item properties so the LLM knows it can pass a schema when defining workflow tasks:

```ts
response_schema: {
  type: "object",
  description: "Optional: constrain the task's final response to this JSON schema.",
  properties: {
    name: { type: "string" },
    schema: { type: "object" },
    strict: { type: "boolean" },
  },
  required: ["name", "schema"],
},
```

### 10. Orchestrator — `packages/workflow/src/orchestrator.ts`

The `SpawnRequest` interface needs a `responseSchema` field. The orchestrator passes it through when spawning agent tasks. ~10 lines.

### 11. Daemon spawn adapter — `packages/daemon/src/workflow-adapters.ts`

`createDaemonSpawnAdapter` forwards `responseSchema` into the spawned session's `model_selection` so the child session's model client includes it in every `completeWithTools` call. ~10 lines.

### 12. Session model client — `packages/daemon/src/sessions/session-tool-loop-model-client.ts`

Already forwards all `ModelInvocationParams` fields via `input.modelInvocation`. As long as `responseSchema` is in that object, it flows through to `completeWithTools`. **No changes needed.**

### 13. Tool loop — `packages/daemon/src/sessions/tool-loop.ts`

**No changes needed.** The tool loop runs as-is. `responseSchema` rides along in `ModelInvocationParams` through every `completeWithTools` call. The model uses tools normally and produces schema-constrained text on its final response (when it returns no tool calls).

### 14. Subagent spawn path — `session-handlers.ts` → `integration-ops.ts`

The subagent handler already passes `model_options` through to `mergeSubagentSpawnModelSelection`. As long as the merge logic (layer 5) handles `responseSchema`, this path works without structural changes. **No changes needed.**

## Design Decisions

### 1. Anthropic: implement or defer?

The synthetic tool workaround for Anthropic is the most complex piece. Options:

- **Implement in v1**: Full cross-provider support. ~100-150 lines of adapter complexity.
- **Defer**: Document Anthropic as unsupported for structured output. Callers get best-effort via prompt. Simpler v1, revisit when/if Anthropic adds native support.

### 2. Schema validation of responses

OpenAI with `strict: true` guarantees schema conformance. Anthropic and Gemini don't.

Options:

- **No validation**: Trust the provider. Simple, but Gemini/Anthropic may return non-conformant JSON.
- **Post-validation with error**: Validate the final response against the schema. Return an error if it doesn't conform. Callers handle retries.
- **Post-validation with retry**: Validate and automatically retry (re-prompt the model with the validation error). More robust but adds latency and complexity.

For v1, "no validation" is reasonable — OpenAI is strict by default, Gemini is reliable in practice, and Anthropic is deferred or best-effort.

### 3. Streaming

Structured output with streaming works on all providers (OpenAI streams partial JSON tokens, Gemini likewise, Anthropic tool-use streams normally). No fundamental blockers. The stream consumers already handle JSON content. No special changes needed.

## Scope Estimate

| Area                                       | Effort | Lines (approx) |
| ------------------------------------------ | ------ | -------------- |
| Core types + merge logic                   | Small  | ~50            |
| OpenAI adapter                             | Small  | ~20            |
| Gemini adapter                             | Small  | ~20            |
| Anthropic adapter (if implemented)         | Large  | ~100-150       |
| Config schema                              | Small  | ~15            |
| Workflow types + descriptor + orchestrator | Small  | ~60            |
| Daemon spawn adapter                       | Small  | ~10            |
| Tests                                      | Medium | ~200-300       |
| **Total (with Anthropic)**                 |        | **~475-625**   |
| **Total (Anthropic deferred)**             |        | **~375-475**   |

## Files Touched

### Must change

- `packages/models/src/types.ts`
- `packages/models/src/openai-compatible.ts`
- `packages/models/src/gemini.ts`
- `packages/models/src/invocation-merge.ts`
- `packages/shared/src/schema.ts`
- `packages/workflow/src/types.ts`
- `packages/workflow/src/tool-descriptor.ts`
- `packages/workflow/src/orchestrator.ts`
- `packages/daemon/src/workflow-adapters.ts`

### Must change if Anthropic is implemented in v1

- `packages/models/src/anthropic-messages.ts`

### No changes needed (pass-through)

- `packages/models/src/failover.ts`
- `packages/models/src/tool-failover.ts`
- `packages/daemon/src/sessions/tool-loop.ts`
- `packages/daemon/src/sessions/session-tool-loop-model-client.ts`
- `packages/daemon/src/sessions/builtin-handlers/session-handlers.ts`
- `packages/daemon/src/control/integration-ops.ts`
