---
date: 2026-05-02
completed: never
---

# Structured Output Support

## Summary

Add cross-provider structured output (JSON schema-constrained responses) to Shoggoth so that subagent spawns, workflows, and other programmatic interactions can request schema-conformant JSON from the model without relying on prompt engineering.

## Motivation

Today there is no way to guarantee a model's final response conforms to a specific shape. Callers either craft careful prompts and hope for valid JSON, or abuse `requestExtras` to pass provider-specific `response_format` blobs — untyped, non-portable, and invisible to the rest of the system.

Structured output solves this by letting any spawn path declare a `responseSchema`. The schema rides along through the existing invocation pipeline, each provider adapter maps it to the native mechanism, and the model's final text response is constrained to match. This is especially valuable for workflow agent tasks whose output feeds into downstream transforms or gates.

## Design

### Data flow

```
caller (workflow / subagent spawn)
  → model_options.responseSchema
    → mergeSubagentSpawnModelSelection (invocation-merge)
      → session model_selection
        → ModelInvocationParams.responseSchema
          → provider adapter (OpenAI / Gemini / Anthropic)
            → native request parameter
              → response text
                → post-response validation (Gemini, Anthropic)
                  → on failure: tool loop retry with feedback
```

The schema is an optional field at every layer. When absent, behavior is unchanged. When present, each adapter translates it to the provider's native mechanism, a post-response validation step ensures conformance for providers that don't guarantee it, and the tool loop retries with model feedback on validation failure.

### Provider mapping

**OpenAI** — Native `response_format.json_schema`. Set `strict: true` for guaranteed conformance. Straightforward mapping, ~20 lines. No post-validation needed (provider guarantees conformance).

**Gemini** — Native `generationConfig.responseSchema` + `responseMimeType: "application/json"`. The existing `sanitizeSchemaForGemini` helper must also be applied to the response schema. ~20 lines. Post-validation required (provider does not guarantee strict conformance).

**Anthropic** — No native support. Uses a synthetic tool workaround:

1. Inject a synthetic tool definition whose `input_schema` matches the desired output schema.
2. On the final call (when the model is done with real tools), force `tool_choice: { type: "tool", name: "<synthetic>" }`.
3. If the model returns the synthetic tool call alongside real tool calls: strip the synthetic call, hold its result, feed back real tool results, and continue the loop.
4. When the model returns _only_ the synthetic tool call: extract the tool arguments as the response content, return empty `toolCalls`.

This is the heaviest adapter lift (~100-150 lines). Post-validation required (synthetic tool arguments are not schema-guaranteed).

### Coexistence with tool use

Structured output and tool use coexist naturally. The model calls tools throughout its turn as usual. The schema constraint applies only to the **final** model response (the one with no tool calls). On OpenAI and Gemini this is handled natively by the provider. On Anthropic, the adapter detects the terminal state and forces the synthetic tool call.

No changes to the tool loop's tool-execution path are needed — the Anthropic adapter handles the synthetic tool internally within its `completeWithTools` implementation.

### Response validation

For providers that don't guarantee schema conformance (Gemini, Anthropic), a post-response validation step runs after the final model response:

1. Parse the response content as JSON.
2. Validate against the provided schema using a JSON Schema validator (e.g., `ajv`).
3. If validation fails, the adapter throws `StructuredOutputValidationError` with the validation error details and the raw non-conformant content.

OpenAI with `strict: true` is exempt from validation since the provider guarantees conformance.

The validator is a shared utility in `packages/models/src/response-validation.ts` that any adapter can call.

### Validation retry in the tool loop

When a provider adapter throws `StructuredOutputValidationError`, the tool loop catches it and retries rather than letting the error kill the session. The retry mechanism works as follows:

1. The tool loop wraps `model.complete()` in a try/catch for `StructuredOutputValidationError`.
2. On catch, the loop injects a correction message into the model context via `model.pushToolMessage` (or a new `model.pushCorrectionMessage` method) containing the validation error and the original schema, asking the model to produce a conformant response.
3. The loop records the failed attempt in the transcript (the non-conformant response + the correction feedback) so the model sees its mistake in context.
4. The loop re-invokes `model.complete()`.
5. A retry counter caps attempts at **2 retries** (3 total attempts). If all attempts fail, the `StructuredOutputValidationError` is re-thrown and the session fails as it would for any unrecoverable model error.
6. Each retry is logged and audited.

