import { computed } from "vue";
import { useStore } from "vuex";
import { parseShoggothUrl, executeDeepLink } from "../utils/deep-link";

interface FilterBind {
  source: string | string[];
  field: string;
  op?: "eq" | "contains" | "gte" | "lte" | "range" | "in";
  nullValue?: unknown;
  emitTo?: string;
}

export function useFilterBind(
  props: { def: Record<string, unknown>; componentId: string; surfaceId: string },
  defaults?: { op?: FilterBind["op"]; nullValue?: unknown },
) {
  const store = useStore();
  const bind = computed(() => (props.def as any).bind as FilterBind | undefined);

  function isNullValue(value: unknown, nullValue: unknown): boolean {
    if (Array.isArray(value) && Array.isArray(nullValue)) {
      return value.length === nullValue.length && value.every((v, i) => v === nullValue[i]);
    }
    return value === nullValue;
  }

  function updateFilter(value: unknown) {
    if (!bind.value) return;
    const sources = Array.isArray(bind.value.source) ? bind.value.source : [bind.value.source];
    const nullValue = bind.value.nullValue ?? defaults?.nullValue ?? "";
    for (const source of sources) {
      store.commit("a2ui/setFilter", {
        surfaceId: props.surfaceId,
        source,
        field: bind.value.field,
        op: bind.value.op ?? defaults?.op ?? "eq",
        value,
        nullValue,
        isNull: isNullValue(value, nullValue) || (Array.isArray(value) && value.length === 0),
        componentId: props.componentId,
      });
    }
  }

  function maybeEmit(value: unknown) {
    const emitTo = (props.def as any).emitTo ?? bind.value?.emitTo;
    if (!emitTo) return;
    const url = emitTo.replace(/\{\{value\}\}/g, encodeURIComponent(String(value)));
    const req = parseShoggothUrl(url);
    if (req) executeDeepLink(req);
  }

  return { bind, updateFilter, maybeEmit };
}
