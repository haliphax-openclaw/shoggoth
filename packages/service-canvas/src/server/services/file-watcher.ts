import { watch, type FSWatcher } from "chokidar";
import path from "path";
import type { Gateway } from "./gateway";

export interface FileWatcherOptions {
  /** Subfolder names to ignore (e.g. ['tmp', 'jsonl']) */
  ignoreDirs?: string[];
}

export class FileWatcher {
  private watcher: FSWatcher;

  constructor(
    sessionPathMap: Map<string, string>,
    gateway: Gateway,
    options: FileWatcherOptions = {},
  ) {
    const watchPaths = [...sessionPathMap.values()];
    const ignoreDirSet = new Set(options.ignoreDirs ?? []);

    this.watcher = watch(watchPaths, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });

    // Build a sorted list of [canonicalPath, session] for longest-prefix matching
    const entries = [...sessionPathMap.entries()]
      .map(([session, dir]) => [path.resolve(dir), session] as const)
      .sort((a, b) => b[0].length - a[0].length);

    function resolveSession(filePath: string): string | null {
      const resolved = path.resolve(filePath);
      for (const [dir, session] of entries) {
        if (resolved.startsWith(dir + path.sep) || resolved === dir) {
          return session;
        }
      }
      return null;
    }

    function isIgnored(filePath: string): boolean {
      if (ignoreDirSet.size === 0) return false;
      const parts = filePath.split(path.sep);
      return parts.some((part) => ignoreDirSet.has(part));
    }

    const notify = (filePath: string) => {
      if (isIgnored(filePath)) return;
      const session = resolveSession(filePath);
      if (session) {
        gateway.broadcastSpaSession(session, { type: "reload", path: filePath });
      }
    };

    this.watcher.on("change", notify);
    this.watcher.on("add", notify);
    this.watcher.on("unlink", notify);
  }

  async close() {
    await this.watcher.close();
  }
}
