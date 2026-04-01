// ---------------------------------------------------------------------------
// procman handler
// ---------------------------------------------------------------------------

import type { BuiltinToolRegistry, BuiltinToolContext } from "../builtin-tool-registry";

export function register(registry: BuiltinToolRegistry): void {
  registry.register("procman", procman);
}

async function procman(
  args: Record<string, unknown>,
  ctx: BuiltinToolContext,
): Promise<{ resultJson: string }> {
  const action = String(args.action ?? "").trim();
  const pm = ctx.getProcessManager();
  if (!pm) {
    return { resultJson: JSON.stringify({ error: "process manager not available" }) };
  }
  if (action === "list") {
    const processes = pm.list().map((mp) => ({
      id: mp.spec.id,
      label: mp.spec.label ?? null,
      state: mp.state,
      pid: mp.pid ?? null,
      uptimeMs: mp.uptimeMs,
      restartCount: mp.restartCount,
      owner: mp.spec.owner,
    }));
    return { resultJson: JSON.stringify({ processes }) };
  }
  if (action === "inspect") {
    const id = String(args.id ?? "").trim();
    if (!id) return { resultJson: JSON.stringify({ error: "id required for inspect" }) };
    const mp = pm.get(id);
    if (!mp) return { resultJson: JSON.stringify({ error: `no process with id "${id}"` }) };
    const recentStdout = mp.readOutput("stdout");
    const recentStderr = mp.readOutput("stderr");
    return {
      resultJson: JSON.stringify({
        id: mp.spec.id,
        label: mp.spec.label ?? null,
        state: mp.state,
        pid: mp.pid ?? null,
        uptimeMs: mp.uptimeMs,
        restartCount: mp.restartCount,
        lastExitCode: mp.lastExitCode,
        lastSignal: mp.lastSignal,
        owner: mp.spec.owner,
        recentStdout,
        recentStderr,
      }),
    };
  }
  return { resultJson: JSON.stringify({ error: `unknown procman action: ${action}` }) };
}
