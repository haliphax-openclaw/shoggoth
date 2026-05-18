type Handler = (data: Record<string, unknown>) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private pendingMessages: Array<Record<string, unknown>> = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private currentSession = "main";

  connect(session?: string) {
    if (this.destroyed) return;
    if (session != null) this.currentSession = session;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    this.ws = new WebSocket(
      `${proto}://${location.host}${base}/ws?session=${encodeURIComponent(this.currentSession)}`,
    );
    this.ws.onmessage = (e) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      const type = data.type as string;
      if (!type) return;
      const typeHandlers = this.handlers.get(type);
      if (typeHandlers?.size) {
        typeHandlers.forEach((h) => h(data));
      } else {
        this.pendingMessages.push(data);
      }
    };
    this.ws.onclose = () => {
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.connect(), 2000);
      }
    };
    this.ws.onerror = () => {
      // onclose will fire after onerror, triggering reconnect
    };
  }

  on(type: string, handler: Handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    // Flush any buffered messages for this type
    const remaining: Array<Record<string, unknown>> = [];
    for (const msg of this.pendingMessages) {
      if (msg.type === type) {
        handler(msg);
      } else {
        remaining.push(msg);
      }
    }
    this.pendingMessages = remaining;
  }

  off(type: string, handler: Handler) {
    this.handlers.get(type)?.delete(handler);
  }

  send(data: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  switchSession(session: string) {
    this.send({ type: "session.switch", session });
  }

  destroy() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}

export const wsClient = new WsClient();
