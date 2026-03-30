/**
 * Injectable Discord REST surface for tests and daemon wiring.
 */

export interface DiscordCreateMessageBody {
  readonly content: string;
  readonly message_reference?: { readonly message_id: string };
  readonly allowed_mentions?: { readonly parse: readonly string[] };
}

export interface DiscordEditMessageBody {
  readonly content: string;
}

export interface DiscordRestTransport {
  /** POST `/users/@me/channels` — returns the DM channel id for `createMessage`. */
  openDmChannel(recipientUserId: string): Promise<string>;
  createMessage(
    channelId: string,
    body: DiscordCreateMessageBody,
  ): Promise<{ readonly id: string }>;
  editMessage(channelId: string, messageId: string, body: DiscordEditMessageBody): Promise<void>;
  /**
   * PUT `/channels/{channel.id}/messages/{message.id}/reactions/{emoji}/@me` — unicode `emoji` is
   * passed raw and URL-encoded (e.g. `✅`). Custom emojis use `name:id`.
   */
  createMessageReaction(channelId: string, messageId: string, emoji: string): Promise<void>;
  /** POST `/channels/{channel.id}/typing` — lasts ~10s; renew for long model turns. */
  triggerTypingIndicator(channelId: string): Promise<void>;
}
