import { Router } from "express";
import type { CatalogRegistry } from "../services/catalog-registry";

export function catalogsRoute(registry: CatalogRegistry): Router {
  const router = Router();

  router.get("/api/catalogs", (_req, res) => {
    res.json({ catalogs: registry.allCatalogs() });
  });

  return router;
}
