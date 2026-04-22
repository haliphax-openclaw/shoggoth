import type { ContextLevel, ShoggothConfig } from "./schema";
import { CONTEXT_LEVELS } from "./schema";

/**
 * Resolve the effective context level for a session.
 *
 * Precedence (highest first):
 * 1. Explicit spawn override parameter
 * 2. Per-agent config (`agents.list[agentId].subagentContextLevel` for subagents,
 *    `agents.list[agentId].contextLevel` for top-level agents)
 * 3. Top-level config (`agents.subagentContextLevel` for subagents,
 *    `agents.contextLevel` for top-level agents)
 * 4. Default: `"full"` for top-level agents, `"light"` for subagents
 */
export function resolveContextLevel(
  config: ShoggothConfig,
  agentId: string,
  spawnOverride?: ContextLevel,
  isSubagent?: boolean,
): ContextLevel {
  if (spawnOverride != null) return spawnOverride;

  const agentEntry = config.agents?.list?.[agentId];
  const field = isSubagent ? "subagentContextLevel" : "contextLevel";

  const perAgent = agentEntry?.[field];
  if (perAgent != null) return perAgent;

  const topLevel = config.agents?.[field];
  if (topLevel != null) return topLevel;

  return isSubagent ? "light" : "full";
}

/**
 * Validate that a string is a valid context level. Returns the typed value or throws.
 */
export function validateContextLevel(value: unknown): ContextLevel {
  if (
    typeof value !== "string" ||
    !(CONTEXT_LEVELS as readonly string[]).includes(value)
  ) {
    throw new Error(
      `Invalid context level "${String(value)}"; must be one of: ${CONTEXT_LEVELS.join(", ")}`,
    );
  }
  return value as ContextLevel;
}
