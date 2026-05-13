import { Router } from "express";
import mime from "mime-types";
import fs from "node:fs/promises";
import { FileResolver } from "../services/file-resolver";

import { DEEP_LINK_SCRIPT } from "../shared/deep-link-script";
import { getSnapshotScript } from "../shared/snapshot-script";

export function canvasRoute(fileResolver: FileResolver, basePath: string = ""): Router {
  const router = Router();

  // Shared handler for canvas file serving with deep link injection
  async function serveCanvasFile(session: string, subpath: string, res: any) {
    res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    const resolved = await fileResolver.resolve(session, subpath);
    if (!resolved) {
      const exists = await fileResolver.sessionExists(session);
      if (exists && (!subpath || subpath === "index.html")) {
        if (!(await fileResolver.hasIndex(session))) {
          res.redirect(`${basePath}/scaffold?session=${encodeURIComponent(session)}`);
          return;
        }
      }
      // Do not fall through to the SPA catch-all: returning index.html for /_c/... breaks the
      // iframe (nested SPA bootstraps under /_c/<session>/... and can infinite-reload).
      res
        .status(404)
        .type("html")
        .send(
          '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Not found</title></head><body><p>Not found</p></body></html>',
        );
      return;
    }

    const contentType = mime.lookup(resolved) || "application/octet-stream";
    const content = await fs.readFile(resolved);
    if (contentType === "text/html") {
      let html = content.toString();
      const injected = DEEP_LINK_SCRIPT + getSnapshotScript();
      if (html.includes("</head>")) {
        html = html.replace("</head>", injected + "</head>");
      } else if (html.includes("</body>")) {
        html = html.replace("</body>", injected + "</body>");
      } else {
        html += injected;
      }
      res.type(contentType).send(html);
    } else {
      res.type(contentType).send(content);
    }
  }

  // Canvas file serving under /_c/ prefix (no conflicts with SPA routes)
  router.get(`/_c/:session/{*subpath}`, async (req, res) => {
    const session = req.params.session as string;
    const rawSubpath = (req.params as any).subpath;
    const subpath = Array.isArray(rawSubpath) ? rawSubpath.join("/") : rawSubpath || "index.html";
    await serveCanvasFile(session, subpath, res);
  });

  router.get(`/_c/:session`, async (req, res) => {
    const session = req.params.session as string;
    await serveCanvasFile(session, "index.html", res);
  });

  return router;
}