This approach keeps retry logic centralized in the tool loop rather than scattered across adapters or callers. The model gets explicit feedback about what went wrong, which significantly improves the chance of a conformant response on retry.

### Parameter merging

`responseSchema` follows the same overlay semantics as other `ModelInvocationParams` fields: the most specific value wins. A workflow task's `responseSchema` overrides the session default, which overrides the global default. The merge logic in `invocation-merge.ts` and the `SESSION_INVOCATION_KEYS` set are updated to include it.

### Failover

Failover clients (`failover.ts`, `tool-failover.ts`) already spread all `ModelInvocationParams` fields. No structural changes needed. If failover crosses provider boundaries (e.g., OpenAI → Anthropic), the fallback adapter independently handles the schema via its own mechanism (synthetic tool for Anthropic, native for others). Post-validation ensures conformance regardless of which provider ultimately serves the request.

## Testing Strategy

- **Unit tests for each adapter**: Verify that `responseSchema` produces the correct native request shape (OpenAI `response_format`, Gemini `generationConfig`, Anthropic synthetic tool injection).
- **Anthropic adapter tests**: Verify synthetic tool injection, mixed tool call handling (synthetic + real tools), terminal detection (synthetic-only response), and content extraction from synthetic tool arguments.
- **Response validation tests**: Verify valid JSON passes, invalid JSON fails with descriptive errors, malformed (non-JSON) content fails, and OpenAI responses skip validation.
- **Tool loop retry tests**: Verify the loop catches `StructuredOutputValidationError`, injects correction feedback, retries up to the cap, records failed attempts in the transcript, and re-throws after exhausting retries.
- **Unit tests for merge logic**: Verify `parseModelInvocationFromUnknown` parses `responseSchema`, `mergeInvocations` overlays correctly, and `SESSION_INVOCATION_KEYS` includes it.
- **Unit tests for workflow types**: Verify `responseSchema` round-trips through task definition parsing and the orchestrator's `SpawnRequest`.
- **Config schema tests**: Verify the Zod schema accepts valid `responseSchema` and rejects malformed ones.
- **Integration test**: Spawn a subagent with a `responseSchema` via the workflow tool and confirm the spawned session's model invocation includes the schema and the response is validated.

## Considerations

- **Anthropic synthetic tool complexity.** The adapter must handle three states: (a) model returns only real tools → continue normally, (b) model returns synthetic + real tools → strip synthetic, continue with real tools, (c) model returns only synthetic tool → terminal, extract arguments as response. Edge cases around the model calling the synthetic tool prematurely need careful handling.
- **Streaming.** Structured output with streaming works on all providers (partial JSON tokens). No special handling needed — existing stream consumers already handle JSON content. For Anthropic, the synthetic tool's arguments stream as normal tool-use content blocks.
- **Validation dependency.** Adding `ajv` (or similar) as a dependency. It's well-established, actively maintained, and small enough for the models package. Alternatively, a lighter validator could be used if the schema subset is constrained.
- **Retry budget.** 2 retries (3 total attempts) balances reliability against latency. Each retry is a full model invocation, so the cost is non-trivial. The cap prevents runaway loops when a model fundamentally can't produce conformant output for a given schema.
- **Correction message format.** The feedback injected on retry must be clear enough for the model to understand what went wrong without being so verbose that it crowds the context. Including the specific validation errors (e.g., "missing required field: categories") and the schema itself gives the model the best chance of self-correcting.
- **Failover across providers.** All three providers now support structured output, so failover works correctly regardless of provider combination. Post-validation ensures consistent guarantees.
- **`requestExtras` overlap.** Callers currently using `requestExtras` to pass `response_format` manually will still work. The typed `responseSchema` field takes precedence if both are set (adapter applies `responseSchema` after spreading `requestExtras`).

## Migration

No migration needed. `responseSchema` is optional at every layer. Existing configs, sessions, and workflows are unaffected. The feature is purely additive.

## References

- [`spec.md`](spec.md) — type signatures, interfaces, and code examples
- [`implementation.md`](implementation.md) — phased implementation steps
- [`research.md`](research.md) — original research findings
