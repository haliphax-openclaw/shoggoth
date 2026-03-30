import { readFileSync } from "node:fs";
import type { ShoggothConfig } from "@shoggoth/shared";
import { listSkillsForConfig, skillAbsolutePathById } from "@shoggoth/skills-plugins";

export function formatSkillsListJson(config: ShoggothConfig): string {
  const rows = listSkillsForConfig(config).map((s) => ({
    id: s.id,
    title: s.title,
    path: s.absolutePath,
    enabled: s.enabled,
  }));
  return `${JSON.stringify(rows, null, 2)}\n`;
}

export function formatSkillPathLine(config: ShoggothConfig, id: string): string {
  const p = skillAbsolutePathById(config, id);
  if (!p) {
    throw new Error(`unknown skill id: ${id}`);
  }
  return `${p}\n`;
}

export function formatSkillReadJson(config: ShoggothConfig, id: string): string {
  const p = skillAbsolutePathById(config, id);
  if (!p) {
    throw new Error(`unknown skill id: ${id}`);
  }
  const content = readFileSync(p, "utf8");
  return `${JSON.stringify({ path: p, content }, null, 2)}\n`;
}
