# Specification

## Interfaces

### Configuration Schema

```ts
const mediaGenerationProviderSchema = z.object({
  /** Unique identifier for this media provider. */
  id: z.string().min(1),
  /** Determines auth headers and URL construction. */
  kind: z.enum(["openai-compatible", "gemini"]),
  /** Base URL for API requests. */
  baseUrl: z.string().url(),
  /** API key (plaintext or env var reference). */
  apiKey: z.string().optional(),
  /** Environment variable name containing the API key. */
  apiKeyEnv: z.string().optional(),
  /** Gemini-specific: API version path segment. Default "v1beta". */
  apiVersion: z.string().optional(),
});

const mediaGenerationAdapterType = z.enum([
  "openai-images",
  "openai-chat-image",
  "openai-video-async",
  "gemini-generate-content",
  "gemini-predict",
  "gemini-long-running",
]);

const mediaGenerationModelEntry = z.object({
  /** Glob pattern matched against the model name. First match wins. */
  pattern: z.string().min(1),
  /** ID of the provider from mediaGeneration.providers. */
  provider: z.string().min(1),
  /** Which adapter protocol to use. */
  adapter: mediaGenerationAdapterType,
});

const mediaGenerationAdapterDefaults = z.object({
  /** Polling interval for async adapters. */
  pollIntervalMs: z.number().int().positive().optional(),
  /** Max time to poll before returning in_progress. */
  timeoutMs: z.number().int().positive().optional(),
});

const mediaGenerationConfigSchema = z.object({
  /** Media generation providers (independent from LLM providers). */
  providers: z.array(mediaGenerationProviderSchema).min(1),
  /** Model routing rules. Evaluated in order; first pattern match wins. */
  models: z.array(mediaGenerationModelEntry).min(1),
  /** Per-adapter-type default settings. */
  adapterDefaults: z.record(mediaGenerationAdapterType, mediaGenerationAdapterDefaults).optional(),
  /** Directory for generated media files. Default: "{workspacePath}/tmp/media". */
  outputDirectory: z.string().min(1).optional(),
});
```

Added to the top-level config schema as:

```ts
mediaGeneration: mediaGenerationConfigSchema.optional(),
```

### Adapter Request/Response Types

```ts
/** Resolved provider info passed to adapters. */
interface ResolvedMediaProvider {
  id: string;
  kind: "openai-compatible" | "gemini";
  baseUrl: string;
  apiKey: string;
  apiVersion?: string; // gemini only
}

/** Common adapter request. */
interface MediaAdapterRequest {
  model: string;
  prompt: string;
  provider: ResolvedMediaProvider;
  outputPath: string;
  params: MediaGenerateParams;
  adapterDefaults?: {
    pollIntervalMs?: number;
    timeoutMs?: number;
  };
}

/** Unchanged from current implementation. */
type MediaAdapterResult =
  | { status: "complete"; path: string; mime_type: string }
  | { status: "in_progress"; operation_id: string }
  | { status: "error"; error: string };
```

### Media Generation Service

```ts
interface MediaGenerationServiceConfig {
  providers: ResolvedMediaProvider[];
  models: MediaGenerationModelEntry[];
  adapterDefaults?: Record<string, { pollIntervalMs?: number; timeoutMs?: number }>;
}

interface MediaGenerateRequest {
  model: string;
  prompt: string;
  params: MediaGenerateParams;
  output_path: string;
  timeout_ms?: number;
}

interface MediaPollRequest {
  model: string; // needed to resolve provider
  operation_id: string;
  output_path?: string;
}

class MediaGenerationService {
  constructor(config: MediaGenerationServiceConfig);

  /** Resolve model → provider + adapter, then dispatch. */
  generate(req: MediaGenerateRequest): Promise<MediaAdapterResult>;

  /** Poll an async operation. */
  poll(req: MediaPollRequest): Promise<MediaAdapterResult>;
}
```

### Model Resolution

```ts
interface ResolvedModel {
  provider: ResolvedMediaProvider;
  adapter: MediaGenerationAdapterType;
}

/**
 * Match a model name against the ordered list of pattern entries.
 * Returns the first match or undefined.
 */
function resolveModel(
  model: string,
  models: MediaGenerationModelEntry[],
  providers: ResolvedMediaProvider[],
): ResolvedModel | undefined;
```

