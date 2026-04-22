/**
 * Per-session steer channel for injecting operator guidance into active tool loops.
 * Follows the same singleton-map pattern as system-context-buffer.ts.
 */

const channels = new Map<string, string[]>();

/** Registers a steer channel for a session. Returns an unregister handle. */
export function registerSteerChannel(sessionId: string): {
  unregister: () => void;
} {
  const queue: string[] = [];
  channels.set(sessionId, queue);
  return {
    unregister: () => {
      if (channels.get(sessionId) === queue) channels.delete(sessionId);
    },
  };
}

/** Pushes a steer message. Returns true if an active channel exists. */
export function pushSteer(sessionId: string, message: string): boolean {
  const q = channels.get(sessionId);
  if (!q) return false;
  q.push(message);
  return true;
}

/** Drains all pending steer messages for a session. */
export function drainSteers(sessionId: string): string[] {
  const q = channels.get(sessionId);
  if (!q || q.length === 0) return [];
  return q.splice(0);
}

/** Visible for testing — clears all channels. */
export function _resetAllChannels(): void {
  channels.clear();
}
