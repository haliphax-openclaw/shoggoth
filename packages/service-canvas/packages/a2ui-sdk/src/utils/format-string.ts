export interface FormatStringOptions {
  transforms?: Record<string, { fn: string; field?: string }>;
  allRows?: Record<string, unknown>[];
}

function resolvePointer(obj: unknown, pointer: string): unknown {
  const parts = pointer.split("/").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function formatString(
  template: string,
  context: Record<string, unknown>,
  options?: FormatStringOptions,
): string {
  if (!template.includes("${")) return template;
  return template.replace(/\$\{([^}]+)\}/g, (match, expr: string) => {
    const [rawField, rawTransform] = expr.split("|").map((s: string) => s.trim());

    let val: unknown;
    if (rawField.startsWith("/")) {
      val = resolvePointer(context, rawField);
    } else {
      val = context[rawField];
    }

    if (rawTransform && options?.transforms?.[rawTransform]) {
      const t = options.transforms[rawTransform];
      if (t.fn === "percentOfMax" && options?.allRows) {
        const f = t.field || rawField;
        const max = Math.max(...options.allRows.map((r) => Number(r[f]) || 0));
        val = max ? ((Number(context[f] ?? val) || 0) / max) * 100 : 0;
      }
    }

    return val === undefined ? match : String(val ?? "");
  });
}
