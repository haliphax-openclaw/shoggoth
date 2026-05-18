import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

export interface A2UISurfaceRow {
  session: string;
  surfaceId: string;
  components: string; // JSON
  root: string | null;
  dataModel: string; // JSON
  theme: string | null;
  catalogId: string | null;
}

export class A2UIStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath ??
      process.env.SHOGGOTH_CANVAS_A2UI_DB ??
      path.join(process.env.HOME ?? ".", ".shoggoth-canvas", "a2ui-cache.db");
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate() {
    const tableInfo = this.db.prepare("PRAGMA table_info(a2ui_surfaces)").all() as Array<{
      name: string;
    }>;
    const hasTable = tableInfo.length > 0;
    const hasSession = tableInfo.some((c) => c.name === "session");
    const hasTheme = tableInfo.some((c) => c.name === "theme");

    if (hasTable && !hasSession) {
      // Migrate: add session column, rebuild primary key
      this.db.exec(`
        ALTER TABLE a2ui_surfaces RENAME TO a2ui_surfaces_old;
        CREATE TABLE a2ui_surfaces (
          session TEXT NOT NULL,
          surfaceId TEXT NOT NULL,
          components TEXT NOT NULL DEFAULT '{}',
          root TEXT,
          dataModel TEXT NOT NULL DEFAULT '{}',
          theme TEXT,
          catalogId TEXT,
          PRIMARY KEY (session, surfaceId)
        );
        INSERT INTO a2ui_surfaces (session, surfaceId, components, root, dataModel)
          SELECT 'main', surfaceId, components, root, dataModel FROM a2ui_surfaces_old;
        DROP TABLE a2ui_surfaces_old;
      `);
    } else if (!hasTable) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS a2ui_surfaces (
          session TEXT NOT NULL,
          surfaceId TEXT NOT NULL,
          components TEXT NOT NULL DEFAULT '{}',
          root TEXT,
          dataModel TEXT NOT NULL DEFAULT '{}',
          theme TEXT,
          catalogId TEXT,
          PRIMARY KEY (session, surfaceId)
        )
      `);
    } else if (hasTable && !hasTheme) {
      // Existing table with session but missing theme/catalogId columns
      this.db.exec(`
        ALTER TABLE a2ui_surfaces ADD COLUMN theme TEXT;
        ALTER TABLE a2ui_surfaces ADD COLUMN catalogId TEXT;
      `);
    }
  }

  save(
    session: string,
    surface: {
      surfaceId: string;
      components: Map<string, Record<string, unknown>>;
      root: string | null;
      dataModel: Record<string, unknown>;
      theme?: string;
      catalogId?: string;
    },
  ) {
    const componentsObj: Record<string, Record<string, unknown>> = {};
    for (const [id, comp] of surface.components) componentsObj[id] = comp;
    this.db
      .prepare(`
      INSERT OR REPLACE INTO a2ui_surfaces (session, surfaceId, components, root, dataModel, theme, catalogId)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
      .run(
        session,
        surface.surfaceId,
        JSON.stringify(componentsObj),
        surface.root,
        JSON.stringify(surface.dataModel),
        surface.theme ?? null,
        surface.catalogId ?? null,
      );
  }

  load(session: string, surfaceId: string): A2UISurfaceRow | undefined {
    return this.db
      .prepare("SELECT * FROM a2ui_surfaces WHERE session = ? AND surfaceId = ?")
      .get(session, surfaceId) as A2UISurfaceRow | undefined;
  }

  loadAll(): A2UISurfaceRow[] {
    return this.db.prepare("SELECT * FROM a2ui_surfaces").all() as A2UISurfaceRow[];
  }

  delete(session: string, surfaceId: string) {
    this.db
      .prepare("DELETE FROM a2ui_surfaces WHERE session = ? AND surfaceId = ?")
      .run(session, surfaceId);
  }

  clearSession(session: string) {
    this.db.prepare("DELETE FROM a2ui_surfaces WHERE session = ?").run(session);
  }

  clear() {
    this.db.exec("DELETE FROM a2ui_surfaces");
  }

  close() {
    this.db.close();
  }
}
