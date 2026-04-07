import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createCoalescingStreamPusher,
} from "../../src/messaging/inbound-session-turn";

let capturedStream: { onModelTextDelta: (t: string) => void } | undefined;

vi.mock("../../src/sessions/session-agent-turn.js", () => ({
  executeSessionAgentTurn: vi.fn().mockImplementation(async (input: any) => {
    capturedStream = input.stream;
    // Simulate streaming: accumulated text grows beyond slice limit
    if (input.stream?.onModelTextDelta) {
      for (let i = 1; i <= 10; i++) {
        input.stream.onModelTextDelta("a".repeat(i * 30));
      }
    }
    return {
      latestAssistantText: "a".repeat(300),
      failoverMeta: undefined,
      showAttachments: undefined,
    };
  }),
}));

const { runInboundSessionTurn } = await import("../../src/messaging/inbound-session-turn");

describe("createCoalescingStreamPusher", () => {
  it("calls setFull with latest text", async () => {
    const setFull = vi.fn().mockResolvedValue(undefined);
    const pusher = createCoalescingStreamPusher(setFull, 0);
    pusher.push("hello");
    await pusher.flush();
    expect(setFull).toHaveBeenCalledWith("hello");
  });
});

describe("runInboundSessionTurn streaming final delivery", () => {
  it("passes full unsliced body to setFullContent when streaming", async () => {
    const MAX_LEN = 50;
    const sendErrorBody = vi.fn().mockResolvedValue(undefined);
    const setFullContent = vi.fn().mockResolvedValue(undefined);
    const streamStart = vi.fn().mockResolvedValue({ setFullContent });

    await runInboundSessionTurn({
      buildTurn: () =>
        Promise.resolve({
          sessionId: "s1",
          agentId: "main",
          userContent: "hi",
          messages: [],
          tools: [],
          systemPrompt: "",
          config: {} as any,
          stateDb: {} as any,
        }),
      streaming: {
        minIntervalMs: 0,
        start: streamStart,
      },
      sliceDisplayText: (t) => (t.length > MAX_LEN ? t.slice(0, MAX_LEN) : t),
      formatAssistantReply: (text) => text,
      formatErrorReply: (err) => String(err),
      sendAssistantBody: vi.fn().mockResolvedValue(undefined),
      sendErrorBody,
    });

    expect(sendErrorBody).not.toHaveBeenCalled();
    expect(setFullContent).toHaveBeenCalled();

    // Streaming path should pass the full body to setFullContent
    const lastCall = setFullContent.mock.calls.at(-1)?.[0] as string;
    expect(lastCall.length).toBe(300);
  });

  it("does not push duplicate sliced content during streaming", async () => {
    const MAX_LEN = 50;
    const setFullContent = vi.fn().mockResolvedValue(undefined);
    const streamStart = vi.fn().mockResolvedValue({ setFullContent });

    await runInboundSessionTurn({
      buildTurn: () =>
        Promise.resolve({
          sessionId: "s1",
          agentId: "main",
          userContent: "hi",
          messages: [],
          tools: [],
          systemPrompt: "",
          config: {} as any,
          stateDb: {} as any,
        }),
      streaming: {
        minIntervalMs: 0,
        start: streamStart,
      },
      sliceDisplayText: (t) => (t.length > MAX_LEN ? t.slice(0, MAX_LEN) : t),
      formatAssistantReply: (text) => text,
      formatErrorReply: (err) => String(err),
      sendAssistantBody: vi.fn().mockResolvedValue(undefined),
      sendErrorBody: vi.fn().mockResolvedValue(undefined),
    });

    // The mock sends 10 deltas: 30, 60, 90, 120, 150, 180, 210, 240, 270, 300 chars.
    // After slicing to 50, deltas 2-10 all produce the same 50-char string.
    // The callback should NOT push duplicates — only the first time the
    // sliced content changes should trigger a push.
    const slicedCalls = setFullContent.mock.calls
      .map((c: any) => c[0] as string)
      .filter((s: string) => s.length === MAX_LEN);

    // With deduplication, the 50-char sliced content should appear at most
    // 3 times: once from the initial push, once from the chain resolving
    // with the updated latest ref, and once from flush.
    // Without dedup, it appears 9+ times.
    expect(slicedCalls.length).toBeLessThanOrEqual(3);
  });
});
