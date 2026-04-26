---
date: 2026-04-03
completed: 2026-04-03
---

# `show` tool — explicit content block surfacing

## Summary

Add a built-in `show` tool that lets the model explicitly surface content blocks (images, files, audio) to the user. The platform reply path extracts blocks from `show` tool results only — other tool results stay invisible regardless of what they contain. Provider capability gating ensures image blocks in transcript history are stripped when the active provider doesn't support image input.

## Motivation

Claude models cannot generate image content blocks natively. The only way to surface visual content to the user is through tool-mediated injection: the model calls a tool that resolves an image (from a path, URL, or base64 bytes), and the platform layer attaches it to the outbound reply. Without an explicit tool for this, there's no clean way for the model to say "show this to the user" vs "I'm reading this for my own context." A dedicated `show` tool gives the model that control and keeps the architecture extensible for future block types (files, audio, etc.).

Additionally, image blocks stored in the transcript are replayed on every subsequent model call. If the active provider doesn't support image input (or the session fails over to a non-vision model), these blocks cause 400 errors. A provider capability gating layer is needed regardless of the `show` tool, but the two features are tightly coupled and should ship together.

## Design

### `show` tool interface

A single built-in tool with a `type` discriminator and flexible input:

```ts
interface ShowToolParams {
  /** Block type discriminator. */
  readonly type: "image"; // future: "file", "audio"
  /** Local file path. */
  readonly path?: string;
  /** Remote URL. */
  readonly url?: string;
  /** Raw base64-encoded bytes. */
  readonly base64?: string;
  /** MIME type. Required with base64; inferred for path/url. */
  readonly mediaType?: string;
  /** Display filename. Inferred from path/url if omitted. */
  readonly filename?: string;
}
```

At least one of `path`, `url`, or `base64` must be provided. The tool accepts an array of inputs for multi-block calls (gallery-style). Captions are left to the model's text reply — no special caption handling in the platform layer.

**Return value:** `contentParts: ChatContentPart[]` containing the resolved block(s). The `resultJson` carries a lightweight confirmation:

```json
{ "ok": true, "type": "image", "count": 2, "totalBytes": 68210 }
```

### Block resolver registry

Each block type registers a resolver function:

```ts
type BlockResolver = (params: ShowToolParams) => Promise<ResolvedBlock>;

type ResolvedBlock =
  | { readonly kind: "contentPart"; readonly parts: ChatContentPart[] }
  | { readonly kind: "attachment"; readonly attachments: OutboundAttachment[] };
```

Adding a new block type = adding a resolver + updating the `type` enum in the JSON schema.

### Image resolver

The `image` resolver normalizes input to a canonical `ImageBlock`:

- `path` → read file bytes, detect mediaType from magic bytes via `detectMediaTypeFromBytes`, base64-encode
- `url` → fetch, detect mediaType from magic bytes, base64-encode
- `base64` + `mediaType` → validate magic bytes match declared type, correct if mismatched

Reuses `detectMediaTypeFromBytes` from `image-ingest.ts` (currently module-private, needs to be exported). Enforces the existing `DEFAULT_MAX_BYTES` size cap.

### Outbound block extraction

After the tool loop completes and the final assistant text is ready:

1. Scan the current turn's tool results for entries where `tool.name === "show"`
2. Parse their `contentParts` (already JSON-serialized in the transcript)
3. Collect into `OutboundAttachment[]`
4. Pass to the platform adapter alongside the text reply

This lives in a new `extractShowBlocks` function called from the turn orchestrator's reply path.

```ts
interface OutboundAttachment {
  readonly filename: string;
  readonly mediaType: string;
  readonly data: Buffer;
}

function extractShowBlocks(turnToolResults: readonly TranscriptMessageRow[]): OutboundAttachment[];
```

### Platform adapter changes

`PlatformAdapter.sendBody` gains optional attachments:

```ts
interface SendBodyOptions {
  readonly replyTo?: string;
  readonly attachments?: readonly OutboundAttachment[];
}
```

The Discord adapter converts attachments to `AttachmentBuilder` instances and includes them in the message payload. For streaming replies, attachments are included with the final streamed chunk — not sent as a follow-up message.

### Provider capability gating

Image blocks in `show` tool results get stored in the transcript and replayed on subsequent turns. If the active provider doesn't support image content, this causes 400 errors.

**Capability flag:** Extend `ImageBlockCodec` (or provider metadata) with a broader capability signal:

```ts
export interface ImageBlockCodec {
  encode(block: ImageBlock): unknown;
  decode(part: unknown): ImageBlock | null;
  readonly supportsUrl: boolean;
  /** Whether this provider accepts image content in messages. */
  readonly supportsImageInput: boolean;
}
```

All three existing codecs set `supportsImageInput: true`. Future text-only providers set it to `false`.

**Transcript sanitization:** A new pass in the model call path strips image blocks when the provider can't handle them:

```ts
function sanitizeTranscriptForProvider(
  messages: ChatMessage[],
  codec: ImageBlockCodec,
): ChatMessage[];
```

When `codec.supportsImageInput` is `false`, image blocks in any message role are replaced with a text placeholder: `[image: image/png, 34KB]`. This is analogous to `stripImageBlocksForCompaction` but applied at model-call time. It also protects against mid-conversation provider failover from a vision-capable model to one that isn't.

### Edge cases and failure modes

