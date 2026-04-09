---
date: 2026-04-09
completed: never
---

# Model Resolution: Session Row as Single Source of Truth

## Summary

Refactor the model resolution chain so that `model_selection_json` on the session row is the authoritative source for which model a session uses at turn time. Config is resolved once at session bootstrap (and subagent spawn), written to the row, and never re-derived during subsequent turns.

## Motivation

The current model resolution in `session-agent-turn.ts` re-derives the full models config from layered config on every single turn via `resolveEffectiveModelsConfig()`. The session's `model_selection_json` is treated as a secondary hint — if it contains a `model` field with a `/`, it gets prepended to the config-derived failover chain; if it doesn't contain `/`, it's silently ignored for the actual model call but leaks into the log line. This creates several problems:

- Unnecessary config re-resolution on every turn (performance waste, layered config merging is not free).
- The session's stored model selection is a hint, not the truth — the config can override it at any time.
- Stale values in `model_selection_json` from old experiments produce wrong log output and potentially wrong model selection.
- The `session_model` control op updates `model_selection_json` but the turn code mostly ignores it in favor of config.
- Config hot-reloads can silently change the model for already-running sessions, which is surprising and destabilizing.

The correct model: resolve once at bootstrap, store the resolved `providerId/model` ref in the session row, and read it back on every subsequent turn. Config hot-reloads affect new sessions only. The `session_model` op becomes the way to change a running session's model.

## Design

### Core data structure: `model_selection_json`

The `model_selection_json` column already stores arbitrary JSON. Currently the shape is ad-hoc — invocation params like `temperature`, `thinking`, `maxOutputTokens`, and sometimes a `model` key. The plan formalizes this shape without breaking existing data:

```typescript
interface SessionModelSelection {
  /** Resolved primary model ref: "providerId/modelName". Always present after bootstrap. */
  model: string;
  /** Invocation params (temperature, thinking, maxOutputTokens, etc.) */
  maxOutputTokens?: number;
  temperature?: number;
  thinking?: { enabled: boolean; budgetTokens?: number };
  reasoningEffort?: string;
  requestExtras?: Record<string, unknown>;
}
```

The `model` field becomes the canonical source of truth for which model the session uses. All other fields remain invocation overrides as they are today.

### Resolution flow by lifecycle stage

#### 1. Bootstrap (new parent session)

When a new parent session is created (platform binding bootstrap), the system:

1. Calls `resolveEffectiveModelsConfig(config, sessionId)` to get the per-agent models config.
2. Reads the first entry from the failover chain to determine the primary `providerId/model` ref.
3. Merges any `defaultInvocation` params from config.
4. Writes the complete `SessionModelSelection` (with `model` field) to `model_selection_json` on the session row.

This happens once. The session row now contains the resolved truth.

#### 2. Subagent spawn

When `subagent_spawn` creates a new session:

1. Resolve `subagentModel` from config: per-agent `agents.list.<id>.subagentModel` → global `agents.subagentModel` fallback.
2. If the parent explicitly passes a model in `model_options`, that wins.
3. If neither is set, inherit the parent session's `model` from its `model_selection_json`.
4. Write the resolved `model` ref + merged invocation params to the new session's `model_selection_json`.

This is largely what happens today via `mergeSubagentSpawnModelSelection()`, but the result must always include a `model` field in `providerId/model` format.

#### 3. Every subsequent turn

In `executeSessionAgentTurn`:

1. Read `session.modelSelection.model` from the session row. This is the primary model ref.
2. Read `resolveEffectiveModelsConfig(config, sessionId)` **only** for the failover chain and provider definitions (needed for failover when the primary provider is down, and for constructing the tool-calling client). Do NOT use it to determine the primary model.
3. Build the failover chain: `[session.model, ...configChainWithoutSessionModel]`.
4. Construct the `FailoverToolCallingClient` with this chain.
5. Merge invocation params: `config.models.defaultInvocation` ← `session.modelSelection` (session wins per field, same as today).

The key change: the primary model comes from the session row, not from config. Config provides the failover chain and provider definitions only.

#### 4. `session_model` control op

Already updates `model_selection_json`. After this change, subsequent turns immediately use the new `model` value because the turn code reads from the session row. No behavioral change needed here beyond ensuring the `model` field is always written in `providerId/model` format.

