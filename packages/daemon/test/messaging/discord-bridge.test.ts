import { describe, it } from "node:test";
import assert from "node:assert";
import type { ShoggothConfig } from "@shoggoth/shared";
import {
  parseDiscordRoutesJson,
  parseDiscordRoutesWithMeta,
  startDiscordMessagingIfConfigured,
} from "../../src/messaging/discord-bridge";
import { createLogger } from "../../src/logging";

const routeGuardCfg = {
  runtime: { agentId: "main", defaultSessionPlatform: "discord" },
} as ShoggothConfig;

const u1 = "agent:test:discord:10000000-0000-4000-8000-000000000001";
const u2 = "agent:test:discord:10000000-0000-4000-8000-000000000002";

describe("discord-bridge", () => {
  it("parseDiscordRoutesJson accepts guild and DM-style routes", () => {
    const routes = parseDiscordRoutesJson(
      JSON.stringify([
        { guildId: "g1", channelId: "c1", sessionId: u1 },
        { channelId: "dm1", sessionId: u2 },
      ]),
    );
    assert.equal(routes.length, 2);
    assert.equal(routes[0]!.guildId, "g1");
    assert.equal(routes[1]!.guildId, undefined);
  });

  it("parseDiscordRoutesJson rejects invalid JSON shape", () => {
    assert.throws(() => parseDiscordRoutesJson("{}"), /array/);
  });

  it("parseDiscordRoutesJson drops non-URN session ids (e.g. bare main)", () => {
    const { routes, inputRowCount } = parseDiscordRoutesWithMeta(
      JSON.stringify([{ channelId: "c", sessionId: "main" }]),
    );
    assert.equal(inputRowCount, 1);
    assert.equal(routes.length, 0);
  });

  it("parseDiscordRoutesJson keeps valid URNs when mixed with invalid rows", () => {
    const { routes, inputRowCount } = parseDiscordRoutesWithMeta(
      JSON.stringify([
        { channelId: "c", sessionId: "main" },
        { channelId: "c2", sessionId: u1 },
      ]),
    );
    assert.equal(inputRowCount, 2);
    assert.equal(routes.length, 1);
    assert.equal(routes[0]!.channelId, "c2");
    assert.equal(routes[0]!.sessionId, u1);
  });

  it("parseDiscordRoutesJson drops garbage session ids", () => {
    const { routes, inputRowCount } = parseDiscordRoutesWithMeta(
      JSON.stringify([{ channelId: "c", sessionId: "!!!" }]),
    );
    assert.equal(inputRowCount, 1);
    assert.equal(routes.length, 0);
  });

  it("parseDiscordRoutesJson accepts channel snowflake session URNs", () => {
    const sid = "agent:main:discord:1487579255616573533";
    const routes = parseDiscordRoutesJson(
      JSON.stringify([{ guildId: "g", channelId: "1487579255616573533", sessionId: sid }]),
    );
    assert.equal(routes.length, 1);
    assert.equal(routes[0]!.sessionId, sid);
  });

  it("parseDiscordRoutesJson drops routes when URN platform is not discord", () => {
    const { routes, inputRowCount } = parseDiscordRoutesWithMeta(
      JSON.stringify([
        {
          channelId: "c1",
          sessionId: "agent:main:slack:30000000-0000-4000-8000-000000000003",
        },
      ]),
    );
    assert.equal(inputRowCount, 1);
    assert.equal(routes.length, 0);
  });

  it("parseDiscordRoutesJson drops routes when discord tail is not uuid or snowflake", () => {
    const { routes, inputRowCount } = parseDiscordRoutesWithMeta(
      JSON.stringify([
        { channelId: "1487579255616573533", sessionId: "agent:main:discord:not-a-uuid-or-snowflake" },
      ]),
    );
    assert.equal(inputRowCount, 1);
    assert.equal(routes.length, 0);
  });

  it("returns undefined without token", async () => {
    const log = createLogger({ component: "t", minLevel: "error" });
    const r = await startDiscordMessagingIfConfigured({
      logger: log,
      botToken: undefined,
      routesJson: `[{"channelId":"c","sessionId":"${u1}"}]`,
    });
    assert.equal(r, undefined);
  });

  it("returns undefined without routes when token set", async () => {
    const log = createLogger({ component: "t", minLevel: "error" });
    const r = await startDiscordMessagingIfConfigured({
      logger: log,
      botToken: "x",
      routesJson: undefined,
    });
    assert.equal(r, undefined);
  });

  it("rejects routes when snowflake session leaf does not match channelId", async () => {
    const log = createLogger({ component: "t", minLevel: "error" });
    await assert.rejects(
      () =>
        startDiscordMessagingIfConfigured({
          logger: log,
          botToken: "token",
          routesJson: JSON.stringify([
            {
              guildId: "g",
              channelId: "1487579255616573533",
              sessionId: "agent:main:discord:1487579255616579999",
            },
          ]),
          deps: {
            connectGateway: async () => ({
              stop: async () => {},
              getBotUserId: () => undefined,
            }),
          },
        }),
      /must equal channelId/,
    );
  });

  it("rejects routes when default-primary UUID does not match SHOGGOTH_AGENT_ID guard config", async () => {
    const log = createLogger({ component: "t", minLevel: "error" });
    await assert.rejects(
      () =>
        startDiscordMessagingIfConfigured({
          logger: log,
          botToken: "token",
          routesJson: JSON.stringify([
            { channelId: "ch", sessionId: "agent:wrong:discord:00000000-0000-4000-8000-000000000001" },
          ]),
          routeGuardConfig: routeGuardCfg,
          deps: {
            connectGateway: async () => ({
              stop: async () => {},
              getBotUserId: () => undefined,
            }),
          },
        }),
      /reserved primary UUID/,
    );
  });

  it("starts with mocked gateway and registers outbound/streaming", async () => {
    const log = createLogger({ component: "t", minLevel: "error" });
    let stopped = false;
    const runtime = await startDiscordMessagingIfConfigured({
      logger: log,
      botToken: "token",
      routesJson: JSON.stringify([{ guildId: "g", channelId: "ch", sessionId: u1 }]),
      routeGuardConfig: routeGuardCfg,
      deps: {
        connectGateway: async () => ({
          stop: async () => {
            stopped = true;
          },
          getBotUserId: () => "mock-discord-bot",
        }),
      },
    });
    assert.ok(runtime);
    assert.equal(runtime!.discordBotUserId, "mock-discord-bot");
    assert.equal(runtime!.routes.length, 1);
    assert.equal(runtime!.capabilities.platform, "discord");
    assert.equal(typeof runtime!.outbound.sendDiscord, "function");
    assert.equal(typeof runtime!.notifyAgentTypingForSession, "function");
    assert.ok(runtime!.streamingForSession(u1));
    assert.equal(runtime!.streamingForSession("unknown"), undefined);
    await runtime!.stop();
    assert.equal(stopped, true);
  });
});
