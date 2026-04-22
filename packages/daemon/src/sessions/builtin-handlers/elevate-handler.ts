// ---------------------------------------------------------------------------
// builtin-elevate — executes commands in the daemon process during elevation
// ---------------------------------------------------------------------------

import type {
  BuiltinToolRegistry,
  BuiltinToolContext,
} from "../builtin-tool-registry";
import {
  handleElevate,
  type ElevateArgs,
} from "../../elevation/builtin-elevate";

export function register(registry: BuiltinToolRegistry): void {
  registry.register("elevate", elevateHandler);
}

async function elevateHandler(
  args: Record<string, unknown>,
  ctx: BuiltinToolContext,
): Promise<{ resultJson: string }> {
  const parsed: ElevateArgs = {
    argv: Array.isArray(args.argv) ? args.argv.map(String) : [],
    workdir: typeof args.workdir === "string" ? args.workdir : undefined,
    timeout: typeof args.timeout === "number" ? args.timeout : undefined,
  };
  return handleElevate(parsed, ctx);
}
