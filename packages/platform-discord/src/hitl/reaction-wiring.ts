import type { DiscordRestTransport } from "../transport";
import type { Logger, PendingActionRow } from "../daemon-types";
import type { HitlDiscordNoticeRegistry } from "./notice-registry";

/** Reaction "buttons" on HITL notices (owner-only; see discord-hitl-reaction-handler). */
export const HITL_DISCORD_NOTICE_REACTION_EMOJIS = [
  "1️⃣",
  "✅",
  "♾️",
  "❌",
] as const;

export async function registerDiscordHitlNoticeAndAddReactions(input: {
  readonly transport: DiscordRestTransport;
  readonly channelId: string;
  readonly messageId: string;
  readonly row: PendingActionRow;
  readonly registry: HitlDiscordNoticeRegistry;
  readonly logger: Logger;
}): Promise<void> {
  input.registry.register(
    input.channelId,
    input.messageId,
    input.row.id,
    input.row.sessionId,
    input.row.toolName,
  );
  for (const emoji of HITL_DISCORD_NOTICE_REACTION_EMOJIS) {
    try {
      await input.transport.createMessageReaction(
        input.channelId,
        input.messageId,
        emoji,
      );
    } catch (e) {
      input.logger.warn("hitl.discord_reaction_add_failed", {
        err: String(e),
        emoji,
      });
    }
  }
}
