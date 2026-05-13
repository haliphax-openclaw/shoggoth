import { Router } from "express";

const SCAFFOLD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shoggoth Canvas</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #1a1a2e; color: #e0e0e0; }
    .scaffold { text-align: center; max-width: 480px; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #888; line-height: 1.6; }
    code { background: #2a2a3e; padding: 0.2em 0.5em; border-radius: 4px; font-size: 0.9em; }
  </style>
</head>
<body>
  <div class="scaffold">
    <h1>Canvas Ready</h1>
    <p>No <code>index.html</code> found for this session. Place files in the session directory to get started.</p>
  </div>
</body>
</html>`;

export function scaffoldRoute(): Router {
  const router = Router();
  router.get("/scaffold", (_req, res) => {
    res.type("html").send(SCAFFOLD_HTML);
  });
  return router;
}