- **Fetch failure in resolver:** return a text error result to the model (`{"error": "fetch_failed", ...}`). Do not throw — let the model react.
- **Oversized image:** return a text error result explaining the size limit.
- **Unknown/unsupported image format:** return a text error result. Do not silently drop.
- **Magic bytes mismatch:** correct the mediaType silently (same fix as the inbound ingest path).
- **Multiple `show` calls in one turn:** all blocks from all `show` results are collected and attached.
- **`show` called but model aborts before final reply:** blocks are in the transcript but never delivered. Acceptable — they'll be visible if the turn is retried.
- **Provider without image support:** `sanitizeTranscriptForProvider` strips blocks before the model call. The `show` tool itself still works (blocks are stored and delivered to the user), but the model won't see them on subsequent turns.

### Security

- File reads via `path` are subject to existing filesystem sandboxing (same as the `read` tool).
- URL fetches are server-side. No user-controlled redirect chains beyond the resolved URL.
- Base64 payloads are bounded by the size cap.
- Image bytes are decoded from tool results and delivered to the platform; they are not persisted to the workspace filesystem.

## Implementation Phases

### Phase 1: Export `detectMediaTypeFromBytes` and add `supportsImageInput`

Extract the magic-byte detection function from `image-ingest.ts` into a shared location and export it. Add `supportsImageInput` to the codec interface and set it on all three existing codecs.

**Files:**

- `packages/daemon/src/presentation/image-ingest.ts` — move `detectMediaTypeFromBytes` to shared or export directly
- `packages/models/src/types.ts` — add `supportsImageInput` to `ImageBlockCodec`
- `packages/models/src/image-codec.ts` — set `supportsImageInput: true` on all three codecs

### Phase 2: Provider capability gating

Add `sanitizeTranscriptForProvider` and wire it into the model call path so image blocks are stripped when the provider can't handle them.

**Files:**

- `packages/daemon/src/sessions/transcript-to-chat.ts` — new `sanitizeTranscriptForProvider` function
- `packages/daemon/src/sessions/session-agent-turn.ts` — call sanitization before model invocation

### Phase 3: `show` tool and block resolver

Implement the tool definition, parameter validation, image resolver, and tool registration.

**Files:**

- `packages/daemon/src/tools/show-tool.ts` — new: tool definition, parameter validation, image resolver
- `packages/daemon/src/presentation/show-blocks.ts` — new: resolver registry, `ResolvedBlock` types
- Tool registration site — register `show` as a built-in tool

### Phase 4: Outbound block extraction and platform delivery

Extract `show` tool results from the current turn, convert to `OutboundAttachment[]`, wire into the platform reply path, and update the Discord adapter to send attachments.

**Files:**

- `packages/daemon/src/presentation/show-blocks.ts` — add `extractShowBlocks`
- `packages/daemon/src/presentation/turn-orchestrator.ts` — call extraction, pass attachments to `sendBody`
- `packages/daemon/src/presentation/platform-adapter.ts` — extend `sendBody` signature with optional attachments
- `packages/platform-discord/src/outbound.ts` — multipart message posting with file attachments
- `packages/platform-discord/src/streaming.ts` — final stream chunk with attachments

## Testing Strategy

- **Magic byte detection:** PNG, JPEG, WebP, GIF magic bytes all resolve to correct MIME types. Unknown bytes return `undefined`. Buffer shorter than 12 bytes returns `undefined`.
- **Provider sanitization:** transcript with image blocks + `supportsImageInput: false` codec → all image blocks replaced with text placeholders. With `supportsImageInput: true` → blocks pass through unchanged. Mixed content (text + image parts) retains text parts.
- **Image resolver:** `path` input reads file and returns correct `ImageBlock`. `url` input fetches and returns correct `ImageBlock`. `base64` input with mismatched mediaType gets corrected. Oversized input returns error result. Fetch failure returns error result.
- **`show` tool:** valid image params return `contentParts` with `ImageBlock` + confirmation `resultJson`. Invalid params (no path/url/base64) return error. Multiple inputs return multiple content parts.
- **Outbound extraction:** tool results from `show` are collected; tool results from other tools are ignored. Multiple `show` calls in one turn produce multiple attachments. Empty turn produces no attachments.
- **Platform delivery:** Discord adapter sends multipart form data with file attachments when `opts.attachments` is present. Streaming final chunk includes attachments. No attachments → existing behavior unchanged.

## Considerations

- **Future block types:** `file` and `audio` resolvers are not in scope. The resolver registry pattern supports adding them without changing the tool interface or platform plumbing.
- **Token estimation:** image blocks in `show` tool results consume tokens when replayed in transcript history. `estimateTokens` will undercount. Accurate image token estimation is deferred (same as the image-block-support plan).
- **Transcript bloat:** base64 images in tool results are ~33% larger than raw bytes. The size cap and compaction stripping mitigate this. A future optimization could store image bytes externally and reference them by hash.
- **Streaming UX:** attaching images to the final streamed chunk means the user sees the image only after the full text reply is complete. This is acceptable — there's no incremental image streaming protocol.
- **Model prompting:** the model needs to know the `show` tool exists and when to use it. The tool description in the schema should make the intent clear: "Use this tool to display images, files, or other content to the user."

## Migration

No schema migration required. The `show` tool is additive — no existing state or configuration is affected. The `supportsImageInput` flag defaults to `true` on all existing codecs, so no behavioral change for current sessions.
