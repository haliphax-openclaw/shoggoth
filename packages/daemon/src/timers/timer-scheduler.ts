// ---------------------------------------------------------------------------
// TimerScheduler — in-process setTimeout-based scheduler with min-heap
// ---------------------------------------------------------------------------

import type Database from "better-sqlite3";
import { TimerHeap, type TimerEntry } from "./timer-heap";
import { getLogger } from "../logging";

const log = getLogger("timer-scheduler");

interface TimerRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly label: string;
  readonly fireAt: string; // ISO 8601 UTC
  readonly message: string;
}

type TimerDeliveryFn = (sessionId: string, message: string) => Promise<void>;

export class TimerScheduler {
  private readonly heap = new TimerHeap();
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private db: Database.Database | undefined;
  private readonly deliver: TimerDeliveryFn;

  constructor(deliver: TimerDeliveryFn) {
    this.deliver = deliver;
  }

  /** Schedule a new timer. Inserts into DB and adds to the in-memory heap. */
  schedule(db: Database.Database, timer: TimerRecord): void {
    this.db = db;
    db.prepare(
      `INSERT INTO timers (id, session_id, label, fire_at, message)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(timer.id, timer.sessionId, timer.label, timer.fireAt, timer.message);

    const entry: TimerEntry = {
      id: timer.id,
      sessionId: timer.sessionId,
      label: timer.label,
      fireAt: timer.fireAt,
      message: timer.message,
    };
    this.heap.insert(entry);
    this.reschedule();
  }

  /** Cancel a timer by ID. Marks fired=1 in DB and removes from heap. */
  cancel(db: Database.Database, id: string): boolean {
    this.db = db;
    const removed = this.heap.removeById(id);
    if (!removed) {
      // Maybe already fired or doesn't exist
      const row = db
        .prepare("SELECT id FROM timers WHERE id = ? AND fired = 0")
        .get(id) as { id: string } | undefined;
      if (!row) return false;
    }
    db.prepare("UPDATE timers SET fired = 1 WHERE id = ?").run(id);
    if (removed) {
      this.reschedule();
    }
    return true;
  }

  /** List active (unfired) timers for a session. */
  listForSession(db: Database.Database, sessionId: string): TimerRecord[] {
    const rows = db
      .prepare(
        "SELECT id, session_id, label, fire_at, message FROM timers WHERE session_id = ? AND fired = 0 ORDER BY fire_at ASC",
      )
      .all(sessionId) as Array<{
      id: string;
      session_id: string;
      label: string;
      fire_at: string;
      message: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      label: r.label,
      fireAt: r.fire_at,
      message: r.message,
    }));
  }

  /** Count active (unfired) timers for a session. */
  countForSession(db: Database.Database, sessionId: string): number {
    const row = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM timers WHERE session_id = ? AND fired = 0",
      )
      .get(sessionId) as { cnt: number };
    return row.cnt;
  }

  /** Restore state on startup: fire any past-due timers, schedule the rest. */
  async restore(db: Database.Database): Promise<void> {
    this.db = db;
    const rows = db
      .prepare(
        "SELECT id, session_id, label, fire_at, message FROM timers WHERE fired = 0 ORDER BY fire_at ASC",
      )
      .all() as Array<{
      id: string;
      session_id: string;
      label: string;
      fire_at: string;
      message: string;
    }>;

    const now = new Date().toISOString();
    for (const r of rows) {
      const entry: TimerEntry = {
        id: r.id,
        sessionId: r.session_id,
        label: r.label,
        fireAt: r.fire_at,
        message: r.message,
      };
      if (r.fire_at <= now) {
        // Past-due: fire immediately
        await this.fireTimer(db, entry);
      } else {
        this.heap.insert(entry);
      }
    }
    this.reschedule();
    if (rows.length > 0) {
      log.info("timers restored", {
        total: rows.length,
        pending: this.heap.size,
      });
    }
  }

  /** Tear down — clear pending timeout. */
  shutdown(): void {
    if (this.timeout !== undefined) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
  }

  // ---- internal ----

  private async fireTimer(
    db: Database.Database,
    entry: TimerEntry,
  ): Promise<void> {
    try {
      db.prepare("UPDATE timers SET fired = 1 WHERE id = ?").run(entry.id);
      await this.deliver(entry.sessionId, entry.message);
      log.debug("timer fired", {
        id: entry.id,
        sessionId: entry.sessionId,
        label: entry.label,
      });
    } catch (e) {
      log.warn("timer delivery failed", {
        id: entry.id,
        sessionId: entry.sessionId,
        err: String(e),
      });
    }
  }

  private reschedule(): void {
    if (this.timeout !== undefined) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
    const head = this.heap.peek();
    if (!head) return;

    const delayMs = Math.max(0, new Date(head.fireAt).getTime() - Date.now());
    this.timeout = setTimeout(() => {
      void this.tick();
    }, delayMs);
    // Prevent the timer from keeping the process alive during shutdown
    if (
      this.timeout &&
      typeof this.timeout === "object" &&
      "unref" in this.timeout
    ) {
      (this.timeout as NodeJS.Timeout).unref();
    }
  }

  private async tick(): Promise<void> {
    this.timeout = undefined;
    const db = this.db;
    if (!db) return;

    // Fire all past-due timers
    const now = new Date().toISOString();
    while (this.heap.size > 0) {
      const head = this.heap.peek()!;
      if (head.fireAt > now) break;
      this.heap.extractMin();
      await this.fireTimer(db, head);
    }
    this.reschedule();
  }
}
