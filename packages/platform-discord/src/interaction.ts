/**
 * Discord interaction (slash command) parsing.
 * Translates Discord INTERACTION_CREATE gateway events into PlatformCommands.
 */
import type { PlatformCommand } from "@shoggoth/daemon/lib";

/** Discord interaction types (subset). */
const INTERACTION_TYPE_APPLICATION_COMMAND = 2;

export interface DiscordInteractionEvent {
  readonly kind: "interaction_create";
  readonly id: string;
  readonly token: string;
  readonly type: number;
  readonly channelId: string;
  readonly guildId?: string;
  readonly userId: string;
  readonly data: {
    readonly name?: string;
    readonly options?: readonly { readonly name: string; readonly type: number; readonly value: string }[];
  };
}

export interface DiscordInteractionCommand {
  readonly command: PlatformCommand;
  readonly interactionId: string;
  readonly interactionToken: string;
}

/**
 * Parse a Discord INTERACTION_CREATE event into a PlatformCommand.
 * Returns null for non-APPLICATION_COMMAND interactions or missing data.
 */
export function discordInteractionToCommand(
  ev: DiscordInteractionEvent,
): DiscordInteractionCommand | null {
  if (ev.type !== INTERACTION_TYPE_APPLICATION_COMMAND) return null;
  const name = ev.data?.name;
  if (!name) return null;

  const options: Record<string, string> = {};
  if (ev.data.options) {
    for (const opt of ev.data.options) {
      options[opt.name] = String(opt.value);
    }
  }

  return {
    command: { name, options },
    interactionId: ev.id,
    interactionToken: ev.token,
  };
}
