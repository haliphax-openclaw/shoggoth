import type { PlatformRegistration } from "@shoggoth/messaging";
import type { MessagingPlatformUrnPolicy } from "@shoggoth/messaging";
import {
  checkDiscordMessagingRouteSessionUrn,
  assertDiscordRoutesDefaultPrimaryUuidMatchesAgent,
  parseFirstDiscordChannelIdFromRoutesJson,
  resolveDiscordBootstrapPrimarySessionUrn,
  DISCORD_SNOWFLAKE_RE,
} from "./messaging-urn-policy";

const DISCORD_RESOURCE_TYPES = ["channel", "dm"] as const;

/**
 * Validates a parsed Discord URN: resource type must be "channel" or "dm",
 * and the leaf segment must be a valid Discord snowflake.
 */
export function validateDiscordUrn(parsed: {
  resourceType: string;
  uuidChain: readonly string[];
}): string | null {
  if (
    !DISCORD_RESOURCE_TYPES.includes(
      parsed.resourceType as (typeof DISCORD_RESOURCE_TYPES)[number],
    )
  ) {
    return `unknown Discord resource type: ${JSON.stringify(parsed.resourceType)} (expected one of: ${DISCORD_RESOURCE_TYPES.join(", ")})`;
  }
  const leaf = parsed.uuidChain[parsed.uuidChain.length - 1];
  if (leaf && !DISCORD_SNOWFLAKE_RE.test(leaf)) {
    return `invalid Discord snowflake: ${JSON.stringify(leaf)} (must be a 17-22 digit numeric string)`;
  }
  return null;
}

const discordUrnPolicy: MessagingPlatformUrnPolicy = {
  platformId: "discord",
  checkRouteSessionUrn: checkDiscordMessagingRouteSessionUrn,
  assertRoutesDefaultPrimaryUuidMatchesAgent:
    assertDiscordRoutesDefaultPrimaryUuidMatchesAgent,
  parseFirstChannelIdFromRoutesJson: parseFirstDiscordChannelIdFromRoutesJson,
  resolveBootstrapPrimarySessionUrn: resolveDiscordBootstrapPrimarySessionUrn,
};

export const discordPlatformRegistration: PlatformRegistration = {
  platformId: "discord",
  resourceTypes: DISCORD_RESOURCE_TYPES,
  validateUrn: validateDiscordUrn,
  validateConfig: () => null,
  urnPolicy: discordUrnPolicy,
};