Pattern matching uses simple glob rules:

- `*` matches any sequence of characters (including `/`)
- Exact string match if no wildcards present
- Case-sensitive

## API / Function Signatures

### OpenAI Images Adapter

```ts
/**
 * POST {baseUrl}/images/generations
 *
 * Request body:
 * {
 *   "model": "black-forest-labs/flux.2-pro",
 *   "prompt": "A cabin at sunset",
 *   "n": 1,
 *   "size": "1024x1024",        // derived from aspectRatio
 *   "response_format": "b64_json"
 * }
 *
 * Response:
 * {
 *   "data": [
 *     { "b64_json": "..." }     // base64-encoded image
 *     // OR
 *     { "url": "https://..." }  // temporary URL to download
 *   ]
 * }
 */
async function openaiImagesAdapter(req: MediaAdapterRequest): Promise<MediaAdapterResult>;
```

### OpenAI Chat Image Adapter

```ts
/**
 * POST {baseUrl}/chat/completions
 *
 * Request body:
 * {
 *   "model": "openai/gpt-5-image",
 *   "messages": [{ "role": "user", "content": "Generate an image of..." }],
 *   "modalities": ["text", "image"]
 * }
 *
 * Response: standard chat completion with image content parts:
 * {
 *   "choices": [{
 *     "message": {
 *       "content": [
 *         { "type": "text", "text": "Here's your image" },
 *         { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
 *       ]
 *     }
 *   }]
 * }
 */
async function openaiChatImageAdapter(req: MediaAdapterRequest): Promise<MediaAdapterResult>;
```

### OpenAI Video Async Adapter

```ts
/**
 * Submit: POST {baseUrl}/chat/completions
 * {
 *   "model": "minimax/hailuo-2.3",
 *   "messages": [{ "role": "user", "content": "A drone shot..." }]
 * }
 *
 * Response includes generation_id header or body field.
 *
 * Poll: GET {baseUrl}/generation?id={generation_id}
 * Response:
 * {
 *   "status": "complete",
 *   "video_url": "https://..."
 * }
 * OR
 * {
 *   "status": "pending"
 * }
 */
async function openaiVideoAsyncAdapter(req: MediaAdapterRequest): Promise<MediaAdapterResult>;
```

### Existing Gemini Adapters

Signatures unchanged. The `MediaAdapterRequest` interface gains a `provider` field instead of flat `apiKey`/`baseUrl` — adapters extract what they need from it.

## Data Structures / Schemas

### Example Configuration

```jsonc
{
  "mediaGeneration": {
    "providers": [
      {
        "id": "openrouter",
        "kind": "openai-compatible",
        "baseUrl": "https://openrouter.ai/api/v1",
        "apiKeyEnv": "OPENROUTER_API_KEY",
      },
      {
        "id": "gemini",
        "kind": "gemini",
        "baseUrl": "https://generativelanguage.googleapis.com",
        "apiKeyEnv": "GEMINI_API_KEY",
      },
    ],
    "models": [
      // OpenAI-compatible image models (sync)
      { "pattern": "black-forest-labs/*", "provider": "openrouter", "adapter": "openai-images" },
      { "pattern": "sourceful/*", "provider": "openrouter", "adapter": "openai-images" },
      { "pattern": "recraft/*", "provider": "openrouter", "adapter": "openai-images" },
      {
        "pattern": "bytedance-seed/seedream*",
        "provider": "openrouter",
        "adapter": "openai-images",
      },

      // Chat-completions image models
      {
        "pattern": "openai/gpt-5-image*",
        "provider": "openrouter",
        "adapter": "openai-chat-image",
      },
      {
        "pattern": "openai/gpt-5.4-image*",
        "provider": "openrouter",
        "adapter": "openai-chat-image",
      },

      // Async video models
      { "pattern": "minimax/hailuo*", "provider": "openrouter", "adapter": "openai-video-async" },
      { "pattern": "kwaivgi/*", "provider": "openrouter", "adapter": "openai-video-async" },
      { "pattern": "openai/sora*", "provider": "openrouter", "adapter": "openai-video-async" },
      {
        "pattern": "bytedance/seedance*",
        "provider": "openrouter",
        "adapter": "openai-video-async",
      },
      { "pattern": "alibaba/wan*", "provider": "openrouter", "adapter": "openai-video-async" },

      // Gemini native
      { "pattern": "gemini-*-image*", "provider": "gemini", "adapter": "gemini-generate-content" },
      { "pattern": "gemini-*-tts*", "provider": "gemini", "adapter": "gemini-generate-content" },
      { "pattern": "lyria-*", "provider": "gemini", "adapter": "gemini-generate-content" },
      { "pattern": "imagen*", "provider": "gemini", "adapter": "gemini-predict" },
      { "pattern": "veo-*", "provider": "gemini", "adapter": "gemini-long-running" },
    ],
    "adapterDefaults": {
      "openai-video-async": {
        "pollIntervalMs": 5000,
        "timeoutMs": 300000,
      },
      "gemini-long-running": {
        "pollIntervalMs": 10000,
        "timeoutMs": 300000,
      },
    },
  },
}
```

