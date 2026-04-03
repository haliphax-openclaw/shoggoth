---
date: 2026-04-03
completed: 2026-04-03
---

# Image block support

## Summary

Add image content block support across the model, presentation, and tool layers. Model providers expose codec functions for translating between a canonical internal image representation and their provider-specific wire format. The presentation layer converts inbound platform attachments to image blocks (with URL passthrough where the provider supports it) and converts outbound image blocks in assistant replies to platform file attachments. The `read` tool returns provider-native image blocks when reading image files. First release covers OpenAI-compatible, Anthropic Messages, and Gemini.

## Motivation

All content flowing through Shoggoth today is text-only. `ChatMessage.content` is `string | null`, inbound Discord attachments are reduced to metadata text, and the `read` tool returns file content as UTF-8 — binary files are garbage. Models from all three supported providers have had vision capabilities for over a year. Without image block support, agents cannot see screenshots, diagrams, photos, or any visual content shared by operators or present in the workspace.

## Design

### Canonical image type

A provider-agnostic representation lives in `@shoggoth/models/types.ts`:

```ts
export interface ImageBlock {
  readonly type: "image";
  /** e.g. "image/jpeg", "image/png", "image/gif", "image/webp" */
  readonly mediaType: string;
  /** Raw image bytes, base64-encoded (no data-URI prefix). Omitted when url is set and the provider supports URL passthrough. */
  readonly base64?: string;
  /** Source URL for the image. When set, providers that support URL sources use this directly instead of base64. */
  readonly url?: string;
}
```

At least one of `base64` or `url` must be present. When both are present, the codec chooses the optimal encoding for its provider.

### Structured content in `ChatMessage`

`ChatMessage.content` becomes a union:

```ts
export type ChatContentPart =
  | { readonly type: "text"; readonly text: string }
  | ImageBlock;

export interface ChatMessage {
  readonly role: ChatRole;
  readonly content?: string | ChatContentPart[] | null;
  // ... existing fields unchanged
}
```

When `content` is a `string`, all existing serialization paths are unchanged. When it is `ChatContentPart[]`, provider serializers emit structured content blocks.

### Image block codec interface

Each provider module exports an `ImageBlockCodec`:

```ts
export interface ImageBlockCodec {
  /** Canonical ImageBlock → provider wire JSON content part. */
  encode(block: ImageBlock): unknown;
  /** Provider wire content part → canonical ImageBlock, or null if not an image part. */
  decode(part: unknown): ImageBlock | null;
  /** Whether this provider supports URL-based image sources (skip base64 fetch). */
  readonly supportsUrl: boolean;
}
```

A registry function resolves the codec for a provider kind:

```ts
export function getImageBlockCodec(
  kind: "openai-compatible" | "anthropic-messages" | "gemini",
): ImageBlockCodec;
```

### Provider wire formats

**OpenAI-compatible** (`supportsUrl: true`):

```ts
// encode — prefer URL when available
block.url
  ? { type: "image_url", image_url: { url: block.url } }
  : { type: "image_url", image_url: { url: `data:${mediaType};base64,${base64}` } }

// decode — parse data URI or plain URL from image_url.url
```

**Anthropic Messages** (`supportsUrl: true`):

```ts
// encode — prefer URL when available
block.url
  ? { type: "image", source: { type: "url", url: block.url } }
  : { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }

// decode — match type === "image", handle both source.type === "base64" and source.type === "url"
```

**Gemini** (`supportsUrl: false`):

```ts
// encode — always base64 (Gemini has no URL source; fileData requires File API upload)
{ inlineData: { mimeType: mediaType, data: base64 } }

// decode — match presence of inlineData with mimeType + data
```

When a provider has `supportsUrl: false` and the `ImageBlock` only has a `url` (no `base64`), the caller must fetch and populate `base64` before encoding. This is handled by the image ingest layer (see below).

### Image URL passthrough

For inbound platform attachments, the image ingest layer checks `codec.supportsUrl`:

