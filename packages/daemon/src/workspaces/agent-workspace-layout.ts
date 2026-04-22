import { runAsUser } from "@shoggoth/os-exec";
import { join } from "node:path";
import { WORKSPACE_TEMPLATE_FILES } from "../sessions/session-system-prompt";

/**
 * Directory of default `AGENTS.md` / `IDENTITY.md` / … copies (image: `/app/templates/agent-workspace`).
 * Override for custom packs: `SHOGGOTH_AGENT_TEMPLATE_DIR`.
 */
export function resolveAgentTemplateDir(): string {
  const e = process.env.SHOGGOTH_AGENT_TEMPLATE_DIR?.trim();
  if (e) return e;
  return join(process.cwd(), "templates", "agent-workspace");
}

/**
 * Ensures `skills/` + `memory/` exist and copies any missing template markdown files from the
 * template directory (never overwrites existing workspace files).
 */
export async function ensureAgentWorkspaceLayout(
  workspaceRoot: string,
  creds: { uid: number; gid: number },
  opts?: { readonly templateDir?: string },
): Promise<void> {
  const root = workspaceRoot.trim();
  if (!root) return;

  const srcDir = opts?.templateDir ?? resolveAgentTemplateDir();
  const templateFiles = WORKSPACE_TEMPLATE_FILES.filter((f) => f !== "BOOTSTRAP.md");

  const script = [
    'const fs = require("fs");',
    'const path = require("path");',
    'const root = process.env._WS_ROOT;',
    'const srcDir = process.env._TEMPLATE_DIR;',
    'const files = JSON.parse(process.env._TEMPLATE_FILES);',
    'const dmode = 0o770;',
    'const fmode = 0o660;',
    'fs.mkdirSync(root, { recursive: true, mode: dmode });',
    'fs.mkdirSync(path.join(root, "skills"), { recursive: true, mode: dmode });',
    'fs.mkdirSync(path.join(root, "memory"), { recursive: true, mode: dmode });',
    'fs.mkdirSync(path.join(root, "tmp"), { recursive: true, mode: dmode });',
    'if (fs.existsSync(srcDir)) {',
    '  for (const name of files) {',
    '    const from = path.join(srcDir, name);',
    '    const to = path.join(root, name);',
    '    if (!fs.existsSync(from) || fs.existsSync(to)) continue;',
    '    fs.copyFileSync(from, to);',
    '    try { fs.chmodSync(to, fmode); } catch {}',
    '  }',
    '}',
  ].join("\n");

  const r = await runAsUser({
    file: process.execPath,
    args: ["-e", script],
    cwd: "/tmp",
    uid: creds.uid,
    gid: creds.gid,
    env: {
      _WS_ROOT: root,
      _TEMPLATE_DIR: srcDir,
      _TEMPLATE_FILES: JSON.stringify(templateFiles),
    },
  });

  if (r.exitCode !== 0) {
    throw new Error(r.stderr.trim() || `workspace layout setup failed (exit ${r.exitCode})`);
  }
}