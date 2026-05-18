import { toRaw } from "vue";

/**
 * Plain row object for template interpolation (Repeat, formatString).
 * When `fields` is provided, reads each key from the row (via proxy getters if needed).
 * This avoids empty objects from `{ ...toRaw(row) }` on some Vuex-reactive row shapes.
 */
export function materializeDataRow(
  row: unknown,
  fields?: readonly string[] | null,
): Record<string, unknown> {
  if (row === null || row === undefined) return {};

  if (Array.isArray(row) && fields?.length) {
    return Object.fromEntries(fields.map((f, i) => [f, row[i]]));
  }

  if (fields?.length) {
    const out: Record<string, unknown> = {};
    const r = row as Record<string, unknown>;
    for (const f of fields) {
      out[f] = r[f];
    }
    return out;
  }

  const raw = toRaw(row);
  const live = row as Record<string, unknown>;
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    const plain = raw as Record<string, unknown>;
    const out: Record<string, unknown> = { ...plain };
    for (const k of Object.keys(live)) {
      if (!(k in out)) out[k] = live[k];
    }
    if (Object.keys(out).length === 0) {
      try {
        const clone = structuredClone(raw) as Record<string, unknown>;
        if (Object.keys(clone).length > 0) return clone;
      } catch {
        /* non-cloneable row */
      }
    }
    return out;
  }
  return {};
}
