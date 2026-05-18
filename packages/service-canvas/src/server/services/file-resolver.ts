import path from "node:path";
import fs from "node:fs/promises";

export class FileResolver {
  private workspaceMap: Map<string, string>;
  private defaultCanvasRoot: string;

  constructor(workspaceMap: Map<string, string>, defaultCanvasRoot: string) {
    this.workspaceMap = workspaceMap;
    this.defaultCanvasRoot = defaultCanvasRoot;
  }

  private canvasRootFor(session: string): string {
    return this.workspaceMap.get(session) ?? path.join(this.defaultCanvasRoot, session);
  }

  async resolve(session: string, subpath: string): Promise<string | null> {
    if (!session || session.includes("..")) return null;

    const sessionRoot = this.canvasRootFor(session);
    const target = path.join(sessionRoot, subpath || "index.html");

    let real: string;
    try {
      real = await fs.realpath(target);
    } catch {
      return null;
    }

    // If the resolved path is a directory, look for index.html inside it
    try {
      const stat = await fs.stat(real);
      if (stat.isDirectory()) {
        const indexPath = path.join(real, "index.html");
        try {
          real = await fs.realpath(indexPath);
        } catch {
          return null;
        }
      }
    } catch {
      return null;
    }

    let realSessionRoot: string | null;
    try {
      realSessionRoot = await fs.realpath(sessionRoot);
    } catch {
      return null;
    }
    if (!real.startsWith(realSessionRoot + path.sep) && real !== realSessionRoot) {
      return null;
    }

    return real;
  }

  async sessionExists(session: string): Promise<boolean> {
    if (!session || session.includes("..")) return false;
    try {
      const stat = await fs.stat(this.canvasRootFor(session));
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  async hasIndex(session: string): Promise<boolean> {
    const resolved = await this.resolve(session, "index.html");
    return resolved !== null;
  }

  getCanvasRoot(): string {
    return this.defaultCanvasRoot;
  }
}