#### 5. Config hot-reload

Does NOT retroactively change already-bootstrapped sessions. New sessions pick up the new config. This is intentional — running sessions are stable. The failover chain from config is still re-read each turn (providers can be added/removed), but the primary model stays pinned to the session row.

### Image block codec resolution

`resolveImageBlockCodec()` currently reads from the first entry in the config-derived failover chain. After this change, it should read from the session's primary model ref (the provider kind determines the codec). The provider definition is still looked up from config — only the "which provider" decision comes from the session row.

### Log line accuracy

The "model call started" log line currently shows `selModel` (which may be a bare name without `/`) or falls back to `resolveModel()` (which re-resolves from config). After this change, it always shows `session.modelSelection.model` — the actual model that will be used.

### Edge cases and failure modes

- **Provider removed from config:** The session row says `providerX/modelY` but `providerX` no longer exists in config. The failover chain handles this — the primary is skipped and the next available provider is used. A warning is logged.
- **`session_model` with bare model name:** The `session_model` op should validate that the `model` field is in `providerId/model` format. Bare names are rejected.
- **`model` set to `"auto"` or similar sentinel:** Not supported. The `model` field must always be a concrete `providerId/model` ref.

### Security considerations

No new attack surface. The `model_selection_json` column is only writable via the `session_model` control op (operator-only) and internal session bootstrap code. Agents cannot directly modify their own model selection.

## Implementation Phases

### Phase 1: Formalize `model_selection_json` shape and bootstrap write

Ensure that session bootstrap always writes a `model` field in `providerId/model` format to `model_selection_json`. Add a helper function `resolveBootstrapModelRef()` that resolves the primary model ref from config and returns it.

- Add `resolveBootstrapModelRef(config, sessionId): string | undefined` to `model-resolution.ts`. This reads `resolveEffectiveModelsConfig()` and extracts the first failover chain entry as a `providerId/model` string.
- Add `getSessionPrimaryModelRef(session: SessionRow): string | undefined` helper to `model-resolution.ts` that reads `model` from `session.modelSelection` with type narrowing and `/` validation.
- Update platform bootstrap code to call `resolveBootstrapModelRef()` and write the result into `model_selection_json` via `sessions.update()` or `sessions.create()`.

**Files:**
- `packages/daemon/src/sessions/model-resolution.ts` — new `resolveBootstrapModelRef()` and `getSessionPrimaryModelRef()` functions
- Platform bootstrap files (session creation sites) — write `model` at session creation

### Phase 2: Subagent spawn writes resolved `model` ref

Ensure `subagent_spawn` always writes a concrete `model` ref to the new session's `model_selection_json`. Update `mergeSubagentSpawnModelSelection()` to guarantee the output includes a `model` field.

- In `integration-ops.ts` `subagent_spawn` case: after resolving `subagentModel` from config (per-agent `agents.list.<id>.subagentModel` → global `agents.subagentModel`), ensure it's written as the `model` field in the merged model selection.
- Update `mergeSubagentSpawnModelSelection()` in `invocation-merge.ts` to accept an explicit `modelRef` parameter that always lands in the output as the `model` key.
- If no `subagentModel` is configured and the parent has no `model` in its selection, fall back to `resolveBootstrapModelRef()` using the subagent's session id.

**Files:**
- `packages/daemon/src/control/integration-ops.ts` — `subagent_spawn` case (~line 804)
- `packages/models/src/invocation-merge.ts` — `mergeSubagentSpawnModelSelection()` signature change

### Phase 3: Turn code reads primary model from session row

Refactor `executeSessionAgentTurn` to read the primary model from the session row instead of re-deriving it from config. Config is still used for the failover chain and provider definitions.

- Read `getSessionPrimaryModelRef(session)` at the top of the turn.
- If present: build failover chain as `[sessionModelRef, ...configChainFiltered]`. Pass this modified config to `createToolClient()`.
- Remove the awkward `selModel` / `includes("/")` conditional logic (~lines 270-280).
- Update `resolveImageBlockCodec()` to accept an optional primary provider id from the session row, falling back to the first failover chain entry.
- Fix the "model call started" log line to always show the session row's model ref in `providerId/model` format.
- Remove the second `resolveModel()` call that was used only for the log line and `ctxWindowTokens`.