### Control Plane Payload (unchanged shape, new routing)

```ts
// media_generate request — same interface as before
interface MediaGeneratePayload {
  model: string;
  prompt: string;
  params: MediaGenerateParams;
  output_path?: string;
  timeout_ms?: number;
}

// provider_id is NO LONGER in the payload.
// The service resolves it from config based on model pattern match.
```

### Builtin Tool Schema (updated)

```json
{
  "name": "builtin-media-generate",
  "description": "Generate images, audio, video, or music using configured media generation models",
  "parameters": {
    "type": "object",
    "properties": {
      "model": {
        "type": "string",
        "description": "Model identifier (e.g. black-forest-labs/flux.2-pro, minimax/hailuo-2.3, gemini-2.5-flash-image)"
      },
      "prompt": { "type": "string", "description": "Generation prompt" },
      "params": {
        "type": "object",
        "description": "Parameters discriminated by 'kind': image (aspectRatio), video (aspectRatio, durationSeconds), speech (voice), music (durationSeconds)",
        "required": ["kind"]
      },
      "output_path": {
        "type": "string",
        "description": "Workspace-relative output path. Auto-generated if omitted."
      },
      "show": {
        "type": "boolean",
        "description": "Surface the result to the user via builtin-show. Default true (images only)."
      },
      "timeout_ms": {
        "type": "number",
        "description": "Max poll time for async models before returning in_progress status."
      }
    },
    "required": ["model", "prompt", "params"]
  }
}
```

## Code Examples

### Model Resolution

```ts
const config: MediaGenerationServiceConfig = {
  providers: [
    {
      id: "openrouter",
      kind: "openai-compatible",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "sk-...",
    },
  ],
  models: [
    { pattern: "black-forest-labs/*", provider: "openrouter", adapter: "openai-images" },
    { pattern: "minimax/hailuo*", provider: "openrouter", adapter: "openai-video-async" },
  ],
};

const service = new MediaGenerationService(config);

// Image generation — resolves to openai-images adapter via openrouter provider
const result = await service.generate({
  model: "black-forest-labs/flux.2-pro",
  prompt: "A cabin at sunset in watercolor style",
  params: { kind: "image", aspectRatio: "16:9" },
  output_path: "/workspace/tmp/media/cabin.png",
});
// → { status: "complete", path: "/workspace/tmp/media/cabin.png", mime_type: "image/png" }

// Video generation — resolves to openai-video-async adapter
const videoResult = await service.generate({
  model: "minimax/hailuo-2.3",
  prompt: "Drone shot over a tropical island at golden hour",
  params: { kind: "video", durationSeconds: 8 },
  output_path: "/workspace/tmp/media/island.mp4",
});
// → { status: "in_progress", operation_id: "gen_abc123" }
// OR after polling completes:
// → { status: "complete", path: "/workspace/tmp/media/island.mp4", mime_type: "video/mp4" }
```

### Auth Header Construction

```ts
function buildAuthHeaders(provider: ResolvedMediaProvider): Record<string, string> {
  switch (provider.kind) {
    case "openai-compatible":
      return { Authorization: `Bearer ${provider.apiKey}` };
    case "gemini":
      return { "x-goog-api-key": provider.apiKey };
  }
}
```
