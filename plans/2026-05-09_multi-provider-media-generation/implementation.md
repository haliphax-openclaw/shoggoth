# Implementation

## Phase 1: Config Schema and Model Resolution

Establish the new configuration schema and the model resolution logic that routes a model name to a provider + adapter.

- Define `mediaGenerationConfigSchema` in the shared schema package
- Remove the old `mediaGeneration` schema fields (`defaultProviderId`, `modelAdapterMap`)
- Implement glob pattern matching for model entries
- Implement `resolveModel()` function
- Implement `resolveMediaProvider()` to extract apiKey (from field or env var)
- Unit tests for pattern matching and resolution

**Files:**

- `packages/shared/src/schema.ts` (replace `mediaGeneration` schema)
- `packages/daemon/src/media/resolve-model.ts` (new)
- `packages/daemon/src/media/resolve-model.test.ts` (new)

## Phase 2: Refactor MediaGenerationService

Rewrite the service to use config-driven routing instead of the hardcoded adapter map. The service becomes a thin dispatcher: resolve model → build adapter request → call adapter.

- Remove `BUILTIN_MODEL_ADAPTER_MAP`
- Remove `kind === "gemini"` checks
- Accept `MediaGenerationServiceConfig` (providers + models + adapterDefaults)
- Dispatch to adapter based on resolved `adapter` type
- Update `MediaAdapterRequest` to carry `ResolvedMediaProvider` instead of flat `apiKey`/`baseUrl`
- Refactor existing Gemini adapters to accept the new request shape
- Unit tests for service dispatch logic

**Files:**

- `packages/daemon/src/media/media-generation-service.ts` (rewrite)
- `packages/daemon/src/media/adapters/types.ts` (update `MediaAdapterRequest`)
- `packages/daemon/src/media/adapters/generate-content-adapter.ts` (update signature)
- `packages/daemon/src/media/adapters/predict-adapter.ts` (update signature)
- `packages/daemon/src/media/adapters/long-running-adapter.ts` (update signature)
- `packages/daemon/test/media/media-generation-service.test.ts` (rewrite)

## Phase 3: OpenAI Images Adapter

Implement the synchronous `/images/generations` adapter for dedicated image generation models (FLUX, Recraft, Seedream, Riverflow).

- Build request body (`model`, `prompt`, `n`, `size`, `response_format`)
- Map `aspectRatio` param to `size` string (e.g. `"16:9"` → `"1792x1024"`)
- Handle response: `b64_json` (decode + write) or `url` (download + write)
- Auth via `Authorization: Bearer`
- Unit tests with mocked fetch

**Files:**

- `packages/daemon/src/media/adapters/openai-images-adapter.ts` (new)
- `packages/daemon/test/media/openai-images-adapter.test.ts` (new)

## Phase 4: OpenAI Chat Image Adapter

Implement the chat-completions adapter for models that output images inline (GPT-5 Image family via OpenRouter).

- Build chat completions request with `modalities: ["text", "image"]`
- Parse response: extract image content parts (data URI or `image_url`)
- Decode base64 from data URI, write to file
- Handle case where model returns text-only (no image generated) — return error
- Unit tests with mocked fetch

**Files:**

- `packages/daemon/src/media/adapters/openai-chat-image-adapter.ts` (new)
- `packages/daemon/test/media/openai-chat-image-adapter.test.ts` (new)

## Phase 5: OpenAI Video Async Adapter

Implement the async video generation adapter with polling.

- Submit generation request via chat completions
- Extract `generation_id` from response header (`X-Generation-Id`) or body
- Poll `GET {baseUrl}/generation?id={generation_id}` at configured interval
- On completion: download video from URL, write to file
- On timeout: return `in_progress` with `operation_id` for later polling
- Stream download for large video files (pipe response body to file)
- Unit tests with mocked fetch (submit + poll sequence)

**Files:**

- `packages/daemon/src/media/adapters/openai-video-async-adapter.ts` (new)
- `packages/daemon/test/media/openai-video-async-adapter.test.ts` (new)

## Phase 6: Control Plane and Tool Injection

Update the control plane op and tool injection to use the new config-driven system.

- Remove `kind === "gemini"` validation from `media_generate` op in `integration-ops.ts`
- Remove `provider_id` from the control op payload (resolved internally)
- Construct `MediaGenerationService` from `config.mediaGeneration`
- Update `media_generate_poll` to resolve provider from model name
- Update `createMediaGenerateToolFinalizer` to check for any configured media provider/model
- Update `builtin-media-generate` handler to remove `resolveProviderId` (no longer needed)
- Integration tests for the control op with new routing

**Files:**

- `packages/daemon/src/control/integration-ops.ts` (update)
- `packages/daemon/src/sessions/session-mcp-tool-context.ts` (update finalizer)
- `packages/daemon/src/sessions/builtin-handlers/media-generate-handler.ts` (update)
- `packages/daemon/test/media/media-generate-control-op.test.ts` (update)

## Phase 7: CLI Update

Update the CLI `shoggoth media generate` command to work without `--provider` (resolved from config).

- Remove required `--provider` flag (keep as optional override for debugging)
- If `--provider` is given, validate it exists in `mediaGeneration.providers`
- Update help text and examples
- Update CLI tests

**Files:**

- `packages/cli/src/run-media.ts` (update)
- `packages/cli/test/run-media.test.ts` (update)

## Phase 8: Skill Documentation

Update the media generation skill file to document the full model catalog and new configuration.

- List available adapter types and their use cases
- Provide example invocations for each adapter type
- Document which models are available through OpenRouter vs direct Gemini

**Files:**

- `skills/media-generate.md` (rewrite)