**Files:**
- `packages/daemon/src/sessions/session-agent-turn.ts` — main refactor (~lines 248-378)
- `packages/daemon/src/sessions/model-resolution.ts` — add `resolveModelFromSessionRef()` variant that accepts a pre-resolved primary ref and walks the failover chain only on failure

### Phase 4: `session_model` op validation

Tighten the `session_model` control op to validate the `model` field format.

- When `model_selection.model` is provided, validate it's in `providerId/model` format (must contain exactly one `/` with non-empty parts on both sides).
- Validate the referenced provider exists in the current config (log a warning if not, but don't hard-error — the provider might be added later via config reload).
- Return the resolved model ref in the response for operator confirmation.

**Files:**
- `packages/daemon/src/control/integration-ops.ts` — `session_model` case (~line 1611)

### Phase 5: Remove redundant config resolution from turn path

After phases 1-4, audit the turn path and remove remaining calls to `resolveEffectiveModelsConfig()` that are no longer needed for primary model resolution.

- `resolveEffectiveModelsConfig()` is still called once per turn for: failover chain provider definitions, `defaultInvocation` merging, compaction model, retry config. This is acceptable.
- Remove the standalone `resolveModel()` call used for `ctxWindowTokens` lookup — use the session's model ref directly with `getModelContextWindowTokens()` by parsing the `providerId` and `model` from the ref.
- Verify no other code paths in the turn still derive the primary model from config.

**Files:**
- `packages/daemon/src/sessions/session-agent-turn.ts`
- `packages/daemon/src/sessions/model-resolution.ts`

## Testing Strategy

### Unit tests

- `resolveBootstrapModelRef()`: given various config shapes (single provider, failover chain, per-agent overrides), returns the correct `providerId/model` ref.
- `getSessionPrimaryModelRef()`: extracts `model` from `modelSelection`; rejects bare names without `/`.
- `mergeSubagentSpawnModelSelection()` with explicit `modelRef`: output always contains `model` field; invocation params merge correctly; `modelRef` wins over parent's `model`.
- `session_model` validation: rejects bare model names, accepts `providerId/model` format, warns on unknown provider.

### Integration tests

- Bootstrap a session → verify `model_selection_json` contains `model` in `providerId/model` format.
- Spawn a subagent with `subagentModel` config → verify the child session's `model_selection_json.model` matches the configured subagent model.
- Spawn a subagent without `subagentModel` → verify it inherits from parent or falls back to config default.
- Run a turn on a session with `model` in `model_selection_json` → verify the failover client is constructed with that ref as primary.
- Use `session_model` to change a session's model → verify next turn uses the new model.
- Hot-reload config with a different default model → verify existing sessions are unaffected; new sessions use the new config.
- Primary provider marked failed → verify failover walks the config chain past the session's primary.

### Manual verification

- Use `session_model` to switch a running session's model mid-conversation → confirm the switch is immediate and the log line reflects it.
- Verify the "model call started" log line always shows `providerId/model` format, never a bare name.

## Considerations

- **The failover chain still comes from config each turn.** This is intentional — providers can be added/removed dynamically, and the failover chain reflects the current provider landscape. Only the *primary* model is pinned to the session row.
- **`resolveEffectiveModelsConfig()` is not eliminated.** It's still called once per turn for the failover chain, provider definitions, retry config, and `defaultInvocation`. The win is that it no longer determines the primary model, reducing the blast radius of config changes on running sessions.
- **Compaction model resolution** (`modelsForSession.compaction.model`) is separate from the session's primary model and continues to come from config. This is correct — compaction is an infrastructure concern, not a session-level choice.
- **The `auto` model sentinel** (if used in config's `model` field) must be resolved to a concrete ref at bootstrap time, not stored as `auto` in the session row.
- **`model_selection_json` size:** Adding a guaranteed `model` field is negligible overhead on the existing JSON blob.
- **Future optimization:** Once the primary model is pinned to the session row, `resolveEffectiveModelsConfig()` results could be cached per config version rather than recomputed each turn. This is deferred but enabled by this change.

## Migration

No schema migration is needed. The `model_selection_json` column already accepts arbitrary JSON. The change is purely in what the application writes to and reads from this column.

State DB should be wiped on deploy. Sessions without a `model` field in `model_selection_json` are not supported after this change — pre-release, no backward compatibility needed.
