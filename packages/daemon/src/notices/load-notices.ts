import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { fillPromptTemplate } from "../prompts/load-prompts";

const NOTICES_DIR = dirname(fileURLToPath(import.meta.url));

export const REQUIRED_NOTICE_KEYS: readonly string[] = [
  "discord-degraded-banner",
  "discord-error-hitl-pending",
  "discord-error-model-400-generic",
  "discord-error-model-400-with-detail",
  "discord-error-model-401",
  "discord-error-model-429",
  "discord-error-model-500",
  "discord-error-model-502-504",
  "discord-error-model-default",
  "discord-error-network-fetch",
  "discord-model-tag-footer",
  "discord-segment-ack-new",
  "discord-segment-ack-reset",
  "discord-segment-command-error",
  "discord-subagent-bound-ended-killed",
  "discord-subagent-bound-ended-ttl",
  "hitl-queued-notice",
] as const;

let cache: Map<string, string> | undefined;

/** Load all `*.md` in this directory (call once from daemon startup). Idempotent. */
export function loadDaemonNotices(): void {
  if (cache) return;
  cache = new Map();
  for (const name of readdirSync(NOTICES_DIR)) {
    if (!name.endsWith(".md") || name === "README.md") continue;
    const key = name.slice(0, -".md".length);
    const text = readFileSync(join(NOTICES_DIR, name), "utf8").replace(/\r\n/g, "\n").trim();
    cache.set(key, text);
  }
  const missing = REQUIRED_NOTICE_KEYS.filter((k) => !cache!.get(k));
  if (missing.length) {
    throw new Error(`Missing or empty daemon notices at startup: ${missing.join(", ")}`);
  }
}

function noticeText(key: string): string {
  if (!cache) loadDaemonNotices();
  const s = cache!.get(key);
  if (s === undefined) {
    throw new Error(`missing daemon notice "${key}.md" under notices/`);
  }
  return s;
}

/** User-facing copy (Discord, operator channels, etc.); same `{{name}}` rules as prompts. */
export function daemonNotice(key: string, vars: Record<string, string> = {}): string {
  return fillPromptTemplate(noticeText(key), vars);
}
