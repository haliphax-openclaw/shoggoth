import { describe, it, expect } from "vitest";
import { discordPlatformRegistration } from "../src/platform-registration";

describe("discordPlatformRegistration", () => {
  it("has platformId 'discord'", () => {
    expect(discordPlatformRegistration.platformId).toBe("discord");
  });

  it("has resourceTypes ['channel', 'dm']", () => {
    expect(discordPlatformRegistration.resourceTypes).toEqual(["channel", "dm"]);
  });

  describe("validateUrn", () => {
    const validate = discordPlatformRegistration.validateUrn!;

    it("accepts valid 'channel' resource type with snowflake leaf", () => {
      expect(validate({ resourceType: "channel", uuidChain: ["123456789012345678"] })).toBeNull();
    });

    it("accepts valid 'dm' resource type with snowflake leaf", () => {
      expect(validate({ resourceType: "dm", uuidChain: ["99999999999999999"] })).toBeNull();
    });

    it("rejects unknown resource type", () => {
      const result = validate({ resourceType: "guild", uuidChain: ["123456789012345678"] });
      expect(result).toBeTypeOf("string");
      expect(result).toContain("guild");
    });

    it("rejects non-snowflake leaf (too short)", () => {
      const result = validate({ resourceType: "channel", uuidChain: ["12345"] });
      expect(result).toBeTypeOf("string");
    });

    it("rejects non-numeric leaf", () => {
      const result = validate({ resourceType: "channel", uuidChain: ["abc123def456ghijk"] });
      expect(result).toBeTypeOf("string");
    });

    it("accepts snowflake at max length (22 digits)", () => {
      expect(validate({ resourceType: "channel", uuidChain: ["1234567890123456789012"] })).toBeNull();
    });
  });

  describe("urnPolicy", () => {
    const policy = discordPlatformRegistration.urnPolicy;

    it("is present", () => {
      expect(policy).toBeDefined();
    });

    it("has platformId 'discord'", () => {
      expect(policy.platformId).toBe("discord");
    });

    it("has required methods", () => {
      expect(typeof policy.checkRouteSessionUrn).toBe("function");
      expect(typeof policy.assertRoutesDefaultPrimaryUuidMatchesAgent).toBe("function");
      expect(typeof policy.parseFirstChannelIdFromRoutesJson).toBe("function");
      expect(typeof policy.resolveBootstrapPrimarySessionUrn).toBe("function");
    });
  });
});
