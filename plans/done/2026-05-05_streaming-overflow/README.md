---
date: 2026-05-05
completed: 2026-05-05
---

# Streaming Overflow — Incremental Chunking During Streaming

## Summary

When streaming model output on Discord, the streaming message stalls at the 2000-character limit and does not update again until the turn completes. This plan adds incremental message splitting _during_ the streaming phase so overflow text is delivered as new messages in real time, and avoids sending duplicate content when `setFullContent` runs at turn end.

## Motivation

GitHub issue #28 reports that streaming output on Discord "hangs with only the first message in the chain once the 2,000 character limit is reached until the agent turn is complete." The response _does_ eventually finish splitting correctly, but the user sees no progress for potentially many seconds.

**Root cause** — three interacting components:

1. **`turn-orchestrator.ts`** `sliceDisplayText` truncates the accumulated text to `maxLen` (2000) on every streaming update.
2. **`inbound-session-turn.ts`** `onModelTextDelta` callback skips pushing to the stream when the sliced text equals the previous value (which it always does once the text exceeds 2000 chars).
3. **`streaming.ts`** `setFullContent` only splits into multiple messages when called at _turn end_, not during incremental streaming pushes.

The result: the user sees a frozen message until the full response is assembled and `setFullContent` fires.

## Design

### Overview

Introduce a new multi-message stream handle that tracks overflow messages created during streaming. The handle maintains:

- The original streaming message ID (initial "…" placeholder)
- A list of overflow message IDs created when content exceeds a single message
- The total text sent so far (to rebuild `setFullContent` correctly at turn end)

During streaming pushes: the handle edits the latest message when there's room, or creates a new overflow message when the current budget is exhausted.

At turn end (`setFullContent`): the handle re-splits the full final text into chunks and creates/edits messages so the final state is a clean chain with no stale overflow slots.

### Data Flow

```
During streaming (push):

  onModelTextDelta(accumulatedText)
    ↓
  streamPusher.push(slicedText)           ← sliceDisplayText still applied (per-msg budget)
    ↓
  DiscordStreamHandle.pushUpdate(text)
    ├─ text fits current message → editMessage(channelId, currentMsgId, text)
    └─ text overflows → createMessage(channelId, remaining) → track new msgId

At turn end (flush + setFullContent):

  streamPusher.flush()
    ↓
  streamSink.setFullContent(fullFinalText)
    ↓
  DiscordStreamHandle.setFullContent(fullFinalText)
    ├─ splitDiscordMessage(fullFinalText, maxLen) → chunks[]
    ├─ editMessage(channelId, originalMsgId, chunks[0])
    ├─ for chunks[1..n]:
    │    reuse overflow message if exists   → editMessage
    │    else                               → createMessage
    └─ delete any stale overflow messages beyond chunks.length
```

### Key Decisions

1. **`sliceDisplayText` stays in the streaming path** — it ensures per-message budget compliance during incremental pushes. The truncation is per-message, not global; once text exceeds 2000, the handle creates a new message for the overflow. This keeps the streaming feel alive.

2. **`setFullContent` is still the authoritative final state** — it re-splits the complete final text, which may differ from the incrementally pushed content due to formatting, thinking normalization, etc. Any overflow messages created during streaming that are no longer needed are cleaned up.

3. **No changes to the coalescing pusher** — the `push` / `flush` contract in `createCoalescingStreamPusher` stays identical. The new logic lives entirely inside the stream handle.

4. **`maxBodyLength` / `sliceDisplayText` stays at the presentation layer** — it remains a per-platform responsibility. The streaming handle is Discord-specific and uses `maxContentLength` as today.

## Testing Strategy

### Unit Tests (`packages/platform-discord/test/streaming.test.ts`)

- **Happy path:** short text (< maxLen) — only edits the original message, no overflow created
- **Overflow during push:** text that exceeds `maxLen` during streaming creates overflow messages; subsequent pushes update the latest overflow in place
- **Multi-overflow:** text that spans multiple `maxLen` thresholds creates a chain of overflow messages
- **Final `setFullContent` reconciles:** after streaming pushes created 3 overflow messages but the final text only needs 2 total chunks, the stale overflow message is deleted
- **Final `setFullContent` adds more:** after streaming pushes created 1 overflow but final text needs 3 chunks, new messages are created
- **Drop-in replacement:** existing tests for the current `setFullContent` behavior still pass (overflow during push is additive, not a breaking change)

### Integration Tests

- Manual: run a long-form prompt on a Discord session with streaming enabled; verify successive messages appear as overflow, and the final chain is clean

## Considerations

### Rate Limiting

Each `createMessage` and `editMessage` costs against Discord's rate limit bucket. During streaming, overflow creates a burst of 1 extra message per `maxLen` boundary crossed. At 2000-char messages, a 10k response creates ~4 overflow messages — well within typical limits. The coalescing pusher's `minIntervalMs` limits the frequency of pushes, so overflow creations are spaced naturally.

### Thinking Blocks

Thinking blocks (`<thinking>...</thinking>`) undergoing normalization may change the rendered character count. The format happens before splitting in both the push and final paths, so the character budget is accurate.

### Message Ordering

Discord preserves creation order within a channel. Since each overflow message is created sequentially via `createMessage`, they appear in the correct order below the original streaming message. No thread/fork complexity.

### Edge Cases

- **Text exactly at maxLen boundary** — no overflow created until the next push crosses the boundary.
- **Overflow message deleted externally** — the handle's deletion in `setFullContent` will 404 silently (Discord REST returns 404, which is already handled by transport).
- **Turn aborted mid-stream** — whatever chunks were already sent remain; `setFullContent` won't be called; stale overflow messages are left behind (acceptable — the user can delete manually if they want).

## Migration

No migration needed. This is purely a change to the runtime behavior of streaming — no config schema changes, no DB schema changes, no wire-format changes. Existing sessions with streaming enabled will pick up the new behavior automatically.

## References

- [Research: Issue #28 Investigation](/research/2026-05-05_issue-28-investigation.md) — full root-cause analysis
- [`spec.md`](spec.md) — type signatures, interfaces, and code examples
- [`implementation.md`](implementation.md) — phased implementation steps
