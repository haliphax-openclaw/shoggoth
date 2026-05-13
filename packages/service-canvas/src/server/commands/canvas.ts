import type { Gateway } from "../services/gateway";
import type { SessionManager } from "../services/session-manager";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

export function registerCanvasCommands(gateway: Gateway, sessionManager: SessionManager) {
  gateway.on("canvas.show", (msg, reply) => {
    const session = isNonEmptyString(msg.session) ? msg.session : sessionManager.getActive();
    sessionManager.setActive(session);
    gateway.broadcastSpaSession(session, { type: "canvas.show", session });
    reply({ ok: true, session });
  });

  gateway.on("canvas.hide", (_msg, reply) => {
    gateway.broadcastSpa({ type: "canvas.hide" });
    reply({ ok: true });
  });

  gateway.on("canvas.navigate", (msg, reply) => {
    const session = isNonEmptyString(msg.session) ? msg.session : sessionManager.getActive();
    const path = typeof msg.path === "string" ? msg.path : "";
    sessionManager.setActive(session);
    gateway.broadcastSpaSession(session, { type: "canvas.navigate", session, path });
    reply({ ok: true, session, path });
  });

  gateway.on("canvas.navigateExternal", (msg, reply) => {
    const url = msg.url;
    if (!isNonEmptyString(url) || !(url.startsWith("http://") || url.startsWith("https://"))) {
      reply({ error: "Invalid URL — only http(s) allowed" });
      return;
    }
    gateway.broadcastSpa({ type: "canvas.navigateExternal", url });
    reply({ ok: true, url });
  });

  gateway.on("canvas.eval", (msg, reply) => {
    if (!isNonEmptyString(msg.js)) {
      reply({ error: "Missing js field" });
      return;
    }
    gateway.broadcastSpa({ type: "canvas.eval", js: msg.js, id: msg.id });
    reply({ ok: true, note: "eval dispatched to SPA" });
  });

  gateway.on("canvas.snapshot", async (msg, reply) => {
    const id = isNonEmptyString(msg.id) ? msg.id : `snap_${Date.now()}`;
    const result = await gateway.requestSnapshot(id);
    reply(result);
  });
}
