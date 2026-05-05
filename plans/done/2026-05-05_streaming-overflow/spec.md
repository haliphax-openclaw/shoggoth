# Specification

## Interfaces

### DiscordStreamHandle (expanded)

```ts
export interface DiscordStreamHandle {
  readonly messageId: string;

  /**
   * Incremental push: send the latest accumulated text to the user.
   * If the text fits in the current message, it is edited in place.
   * If it exceeds maxContentLength, overflow messages are created.
   */
  pushUpdate(text: string): Promise<void>;

  /**
   * Finalize: re-split the complete final text into chunks and reconcile
   * the message chain. Edits the original streaming message with chunk[0],
   * creates or edits overflow messages for chunks[1..n], and deletes any
   * stale overflow messages beyond chunks.length.
   */
  setFullContent(text: string): Promise<void>;
}
```

### DiscordStreamingOutbound (unchanged contract)

```ts
export interface DiscordStreamingOutbound {
  start(): Promise<DiscordStreamHandle>;
}
```

### DiscordStreamingOutboundConfig (unchanged)

```ts
export interface DiscordStreamingOutboundConfig {
  readonly transport: DiscordRestTransport;
  readonly capabilities: MessagingAdapterCapabilities;
  readonly channelId: string;
  readonly maxContentLength?: number;
  readonly thinkingDisplay?: ThinkingDisplayMode;
}
```

## Internal Types

```ts
interface OverflowMessage {
  messageId: string;
  /** Content last written to this overflow message (used for dedup on edit). */
  content: string;
}
```

## Function Signatures

### `createDiscordStreamingOutbound`

```ts
function createDiscordStreamingOutbound(
  config: DiscordStreamingOutboundConfig,
): DiscordStreamingOutbound;
```

Returns an outbound handle factory. The `start()` method posts a "…" placeholder and returns a `DiscordStreamHandle` that tracks overflow messages internally.

### `DiscordStreamHandle.pushUpdate`

```ts
async pushUpdate(text: string): Promise<void>;
```

1. Format `text` (thinking, table-ascii — same as `setFullContent`).
2. If `text.length <= maxContentLength`:
   - Edit the first/original message with `text`.
   - Delete any accumulated overflow messages (user deleted one character, now fits).
3. If `text.length > maxContentLength`:
   - Split the formatted text into chunks via `splitDiscordMessage`.
   - Edit the original message with `chunks[0]`.
   - For each subsequent chunk: if an overflow message exists at that index, edit it; otherwise create it and track the ID.

### `DiscordStreamHandle.setFullContent`

```ts
async setFullContent(text: string): Promise<void>;
```

Same logic as today but with overflow reconciliation:

1. Format `text` (thinking, table-ascii).
2. Split into chunks via `splitDiscordMessage`.
3. Edit original message with `chunks[0]`.
4. For `chunks[1..n]`: edit existing overflow messages at matching indices, or create new ones if none exist.
5. Delete any overflow messages whose index >= chunks.length.

## Changes to Existing Types

No existing types are changed. The `DiscordStreamHandle` interface gains `pushUpdate`. The `StreamHandle` interface in the presentation layer (`packages/daemon/src/presentation/platform-adapter.ts`) remains unchanged — it only uses `setFullContent`.

## Downstream Impact

### In inbound-session-turn.ts

The `onModelTextDelta` callback currently calls `streamPusher.push(sliced)` which chains through to `setFullContent(latest)`. This is the identity of the issue — push calls `setFullContent`. With the new design, `setFullContent` is still callable during streaming (via the pusher), but **it now handles the overflow case** by only editing the relevant chunk rather than the entire chain.

No change to the callback signature or the coalescing pusher — the fix is purely in how `setFullContent` behaves on the Discord side.

## Code Examples

### Short text (one edit)

```ts
const handle = await streaming.start(); // posts "…"
await handle.setFullContent("Hello."); // edits "…" → "Hello."
// No overflow messages created.
```

### Long text during streaming

```ts
const handle = await streaming.start(); // posts "…"

// Push 1: 100 chars
await handle.pushUpdate("a".repeat(100));
// → edits "…" → "aaa..."

// Push 2: 2500 chars (overflow)
await handle.pushUpdate("a".repeat(2500));
// → edits original with first 2000 chars
// → creates overflow message with remaining 500 chars

// Push 3: 3500 chars (two overflows)
await handle.pushUpdate("a".repeat(3500));
// → edits original with first 2000 chars
// → edits overflow[0] with next 1500 chars
// (fits in one overflow message)

// Final setFullContent: 3200 chars (final formatting changed length)
await handle.setFullContent("b".repeat(3200));
// → edits original with first 2000 chars
// → edits overflow[0] with remaining 1200 chars
// (no stale messages to clean up)
```
