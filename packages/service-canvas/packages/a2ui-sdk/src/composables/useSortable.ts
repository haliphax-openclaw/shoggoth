import { ref, computed, type Ref } from "vue";

type Row = Record<string, unknown>;

function compare(a: unknown, b: unknown, dir: number): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return dir * (a - b);
  return dir * String(a).localeCompare(String(b));
}

export type SortDirection = "asc" | "desc" | null;

export function useSortable(rows: Ref<Row[]>) {
  const sortField = ref<string | null>(null);
  const sortDirection = ref<SortDirection>(null);

  const sortedRows = computed(() => {
    if (!sortField.value || !sortDirection.value) return rows.value;
    const field = sortField.value;
    const dir = sortDirection.value === "asc" ? 1 : -1;
    return [...rows.value].sort((a, b) => compare(a[field], b[field], dir));
  });

  function cycleSort(field: string) {
    if (sortField.value !== field) {
      sortField.value = field;
      sortDirection.value = "asc";
    } else if (sortDirection.value === "asc") {
      sortDirection.value = "desc";
    } else {
      sortField.value = null;
      sortDirection.value = null;
    }
  }

  function setSort(field: string | null, direction: SortDirection) {
    sortField.value = field;
    sortDirection.value = direction;
  }

  return { sortField, sortDirection, sortedRows, cycleSort, setSort };
}
