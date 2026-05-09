---
date: 2026-05-09
completed: never
---

# Multi-Provider Media Generation

## Summary

Replace the Gemini-only media generation system with a provider-agnostic architecture driven entirely by configuration. Support OpenAI-compatible image endpoints, chat-completions-with-image-output, and async video generation via polling — covering the full spread of models available through gateways like OpenRouter.

## Motivation

The current media generation system is hardcoded to Gemini at three layers: tool injection, control plane validation, and the service/adapter layer. This locks out a large and growing ecosystem of media models available through OpenAI-compatible APIs (FLUX.2, Recraft, Hailuo, Kling, Sora, Seedance, etc.). OpenRouter alone exposes 18+ image models and 13+ video models behind a unified API.

Rather than adding provider-specific adapters one by one, this plan targets the OpenAI compatibility standard as the protocol layer. Any provider that speaks the standard endpoints works without code changes — only configuration.

## Design

### Architecture

```
Agent/Operator
    │
    ├─ builtin-media-generate (tool)
    ├─ shoggoth media generate (CLI)
    │
    ▼
control plane op: media_generate
    │
    ▼
MediaGenerationService
    ├─ resolves provider + adapter from config
    │
    ├─ OpenAI Images Adapter         POST /images/generations (sync)
    ├─ OpenAI Chat Image Adapter     POST /chat/completions (image in response)
    ├─ OpenAI Video Async Adapter    POST /chat/completions → poll generation_id
    ├─ Gemini GenerateContent Adapter (existing)
    ├─ Gemini Predict Adapter         (existing)
    └─ Gemini LongRunning Adapter     (existing)
    │
    ▼
Result: file written to workspace
    │
    ▼
Surfaced via builtin-show / platform attachment
```

### Configuration-Driven Routing

All routing decisions come from the `mediaGeneration` config section. No hardcoded model-to-adapter map. No hardcoded provider kind checks.

The config declares:

1. **Providers** — independent from LLM providers. Each has an id, kind (for auth/URL scheme), baseUrl, and apiKey.
2. **Models** — a list of pattern-matched entries mapping model names to a provider and adapter type.
3. **Adapter defaults** — per-adapter-type settings (e.g. polling interval/timeout for async adapters).

If `mediaGeneration` is absent or has no providers/models, the `builtin-media-generate` tool is not injected and the feature is disabled.

### Adapter Types

Six adapter types, identified by string:

| Adapter                   | Protocol                                              | Sync/Async | Use Case                           |
| ------------------------- | ----------------------------------------------------- | ---------- | ---------------------------------- |
| `openai-images`           | `POST /images/generations`                            | Sync       | FLUX, Recraft, Seedream, Riverflow |
| `openai-chat-image`       | `POST /chat/completions` (image output parts)         | Sync       | GPT-5 Image, GPT-5.4 Image 2       |
| `openai-video-async`      | `POST /chat/completions` → poll `GET /generation?id=` | Async      | Hailuo, Kling, Sora, Seedance, Wan |
| `gemini-generate-content` | Gemini `generateContent`                              | Sync       | Nano Banana, TTS, Lyria            |
| `gemini-predict`          | Gemini `predict`                                      | Sync       | Imagen                             |
| `gemini-long-running`     | Gemini `predictLongRunning` + poll                    | Async      | Veo                                |

### Provider Kind

The provider `kind` determines auth headers and URL construction:

| Kind                | Auth                                           | URL Pattern                                                  |
| ------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| `openai-compatible` | `Authorization: Bearer {apiKey}`               | `{baseUrl}/images/generations`, `{baseUrl}/chat/completions` |
| `gemini`            | `x-goog-api-key` header or `?key=` query param | `{baseUrl}/{apiVersion}/models/{model}:generateContent`      |

### Model Pattern Matching

Models are matched by glob-style patterns evaluated in declaration order (first match wins):

- `black-forest-labs/*` — matches any model starting with `black-forest-labs/`
- `minimax/hailuo*` — matches `minimax/hailuo-2.3`, `minimax/hailuo-2.3-fast`, etc.
- `gemini-*-image` — matches `gemini-2.5-flash-image`, `gemini-3-pro-image-preview` (if using `*` as wildcard)
- Exact match: `veo-3.1-generate-preview`

### Tool Injection

The `createMediaGenerateToolFinalizer` checks whether `config.mediaGeneration.providers` has at least one entry and `config.mediaGeneration.models` has at least one entry. If both are present, the tool is injected. No provider-kind check.

### Control Plane Validation

The `media_generate` op validates:

1. The requested model matches a configured pattern
2. The resolved provider exists in `mediaGeneration.providers`
3. The resolved adapter type is known

No `kind === "gemini"` gate.

### Async Polling

For async adapters (`openai-video-async`, `gemini-long-running`), the service:

1. Submits the generation request
2. Polls internally up to the configured timeout
3. Returns `in_progress` with an operation/generation ID if timeout is reached
4. The agent can poll later via `media_generate_poll`

Per-adapter defaults for polling:

```yaml
adapterDefaults:
  openai-video-async:
    pollIntervalMs: 5000
    timeoutMs: 300000
  gemini-long-running:
    pollIntervalMs: 10000
    timeoutMs: 300000
```

### Removal of Hardcoded State

- Delete `BUILTIN_MODEL_ADAPTER_MAP` from `media-generation-service.ts`
- Remove `kind === "gemini"` checks from `integration-ops.ts` and the service
- Remove `hasGemini` check from `createMediaGenerateToolFinalizer`
- Remove `mediaGeneration.modelAdapterMap` (replaced by `mediaGeneration.models`)
- Remove `mediaGeneration.defaultProviderId` (replaced by explicit provider in each model entry)

## Testing Strategy

- Unit tests for each new adapter (mocked fetch, verify request shape, response parsing, file writing)
- Unit tests for pattern matching / model resolution logic
- Unit tests for provider auth header construction per kind
- Integration tests for the control op (mock service, verify routing and validation)
- Integration test for tool injection (present when config has entries, absent when not)
- Manual verification: generate an image via OpenRouter (FLUX.2), generate a video via OpenRouter (Hailuo)

## Considerations

- **OpenRouter pricing** uses per-request flat fees for media models (not token-based). The cost model is different from LLM usage. Operators should be aware.
- **Rate limits** vary wildly between media providers. The existing resilience layer is not wired into media generation. This plan does not add retry/backoff to media adapters — surface errors clearly and let the agent/operator retry.
- **Response format detection** — OpenRouter's image endpoint can return `b64_json` or `url`. The adapter should handle both (download URL if given, decode base64 if given).
- **Video file sizes** can be large (50-200MB). The adapter downloads to disk streaming rather than buffering in memory.
- **No fallback/failover** between media providers. Each model maps to exactly one provider. Failover across media providers is out of scope.
- **Existing CLI and slash command** (`shoggoth media generate`, `/generate`) continue to work — they invoke the same control op. The CLI's `--provider` flag becomes optional (resolved from config).

## Migration

No data migration. The existing `mediaGeneration` config section is replaced wholesale. Existing deployments must update their config to the new schema to re-enable media generation. If the section is absent, the feature is disabled.

## References

- [`spec.md`](spec.md) — type signatures, interfaces, and code examples
- [`implementation.md`](implementation.md) — phased implementation steps
- [`plans/done/2026-04-23_media-generation/`](../done/2026-04-23_media-generation/README.md) — original Gemini-only media generation plan
