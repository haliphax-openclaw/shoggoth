export interface FieldFilter {
  field: string;
  op: "eq" | "contains" | "gte" | "lte" | "range" | "in";
  value: unknown;
  nullValue: unknown;
  isNull: boolean;
  componentId: string;
}

export interface AggregateSpec {
  fn: "count" | "sum" | "avg" | "min" | "max";
  field?: string;
}

type Row = Record<string, unknown>;

export function matchFilter(row: Row, f: FieldFilter): boolean {
  const v = row[f.field];
  switch (f.op) {
    case "eq":
      return v === f.value;
    case "contains":
      return (
        typeof v === "string" &&
        typeof f.value === "string" &&
        v.toLowerCase().includes(f.value.toLowerCase())
      );
    case "gte":
      return (v as number) >= (f.value as number);
    case "lte":
      return (v as number) <= (f.value as number);
    case "range": {
      const [lo, hi] = f.value as [number, number];
      const n = v as number;
      return n >= lo && n <= hi;
    }
    case "in":
      return Array.isArray(f.value) && f.value.includes(v);
    default:
      return true;
  }
}

export function applyFilters(rows: Row[], filters: FieldFilter[]): Row[] {
  const active = filters.filter((f) => !f.isNull);
  if (!active.length) return rows;
  return rows.filter((row) => active.every((f) => matchFilter(row, f)));
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

export function computeAggregate(spec: AggregateSpec, rows: Row[]): number {
  if (spec.fn === "count") return rows.length;
  const vals = rows.map((r) => Number(r[spec.field!])).filter((n) => !isNaN(n));
  if (!vals.length) return 0;
  switch (spec.fn) {
    case "sum":
      return vals.reduce((a, b) => a + b, 0);
    case "avg":
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    case "min":
      return Math.min(...vals);
    case "max":
      return Math.max(...vals);
  }
}