- **`supportsUrl: true` (OpenAI, Anthropic):** build an `ImageBlock` with only `url` set (the platform CDN URL). No fetch, no base64 encoding. This saves memory, latency, and avoids bloating the transcript with large base64 payloads.
- **`supportsUrl: false` (Gemini):** fetch the attachment URL, read bytes, base64-encode, and build an `ImageBlock` with `base64` set.

For the `read` tool (local files), there is no URL — `base64` is always populated.

### Message mapping changes

Each provider's message mapping function must handle `ChatContentPart[]` content:

- `serializeChatMessage` (OpenAI): when `content` is an array, emit `content: [...]` with text and `image_url` parts instead of a plain string.
- `mapChatMessagesToAnthropicPayload`: when user `content` is an array, emit content blocks array. Text blocks use `{ type: "text", text }`, image blocks use the Anthropic codec.
- `mapChatMessagesToGeminiPayload`: when user `content` is an array, emit multiple `parts` (text + `inlineData`) instead of a single text part.

When `content` is a plain string, existing serialization is untouched — zero behavioral change.

### Tool result content parts

The tool loop needs to pass structured content (not just a JSON string) when a tool returns image data. Extend the tool executor return type:

```ts
export interface ToolExecuteResult {
  readonly resultJson: string;
  /** When set, the tool result message uses structured content instead of resultJson. */
  readonly contentParts?: ChatContentPart[];
}
```

The tool loop's `pushToolMessage` path sets the tool message's `content` to the structured array when `contentParts` is present. Each provider's message mapper already needs to handle `ChatContentPart[]` content (from the user message work above), so tool messages with image parts serialize correctly with no additional provider changes.

### `read` tool image detection

`readHandler` in `fs-handlers.ts` checks the file extension against an image allowlist. When matched:

1. Read the file as raw bytes (not UTF-8), base64-encode.
2. Build a canonical `ImageBlock` (with `base64`, no `url`).
3. Return `contentParts` with the image block and a text part containing the path metadata.
4. Files above a size cap (default 20 MB) return a text error instead.

