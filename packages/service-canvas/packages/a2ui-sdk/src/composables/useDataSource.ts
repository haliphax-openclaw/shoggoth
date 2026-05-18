import { computed } from "vue";
import { useStore } from "vuex";
import { computeAggregate, applyFilters, formatCompact } from "../filters";
import { formatString } from "../utils/format-string";

export function useDataSource(props: { def: Record<string, unknown>; surfaceId: string }) {
  const store = useStore();
  const binding = computed(
    () =>
      (props.def as any).dataSource as
        | {
            source: string;
            map?: Record<string, string>;
            aggregate?: { fn: string; field?: string; format?: string };
            aggregates?: Record<
              string,
              {
                fn: string;
                field?: string;
                format?: string;
                where?: { field: string; op: string; value: unknown };
              }
            >;
            columns?: string[];
          }
        | undefined,
  );

  const filteredRows = computed(() => {
    if (!binding.value) return null;
    return store.getters["a2ui/filteredSource"](props.surfaceId, binding.value.source) ?? [];
  });

  const aggregatedValue = computed(() => {
    if (!binding.value?.aggregate || !filteredRows.value) return null;
    const raw = computeAggregate(binding.value.aggregate as any, filteredRows.value);
    return binding.value.aggregate.format === "compact" ? formatCompact(raw) : raw;
  });

  const compoundAggregates = computed<Record<string, string | number>>(() => {
    if (!binding.value?.aggregates || !filteredRows.value) return {};
    const result: Record<string, string | number> = {};
    for (const [key, spec] of Object.entries(binding.value.aggregates)) {
      let rows = filteredRows.value;
      if (spec.where) {
        rows = applyFilters(rows, [
          {
            field: spec.where.field,
            op: spec.where.op as any,
            value: spec.where.value,
            nullValue: null,
            isNull: false,
            componentId: "",
          },
        ]);
      }
      const raw = computeAggregate({ fn: spec.fn as any, field: spec.field }, rows);
      result[key] = spec.format === "compact" ? formatCompact(raw) : raw;
    }
    return result;
  });

  const mappedProps = computed(() => {
    if (!binding.value?.map) return {};
    const aggs = compoundAggregates.value;
    const result: Record<string, unknown> = {};
    for (const [prop, template] of Object.entries(binding.value.map)) {
      if (template.includes("${")) {
        const allKeys: Record<string, unknown> = { ...aggs };
        if (aggregatedValue.value != null) allKeys["$value"] = aggregatedValue.value;
        const row =
          filteredRows.value && filteredRows.value.length > 0 ? filteredRows.value[0] : null;
        result[prop] = formatString(template, { ...allKeys, ...row });
      } else if (template === "$value") {
        result[prop] = aggregatedValue.value;
      } else if (filteredRows.value && filteredRows.value.length > 0) {
        result[prop] = filteredRows.value[0][template];
      }
    }
    return result;
  });

  return { filteredRows, aggregatedValue, compoundAggregates, mappedProps, binding };
}
