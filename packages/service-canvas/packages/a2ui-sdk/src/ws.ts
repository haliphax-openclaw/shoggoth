type SendFn = (data: Record<string, unknown>) => void;

let _send: SendFn | null = null;

/**
 * Register the platform's WebSocket send function.
 * Called once by the host app during initialization.
 */
export function registerWsSend(send: SendFn) {
  _send = send;
}

/**
 * Send an event back to the server via the platform's WebSocket connection.
 * This is the public API for external components to communicate with the server.
 */
export function sendEvent(type: string, payload: Record<string, unknown> = {}) {
  if (!_send) {
    console.warn("[a2ui-sdk] WebSocket send not registered — call registerWsSend() first");
    return;
  }
  _send({ type, ...payload });
}
