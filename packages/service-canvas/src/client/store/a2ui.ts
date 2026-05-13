import type { Module } from "vuex";
import type { RootState } from "./index";
import { applyFilters } from "@shoggoth/a2ui-sdk";
import type { A2UISurfaceState, DataSource, FieldFilter } from "@shoggoth/a2ui-sdk";

export type { A2UISurfaceState, DataSource, FieldFilter };

export interface A2UIState {
  surfaces: Record<string, A2UISurfaceState>;
}

function makeSurface(): A2UISurfaceState {
  return { components: {}, root: null, dataModel: {}, sources: {}, filters: {} };
}

export const a2uiModule: Module<A2UIState, RootState> = {
  namespaced: true,
  state: (): A2UIState => ({ surfaces: {} }),
  getters: {
    filteredSource:
      (state) =>
      (surfaceId: string, sourceName: string): Record<string, unknown>[] => {
        const s = state.surfaces[surfaceId];
        if (!s) return [];
        const src = s.sources[sourceName];
        if (!src) return [];
        const filters = s.filters[sourceName] || [];
        return applyFilters(src.rows, filters);
      },
  },
  mutations: {
    upsertSurface(
      state,
      payload: {
        surfaceId: string;
        components: Array<{ id: string; component: string; [key: string]: unknown }>;
      },
    ) {
      if (!state.surfaces[payload.surfaceId]) {
        state.surfaces[payload.surfaceId] = makeSurface();
      }
      const s = state.surfaces[payload.surfaceId];
      for (const c of payload.components) {
        const { id, ...rest } = c;
        s.components[id] = rest;
      }
    },
    setRoot(
      state,
      payload: {
        surfaceId: string;
        root: string;
        theme?: string;
        catalogId?: string;
        sendDataModel?: boolean;
      },
    ) {
      if (!state.surfaces[payload.surfaceId]) {
        state.surfaces[payload.surfaceId] = makeSurface();
      }
      const s = state.surfaces[payload.surfaceId];
      s.root = payload.root;
      if (payload.theme !== undefined) s.theme = payload.theme;
      if (payload.catalogId !== undefined) s.catalogId = payload.catalogId;
      if (payload.sendDataModel !== undefined) s.sendDataModel = payload.sendDataModel;
    },
    updateDataModel(
      state,
      payload: { surfaceId: string; data: Record<string, unknown>; merge?: boolean },
    ) {
      const s = state.surfaces[payload.surfaceId];
      if (!s) return;

      // Extract $sources if present
      const data = { ...payload.data };
      if (data.$sources) {
        const raw = data.$sources as Record<
          string,
          { fields: string[]; rows: Record<string, unknown>[]; primaryKey?: string }
        >;
        for (const [name, src] of Object.entries(raw)) {
          const rows = (src.rows || []) as Record<string, unknown>[];
          const existing = s.sources[name];
          if (payload.merge && existing?.primaryKey) {
            const pk = existing.primaryKey;
            const map = new Map(existing.rows.map((r) => [r[pk] as string, r]));
            for (const row of rows) map.set(row[pk] as string, row);
            existing.rows = Array.from(map.values());
            if (src.fields?.length) existing.fields = src.fields;
          } else {
            s.sources[name] = { fields: src.fields || [], rows, primaryKey: src.primaryKey };
          }
        }
        delete data.$sources;
      }

      Object.assign(s.dataModel, data);
    },
    setFilter(
      state,
      payload: {
        surfaceId: string;
        source: string;
        field: string;
        op: FieldFilter["op"];
        value: unknown;
        nullValue: unknown;
        isNull: boolean;
        componentId: string;
      },
    ) {
      const s = state.surfaces[payload.surfaceId];
      if (!s) return;
      if (!s.filters[payload.source]) s.filters[payload.source] = [];
      const arr = s.filters[payload.source];
      const idx = arr.findIndex(
        (f) => f.field === payload.field && f.componentId === payload.componentId,
      );
      const filter: FieldFilter = {
        field: payload.field,
        op: payload.op,
        value: payload.value,
        nullValue: payload.nullValue,
        isNull: payload.isNull,
        componentId: payload.componentId,
      };
      if (idx >= 0) arr.splice(idx, 1, filter);
      else arr.push(filter);
    },
    clearFilters(state, payload: { surfaceId: string }) {
      const s = state.surfaces[payload.surfaceId];
      if (s) s.filters = {};
    },
    deleteSurface(state, payload: { surfaceId: string }) {
      delete state.surfaces[payload.surfaceId];
    },
    clearAll(state) {
      state.surfaces = {};
    },
  },
};
