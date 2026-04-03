import assert from "node:assert";
import { describe, it } from "vitest";
import {
  defaultPrimarySessionUrnForAgent,
  formatAgentSessionUrn,
  isSubagentSessionUrn,
  isValidAgentSessionUrn,
  mintAgentSessionUrn,
  mintSubagentSessionUrnFromParent,
  parseAgentSessionUrn,
  resolveAgentWorkspacePath,
  resolveTopLevelSessionUrn,
  SHOGGOTH_DEFAULT_PRIMARY_SESSION_UUID,
} from "../src/session-urn";

describe("session-urn", () => {
  // ── parseAgentSessionUrn ──────────────────────────────────────────

  it("parses new format URN with resourceType", () => {
    const p = parseAgentSessionUrn("agent:main:discord:channel:1480957862858719232");
    assert.deepStrictEqual(p, {
      agentId: "main",
      platform: "discord",
      resourceType: "channel",
      uuidChain: ["1480957862858719232"],
    });
  });

  it("parses new format subagent URN with resourceType", () => {
    const p = parseAgentSessionUrn(
      "agent:main:discord:channel:1480957862858719232:a31c6359-af42-4efa-b6ea-ff102ecfce0b",
    );
    assert.deepStrictEqual(p, {
      agentId: "main",
      platform: "discord",
      resourceType: "channel",
      uuidChain: ["1480957862858719232", "a31c6359-af42-4efa-b6ea-ff102ecfce0b"],
    });
  });

  it("rejects old format URNs (no resource type — only 3 segments after agent:)", () => {
    // Old format: agent:<agentId>:<platform>:<leaf> — only 3 segments after "agent:"
    // This is ambiguous with new format, but with exactly 3 colon-separated parts after "agent:",
    // there's no resourceType. The new minimum is 4 segments: agentId:platform:resourceType:leaf
    const result = parseAgentSessionUrn("agent:main:discord:1480957862858719232");
    assert.strictEqual(result, null, "old format with 3 segments after agent: should be rejected");
  });

  it("rejects URN with only agent:agentId:platform (no resourceType or leaf)", () => {
    assert.strictEqual(parseAgentSessionUrn("agent:main:discord"), null);
  });

  it("rejects URN with only agent:agentId (no platform, resourceType, or leaf)", () => {
    assert.strictEqual(parseAgentSessionUrn("agent:main"), null);
  });

  // ── formatAgentSessionUrn ─────────────────────────────────────────

  it("formats URN with resourceType parameter", () => {
    const u = formatAgentSessionUrn("dev", "discord", "channel", "30000000-0000-4000-8000-000000000003");
    assert.strictEqual(u, "agent:dev:discord:channel:30000000-0000-4000-8000-000000000003");
  });

  it("formats and parses round-trip with resourceType", () => {
    const u = formatAgentSessionUrn("dev", "discord", "channel", "30000000-0000-4000-8000-000000000003");
    assert.ok(isValidAgentSessionUrn(u));
    const p = parseAgentSessionUrn(u);
    assert.deepStrictEqual(p, {
      agentId: "dev",
      platform: "discord",
      resourceType: "channel",
      uuidChain: ["30000000-0000-4000-8000-000000000003"],
    });
  });

  it("formatAgentSessionUrn throws on empty resourceType", () => {
    assert.throws(() => formatAgentSessionUrn("dev", "discord", "", "some-leaf"));
  });

  it("formatAgentSessionUrn throws on invalid resourceType (contains colons)", () => {
    assert.throws(() => formatAgentSessionUrn("dev", "discord", "chan:nel", "some-leaf"));
  });

  // ── mintAgentSessionUrn ───────────────────────────────────────────

  it("mintAgentSessionUrn takes resourceType and produces valid URN", () => {
    const u = mintAgentSessionUrn("main", "discord", "channel");
    assert.ok(isValidAgentSessionUrn(u));
    const p = parseAgentSessionUrn(u);
    assert.strictEqual(p?.agentId, "main");
    assert.strictEqual(p?.platform, "discord");
    assert.strictEqual(p?.resourceType, "channel");
    assert.strictEqual(p?.uuidChain.length, 1);
  });

  // ── mintSubagentSessionUrnFromParent ──────────────────────────────

  it("mintSubagentSessionUrnFromParent preserves resourceType from parent", () => {
    const parent = formatAgentSessionUrn("main", "discord", "channel", "1480957862858719232");
    const sub = mintSubagentSessionUrnFromParent(parent, "50000000-0000-4000-8000-000000000005");
    const p = parseAgentSessionUrn(sub);
    assert.strictEqual(p?.resourceType, "channel");
    assert.strictEqual(p?.uuidChain.length, 2);
    assert.strictEqual(p?.uuidChain[0], "1480957862858719232");
    assert.strictEqual(p?.uuidChain[1], "50000000-0000-4000-8000-000000000005");
  });

  it("mintSubagentSessionUrnFromParent preserves resourceType 'subagent'", () => {
    const parent = formatAgentSessionUrn("main", "discord", "subagent", "40000000-0000-4000-8000-000000000004");
    const sub = mintSubagentSessionUrnFromParent(parent, "60000000-0000-4000-8000-000000000006");
    const p = parseAgentSessionUrn(sub);
    assert.strictEqual(p?.resourceType, "subagent");
    assert.strictEqual(p?.uuidChain[0], "40000000-0000-4000-8000-000000000004");
    assert.strictEqual(p?.uuidChain[1], "60000000-0000-4000-8000-000000000006");
  });

  // ── resolveTopLevelSessionUrn ─────────────────────────────────────

  it("resolveTopLevelSessionUrn works with new segment positions", () => {
    const sub = "agent:main:discord:channel:1480957862858719232:a31c6359-af42-4efa-b6ea-ff102ecfce0b";
    const top = resolveTopLevelSessionUrn(sub);
    assert.strictEqual(top, "agent:main:discord:channel:1480957862858719232");
  });

  it("resolveTopLevelSessionUrn returns null for top-level URN", () => {
    const top = "agent:main:discord:channel:1480957862858719232";
    assert.strictEqual(resolveTopLevelSessionUrn(top), null);
  });

  it("resolveTopLevelSessionUrn returns null for invalid URN", () => {
    assert.strictEqual(resolveTopLevelSessionUrn("garbage"), null);
  });

  // ── isSubagentSessionUrn ──────────────────────────────────────────

  it("isSubagentSessionUrn returns false for top-level new format", () => {
    const top = formatAgentSessionUrn("a", "discord", "channel", "40000000-0000-4000-8000-000000000004");
    assert.strictEqual(isSubagentSessionUrn(top), false);
  });

  it("isSubagentSessionUrn returns true for subagent new format", () => {
    const top = formatAgentSessionUrn("a", "discord", "channel", "40000000-0000-4000-8000-000000000004");
    const sub = mintSubagentSessionUrnFromParent(top, "50000000-0000-4000-8000-000000000005");
    assert.strictEqual(isSubagentSessionUrn(sub), true);
  });

  // ── defaultPrimarySessionUrnForAgent ──────────────────────────────

  it("defaultPrimarySessionUrnForAgent takes resourceType parameter", () => {
    const u = defaultPrimarySessionUrnForAgent("main", "discord", "channel");
    assert.strictEqual(
      u,
      formatAgentSessionUrn("main", "discord", "channel", SHOGGOTH_DEFAULT_PRIMARY_SESSION_UUID),
    );
    const p = parseAgentSessionUrn(u);
    assert.strictEqual(p?.resourceType, "channel");
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it("rejects empty resource type in URN string", () => {
    // agent:main:discord::leaf — empty resourceType segment
    assert.strictEqual(parseAgentSessionUrn("agent:main:discord::1480957862858719232"), null);
  });

  it("rejects resource type with invalid characters", () => {
    assert.strictEqual(parseAgentSessionUrn("agent:main:discord:chan nel:1480957862858719232"), null);
  });

  it("accepts various valid resource types", () => {
    for (const rt of ["channel", "subagent", "dm", "thread", "voice-channel", "my.type", "Type_01"]) {
      const u = formatAgentSessionUrn("main", "discord", rt, "some-leaf");
      const p = parseAgentSessionUrn(u);
      assert.strictEqual(p?.resourceType, rt, `resourceType ${rt} should round-trip`);
    }
  });

  // ── Preserved non-URN tests ───────────────────────────────────────

  it("resolveAgentWorkspacePath joins root and agent id", () => {
    const p = resolveAgentWorkspacePath("/var/lib/ws", "main");
    assert.match(p, /[/\\]main$/);
  });
});
