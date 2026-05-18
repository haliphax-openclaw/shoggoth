import { Router } from "express";

export interface CanvasConfigData {
  skipConfirmation: boolean;
  agents: string[];
  allowedAgentIds: string[];
}

/**
 * GET /api/canvas-config — exposes canvas configuration to the SPA.
 * Returns: { skipConfirmation, agents, allowedAgentIds }
 */
export function canvasConfigRoute(configData?: CanvasConfigData): Router {
  const router = Router();

  router.get("/api/canvas-config", (_req, res) => {
    res.json(
      configData ?? {
        skipConfirmation: false,
        agents: [],
        allowedAgentIds: [],
      },
    );
  });

  return router;
}
