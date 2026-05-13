import type { Component } from "vue";

export interface DataSource {
  fields: string[];
  rows: Record<string, unknown>[];
  primaryKey?: string;
}

export interface FieldFilter {
  field: string;
  op: "eq" | "contains" | "gte" | "lte" | "range" | "in";
  value: unknown;
  nullValue: unknown;
  isNull: boolean;
  componentId: string;
}

export interface A2UISurfaceState {
  components: Record<string, Record<string, unknown>>;
  root: string | null;
  dataModel: Record<string, unknown>;
  sources: Record<string, DataSource>;
  filters: Record<string, FieldFilter[]>;
  theme?: string;
  catalogId?: string;
  sendDataModel?: boolean;
}

export interface ComponentRegistration {
  /** The A2UI component type name (e.g. "Chart", "Map") */
  name: string;
  /** The Vue 3 component implementation */
  component: Component;
}

export interface PackageDefinition {
  /** Components provided by this package */
  components: ComponentRegistration[];
}
