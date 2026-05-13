import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import { store } from "./store";
import { wsClient } from "./services/ws-client";
import { registerWsSend } from "@shoggoth/a2ui-sdk";
import A2UINode from "./components/A2UINode.vue";
import "./styles/tailwind.css";
import "./styles/custom.css";

// Extract session from URL path (first segment after base path) so initial WS connect uses the correct session
const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const pathAfterBase = window.location.pathname.startsWith(base)
  ? window.location.pathname.slice(base.length)
  : window.location.pathname;
const sessionMatch = pathAfterBase.match(/^\/([^/]+)/);
wsClient.connect(sessionMatch?.[1] ?? undefined);

// Wire up the SDK's sendEvent to the platform WebSocket
registerWsSend(wsClient.send.bind(wsClient));

// Save panel state on server shutdown
wsClient.on("server.shutdown", () => {
  // Visibility is already persisted on each mutation; nothing extra needed
  wsClient.destroy();
});

const app = createApp(App);
app.component("A2UINode", A2UINode);
app.use(router).use(store).mount("#app");
