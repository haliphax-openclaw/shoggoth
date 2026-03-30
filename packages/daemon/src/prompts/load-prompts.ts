import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));

let cache: Map<string, string> | undefined;

/** Load all `*.md` in this directory (call once from daemon startup). Idempotent. */
export function loadDaemonPrompts(): void {
  if (cache) return;
  cache = new Map();
  for (const name of readdirSync(PROMPTS_DIR)) {
    if (!name.endsWith(".md") || name === "README.md") continue;
    const key = name.slice(0, -".md".length);
    const text = readFileSync(join(PROMPTS_DIR, name), "utf8").replace(/\r\n/g, "\n").trim();
    cache.set(key, text);
  }
}

function promptText(key: string): string {
  if (!cache) loadDaemonPrompts();
  const s = cache!.get(key);
  if (s === undefined) {
    throw new Error(`missing daemon prompt "${key}.md" under prompts/`);
  }
  return s;
}

/** Replace `{{name}}` placeholders; missing keys become empty string. */
export function fillPromptTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}

export function daemonPrompt(key: string, vars: Record<string, string> = {}): string {
  return fillPromptTemplate(promptText(key), vars);
}
