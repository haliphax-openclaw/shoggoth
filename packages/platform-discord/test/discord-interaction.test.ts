import { describe, it } from "vitest";
import assert from "node:assert";
import { discordInteractionToCommand, type DiscordInteractionEvent } from "../src/interaction";

describe("discordInteractionToCommand", () => {
  it("parses an APPLICATION_COMMAND interaction with no options", () => {
    const ev: DiscordInteractionEvent = {
      kind: "interaction_create",
      id: "int-1",
      token: "tok-1",
      type: 2, // APPLICATION_COMMAND
      channelId: "ch-1",
      guildId: "g-1",
      userId: "user-1",
      data: { name: "abort" },
    };
    const result = discordInteractionToCommand(ev);
    assert.ok(result);
    assert.strictEqual(result.command.name, "abort");
    assert.deepStrictEqual(result.command.options, {});
    assert.strictEqual(result.interactionId, "int-1");
    assert.strictEqual(result.interactionToken, "tok-1");
  });

  it("parses options from interaction data", () => {
    const ev: DiscordInteractionEvent = {
      kind: "interaction_create",
      id: "int-2",
      token: "tok-2",
      type: 2,
      channelId: "ch-1",
      guildId: "g-1",
      userId: "user-1",
      data: {
        name: "abort",
        options: [
          {
            name: "session_id",
            type: 3,
            value: "agent:main:discord:channel:abc",
          },
        ],
      },
    };
    const result = discordInteractionToCommand(ev);
    assert.ok(result);
    assert.strictEqual(result.command.name, "abort");
    assert.deepStrictEqual(result.command.options, {
      session_id: "agent:main:discord:channel:abc",
    });
  });

  it("returns null for non-APPLICATION_COMMAND interactions", () => {
    const ev: DiscordInteractionEvent = {
      kind: "interaction_create",
      id: "int-3",
      token: "tok-3",
      type: 1, // PING
      channelId: "ch-1",
      userId: "user-1",
      data: { name: "abort" },
    };
    assert.strictEqual(discordInteractionToCommand(ev), null);
  });

  it("returns null when data has no name", () => {
    const ev: DiscordInteractionEvent = {
      kind: "interaction_create",
      id: "int-4",
      token: "tok-4",
      type: 2,
      channelId: "ch-1",
      userId: "user-1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {} as any,
    };
    assert.strictEqual(discordInteractionToCommand(ev), null);
  });

  // NEW TESTS FOR EXTENDED DiscordInteractionEvent INTERFACE
  it("parses MESSAGE_COMPONENT interaction with custom_id and component_type", () => {
    const ev: DiscordInteractionEvent = {
      kind: "interaction_create",
      id: "int-5",
      token: "tok-5",
      type: 3, // MESSAGE_COMPONENT
      channelId: "ch-1",
      guildId: "g-1",
      userId: "user-1",
      data: {
        custom_id: "button_handler",
        component_type: 2,
        message: {
          id: "msg-1",
          content: "Button message",
        },
      },
    };
    // This should return null because it's not an APPLICATION_COMMAND
    const result = discordInteractionToCommand(ev);
    assert.strictEqual(result, null);
  });

  it("parses MODAL_SUBMIT interaction with custom_id and components", () => {
    const ev: DiscordInteractionEvent = {
      kind: "interaction_create",
      id: "int-6",
      token: "tok-6",
      type: 5, // MODAL_SUBMIT
      channelId: "ch-1",
      guildId: "g-1",
      userId: "user-1",
      data: {
        custom_id: "modal_handler",
        components: [
          {
            type: 1,
            components: [
              {
                type: 4,
                custom_id: "input_1",
                value: "User input",
              },
            ],
          },
        ],
      },
    };
    // This should return null because it's not an APPLICATION_COMMAND
    const result = discordInteractionToCommand(ev);
    assert.strictEqual(result, null);
  });

  it("handles SELECT_MENU interaction with values array", () => {
    const ev: DiscordInteractionEvent = {
      kind: "interaction_create",
      id: "int-7",
      token: "tok-7",
      type: 3, // MESSAGE_COMPONENT
      channelId: "ch-1",
      guildId: "g-1",
      userId: "user-1",
      data: {
        custom_id: "select_handler",
        component_type: 3,
        values: ["option_1", "option_2"],
      },
    };
    // This should return null because it's not an APPLICATION_COMMAND
    const result = discordInteractionToCommand(ev);
    assert.strictEqual(result, null);
  });

  it("confirms extended interface carries new fields", () => {
    // Test that TypeScript accepts the new fields in DiscordInteractionEvent
    const ev: DiscordInteractionEvent = {
      kind: "interaction_create",
      id: "int-8",
      token: "tok-8",
      type: 3,
      channelId: "ch-1",
      userId: "user-1",
      data: {
        custom_id: "test",
        component_type: 2,
        values: ["a", "b"],
        components: [{ type: 1, components: [] }],
        message: { id: "msg-1" },
      },
    };
    // If this compiles, the interface supports the new fields
    assert.ok(ev);
    assert.strictEqual(ev.data.custom_id, "test");
    assert.strictEqual(ev.data.component_type, 2);
    assert.ok(Array.isArray(ev.data.values));
    assert.ok(Array.isArray(ev.data.components));
    assert.ok(ev.data.message);
  });
});
