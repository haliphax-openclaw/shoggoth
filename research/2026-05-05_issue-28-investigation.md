# GitHub Issue #28 Investigation Report

## Issue Details

- **Title:** Streaming output on Discord stops at character limit until turn is finished
- **URL:** https://github.com/haliphax-ai/shoggoth/issues/28
- **Status:** Open
- **Labels:** bug
- **Description:** The response splitting does eventually happen, and you see the entire response, but it hangs with only the first message in the chain once the 2,000 character limit is reached until the agent turn is complete.

## Executive Summary

When streaming responses on Discord, the message becomes "stuck" at the 2000-character limit until the entire agent turn completes. During this time, no incremental updates are shown to the user, creating a poor user experience where the response appears frozen.

## Root Cause Analysis

### Problem Location

The issue stems from the interaction between three components:

1. **`packages/daemon/src/presentation/turn-orchestrator.ts`** (lines 133-134)
2. **`packages/daemon/src/messaging/inbound-session-turn.ts`** (lines 134-142)
3. **`packages/platform-discord/src/streaming.ts`** (lines 55-75)

### Detailed Analysis

#### 1. Text Truncation During Streaming

**File:** `packages/daemon/src/presentation/turn-orchestrator.ts` (lines 133-134)

```typescript
const sliceDisplayText = (text: string): string =>
  text.length > maxLen ? text.slice(0, maxLen) : text;
```

This function is called on **every streaming update** to ensure text doesn't exceed Discord's 2000-character limit. However, it simply truncates the text without any special handling for streaming scenarios.

#### 2. Streaming Update Mechanism

**File:** `packages/daemon/src/messaging/inbound-session-turn.ts` (lines 134-142)

```typescript
onModelTextDelta: (() => {
  let lastSliced = "";
  return (t: string) => {
    const vis = t.trim() ? t : "…";
    const sliced = sliceDisplayText(vis);
    if (sliced === lastSliced) return;
    lastSliced = sliced;
    streamPusher!.push(sliced);
  };
})(),
```

The streaming callback:

1. Receives accumulated text from the model
2. Calls `sliceDisplayText` which truncates to 2000 characters
3. Pushes the truncated text to the stream
4. Only updates if the sliced text has changed

**Problem:** When accumulated text exceeds 2000 characters, `sliceDisplayText` always returns the first 2000 characters. As more text accumulates, the sliced text remains the same (first 2000 chars), so no updates occur.

#### 3. Final Text Handling

**File:** `packages/platform-discord/src/streaming.ts` (lines 55-75)

```typescript
async setFullContent(text: string): Promise<void> {
  let formattedText = text;
  if (thinkingDisplay) {
    formattedText = formatMessageWithThinking(text, thinkingDisplay);
  }
  formattedText = mdTableToAscii(formattedText);

  const chunks = splitDiscordMessage(formattedText, maxContentLength);
  // Edit the original streaming message with the first chunk.
  await transport.editMessage(channelId, messageId, {
    content: chunks[0],
  });
  // Send remaining chunks as new messages.
  for (let i = 1; i < chunks.length; i++) {
    await transport.createMessage(channelId, { content: chunks[i] });
  }
}
```

At turn completion, `setFullContent` is called with the final accumulated text. This function:

1. Splits the full text into chunks (respecting 2000-char limit)
2. Edits the original streaming message with the first chunk
3. Creates new messages for remaining chunks

**Problem:** This only happens at the **end** of the turn, not during streaming. The user sees a static message until the turn completes.

### Flow Diagram

```
Model generates text
    ↓
onModelTextDelta callback fires with accumulated text
    ↓
sliceDisplayText truncates to 2000 chars
    ↓
streamPusher.push(sliced)
    ↓
Discord message updated with truncated text
    ↓
[More text accumulates...]
    ↓
sliceDisplayText still returns first 2000 chars
    ↓
lastSliced === sliced → NO UPDATE SENT
    ↓
[Message stuck at 2000 chars until turn completes]
    ↓
At turn completion: setFullContent(finalText) called
    ↓
Full text split into chunks, additional messages sent
```

## Impact

### User Experience

- **Before 2000 chars:** Smooth streaming updates
- **After 2000 chars:** Message appears frozen, no visible progress
- **At turn completion:** Multiple messages appear suddenly

### Technical Impact

- Inefficient use of Discord API (single message edit vs. multiple messages)
- Potential for confusion about response status
- Poor perception of streaming capability

## Potential Solutions

### Solution 1: Incremental Chunking During Streaming

**Approach:** Modify the streaming mechanism to send additional messages when accumulated text exceeds the limit during streaming.

**Implementation:**

1. Track which chunks have been sent during streaming
2. When text exceeds limit, send new chunks as separate messages
3. Continue editing the original message with the "current" chunk

**Pros:**

- True incremental streaming
- Better user experience
- Efficient use of Discord API

**Cons:**

- More complex state management
- Need to track message IDs for multiple messages

### Solution 2: Improved Truncation Display

**Approach:** At least indicate to the user that more text is coming.

**Implementation:**

- Append "..." or similar indicator when text is truncated
- Or use a different placeholder during overflow

**Pros:**

- Simple to implement
- Better than no indication

**Cons:**

- Doesn't solve the core problem
- Still shows incomplete text

### Solution 3: Multi-message Streaming with State Tracking

**Approach:** Track message state during streaming and incrementally send chunks.

**Implementation:**

1. Maintain a list of sent message IDs
2. Track current chunk index
3. Send new chunks as separate messages
4. Edit the most recent message when possible

**Pros:**

- Full streaming capability
- Clear progress indication

**Cons:**

- Complex implementation
- Discord rate limiting considerations

## Recommendation

**Solution 1 (Incremental Chunking)** is recommended as it provides the best user experience while maintaining efficiency. The key changes would be:

1. **Modify `inbound-session-turn.ts`:**
   - Track streaming message state
   - Send overflow chunks as new messages during streaming

2. **Modify `streaming.ts`:**
   - Add state tracking for multiple messages
   - Handle incremental updates properly

3. **Modify `turn-orchestrator.ts`:**
   - Consider removing or adjusting the truncation for streaming scenarios

## Next Steps

1. **Design Phase:** Create a detailed design document for incremental chunking
2. **Implementation:** Implement the solution in phases
3. **Testing:** Test with long streaming responses to verify the fix
4. **Documentation:** Update documentation to reflect the new behavior

## Related Files for Implementation

- `packages/daemon/src/presentation/turn-orchestrator.ts`
- `packages/daemon/src/messaging/inbound-session-turn.ts`
- `packages/platform-discord/src/streaming.ts`
- `packages/platform-discord/src/split-message.ts`
- `packages/platform-discord/src/transport.ts`

## References

- Discord Message Limit: 2000 characters (hard limit)
- Current constant: `DISCORD_PLATFORM_MAX_MESSAGE_BODY_CHARS = 2000`
- Message splitting logic: `splitDiscordMessage()` in `split-message.ts`
