import type { AttachmentHandlingMode, ShoggothConfig } from "@shoggoth/shared";
import { parseAgentSessionUrn } from "@shoggoth/shared";
import { getLogger } from "../logging.js";

const log = getLogger();

/**
 * Resolve the effective attachment handling mode for a session.
 * Per-agent platforms.attachmentHandling takes precedence over
 * global platforms.attachmentHandling. Default: "download".
 */
export function resolveAttachmentHandlingMode(
  config: ShoggothConfig,
  sessionId: string,
): AttachmentHandlingMode {
  const parsed = parseAgentSessionUrn(sessionId);
  const agentId = parsed?.agentId;

  // Check per-agent override first
  if (agentId) {
    const agentEntry = (config as Record<string, unknown>).agents as
      | { list?: Record<string, { platforms?: { attachmentHandling?: { mode?: string } } }> }
      | undefined;
    const mode = agentEntry?.list?.[agentId]?.platforms?.attachmentHandling?.mode;
    if (mode === "download" || mode === "inline" || mode === "hybrid") {
      log.debug("resolved per-agent attachment handling mode", { agentId, mode });
      return mode;
    }
  }

  // Fall back to global
  const platforms = (config as Record<string, unknown>).platforms as
    | { attachmentHandling?: { mode?: string } }
    | undefined;
  const globalMode = platforms?.attachmentHandling?.mode;
  if (globalMode === "download" || globalMode === "inline" || globalMode === "hybrid") {
    log.debug("resolved global attachment handling mode", { mode: globalMode });
    return globalMode;
  }

  return "download";
}
