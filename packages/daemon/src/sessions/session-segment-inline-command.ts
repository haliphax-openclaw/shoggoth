import { daemonPrompt } from "../prompts/load-prompts";

/**
 * Plain-text session segment triggers (e.g. chat `new` / `reset`). Not transport-specific — the same
 * strings can be used from CLI or future slash commands; surfaces map inbound text here.
 */
export function parseSessionSegmentInlineCommand(body: string): "new" | "reset" | null {
  const t = body.trim().toLowerCase();
  if (t === "new" || t === "/new") return "new";
  if (t === "reset" || t === "/reset") return "reset";
  return null;
}

/** Synthetic user line for the post-`new` / `reset` model turn (startup acknowledgment). */
export function sessionSegmentStartupUserContent(mode: "new" | "reset"): string {
  return mode === "new"
    ? daemonPrompt("session-segment-startup-new")
    : daemonPrompt("session-segment-startup-reset");
}
