import type { DiscordMessagingRuntime } from "@shoggoth/messaging";
import type { SessionModelTurnDelivery } from "../messaging/session-model-turn-delivery";
import type { SessionAgentTurnResult } from "../sessions/session-agent-turn";

/**
 * Filled from `index.ts` after Discord platform starts. Control-plane subagent ops consult this ref.
 */
export type SubagentRuntimeExtension = {
  readonly runSessionModelTurn: (input: {
    readonly sessionId: string;
    readonly userContent: string;
    readonly userMetadata?: Record<string, unknown>;
    readonly delivery: SessionModelTurnDelivery;
  }) => Promise<SessionAgentTurnResult>;
  readonly subscribeSubagentSession: (sessionId: string) => () => void;
  readonly registerDiscordThreadBinding: DiscordMessagingRuntime["registerDiscordThreadBinding"];
};

export const subagentRuntimeExtensionRef: { current: SubagentRuntimeExtension | undefined } = {
  current: undefined,
};

export function setSubagentRuntimeExtension(ext: SubagentRuntimeExtension | undefined): void {
  subagentRuntimeExtensionRef.current = ext;
}
