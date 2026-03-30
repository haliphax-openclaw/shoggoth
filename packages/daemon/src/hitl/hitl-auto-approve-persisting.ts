import { parseAgentSessionUrn } from "@shoggoth/shared";
import type Database from "better-sqlite3";
import type { ShoggothConfig } from "@shoggoth/shared";
import type { HitlConfigRef } from "../config-hot-reload";
import type { Logger } from "../logging";
import { persistAgentToolAutoApproveAndReload } from "./hitl-agent-tool-auto-persist";
import {
  insertSessionToolAutoApprove,
  sessionHasToolAutoApprove,
} from "./hitl-session-tool-auto-store";
import type { HitlAutoApproveGate } from "./hitl-auto-approve";

export function createPersistingHitlAutoApproveGate(input: {
  readonly db: Database.Database;
  readonly configDirectory: string;
  readonly configRef: { current: ShoggothConfig };
  readonly hitlRef: HitlConfigRef;
  readonly logger: Logger;
}): HitlAutoApproveGate {
  return {
    enableSessionTool(sessionId, toolName) {
      insertSessionToolAutoApprove(input.db, sessionId, toolName);
    },
    enableAgentTool(agentId, toolName) {
      try {
        persistAgentToolAutoApproveAndReload({
          configDirectory: input.configDirectory,
          configRef: input.configRef,
          hitlRef: input.hitlRef,
          agentId,
          toolName,
        });
      } catch (e) {
        input.logger.warn("hitl.agent_tool_auto_persist_failed", {
          err: String(e),
          agentId,
          toolName,
        });
      }
    },
    shouldAutoApprove(sessionId, toolName) {
      const sid = sessionId.trim();
      const t = toolName.trim();
      if (sessionHasToolAutoApprove(input.db, sid, t)) return true;
      const p = parseAgentSessionUrn(sid);
      if (!p) return false;
      const list = input.hitlRef.value.agentToolAutoApprove[p.agentId];
      return Array.isArray(list) && list.includes(t);
    },
  };
}
