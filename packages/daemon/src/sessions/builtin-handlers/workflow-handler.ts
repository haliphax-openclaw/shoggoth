// ---------------------------------------------------------------------------
// workflow handler
// ---------------------------------------------------------------------------

import type { BuiltinToolRegistry } from "../builtin-tool-registry";

export function register(registry: BuiltinToolRegistry): void {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  registry.register("workflow", async (args, _ctx) => {
    const { executeWorkflowToolCall } = await import("../../workflow-singleton.js");
    const result = await executeWorkflowToolCall(
      args as unknown as Parameters<typeof executeWorkflowToolCall>[0],
      { currentDepth: 0, maxDepth: 2 },
    );
    return { resultJson: JSON.stringify(result) };
  });
}
