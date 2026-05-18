import { createStore } from "vuex";
import { a2uiModule, type A2UIState } from "./a2ui";

const VISIBLE_KEY = "shoggoth-canvas-visible";

function loadVisible(): boolean {
  try {
    const v = localStorage.getItem(VISIBLE_KEY);
    return v === null ? true : v === "true";
  } catch {
    return true;
  }
}

export interface RootState {
  session: {
    active: string;
    sessions: string[];
  };
  panel: {
    visible: boolean;
  };
  a2ui?: A2UIState;
}

export const store = createStore<RootState>({
  state: {
    session: {
      active: "main",
      sessions: ["main"],
    },
    panel: {
      visible: loadVisible(),
    },
  },
  mutations: {
    setActiveSession(state, session: string) {
      state.session.active = session;
      if (!state.session.sessions.includes(session)) {
        state.session.sessions.push(session);
      }
    },
    setVisible(state, visible: boolean) {
      state.panel.visible = visible;
      try {
        localStorage.setItem(VISIBLE_KEY, String(visible));
      } catch {
        /* ignore */
      }
    },
  },
  actions: {
    switchSession({ commit }, session: string) {
      commit("setActiveSession", session);
    },
  },
  modules: {
    a2ui: a2uiModule,
  },
});
