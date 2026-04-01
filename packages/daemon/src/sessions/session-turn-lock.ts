/**
 * Per-session async mutex to serialize model turns.
 * Concurrent callers for the same session queue up; different sessions run in parallel.
 */
export class SessionTurnLock {
  private readonly chains = new Map<string, Promise<void>>();
  private readonly pending = new Map<string, number>();

  /**
   * Acquire the lock for a session. Returns a release function that MUST be
   * called (ideally in a `finally` block) when the turn is done.
   */
  acquire(sessionId: string): Promise<() => void> {
    this.pending.set(sessionId, (this.pending.get(sessionId) ?? 0) + 1);

    const prev = this.chains.get(sessionId) ?? Promise.resolve();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = () => {
        const count = (this.pending.get(sessionId) ?? 1) - 1;
        if (count <= 0) {
          this.pending.delete(sessionId);
          this.chains.delete(sessionId);
        } else {
          this.pending.set(sessionId, count);
        }
        resolve();
      };
    });

    // Chain this caller after the previous one completes.
    // We swallow rejections on `prev` so a failed turn doesn't break the chain.
    const ready = prev.then(() => release);
    this.chains.set(sessionId, gate);

    return ready;
  }
}
