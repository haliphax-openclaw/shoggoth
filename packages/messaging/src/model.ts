/**
 * Internal message model (platform-agnostic).
 */

export type MessageDirection = "inbound" | "outbound";

export interface MessageAttachment {
  readonly id: string;
  readonly url: string;
  readonly filename: string;
  readonly contentType?: string;
  readonly sizeBytes?: number;
}

export interface MessageReaction {
  readonly emoji: string;
  readonly count: number;
}

/** Discord-specific envelope (transport layer); session turn logic stays platform-agnostic. */
export interface DiscordTransportEnvelope {
  readonly authorSnowflake: string;
  readonly authorIsBot: boolean;
  /** True when the author is this Shoggoth bot (Gateway READY / `@me`). */
  readonly isSelf: boolean;
  /** True when the author matches configured `discord.ownerUserId`. */
  readonly isOwner: boolean;
}

export interface MessageExtensions {
  readonly attachments?: readonly MessageAttachment[];
  readonly threadId?: string;
  readonly replyToMessageId?: string;
  readonly reactions?: readonly MessageReaction[];
  readonly discord?: DiscordTransportEnvelope;
  /**
   * Platform-keyed transport envelopes (e.g. `{ discord: { ... } }`).
   * Provides a uniform lookup path for multi-platform support.
   * The legacy {@link discord} field is kept for backward compatibility during migration.
   */
  readonly platform?: Record<string, import("./platform").PlatformTransportEnvelope>;
}

export interface InternalMessage {
  readonly id: string;
  readonly direction: MessageDirection;
  readonly sessionId: string;
  readonly agentId?: string;
  readonly userId?: string;
  readonly createdAt: string;
  readonly body: string;
  readonly extensions: MessageExtensions;
}

export interface CreateInboundMessageInput {
  readonly id: string;
  readonly sessionId: string;
  readonly agentId?: string;
  readonly userId?: string;
  readonly createdAt: string;
  readonly body: string;
  readonly extensions?: MessageExtensions;
}

export function createInboundMessage(input: CreateInboundMessageInput): InternalMessage {
  return {
    id: input.id,
    direction: "inbound",
    sessionId: input.sessionId,
    agentId: input.agentId,
    userId: input.userId,
    createdAt: input.createdAt,
    body: input.body,
    extensions: input.extensions ?? {},
  };
}

export interface CreateOutboundMessageInput {
  readonly id: string;
  readonly sessionId: string;
  readonly agentId?: string;
  readonly userId?: string;
  readonly createdAt: string;
  readonly body: string;
  readonly extensions?: MessageExtensions;
}

export function createOutboundMessage(input: CreateOutboundMessageInput): InternalMessage {
  return {
    id: input.id,
    direction: "outbound",
    sessionId: input.sessionId,
    agentId: input.agentId,
    userId: input.userId,
    createdAt: input.createdAt,
    body: input.body,
    extensions: input.extensions ?? {},
  };
}
