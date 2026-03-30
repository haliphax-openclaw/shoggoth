import { DEFAULT_MESSAGING_PLATFORM_ID } from "@shoggoth/shared";
import {
  assertDiscordRoutesDefaultPrimaryUuidMatchesAgent,
  checkDiscordMessagingRouteSessionUrn,
  parseFirstDiscordChannelIdFromRoutesJson,
  resolveDiscordBootstrapPrimarySessionUrn,
} from "../platforms/discord/discord-messaging-urn-policy";
import {
  registerMessagingPlatformUrnPolicy,
  type MessagingPlatformUrnPolicy,
} from "./messaging-platform-urn-registry";

const discordUrnPolicy: MessagingPlatformUrnPolicy = {
  platformId: DEFAULT_MESSAGING_PLATFORM_ID,
  checkRouteSessionUrn: checkDiscordMessagingRouteSessionUrn,
  assertRoutesDefaultPrimaryUuidMatchesAgent: assertDiscordRoutesDefaultPrimaryUuidMatchesAgent,
  parseFirstChannelIdFromRoutesJson: parseFirstDiscordChannelIdFromRoutesJson,
  resolveBootstrapPrimarySessionUrn: resolveDiscordBootstrapPrimarySessionUrn,
};

let didRegister = false;

/** Idempotent: registers built-in transport URN policies (Discord, …). Call once during daemon startup. */
export function registerBuiltInMessagingPlatforms(): void {
  if (didRegister) return;
  didRegister = true;
  registerMessagingPlatformUrnPolicy(discordUrnPolicy);
}
