/**
 * Agent Proxy Router
 */

import { Router, type Request, type Response, type NextFunction } from "express";

export interface AgentProxyOptions {
  sessionsSpawn: Function;
}

export function createAgentProxyRouter(opts: AgentProxyOptions): Router {
  const router = Router();

  router.post("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message, agentId, model, sessionKey } = req.body;

      // Validate message is required
      if (message === undefined || message === null || message === "") {
        res.status(400).json({ error: "message is required" });
        return;
      }

      // Build the sessionsSpawn call
      const spawnOptions: Record<string, unknown> = {
        message,
      };

      if (agentId !== undefined) {
        spawnOptions.agentId = agentId;
      }
      if (model !== undefined) {
        spawnOptions.model = model;
      }
      if (sessionKey !== undefined) {
        spawnOptions.sessionKey = sessionKey;
      }

      const result = await opts.sessionsSpawn(spawnOptions);
      res.json({ ok: true, result });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
