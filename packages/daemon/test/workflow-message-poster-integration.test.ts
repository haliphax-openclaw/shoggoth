import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDaemonMessagePoster } from "../src/workflow-adapters";

describe("workflow message poster integration", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockLogger: any;
  let mockSendBody: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    mockSendBody = vi.fn().mockResolvedValue(undefined);
  });

  it("posts messages through the platform adapter sendBody", async () => {
    const poster = createDaemonMessagePoster({
      sendBody: mockSendBody,
      logger: mockLogger,
    });

    await poster.post("channel-456", "Test message");

    expect(mockSendBody).toHaveBeenCalledWith("channel-456", "Test message");
  });

  it("logs message operations", async () => {
    const poster = createDaemonMessagePoster({
      sendBody: mockSendBody,
      logger: mockLogger,
    });

    await poster.post("channel-456", "Test message");

    expect(mockLogger.debug).toHaveBeenCalledWith(
      "message task posting",
      expect.objectContaining({ target: "channel-456", messageLen: 12 }),
    );
    expect(mockLogger.debug).toHaveBeenCalledWith(
      "message task posted",
      expect.objectContaining({ target: "channel-456" }),
    );
  });

  it("handles sendBody exceptions gracefully", async () => {
    mockSendBody.mockRejectedValue(new Error("Network error"));

    const poster = createDaemonMessagePoster({
      sendBody: mockSendBody,
      logger: mockLogger,
    });

    await poster.post("channel-456", "Test message");

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "message task post failed",
      expect.objectContaining({
        target: "channel-456",
        err: "Error: Network error",
      }),
    );
  });

  it("supports multiple concurrent posts", async () => {
    const poster = createDaemonMessagePoster({
      sendBody: mockSendBody,
      logger: mockLogger,
    });

    await Promise.all([
      poster.post("channel-1", "Message 1"),
      poster.post("channel-2", "Message 2"),
      poster.post("channel-3", "Message 3"),
    ]);

    expect(mockSendBody).toHaveBeenCalledTimes(3);
    expect(mockSendBody).toHaveBeenNthCalledWith(1, "channel-1", "Message 1");
    expect(mockSendBody).toHaveBeenNthCalledWith(2, "channel-2", "Message 2");
    expect(mockSendBody).toHaveBeenNthCalledWith(3, "channel-3", "Message 3");
  });
});
