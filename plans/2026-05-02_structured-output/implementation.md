# Implementation

## Phase 1: Core types and merge logic

Add the `responseSchema` field to the shared type system and teach the invocation merge pipeline to parse, merge, and propagate it. After this phase, any caller that sets `responseSchema` on `ModelInvocationParams` will see it flow through to provider adapters (which won't act on it yet).

- Add `ResponseSchema` interface and `responseSchema` field to `ModelInvocationParams` in the core types.
- Update `parseModelInvocationFromUnknown` to recognize `responseSchema` from raw JSON.
- Update `mergeInvocations` to apply overlay-wins semantics for `responseSchema`.
- Add `"responseSchema"` to `SESSION_INVOCATION_KEYS`.
- Add `responseSchema` to the Zod config schema (`shoggothModelDefaultInvocationSchema`).
- Unit tests for parsing, merging, and schema validation.

**Files:**

- `packages/models/src/types.ts`
- `packages/models/src/invocation-merge.ts`
- `packages/shared/src/schema.ts`
- `packages/models/src/invocation-merge.test.ts` (new or extended)
- `packages/shared/src/schema.test.ts` (new or extended)

## Phase 2: Response validation utility

Add the shared response validation module that adapters will use to verify schema conformance. This is independent of any specific adapter and can be tested in isolation.

- Add `ajv` as a dependency to the models package.
- Create `response-validation.ts` with `validateResponseSchema` function and associated types (`ValidationSuccess`, `ValidationFailure`, `ValidationResult`).
- Create `StructuredOutputValidationError` error class. Include `rawContent` and `schema` on the error so the tool loop can build correction feedback without needing the original invocation params.
- Unit tests: valid JSON passes, invalid JSON structure fails, non-JSON content fails, descriptive error messages include schema path info.

**Files:**

- `packages/models/package.json` (add `ajv` dependency)
- `packages/models/src/response-validation.ts` (new)
- `packages/models/src/response-validation.test.ts` (new)

## Phase 3: OpenAI and Gemini adapters

Map `responseSchema` to each provider's native request parameter. Gemini applies post-response validation.

- OpenAI adapter: when `responseSchema` is present, set `response_format` with `type: "json_schema"` on the request body. Apply after `requestExtras` spread so the typed field wins. No post-validation (provider guarantees conformance with `strict: true`).
- Gemini adapter: when `responseSchema` is present, set `generationConfig.responseMimeType` to `"application/json"` and pass the schema through `sanitizeSchemaForGemini`. Apply post-response validation using `validateResponseSchema`; throw `StructuredOutputValidationError` on failure.
- Unit tests for both adapters verifying correct request shape with and without `responseSchema`.
- Unit tests for Gemini post-validation integration (mock a non-conformant response, verify error is thrown).

**Files:**

- `packages/models/src/openai-compatible.ts`
- `packages/models/src/gemini.ts`
- `packages/models/src/openai-compatible.test.ts` (new or extended)
- `packages/models/src/gemini.test.ts` (new or extended)

## Phase 4: Anthropic adapter (synthetic tool workaround)

Implement structured output for Anthropic using the synthetic tool injection pattern. This is the most complex adapter change.

- Define `STRUCTURED_OUTPUT_TOOL_PREFIX` constant and `buildSyntheticTool` helper.
- Define `isSyntheticToolCall` predicate.
- In `completeWithTools`: inject the synthetic tool into the tools list when `responseSchema` is present.
- Handle three response states:
  - Synthetic-only tool call → terminal, extract arguments as response content.
  - Synthetic + real tool calls → strip synthetic, return only real tool calls.
  - No synthetic call + no real tool calls (text-only response) → force a follow-up call with `tool_choice` set to the synthetic tool, extract arguments.
- Apply post-response validation using `validateResponseSchema`; throw `StructuredOutputValidationError` on failure.
- Unit tests:
  - Synthetic tool is injected into tools list.
  - Terminal detection: synthetic-only response extracts arguments correctly.
  - Mixed response: synthetic is stripped, real tools are returned.
  - Text-only response with schema: forced follow-up call is made.
  - Post-validation integration (mock non-conformant arguments, verify error).

**Files:**

- `packages/models/src/anthropic-messages.ts`
- `packages/models/src/anthropic-messages.test.ts` (new or extended)

## Phase 5: Tool loop validation retry

Add retry handling to the tool loop so that `StructuredOutputValidationError` from adapters triggers a correction-and-retry cycle instead of killing the session.

- Import `StructuredOutputValidationError` from `@shoggoth/models`.
- Add `STRUCTURED_OUTPUT_MAX_RETRIES` constant (2 retries, 3 total attempts).
- Wrap the `model.complete()` call in a try/catch for `StructuredOutputValidationError`.
- On catch:
  - Increment attempt counter.
  - If retries exhausted, re-throw the error (session fails normally).
  - Record the non-conformant response in the transcript with `structuredOutputValidationFailed` metadata.
  - Build a correction message containing the validation error and the schema.
  - Inject the correction via `model.pushSteerMessage` (reuses existing steer infrastructure).
  - Record the correction in the transcript with `structuredOutputCorrection` metadata.
  - Log and audit the failed attempt.
  - `continue` to re-enter the loop and call `model.complete()` again.
- Reset the attempt counter when a terminal response succeeds (passes validation or has no `responseSchema`).
- Unit tests:
  - First attempt fails validation → correction injected → second attempt succeeds.
  - All 3 attempts fail → error is re-thrown.
  - Transcript contains failed response + correction + successful response.
  - Retry counter resets after success.
  - Non-`StructuredOutputValidationError` exceptions propagate normally (no retry).
  - Abort signal is respected between retries.

**Files:**

- `packages/daemon/src/sessions/tool-loop.ts`
- `packages/daemon/test/sessions/tool-loop.test.ts` (new or extended)

## Phase 6: Workflow integration

Expose `responseSchema` through the workflow system so LLM-authored workflow definitions can constrain agent task output.

- Add `responseSchema` to `AgentTaskDef` in workflow types.
- Add `response_schema` to the workflow tool descriptor's task item properties.
- Add `responseSchema` to the orchestrator's `SpawnRequest` interface and pass it through when spawning agent tasks.
- Update `createDaemonSpawnAdapter` to forward `responseSchema` into the spawned session's `model_selection`.
- Unit tests for task definition parsing, orchestrator spawn request construction, and daemon adapter forwarding.

**Files:**

- `packages/workflow/src/types.ts`
- `packages/workflow/src/tool-descriptor.ts`
- `packages/workflow/src/orchestrator.ts`
- `packages/daemon/src/workflow-adapters.ts`
- `packages/workflow/src/types.test.ts` (new or extended)
- `packages/workflow/src/orchestrator.test.ts` (new or extended)
- `packages/daemon/src/workflow-adapters.test.ts` (new or extended)
