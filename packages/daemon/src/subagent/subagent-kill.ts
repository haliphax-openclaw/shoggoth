import type { SessionManager } from "../sessions/session-manager";
import { disposeSubagentRuntime } from "./subagent-disposables";

/** Clears in-process bindings then terminates the session (tokens revoked, status terminated). */
export function terminateBoundSubagentSession(sessionManager: SessionManager, sessionId: string): void {
  disposeSubagentRuntime(sessionId);
  sessionManager.kill(sessionId);
}
