/**
 * Resolve JSON Pointer–style paths against a surface data model (A2UI v0.9).
 * Paths use "/" segments, e.g. "/user/email" or "user/email".
 */
export function getDataModelValue(obj: unknown, pointer: string): unknown {
  const normalized = pointer.startsWith("/") ? pointer : `/${pointer}`;
  const parts = normalized.split("/").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** DynamicString: plain string, v0.8 literalString wrapper, or { path } binding. */
export function resolveDynamicString(raw: unknown, dataModel: Record<string, unknown>): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown>;
    if (typeof o.literalString === "string") return o.literalString;
    if (typeof o.path === "string") {
      const v = getDataModelValue(dataModel, o.path);
      return v == null ? "" : String(v);
    }
  }
  return String(raw);
}

/** DynamicBoolean: boolean literal or { path } to a boolean in the data model. */
export function resolveDynamicBoolean(
  raw: unknown,
  dataModel: Record<string, unknown>,
): boolean | undefined {
  if (typeof raw === "boolean") return raw;
  if (raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).path === "string") {
    const v = getDataModelValue(dataModel, (raw as Record<string, unknown>).path as string);
    if (typeof v === "boolean") return v;
    return undefined;
  }
  return undefined;
}