The `BuiltinToolContext` carries the active `ImageBlockCodec` (or `undefined` when the provider doesn't support images), wired from `executeSessionAgentTurn` where the provider kind is already resolved.

### Inbound attachment → image block (presentation layer)

New module `packages/daemon/src/presentation/image-ingest.ts`:

```ts
export interface ImageIngestOptions {
  readonly codec: ImageBlockCodec;
  readonly maxBytes?: number;
  readonly fetchImpl?: FetchLike;
}

/** Convert a platform attachment to a canonical ImageBlock. */
export async function ingestAttachmentImage(
  attachment: MessageAttachment,
  options: ImageIngestOptions,
): Promise<ImageBlock | null>;
```

- Checks `contentType` or infers from filename extension against the allowlist.
- If `codec.supportsUrl` is `true`, returns `{ type: "image", mediaType, url: attachment.url }` — no fetch.
- If `codec.supportsUrl` is `false`, fetches the URL, reads bytes, base64-encodes, returns `{ type: "image", mediaType, base64 }`.
- Returns `null` for non-images, oversized files, or fetch failures.

The inbound turn path (presentation turn orchestrator) calls this for each attachment on the `InternalMessage`. Resolved image blocks are prepended to the user content as `ChatContentPart[]`. Non-image attachments keep the existing `formatAttachmentMetadata` text fallback.

### Outbound image blocks → platform attachments

When the model emits assistant content containing `ChatContentPart[]` with image blocks, the presentation layer extracts them and converts them to platform attachments.

New module `packages/daemon/src/presentation/image-outbound.ts`:

```ts
export interface OutboundImageResult {
  /** Text content with image blocks removed (replaced with nothing or a caption). */
  readonly textContent: string;
  /** Extracted image attachments ready for platform delivery. */
  readonly imageAttachments: OutboundImageAttachment[];
}

export interface OutboundImageAttachment {
  readonly filename: string;
  readonly mediaType: string;
  readonly bytes: Buffer;
}

/**
 * Extract image blocks from assistant content, decode to raw bytes,
 * and return cleaned text + attachment list.
 */
export function extractOutboundImages(
  content: string | ChatContentPart[] | null,
  codec: ImageBlockCodec,
): OutboundImageResult;
```

For image blocks with `base64`, decode to `Buffer` directly. For image blocks with only `url`, fetch the URL and read bytes. Filenames are generated as `image-{index}.{ext}`.

### Platform adapter changes for outbound attachments

Extend `PlatformAdapter.sendBody` to accept optional attachments:

```ts
export interface OutboundAttachment {
  readonly filename: string;
  readonly contentType: string;
  readonly data: Buffer;
}

export interface PlatformAdapter {
  sendBody(
    sessionId: string,
    body: string,
    opts?: { replyTo?: string; attachments?: OutboundAttachment[] },
  ): Promise<void>;
  // ... rest unchanged
}
```

The Discord outbound implementation uses Discord's multipart `POST /channels/{id}/messages` with file attachments. The `StreamHandle.setFullContent` final patch also needs an attachment variant for streamed replies that end with images.

### Reply formatter integration

The reply formatter (`reply-formatter.ts`) calls `extractOutboundImages` on the final assistant content before passing to `sendBody`. The text portion gets the existing formatting (degraded prefix, model tag, etc.), and the extracted attachments are passed through as `opts.attachments`.

### Transcript storage

`TranscriptMessageRow.content` is a string column. When content is `ChatContentPart[]`, store it as a JSON-serialized string. `transcriptRowsToModelChatMessages` detects JSON arrays vs plain strings:

```ts
function parseTranscriptContent(raw: string): string | ChatContentPart[] {
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0]?.type === "string") {
        return parsed as ChatContentPart[];
      }
    } catch { /* fall through */ }
  }
  return raw;
}
```

No schema migration needed — the column type is already text.

### Compaction

Image blocks in compacted transcript segments are replaced with `[image omitted]` text parts. The summarization request must not include large base64 payloads. URL-only image blocks are also replaced (the summarizer doesn't need to see images).

### Image MIME constants

Shared constants (in `@shoggoth/shared`):

```ts
export const IMAGE_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
]);

export const IMAGE_EXTENSION_TO_MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
};

export const IMAGE_MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": ".jpg", "image/png": ".png",
  "image/gif": ".gif", "image/webp": ".webp",
};
```

### Edge cases and failure modes

- **Fetch failure on inbound attachment (non-passthrough):** log warning, fall back to text metadata. Do not block the turn.
- **Oversized image in `read` tool:** return a text error result explaining the size limit.
- **Unknown/unsupported image format:** treat as non-image, return text content or metadata.
- **Provider without image support:** if `imageBlockCodec` is `undefined` on `BuiltinToolContext`, `read` returns a text error: `"Image content not supported by the active model provider."`.
- **Compaction with images:** strip to placeholder before summarization call.
- **Multiple images in one message:** supported from day one — `ChatContentPart[]` is a list.
- **URL-only ImageBlock on a non-URL provider:** the ingest layer prevents this by checking `codec.supportsUrl` before building the block. If it somehow occurs at encode time, the codec throws.
- **CDN URL expiry (URL passthrough):** Discord CDN URLs are signed and may expire. For long-lived transcript replay this could be an issue, but for the immediate model request the URL is fresh. Acceptable tradeoff — base64 fallback can be added later if needed.
- **Outbound image decode failure:** if base64 decode fails, log warning and skip the attachment; deliver text-only reply.
- **Outbound URL-only image block:** fetch the URL to get bytes for the platform attachment. If fetch fails, skip with a `[image unavailable]` placeholder.

### Security

- Attachment URLs are fetched server-side (no user-controlled redirect chains beyond the platform CDN).
- Base64 payloads are bounded by the size cap.
- Image bytes are never written to the workspace by the ingest path — they exist only in transcript content and model requests.
- Outbound image bytes are decoded from model output and delivered to the platform; they are not persisted to the workspace filesystem.

## Implementation Phases

### Phase 1: Model types and codecs

Introduce `ImageBlock`, `ChatContentPart`, `ImageBlockCodec`, and the three provider codec implementations with URL passthrough support. No message mapping changes yet — this phase is pure types and codec functions with full test coverage.

**Files:**
- `packages/models/src/types.ts` — `ImageBlock`, `ChatContentPart`, `ImageBlockCodec`
- `packages/models/src/image-codec.ts` — new: codec implementations + `getImageBlockCodec`
- `packages/models/src/index.ts` — re-exports
- `packages/shared/src/image.ts` — new: `IMAGE_MIME_TYPES`, `IMAGE_EXTENSION_TO_MIME`, `IMAGE_MIME_TO_EXTENSION`
- `packages/shared/src/index.ts` — re-exports
- `packages/models/test/image-codec.test.ts` — new: round-trip encode/decode tests per provider, URL vs base64 encoding preference, `supportsUrl` behavior

### Phase 2: Provider message mapping

Update each provider's message serializer to handle `ChatContentPart[]` content on user, assistant, and tool messages.

**Files:**
- `packages/models/src/openai-compatible.ts` — `serializeChatMessage` handles array content
- `packages/models/src/anthropic-messages.ts` — `mapChatMessagesToAnthropicPayload` handles array content
- `packages/models/src/gemini.ts` — `mapChatMessagesToGeminiPayload` handles array content
- `packages/models/test/openai-compatible.test.ts` — mixed text+image message tests
- `packages/models/test/anthropic-messages.test.ts` — mixed text+image message tests
- `packages/models/test/gemini.test.ts` — mixed text+image message tests

### Phase 3: Tool loop structured content

Extend `ToolExecuteResult` with `contentParts`, update the tool loop to pass structured content through to tool messages, and update transcript storage/retrieval to handle `ChatContentPart[]`.

**Files:**
- `packages/daemon/src/sessions/tool-loop.ts` — handle `contentParts` in tool result → tool message
- `packages/daemon/src/sessions/transcript-to-chat.ts` — `parseTranscriptContent` for structured content
- `packages/daemon/src/sessions/builtin-tool-registry.ts` — extend `BuiltinToolContext` with `imageBlockCodec`
- `packages/daemon/src/sessions/session-agent-turn.ts` — wire `imageBlockCodec` into context
- `packages/daemon/test/sessions/tool-loop.test.ts` — structured content tool result tests
- `packages/daemon/test/sessions/session-agent-turn.test.ts` — codec wiring test

### Phase 4: `read` tool image support

Detect image files in `readHandler`, read as bytes, return provider-native image blocks via the codec.

**Files:**
- `packages/daemon/src/sessions/builtin-handlers/fs-handlers.ts` — image detection + codec-aware result
- `packages/os-exec/src/tools.ts` — `toolReadBinary` helper (read file as `Buffer` instead of UTF-8)
- `packages/daemon/test/sessions/builtin-handlers.test.ts` — image read tests with mock filesystem

### Phase 5: Inbound attachment image ingestion

Fetch platform attachments (or pass through URLs), convert to image blocks, enrich user messages before transcript storage. URL passthrough is codec-driven: URL-capable providers skip the fetch.

**Files:**
- `packages/daemon/src/presentation/image-ingest.ts` — new: `ingestAttachmentImage` with URL passthrough
- `packages/daemon/src/presentation/turn-orchestrator.ts` — call image ingest for attachments
- `packages/daemon/test/presentation/image-ingest.test.ts` — new: URL passthrough tests, base64 fallback tests, fetch mock tests
- `packages/daemon/test/presentation/turn-orchestrator.test.ts` — attachment enrichment tests

### Phase 6: Outbound image blocks → platform attachments

Extract image blocks from assistant replies, decode to raw bytes, deliver as platform file attachments alongside the text reply.

**Files:**
- `packages/daemon/src/presentation/image-outbound.ts` — new: `extractOutboundImages`
- `packages/daemon/src/presentation/reply-formatter.ts` — integrate `extractOutboundImages` before `sendBody`
- `packages/daemon/src/presentation/platform-adapter.ts` — add `attachments` to `sendBody` opts
- `packages/platform-discord/src/outbound.ts` — multipart message posting with file attachments
- `packages/platform-discord/src/streaming.ts` — final stream patch with attachments
- `packages/daemon/test/presentation/image-outbound.test.ts` — new: extraction tests, base64 decode, URL fetch fallback
- `packages/daemon/test/presentation/reply-formatter.test.ts` — outbound attachment integration tests
- `packages/platform-discord/test/discord-platform.test.ts` — multipart outbound tests

### Phase 7: Compaction safety

Strip image blocks from transcript content before summarization requests.

**Files:**
- `packages/daemon/src/transcript-compact.ts` — strip image blocks to `[image omitted]`
- `packages/daemon/test/transcript-compact.test.ts` — compaction with image content tests

## Testing Strategy

- **Codec round-trips:** for each provider, `decode(encode(block))` returns the original `ImageBlock` for all four MIME types. Test both base64 and URL variants. Verify URL-capable codecs prefer URL when both are present. Verify Gemini codec throws when given a URL-only block.
- **Message mapping:** each provider serializer produces correct wire JSON for messages with `ChatContentPart[]` content (text-only, image-only, mixed, URL-based, base64-based). Verify backward compat: plain string content produces identical output to today.
- **Tool loop:** a tool returning `contentParts` with an image block produces a tool message with structured content that round-trips through transcript storage and back to `ChatMessage`.
- **`read` handler:** reading a `.png` file returns structured content with an image block; reading a `.txt` file returns plain text (unchanged); reading an oversized image returns a text error.
- **Image ingest (URL passthrough):** with an OpenAI/Anthropic codec, ingest returns a URL-only `ImageBlock` without fetching. With a Gemini codec, ingest fetches and returns a base64 `ImageBlock`. Non-image attachments return `null`. Fetch failures return `null` without throwing.
- **Image outbound:** assistant content with image blocks produces correct `OutboundImageResult` — text cleaned, attachments extracted with correct filenames and bytes. URL-only outbound blocks trigger a fetch. Decode failures are skipped gracefully.
- **Platform outbound:** Discord outbound sends multipart form data with file attachments when `opts.attachments` is present.
- **Compaction:** transcript with image blocks compacts to text-only with `[image omitted]` placeholders.
- **Integration:** inbound Discord message with a JPEG attachment → transcript stores `ChatContentPart[]` → model receives provider-native image block in the user message. Assistant reply with image block → Discord message with file attachment.

## Considerations

- **Token estimation:** image blocks consume tokens differently per provider (OpenAI uses tile-based counting, Anthropic uses pixel-based). `estimateTokens` in session stats will undercount for image messages. Accurate image token estimation is deferred.
- **Video, audio, PDF:** not in scope. The `ImageBlock` type and codec pattern extend naturally to other modalities later.
- **Streaming image deltas:** not a thing — images arrive as complete blocks, not streamed incrementally.
- **Transcript size:** URL-passthrough images are lightweight in the transcript (just a URL string). Base64 images are ~33% larger than raw bytes. A 10 MB image becomes ~13 MB of transcript text. The size cap and compaction stripping mitigate this.
- **CDN URL expiry:** Discord CDN URLs are signed and may expire after some time. For the immediate model request the URL is fresh. If transcript replay or long-lived context becomes an issue, a background job could lazily fetch and replace URL-only blocks with base64. Not in scope for this plan.
- **Image generation:** model-initiated image creation (e.g. DALL-E, Imagen) is a separate feature and not covered here. This plan covers image *understanding* (inbound) and image *passthrough* (outbound blocks the model includes in its reply).

## Migration

No schema migration required. The `content` column in `transcript_messages` is already `TEXT` and can store JSON arrays. Existing plain-string content is handled transparently by the parsing logic. No state wipe needed.
