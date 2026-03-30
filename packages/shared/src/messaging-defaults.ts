/**
 * Default messaging bridge id for session URNs (`agent:<agentId>:<platform>:…`) when config does not
 * override. Daemon transports register URN policies under this id (e.g. Discord).
 */
export const DEFAULT_MESSAGING_PLATFORM_ID = "discord";
