import { daemonNotice } from "../notices/load-notices";
import { registerDiscordHitlNoticeAndAddReactions } from "../hitl/discord-hitl-reaction-wiring";
import type { HitlNotifier } from "../hitl/hitl-notifier";
import type { HitlDiscordNoticeRegistry } from "../hitl/hitl-discord-notice-registry";
import type { PendingActionRow } from "../hitl/pending-actions-store";
import type { Logger } from "../logging";
import type { DiscordMessagingRuntime } from "@shoggoth/messaging";

/** Max chars for tool payload JSON shown in Discord HITL notices (webhook uses the same cap). */
export const HITL_NOTICE_PAYLOAD_MAX_CHARS = 600;

/** JSON/string excerpt for operator-facing HITL copy; collapses whitespace, strips backticks. */
export function formatHitlPayloadExcerpt(
  payload: unknown,
  maxChars: number = HITL_NOTICE_PAYLOAD_MAX_CHARS,
): string | undefined {
  if (payload === undefined || payload === null) return undefined;
  let s: string;
  try {
    s = typeof payload === "string" ? payload : JSON.stringify(payload);
  } catch {
    s = String(payload);
  }
  const oneLine = s.replace(/`/g, "'").replace(/\r?\n/g, " ").trim();
  if (oneLine.length === 0) return undefined;
  if (oneLine.length <= maxChars) return oneLine;
  return `${oneLine.slice(0, maxChars - 1)}…`;
}

/** Shared copy for operator channel posts and in-session Discord replies when HITL queues. */
export function buildHitlQueuedNoticeLines(row: PendingActionRow): string[] {
  const correlationLine = row.correlationId ? `run: \`${row.correlationId}\`\n` : "";
  const payloadExcerpt = formatHitlPayloadExcerpt(row.payload);
  const payloadLine = payloadExcerpt ? `payload (truncated): \`${payloadExcerpt}\`\n` : "";
  const text = daemonNotice("hitl-queued-notice", {
    id: row.id,
    sessionId: row.sessionId,
    toolName: row.toolName,
    riskTier: row.riskTier,
    correlationLine,
    payloadLine,
  });
  return text.split("\n");
}

export function createDiscordHitlNotifier(input: {
  readonly logger: Logger;
  readonly env: NodeJS.ProcessEnv;
  readonly discord: DiscordMessagingRuntime;
  /** When set, REST-posted notices get reaction “buttons” and registry entries for owner approval. */
  readonly hitlDiscordNoticeRegistry?: HitlDiscordNoticeRegistry;
}): HitlNotifier {
  const hitlNotifyChannelId = input.env.SHOGGOTH_HITL_NOTIFY_CHANNEL_ID?.trim();
  const hitlNotifyWebhookUrl = input.env.SHOGGOTH_HITL_NOTIFY_WEBHOOK_URL?.trim();
  const hitlNotifyDmUserId = input.env.SHOGGOTH_HITL_NOTIFY_DM_USER_ID?.trim();

  let dmChannelIdCached: string | undefined;
  let dmChannelInflight: Promise<string> | undefined;

  function resolveDmChannelId(): Promise<string> {
    if (dmChannelIdCached) return Promise.resolve(dmChannelIdCached);
    if (!hitlNotifyDmUserId) {
      return Promise.reject(new Error("SHOGGOTH_HITL_NOTIFY_DM_USER_ID unset"));
    }
    dmChannelInflight ??= input.discord.discordRestTransport
      .openDmChannel(hitlNotifyDmUserId)
      .then((id) => {
        dmChannelIdCached = id;
        dmChannelInflight = undefined;
        return id;
      })
      .catch((e) => {
        dmChannelInflight = undefined;
        throw e;
      });
    return dmChannelInflight;
  }

  return {
    onQueued(row: PendingActionRow): void {
      input.logger.info("hitl.pending_queued", {
        pendingId: row.id,
        sessionId: row.sessionId,
        tool: row.toolName,
        riskTier: row.riskTier,
        correlationId: row.correlationId,
        expiresAt: row.expiresAt,
      });
      if (hitlNotifyWebhookUrl) {
        const payloadPreview = formatHitlPayloadExcerpt(row.payload) ?? null;
        const body = JSON.stringify({
          event: "hitl.pending_queued",
          pendingId: row.id,
          sessionId: row.sessionId,
          tool: row.toolName,
          riskTier: row.riskTier,
          correlationId: row.correlationId ?? null,
          expiresAt: row.expiresAt,
          payloadPreview,
        });
        void fetch(hitlNotifyWebhookUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        }).catch((e) => {
          input.logger.warn("hitl.webhook_notify_failed", { err: String(e) });
        });
      }
      const lines = buildHitlQueuedNoticeLines(row);
      const content = lines.join("\n");
      if (hitlNotifyChannelId) {
        void input.discord.discordRestTransport
          .createMessage(hitlNotifyChannelId, { content })
          .then(async (sent) => {
            if (!input.hitlDiscordNoticeRegistry) return;
            await registerDiscordHitlNoticeAndAddReactions({
              transport: input.discord.discordRestTransport,
              channelId: hitlNotifyChannelId,
              messageId: sent.id,
              row,
              registry: input.hitlDiscordNoticeRegistry,
              logger: input.logger,
            });
          })
          .catch((e) => {
            input.logger.warn("hitl.discord_notify_failed", { err: String(e) });
          });
      }
      if (hitlNotifyDmUserId) {
        void resolveDmChannelId()
          .then(async (ch) => {
            const sent = await input.discord.discordRestTransport.createMessage(ch, { content });
            if (!input.hitlDiscordNoticeRegistry) return;
            await registerDiscordHitlNoticeAndAddReactions({
              transport: input.discord.discordRestTransport,
              channelId: ch,
              messageId: sent.id,
              row,
              registry: input.hitlDiscordNoticeRegistry,
              logger: input.logger,
            });
          })
          .catch((e) => {
            input.logger.warn("hitl.discord_dm_notify_failed", { err: String(e) });
          });
      }
    },
  };
}
