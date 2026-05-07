import { describe, it } from "vitest";
import assert from "node:assert";
import { discordInteractionCreateToEvent } from "../src/gateway-payload";

describe("discordInteractionCreateToEvent", () => {
  it("maps INTERACTION_CREATE payload with guild member", () => {
    const ev = discordInteractionCreateToEvent({
      id: "int-1",
      token: "tok-1",
      type: 2,
      channel_id: "ch-1",
      guild_id: "g-1",
      member: { user: { id: "u-1", username: "tester" } },
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
    });
    assert.ok(ev);
    assert.strictEqual(ev.kind, "interaction_create");
    assert.strictEqual(ev.id, "int-1");
    assert.strictEqual(ev.token, "tok-1");
    assert.strictEqual(ev.type, 2);
    assert.strictEqual(ev.channelId, "ch-1");
    assert.strictEqual(ev.guildId, "g-1");
    assert.strictEqual(ev.userId, "u-1");
    assert.strictEqual(ev.data.name, "abort");
    assert.strictEqual(ev.data.options?.[0]?.name, "session_id");
    assert.strictEqual(ev.data.options?.[0]?.value, "agent:main:discord:channel:abc");
  });

  it("maps INTERACTION_CREATE payload with DM user (no member)", () => {
    const ev = discordInteractionCreateToEvent({
      id: "int-2",
      token: "tok-2",
      type: 2,
      channel_id: "ch-2",
      user: { id: "u-2", username: "dm-user" },
      data: { name: "abort" },
    });
    assert.ok(ev);
    assert.strictEqual(ev.userId, "u-2");
    assert.strictEqual(ev.guildId, undefined);
  });

  it("maps INTERACTION_CREATE with no options", () => {
    const ev = discordInteractionCreateToEvent({
      id: "int-3",
      token: "tok-3",
      type: 2,
      channel_id: "ch-3",
      guild_id: "g-3",
      member: { user: { id: "u-3" } },
      data: { name: "abort" },
    });
    assert.ok(ev);
    assert.strictEqual(ev.data.name, "abort");
    assert.strictEqual(ev.data.options, undefined);
  });

  it("returns null for missing required fields", () => {
    assert.strictEqual(discordInteractionCreateToEvent(null), null);
    assert.strictEqual(discordInteractionCreateToEvent({}), null);
    assert.strictEqual(discordInteractionCreateToEvent({ id: "x", token: "t", type: 2 }), null);
    // Missing user id
    assert.strictEqual(
      discordInteractionCreateToEvent({
        id: "x",
        token: "t",
        type: 2,
        channel_id: "c",
        data: { name: "abort" },
      }),
      null,
    );
  });

  // NEW TESTS FOR MESSAGE_COMPONENT (type 3) and MODAL_SUBMIT (type 5)
  it("maps INTERACTION_CREATE payload with MESSAGE_COMPONENT type 3", () => {
    const ev = discordInteractionCreateToEvent({
      id: "int-4",
      token: "tok-4",
      type: 3, // MESSAGE_COMPONENT
      channel_id: "ch-4",
      guild_id: "g-4",
      member: { user: { id: "u-4", username: "component-user" } },
      data: {
        custom_id: "button_click_handler",
        component_type: 2, // BUTTON
      },
      message: {
        id: "msg-4",
        content: "Click the button",
      },
    });
    assert.ok(ev);
    assert.strictEqual(ev.kind, "interaction_create");
    assert.strictEqual(ev.id, "int-4");
    assert.strictEqual(ev.token, "tok-4");
    assert.strictEqual(ev.type, 3);
    assert.strictEqual(ev.channelId, "ch-4");
    assert.strictEqual(ev.guildId, "g-4");
    assert.strictEqual(ev.userId, "u-4");
    assert.strictEqual(ev.data.custom_id, "button_click_handler");
    assert.strictEqual(ev.data.component_type, 2);
    assert.strictEqual(ev.data.message?.id, "msg-4");
    assert.strictEqual(ev.data.message?.content, "Click the button");
  });

  it("maps INTERACTION_CREATE payload with MODAL_SUBMIT type 5", () => {
    const ev = discordInteractionCreateToEvent({
      id: "int-5",
      token: "tok-5",
      type: 5, // MODAL_SUBMIT
      channel_id: "ch-5",
      guild_id: "g-5",
      member: { user: { id: "u-5", username: "modal-user" } },
      data: {
        custom_id: "modal_submit_handler",
        components: [
          {
            type: 1, // ACTION_ROW
            components: [
              {
                type: 4, // TEXT_INPUT
                custom_id: "input_field_1",
                value: "User input value",
              },
            ],
          },
        ],
      },
    });
    assert.ok(ev);
    assert.strictEqual(ev.kind, "interaction_create");
    assert.strictEqual(ev.id, "int-5");
    assert.strictEqual(ev.token, "tok-5");
    assert.strictEqual(ev.type, 5);
    assert.strictEqual(ev.channelId, "ch-5");
    assert.strictEqual(ev.guildId, "g-5");
    assert.strictEqual(ev.userId, "u-5");
    assert.strictEqual(ev.data.custom_id, "modal_submit_handler");
    assert.ok(Array.isArray(ev.data.components));
    assert.strictEqual(ev.data.components.length, 1);
    assert.strictEqual(ev.data.components[0].type, 1);
    assert.ok(Array.isArray(ev.data.components[0].components));
    assert.strictEqual(ev.data.components[0].components.length, 1);
    assert.strictEqual(ev.data.components[0].components[0].type, 4);
    assert.strictEqual(ev.data.components[0].components[0].custom_id, "input_field_1");
    assert.strictEqual(ev.data.components[0].components[0].value, "User input value");
  });

  it("maps INTERACTION_CREATE payload with SELECT_MENU component type", () => {
    const ev = discordInteractionCreateToEvent({
      id: "int-6",
      token: "tok-6",
      type: 3, // MESSAGE_COMPONENT
      channel_id: "ch-6",
      guild_id: "g-6",
      member: { user: { id: "u-6", username: "select-user" } },
      data: {
        custom_id: "select_menu_handler",
        component_type: 3, // SELECT_MENU
        values: ["option_1", "option_2", "option_3"],
      },
    });
    assert.ok(ev);
    assert.strictEqual(ev.type, 3);
    assert.strictEqual(ev.data.custom_id, "select_menu_handler");
    assert.strictEqual(ev.data.component_type, 3);
    assert.ok(Array.isArray(ev.data.values));
    assert.strictEqual(ev.data.values.length, 3);
    assert.strictEqual(ev.data.values[0], "option_1");
    assert.strictEqual(ev.data.values[1], "option_2");
    assert.strictEqual(ev.data.values[2], "option_3");
  });
});
