import { Router } from "express";
import fs from "node:fs";
import path from "node:path";

/**
 * GET /api/canvas-config — exposes canvas configuration to the SPA.
 * Returns: { skipConfirmation, agents, allowedAgentIds }
 */
export function canvasConfigRoute(shoggothConfigPath?: string): Router {
  const router = Router();

  router.get("/api/canvas-config", (_req, res) => {
    const skipConfirmation = process.env.SHOGGOTH_CANVAS_SKIP_CONFIRM === "true";

    let agents: string[] = [];
    let allowedAgentIds: string[] = [];

    // Try to read agent list from shoggoth.json
    const configPath = shoggothConfigPath ?? findShoggothConfig();
    if (configPath) {
      try {
        const raw = fs.readFileSync(configPath, "utf-8");
        const config = JSON.parse(raw);
        const agentList = config?.agents?.list;
        if (Array.isArray(agentList)) {
          agents = agentList.map((a: any) => a.id).filter(Boolean);
        }
        const hookAgents = config?.hooks?.allowedAgentIds;
        if (Array.isArray(hookAgents)) {
          allowedAgentIds = hookAgents;
        }
      } catch {
        /* ignore read errors */
      }
    }

    res.json({ skipConfirmation, agents, allowedAgentIds });
  });

  return router;
}

function findShoggothConfig(): string | null {
  const candidates = [
    path.join(process.env.HOME ?? "/root", ".shoggoth", "shoggoth.json"),
    "/home/node/.shoggoth/shoggoth.json",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}
