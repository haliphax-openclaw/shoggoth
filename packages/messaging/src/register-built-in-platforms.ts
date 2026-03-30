import { DEFAULT_MESSAGING_PLATFORM_ID } from "@shoggoth/shared";
import {
  assertDiscordRoutesDefaultPrimaryUuidMatchesAgent,
  checkDiscordMessagingRouteSessionUrn,
  parseFirstDiscordChannelIdFromRoutesJson,
  resolveDiscordBootstrapPrimarySessionUrn,
} from "./discord/messaging-urn-policy";
import { registerMessagingPlatformUrnPolicy, type MessagingPlatformUrnPolicy } from "./platform-urn-registry";

const discordUrnPolicy: MessagingPlatformUrnPolicy = {
  platformId: DEFAULT_MESSAGING_PLATFORM_ID,
  checkRouteSessionUrn: checkDiscordMessagingRouteSessionUrn,
  assertRoutesDefaultPrimaryUuidMatchesAgent: assertDiscordRoutesDefaultPrimaryUuidMatchesAgent,
  parseFirstChannelIdFromRoutesJson: parseFirstDiscordChannelIdFromRoutesJson,
  resolveBootstrapPrimarySessionUrn: resolveDiscordBootstrapPrimarySessionUrn,
};

let didRegister = false;

/** Idempotent: registers built-in transport URN policies (Discord, …). Call once during daemon / CLI startup. */
export function registerBuiltInMessagingPlatforms(): void {
  if (didRegister) return;
  didRegister = true;
  registerMessagingPlatformUrnPolicy(discordUrnPolicy);
}
