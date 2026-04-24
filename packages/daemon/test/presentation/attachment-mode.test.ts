import { describe, it, expect, vi } from "vitest";
import type { ShoggothConfig } from "@shoggoth/shared";
import { resolveAttachmentHandlingMode } from "../../src/presentation/attachment-mode.js";

// Suppress logger output in tests
vi.mock("../../src/logging.js", () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

/**
 * Build a minimal config cast to ShoggothConfig for testing.
 * Only the fields relevant to attachment mode resolution are populated.
 */
function makeConfig(opts?: {
  globalMode?: string;
  agentMode?: string;
  agentId?: string;
}): ShoggothConfig {
  const cfg: Record<string, unknown> = {};

  if (opts?.globalMode) {
    cfg.platforms = {
      attachmentHandling: { mode: opts.globalMode },
    };
  }

  if (opts?.agentMode && opts?.agentId) {
    cfg.agents = {
      list: {
        [opts.agentId]: {
          platforms: {
            attachmentHandling: { mode: opts.agentMode },
          },
        },
      },
    };
  }

  return cfg as unknown as ShoggothConfig;
}

describe("resolveAttachmentHandlingMode", () => {
  const sessionId = "agent:myagent:discord:channel:123";

  it("returns 'download' when neither global nor per-agent config is set (default)", () => {
    const config = makeConfig();
    const mode = resolveAttachmentHandlingMode(config, sessionId);
    expect(mode).toBe("download");
  });

  it("returns global platforms.attachmentHandling.mode when set", () => {
    const config = makeConfig({ globalMode: "inline" });
    const mode = resolveAttachmentHandlingMode(config, sessionId);
    expect(mode).toBe("inline");
  });

  it("returns per-agent override when both global and per-agent are set", () => {
    const config = {
      ...makeConfig({ globalMode: "download" }),
      agents: {
        list: {
          myagent: {
            platforms: {
              attachmentHandling: { mode: "hybrid" },
            },
          },
        },
      },
    } as unknown as ShoggothConfig;

    const mode = resolveAttachmentHandlingMode(config, sessionId);
    expect(mode).toBe("hybrid");
  });

  it("returns global when per-agent is not set but global is", () => {
    const config = {
      ...makeConfig({ globalMode: "hybrid" }),
      agents: {
        list: {
          myagent: {
            // no platforms.attachmentHandling
          },
        },
      },
    } as unknown as ShoggothConfig;

    const mode = resolveAttachmentHandlingMode(config, sessionId);
    expect(mode).toBe("hybrid");
  });

  it("works for mode 'download'", () => {
    const config = makeConfig({ globalMode: "download" });
    const mode = resolveAttachmentHandlingMode(config, sessionId);
    expect(mode).toBe("download");
  });

  it("works for mode 'inline'", () => {
    const config = makeConfig({ globalMode: "inline" });
    const mode = resolveAttachmentHandlingMode(config, sessionId);
    expect(mode).toBe("inline");
  });

  it("works for mode 'hybrid'", () => {
    const config = makeConfig({ globalMode: "hybrid" });
    const mode = resolveAttachmentHandlingMode(config, sessionId);
    expect(mode).toBe("hybrid");
  });

  it("extracts agent ID from session URN to find per-agent config", () => {
    const config = {
      agents: {
        list: {
          "special-agent": {
            platforms: {
              attachmentHandling: { mode: "inline" },
            },
          },
        },
      },
    } as unknown as ShoggothConfig;

    const mode = resolveAttachmentHandlingMode(config, "agent:special-agent:discord:channel:456");
    expect(mode).toBe("inline");
  });
});
