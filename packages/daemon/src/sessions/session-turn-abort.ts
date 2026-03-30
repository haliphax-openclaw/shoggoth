/**
 * Per-session {@link AbortSignal} for the **currently running** tool/model loop (one scope per turn).
 * {@link requestSessionTurnAbort} is used by operator control op `session_abort` (any session with an active turn).
 */

export class TurnAbortedError extends Error {
  constructor() {
    super("aborted");
    this.name = "TurnAbortedError";
  }
}

const controllers = new Map<string, AbortController>();

/**
 * Registers a fresh controller for `sessionId` and returns its signal. Call `end()` in a `finally`
 * block when the turn finishes so the map entry is cleared.
 */
export function beginSessionTurnAbortScope(sessionId: string): {
  readonly signal: AbortSignal;
  readonly end: () => void;
} {
  const sid = sessionId.trim();
  const ac = new AbortController();
  controllers.set(sid, ac);
  return {
    signal: ac.signal,
    end: () => {
      if (controllers.get(sid) === ac) controllers.delete(sid);
    },
  };
}

/** Aborts the in-process turn for this session, if any. Returns whether a live scope existed. */
export function requestSessionTurnAbort(sessionId: string): boolean {
  const sid = sessionId.trim();
  const ac = controllers.get(sid);
  if (!ac) return false;
  ac.abort();
  return true;
}
