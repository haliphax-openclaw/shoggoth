import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveSessionAgentHitlPrincipalRoles,
  SHOGGOTH_HITL_UNKNOWN_SESSION_AGENT,
} from "../../src/hitl/session-agent-principals.js";

describe("resolveSessionAgentHitlPrincipalRoles", () => {
  it("returns agent:<id> from session URN", () => {
    assert.deepEqual(resolveSessionAgentHitlPrincipalRoles("agent:main:discord:00000000-0000-4000-8000-000000000001"), [
      "agent:main",
    ]);
  });

  it("uses same agent id for subagent URNs", () => {
    assert.deepEqual(
      resolveSessionAgentHitlPrincipalRoles(
        "agent:pytest:discord:10000000-0000-4000-8000-000000000001:20000000-0000-4000-8000-000000000002",
      ),
      ["agent:pytest"],
    );
  });

  it("falls back when session id is not an agent URN", () => {
    assert.deepEqual(resolveSessionAgentHitlPrincipalRoles("not-a-urn"), [SHOGGOTH_HITL_UNKNOWN_SESSION_AGENT]);
  });
});
