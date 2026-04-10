import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface ElevationGrant {
  id: string;
  sessionId: string;
  grantedAt: string;
  expiresAt: string;
  revoked: boolean;
}

const MAX_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export function createElevationStore(db: Database.Database) {
  return {
    grant(sessionId: string, durationMs?: number): ElevationGrant {
      const dur = Math.min(durationMs ?? DEFAULT_DURATION_MS, MAX_DURATION_MS);
      if (dur <= 0) throw new Error("duration_ms must be positive");
      const id = randomUUID();
      const now = new Date();
      const expires = new Date(now.getTime() + dur);
      db.prepare(
        `INSERT INTO elevation_grants (id, session_id, granted_at, expires_at)
         VALUES (@id, @sessionId, @grantedAt, @expiresAt)`,
      ).run({
        id,
        sessionId,
        grantedAt: now.toISOString(),
        expiresAt: expires.toISOString(),
      });
      return { id, sessionId, grantedAt: now.toISOString(), expiresAt: expires.toISOString(), revoked: false };
    },

    revoke(grantId: string): boolean {
      const r = db.prepare(`UPDATE elevation_grants SET revoked = 1 WHERE id = ? AND revoked = 0`).run(grantId);
      return r.changes > 0;
    },

    revokeAllForSession(sessionId: string): number {
      const r = db.prepare(`UPDATE elevation_grants SET revoked = 1 WHERE session_id = ? AND revoked = 0`).run(sessionId);
      return r.changes;
    },

    isActive(sessionId: string): boolean {
      const row = db.prepare(
        `SELECT 1 FROM elevation_grants
         WHERE session_id = ? AND revoked = 0 AND expires_at > datetime('now')
         LIMIT 1`,
      ).get(sessionId);
      return row != null;
    },

    getStatus(sessionId: string): { active: boolean; grant?: ElevationGrant; remainingMs?: number } {
      const row = db.prepare(
        `SELECT id, session_id, granted_at, expires_at, revoked
         FROM elevation_grants
         WHERE session_id = ? AND revoked = 0 AND expires_at > datetime('now')
         ORDER BY expires_at DESC LIMIT 1`,
      ).get(sessionId) as { id: string; session_id: string; granted_at: string; expires_at: string; revoked: number } | undefined;
      if (!row) return { active: false };
      const remaining = new Date(row.expires_at).getTime() - Date.now();
      return {
        active: remaining > 0,
        grant: {
          id: row.id,
          sessionId: row.session_id,
          grantedAt: row.granted_at,
          expiresAt: row.expires_at,
          revoked: false,
        },
        remainingMs: Math.max(0, remaining),
      };
    },
  };
}
