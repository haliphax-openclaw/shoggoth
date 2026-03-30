import {
  startDiscordMessagingIfConfigured,
  type DiscordMessagingRuntime,
  type DiscordReactionAddEvent,
} from "./bridge";
import { isPlatformEnabled, type ShoggothConfig } from "@shoggoth/shared";
import type { DiscordBridgeLogger } from "./bridge";
import type { NoticeResolver } from "./daemon-types";
import { setNoticeResolver } from "./notices";
import {
  resolveDiscordAllowBotMessages,
  resolveDiscordIntents,
  resolveDiscordOwnerUserId,
  resolveDefaultSessionPlatform,
  resolveEffectiveDiscordRoutesJson,
  resolveShoggothAgentId,
} from "./config";

export type { DiscordMessagingRuntime };

export interface StartDaemonDiscordMessagingOptions {
  readonly logger: DiscordBridgeLogger;
  readonly config: ShoggothConfig;
  /** Resolved token (`DISCORD_BOT_TOKEN` env wins over layered `discord.botToken`). */
  readonly botToken: string | undefined;
  readonly onMessageReactionAdd?: (ev: DiscordReactionAddEvent) => void;
  readonly reactionBotUserIdRef?: { current: string | undefined };
  /** Daemon's notice resolver — wired into platform-discord's `setNoticeResolver` at startup. */
  readonly noticeResolver?: NoticeResolver;
}

/**
 * Starts Discord messaging (gateway + routes + A2A bus) when enabled in config and credentials exist.
 * URN policies must already be registered ({@link registerBuiltInMessagingPlatforms}).
 */
export async function startDaemonDiscordMessaging(
  opts: StartDaemonDiscordMessagingOptions,
): Promise<DiscordMessagingRuntime | undefined> {
  if (opts.noticeResolver) {
    setNoticeResolver(opts.noticeResolver);
  }
  if (!isPlatformEnabled(opts.config, "discord")) {
    return undefined;
  }
  return startDiscordMessagingIfConfigured({
    logger: opts.logger,
    botToken: opts.botToken,
    routesJson: resolveEffectiveDiscordRoutesJson(opts.config),
    intents: resolveDiscordIntents(opts.config),
    allowBotMessages: resolveDiscordAllowBotMessages(opts.config),
    ownerUserId: resolveDiscordOwnerUserId(opts.config),
    routeGuard: {
      resolvedAgentId: resolveShoggothAgentId(opts.config),
      defaultSessionPlatform: resolveDefaultSessionPlatform(opts.config),
      agentsList: opts.config.agents?.list
        ? Object.entries(opts.config.agents.list).map(([id, a]) => ({
            id: id.trim(),
            ...(a.defaultSessionPlatform ? { defaultSessionPlatform: a.defaultSessionPlatform } : {}),
          }))
        : undefined,
    },
    onMessageReactionAdd: opts.onMessageReactionAdd,
    reactionBotUserIdRef: opts.reactionBotUserIdRef,
  });
}
