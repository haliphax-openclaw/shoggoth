/**
 * Run inside the Shoggoth container (see readiness-compose.test.mjs).
 * Creates fixed session rows + one agent workspace (`readiness`) for two Discord route URNs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createSessionStore,
  defaultMigrationsDir,
  ensureAgentWorkspaceLayout,
  migrate,
  openStateDb,
} from "@shoggoth/daemon/lib";
import {
  readinessDmSessionUrn,
  readinessGuildSessionUrn,
  resolveAgentWorkspacePath,
} from "@shoggoth/shared";

const dbPath = "/var/lib/shoggoth/state/shoggoth.db";
const AGENT_ID = "readiness";
const wsRoot = process.env.SHOGGOTH_WORKSPACES_ROOT?.trim() || "/var/lib/shoggoth/workspaces";
const dir = resolveAgentWorkspacePath(wsRoot, AGENT_ID);
const sessions = [
  { id: readinessGuildSessionUrn(AGENT_ID) },
  { id: readinessDmSessionUrn(AGENT_ID) },
];

const db = openStateDb(dbPath);
try {
  migrate(db, defaultMigrationsDir());
  const store = createSessionStore(db);
  ensureAgentWorkspaceLayout(dir);
  mkdirSync(join(dir, "memory"), { recursive: true, mode: 0o770 });
  writeFileSync(
    `${dir}/skills/readiness-skill.md`,
    "---\ntitle: Readiness skill\n---\n# Readiness\nSkill body for scanRoots test.\n",
  );
  writeFileSync(`${dir}/memory/note.md`, "# Memory note\n\nreadiness-alpha unique phrase for FTS.\n");
  for (const s of sessions) {
    if (!store.getById(s.id)) {
      store.create({
        id: s.id,
        workspacePath: dir,
        status: "active",
        runtimeUid: 901,
        runtimeGid: 901,
      });
    }
  }
} finally {
  db.close();
}
console.log(JSON.stringify({ ok: true, sessions: sessions.map((s) => s.id) }));
