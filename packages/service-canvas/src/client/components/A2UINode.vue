<template>
  <component
    v-if="resolvedComponent"
    :is="resolvedComponent"
    :def="componentDef"
    :component-id="componentId"
    :surface-id="surfaceId"
  />
</template>

<script lang="ts">
import { defineComponent, computed } from "vue";
import type { Component } from "vue";
import { useStore } from "vuex";
import { catalogComponents } from "virtual:shoggoth-catalogs";

/** Built-in component map — all components now resolve through the catalog system */
const builtinMap: Record<string, Component> = {};

/**
 * Resolve a component by name using two-tier lookup:
 * 1. Built-in map (always wins)
 * 2. Catalog components from virtual:shoggoth-catalogs
 *
 * Exported for testability.
 */
export function resolveA2UIComponent(name: string | null): Component | null {
  if (!name) return null;

  // Built-in always wins
  if (builtinMap[name]) return builtinMap[name];

  // Catalog fallback
  // TODO: catalogId filtering — restrict catalog components by surface catalogId
  const catalogEntry = catalogComponents[name];
  if (catalogEntry) return catalogEntry.component;

  return null;
}

export default defineComponent({
  name: "A2UINode",
  props: {
    componentId: { type: String, required: true },
    surfaceId: { type: String, required: true },
  },
  setup(props) {
    const store = useStore();

    const componentEntry = computed(() => {
      const surface = store.state.a2ui?.surfaces?.[props.surfaceId];
      return surface?.components?.[props.componentId] ?? null;
    });

    // v0.9 flat shape: { component: "Column", children: [...] }
    const typeName = computed(() => {
      const entry = componentEntry.value;
      if (!entry) return null;
      return (entry.component as string) ?? null;
    });

    const componentDef = computed(() => {
      const entry = componentEntry.value;
      if (!entry || !typeName.value) return null;
      const { component, ...props } = entry as Record<string, unknown>;
      // MultiSelect alias implies multi: true
      if (component === "MultiSelect") return { ...props, multi: true };
      return props;
    });

    const resolvedComponent = computed(() => resolveA2UIComponent(typeName.value));

    return { resolvedComponent, componentDef };
  },
});
</script>
