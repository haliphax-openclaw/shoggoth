# Implementation

## Phase 1: Multi-Message Stream Handle

Extend `DiscordStreamHandle` with `pushUpdate` and track overflow messages internally. Keep `setFullContent` working as before but with overflow reconciliation.

**Files:**

- `packages/platform-discord/src/streaming.ts`
- `packages/platform-discord/test/streaming.test.ts`

**Tasks:**

1. **Refactor `createDiscordStreamingOutbound`** — extract the inner stream handle into an explicit class or closure with shared state (`messageId`, `overflowMessages: Map<number, OverflowMessage>`, `channelId`, `maxContentLength`, `transport`, `thinkingDisplay`).

2. **Add `pushUpdate` method** on the handle:
   - Format text (thinking, table-ascii) — same pipeline as `setFullContent`.
   - If `formattedText.length <= maxContentLength`:
     - `editMessage(channelId, messageId, { content: formattedText })`.
     - Delete all tracked overflow messages (`.deleteMessage`).
     - Clear overflow tracking map.
   - If `formattedText.length > maxContentLength`:
     - `splitDiscordMessage(formattedText, maxContentLength)` → chunks.
     - Edit original message with `chunks[0]`.
     - For `chunks[1..n]`:
       - If overflow with that index exists: `editMessage` with the chunk content.
       - Else: `createMessage`, store the ID at that index.
     - Delete any tracked overflow messages whose index >= chunks.length.

3. **Refactor `setFullContent`** to use the same overflow reconciliation logic:
   - Format, split.
   - Edit original with `chunks[0]`.
   - For `chunks[1..n]`:
     - Reuse existing overflow messages (edit in place).
     - Create new ones as needed.
   - Delete stale overflow messages.

4. **Preserve the `StreamHandle` interface** — `setFullContent` signature stays the same. `pushUpdate` is the new method. The `StreamHandle` from `platform-adapter.ts` only sees `setFullContent`.

**Tests:**

- `pushUpdate` with short text — single edit, no overflow created
- `pushUpdate` with text exceeding `maxContentLength` — creates one overflow message, original message gets first chunk
- `pushUpdate` with multi-overflow — creates multiple overflow messages in correct order
- Multiple `pushUpdate` calls with growing text — edits existing overflow messages in place instead of creating new ones
- `pushUpdate` with shrinking text (back under limit) — deletes stale overflow messages
- `setFullContent` after `pushUpdate` — reconciles correctly: reuses overflow IDs for matching indices, deletes stale ones beyond chunk count
- Existing `setFullContent` tests continue to pass (overflow creation, no-overflow, flush+final)

## Phase 2: Wire `pushUpdate` into the Streaming Path

Connect `pushUpdate` to the streaming delta callback in `inbound-session-turn.ts`.

**Files:**

- `packages/platform-discord/src/streaming.ts`
- `packages/daemon/src/messaging/inbound-session-turn.ts`
- `packages/daemon/test/messaging/inbound-session-turn.test.ts`

**Tasks:**

1. **In `inbound-session-turn.ts`** — change the coalescing pusher to route through `pushUpdate` instead of `setFullContent` during streaming:

   ```ts
   // Before:
   streamPusher = createCoalescingStreamPusher(
     (s) => streamSink!.setFullContent(s),
     streaming.minIntervalMs,
   );

   // After:
   streamPusher = createCoalescingStreamPusher(
     (s) => streamSink!.pushUpdate(s),
     streaming.minIntervalMs,
   );
   ```

2. **Keep `flush` → `setFullContent` unchanged** — after `flush()`, `setFullContent` is called explicitly with the full body:

   ```ts
   await streamPusher.flush();
   await streamSink.setFullContent(rawBody); // final reconciliation
   ```

3. **Remove `sliceDisplayText` from the streaming delta callback** — since `pushUpdate` handles its own splitting, the per-update truncation at the presentation layer is redundant for the streaming path. `sliceDisplayText` is still needed for the non-streaming path and error messages.
   - Pass the full accumulated text to `pushUpdate` (no truncation).
   - Remove the `sliced === lastSliced` dedup guard. The guard was only needed because truncation caused the same value to repeat; now `pushUpdate` handles overflow internally.

**Tests:**

- Verify `pushUpdate` is called during streaming deltas and `setFullContent` on final delivery
- Verify no duplicate content (pushUpdate doesn't append what setFullContent already sent)
- Non-streaming path (no streaming configured) is unaffected
- Existing inbound-session-turn streaming tests continue to pass
