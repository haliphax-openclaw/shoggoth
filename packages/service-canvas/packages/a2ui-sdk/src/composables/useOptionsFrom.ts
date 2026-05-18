import { computed } from "vue";
import { useStore } from "vuex";

interface OptionsFromSource {
  source: string;
  field: string;
  includeAll?: boolean;
  allLabel?: string;
}

interface OptionsFromList {
  list: string[];
}

type OptionsFrom = OptionsFromSource | OptionsFromList;

interface Option {
  label: string;
  value: string;
}

export function useOptionsFrom(props: { def: Record<string, unknown>; surfaceId: string }) {
  const store = useStore();
  const optionsFrom = computed(() => (props.def as any).optionsFrom as OptionsFrom | undefined);

  const derivedOptions = computed((): Option[] | null => {
    const of = optionsFrom.value;
    if (!of) return null;

    if ("list" in of && Array.isArray(of.list)) {
      return of.list.map((v: string) => ({ label: String(v), value: String(v) }));
    }

    if ("source" in of && "field" in of) {
      const surface = store.state.a2ui?.surfaces?.[props.surfaceId];
      const src = surface?.sources?.[of.source];
      if (!src) return [];
      const unique = [
        ...new Set(
          src.rows
            .map((r: Record<string, unknown>) => r[of.field])
            .filter((v: unknown) => v != null),
        ),
      ];
      unique.sort((a: unknown, b: unknown) => String(a).localeCompare(String(b)));
      const opts = unique.map((v: unknown) => ({ label: String(v), value: String(v) }));
      if (of.includeAll) {
        opts.unshift({ label: of.allLabel || "All", value: "" });
      }
      return opts;
    }

    return null;
  });

  return { optionsFrom, derivedOptions };
}
