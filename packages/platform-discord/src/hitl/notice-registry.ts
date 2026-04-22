/**
 * Maps Discord HITL notice messages (channel + message id) to the pending tool row so gateway
 * reaction events can resolve approvals without scraping message content.
 */
export type HitlDiscordNoticeRegistry = {
  register(
    channelId: string,
    messageId: string,
    pendingId: string,
    sessionId: string,
    toolName: string,
  ): void;
  lookup(
    channelId: string,
    messageId: string,
  ):
    | {
        readonly pendingId: string;
        readonly sessionId: string;
        readonly toolName: string;
      }
    | undefined;
};

const noticeKey = (channelId: string, messageId: string) =>
  `${channelId}:${messageId}`;

export function createHitlDiscordNoticeRegistry(
  maxEntries = 2000,
): HitlDiscordNoticeRegistry {
  const map = new Map<
    string,
    { pendingId: string; sessionId: string; toolName: string }
  >();
  const order: string[] = [];

  return {
    register(channelId, messageId, pendingId, sessionId, toolName) {
      const k = noticeKey(channelId, messageId);
      if (!map.has(k)) order.push(k);
      map.set(k, { pendingId, sessionId, toolName: toolName.trim() });
      while (order.length > maxEntries) {
        const rm = order.shift();
        if (rm) map.delete(rm);
      }
    },
    lookup(channelId, messageId) {
      return map.get(noticeKey(channelId, messageId));
    },
  };
}
