import { createRouter, createWebHistory } from "vue-router";
import CanvasView from "./views/CanvasView.vue";
import ScaffoldView from "./views/ScaffoldView.vue";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // Static routes MUST be defined before the catch-all /:sessionId route
    { path: "/scaffold", name: "scaffold", component: ScaffoldView },
    { path: "/", redirect: "/main/" },
    { path: "/:sessionId/:path(.*)", name: "canvas", component: CanvasView },
  ],
});
