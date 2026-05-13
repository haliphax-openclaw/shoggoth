import type { A2UIStore } from "./a2ui-store";

export interface A2UISurface {
  surfaceId: string;
  session: string;
  /** v0.9 flat shape: value is { component: "Text", text: "..." } (no id) */
  components: Map<string, { component: string; [key: string]: unknown }>;
  root: string | null;
  dataModel: Record<string, unknown>;
  catalogId?: string;
  theme?: string;
}

/** Composite key for session-scoped surfaces */
function key(session: string, surfaceId: string): string {
  return `${session}\0${surfaceId}`;
}

export class A2UIManager {
  private surfaces = new Map<string, A2UISurface>();
  private store: A2UIStore | null;

  constructor(store?: A2UIStore) {
    this.store = store ?? null;
    if (this.store) {
      for (const row of this.store.loadAll()) {
        const componentsObj = JSON.parse(row.components) as Record<
          string,
          { component: string; [key: string]: unknown }
        >;
        const components = new Map(Object.entries(componentsObj));
        this.surfaces.set(key(row.session, row.surfaceId), {
          surfaceId: row.surfaceId,
          session: row.session,
          components,
          root: row.root,
          dataModel: JSON.parse(row.dataModel),
          catalogId: row.catalogId ?? undefined,
          theme: row.theme ?? undefined,
        });
      }
    }
  }

  allSurfaces(): IterableIterator<A2UISurface> {
    return this.surfaces.values();
  }

  surfacesForSession(session: string): A2UISurface[] {
    const result: A2UISurface[] = [];
    for (const s of this.surfaces.values()) {
      if (s.session === session) result.push(s);
    }
    return result;
  }

  upsertSurface(
    session: string,
    surfaceId: string,
    components: Array<{ id: string; component: string; [key: string]: unknown }>,
  ) {
    const k = key(session, surfaceId);
    let surface = this.surfaces.get(k);
    if (!surface) {
      surface = { surfaceId, session, components: new Map(), root: null, dataModel: {} };
      this.surfaces.set(k, surface);
    }
    for (const { id, ...rest } of components) {
      surface.components.set(id, rest as { component: string; [key: string]: unknown });
    }
    this.store?.save(session, surface);
  }

  setRoot(
    session: string,
    surfaceId: string,
    root: string,
    opts?: { catalogId?: string; theme?: string },
  ) {
    const surface = this.surfaces.get(key(session, surfaceId));
    if (surface) {
      surface.root = root;
      if (opts?.catalogId !== undefined) surface.catalogId = opts.catalogId;
      if (opts?.theme !== undefined) surface.theme = opts.theme;
      this.store?.save(session, surface);
    }
  }

  updateDataModel(session: string, surfaceId: string, data: Record<string, unknown>) {
    const surface = this.surfaces.get(key(session, surfaceId));
    if (surface) {
      // Normalize array rows to object rows in $sources
      if (data.$sources && typeof data.$sources === "object") {
        const sources = data.$sources as Record<string, any>;
        for (const [name, src] of Object.entries(sources)) {
          if (src?.rows && Array.isArray(src.rows) && Array.isArray(src.fields)) {
            const fields: string[] = src.fields;
            const hasArrayRows = src.rows.some((r: any) => Array.isArray(r));
            if (hasArrayRows) {
              console.log(
                `[a2ui-manager] Normalizing array rows for source "${name}" in ${surfaceId}`,
              );
              src.rows = src.rows.map((r: any) =>
                Array.isArray(r)
                  ? Object.fromEntries(fields.map((f: string, i: number) => [f, r[i]]))
                  : r,
              );
            }
          }
        }
      }
      Object.assign(surface.dataModel, data);
      this.store?.save(session, surface);
    }
  }

  deleteSurface(session: string, surfaceId: string) {
    this.surfaces.delete(key(session, surfaceId));
    this.store?.delete(session, surfaceId);
  }

  clearSession(session: string) {
    for (const [k, s] of this.surfaces) {
      if (s.session === session) this.surfaces.delete(k);
    }
    this.store?.clearSession(session);
  }

  clearAll() {
    this.surfaces.clear();
    this.store?.clear();
  }

  getSurface(session: string, surfaceId: string): A2UISurface | undefined {
    return this.surfaces.get(key(session, surfaceId));
  }

  /** Serialize for sending to SPA */
  serialize(session: string, surfaceId: string): Record<string, unknown> | null {
    const s = this.surfaces.get(key(session, surfaceId));
    if (!s) return null;
    const components: Record<string, Record<string, unknown>> = {};
    for (const [id, comp] of s.components) components[id] = comp;
    return {
      surfaceId: s.surfaceId,
      session: s.session,
      components,
      root: s.root,
      dataModel: s.dataModel,
    };
  }
}
