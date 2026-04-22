import { describe, it, expect, vi } from "vitest";
import { createDaemonMessagePoster } from "../src/workflow-adapters";

describe("createDaemonMessagePoster", () => {
  it("should post a message through sendBody", async () => {
    const mockSendBody = vi.fn().mockResolvedValue(undefined);
    const mockLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };

    const poster = createDaemonMessagePoster({
      sendBody: mockSendBody,
      logger: mockLogger,
    });

    await poster.post("channel-456", "Hello from workflow");

    expect(mockSendBody).toHaveBeenCalledWith(
      "channel-456",
      "Hello from workflow",
    );
    expect(mockLogger.debug).toHaveBeenCalledWith("message task posted", {
      target: "channel-456",
    });
  });

  it("should handle sendBody failures gracefully", async () => {
    const mockSendBody = vi
      .fn()
      .mockRejectedValue(new Error("Permission denied"));
    const mockLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };

    const poster = createDaemonMessagePoster({
      sendBody: mockSendBody,
      logger: mockLogger,
    });

    await poster.post("channel-456", "Hello from workflow");

    expect(mockLogger.warn).toHaveBeenCalledWith(
      "message task post failed",
      expect.objectContaining({
        target: "channel-456",
        err: "Error: Permission denied",
      }),
    );
  });
});
