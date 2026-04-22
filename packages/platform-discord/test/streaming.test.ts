import { describe, it, expect, vi } from "vitest";
import { createDiscordStreamingOutbound } from "../src/streaming";
import type { DiscordRestTransport } from "../src/transport";
import { discordCapabilityDescriptor } from "../src/capabilities";

function createMockTransport(): DiscordRestTransport {
  return {
    createMessage: vi.fn().mockResolvedValue({ id: "msg-1" }),
    editMessage: vi.fn().mockResolvedValue(undefined),
    createMessageWithFiles: vi.fn().mockResolvedValue({ id: "msg-2" }),
    triggerTypingIndicator: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
  } as unknown as DiscordRestTransport;
}

describe("DiscordStreamingOutbound", () => {
  it("creates overflow messages when content exceeds maxContentLength", async () => {
    const transport = createMockTransport();
    const caps = discordCapabilityDescriptor();
    const maxLen = 100;

    const streaming = createDiscordStreamingOutbound({
      transport,
      capabilities: caps,
      channelId: "ch-1",
      maxContentLength: maxLen,
    });

    const handle = await streaming.start();

    const longText = "a".repeat(80) + "\n" + "b".repeat(80);
    await handle.setFullContent(longText);

    expect(transport.editMessage).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createCalls = (transport.createMessage as any).mock.calls;
    // First call is the "…" placeholder, subsequent calls are overflow
    expect(createCalls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not create overflow when content fits in maxContentLength", async () => {
    const transport = createMockTransport();
    const caps = discordCapabilityDescriptor();
    const maxLen = 2000;

    const streaming = createDiscordStreamingOutbound({
      transport,
      capabilities: caps,
      channelId: "ch-1",
      maxContentLength: maxLen,
    });

    const handle = await streaming.start();
    await handle.setFullContent("short message");

    expect(transport.editMessage).toHaveBeenCalledTimes(1);
    expect(transport.createMessage).toHaveBeenCalledTimes(1);
  });

  it("creates overflow after streaming flush + final setFullContent", async () => {
    const MAX_LEN = 100;
    const transport = createMockTransport();
    const caps = discordCapabilityDescriptor();

    const streaming = createDiscordStreamingOutbound({
      transport,
      capabilities: caps,
      channelId: "ch-1",
      maxContentLength: MAX_LEN,
    });

    const handle = await streaming.start();

    // Simulate flush: setFullContent with sliced content (fits in one message)
    const fullResponse = "word ".repeat(40); // 200 chars
    const sliced = fullResponse.slice(0, MAX_LEN);
    await handle.setFullContent(sliced);

    // Reset mocks to isolate the final call
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (transport.editMessage as any).mockClear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (transport.createMessage as any).mockClear();

    // Final setFullContent with full body (mirrors inbound-session-turn)
    await handle.setFullContent(fullResponse);

    // Should edit original with first chunk
    expect(transport.editMessage).toHaveBeenCalledTimes(1);
    // Should create overflow message(s) for remaining content
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (transport.createMessage as any).mock.calls.length,
    ).toBeGreaterThanOrEqual(1);
  });
});
