import { parseNamespacedMcpTool } from "@shoggoth/mcp-integration";
import { DEFAULT_HITL_CONFIG, normalizeHitlToolKeys, normalizeToolName, type HitlRiskTier } from "@shoggoth/shared";

export const DEFAULT_TOOL_RISK: Readonly<Record<string, HitlRiskTier>> = DEFAULT_HITL_CONFIG.toolRisk;

/**
 * Config-driven risk tier for a tool name. Later filename-specific rules can be layered above this.
 * Namespaced MCP names (`source.tool`) fall back to the map entry for `tool` after the first dot
 * so defaults like `read` / `write` / `exec` apply to `builtin.read`, etc.
 */
export function classifyToolRisk(
  toolName: string,
  toolRiskOverlay: Readonly<Record<string, HitlRiskTier>>,
): HitlRiskTier {
  const map: Record<string, HitlRiskTier> = { ...DEFAULT_TOOL_RISK, ...normalizeHitlToolKeys(toolRiskOverlay) };
  const canonical = normalizeToolName(toolName);
  const direct = map[canonical];
  if (direct !== undefined) return direct;
  const parsed = parseNamespacedMcpTool(canonical);
  if (parsed) {
    const byOriginal = map[parsed.toolName];
    if (byOriginal !== undefined) return byOriginal;
  }
  const wild = map["*"];
  if (wild !== undefined) return wild;
  return "caution";
}
