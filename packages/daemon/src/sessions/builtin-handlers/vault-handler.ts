// ---------------------------------------------------------------------------
// builtin-vault — secure credential storage
// -----------------------------------------------------------------------------

import type { BuiltinToolRegistry, BuiltinToolContext } from "../builtin-tool-registry";

export function register(registry: BuiltinToolRegistry): void {
  registry.register("builtin-vault", vaultHandler);
}

async function vaultHandler(
  args: Record<string, unknown>,
  _ctx: BuiltinToolContext,
): Promise<{ resultJson: string }> {
  // Stub: return error indicating not implemented
  return {
    resultJson: JSON.stringify({ error: "vault handler not implemented" }),
  };
}