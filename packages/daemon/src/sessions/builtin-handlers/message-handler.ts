// ---------------------------------------------------------------------------
// message handler
// ---------------------------------------------------------------------------

import type { BuiltinToolRegistry, BuiltinToolContext } from "../builtin-tool-registry";

export function register(registry: BuiltinToolRegistry): void {
  registry.register("message", message);
}

async function message(
  args: Record<string, unknown>,
  ctx: BuiltinToolContext,
): Promise<{ resultJson: string }> {
  const mtCtx = ctx.messageToolCtx;
  if (!mtCtx) {
    return { resultJson: JSON.stringify({ error: "message_tool_unavailable" }) };
  }
  const result = await mtCtx.execute(ctx.sessionId, args);
  return { resultJson: JSON.stringify(result) };
}
