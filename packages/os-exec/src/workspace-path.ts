import { realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export class PathEscapeError extends Error {
  override readonly name = "PathEscapeError";
  constructor(message = "path escapes workspace") {
    super(message);
  }
}

function assertInsideRoot(rootReal: string, absolutePath: string): void {
  const rel = relative(rootReal, absolutePath);
  if (rel === "..") {
    throw new PathEscapeError();
  }
  if (rel.startsWith(`..${sep}`)) {
    throw new PathEscapeError();
  }
}

function validatePath(userPath: string): void {
  if (userPath.includes("\0")) {
    throw new PathEscapeError("NUL byte in path");
  }
}

function logicalPathUnderRoot(workspaceRoot: string, userPath: string): { rootReal: string; joined: string } {
  validatePath(userPath);
  const rootReal = realpathSync(workspaceRoot);
  
  // Accept both absolute and relative paths
  const joined = isAbsolute(userPath) ? userPath : resolve(rootReal, userPath);
  assertInsideRoot(rootReal, joined);
  return { rootReal, joined };
}

function ensureWriteParentContained(rootReal: string, logicalFile: string): void {
  let dir = dirname(logicalFile);
  const visited = new Set<string>();
  while (!visited.has(dir)) {
    visited.add(dir);
    try {
      const realDir = realpathSync(dir);
      assertInsideRoot(rootReal, realDir);
      return;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        const parent = dirname(dir);
        if (parent === dir) {
          throw new PathEscapeError("invalid path");
        }
        dir = parent;
        continue;
      }
      throw e;
    }
  }
}

/**
 * Resolve a session-relative or absolute path for read: logical path must stay under workspace;
 * final target is realpath'd so symlink escapes are rejected.
 * 
 * Accepts both:
 * - Relative paths (resolved relative to workspace root)
 * - Absolute paths (validated to be within workspace root)
 */
export function resolvePathForRead(workspaceRoot: string, userPath: string): string {
  const { rootReal, joined } = logicalPathUnderRoot(workspaceRoot, userPath);
  const realTarget = realpathSync(joined);
  assertInsideRoot(rootReal, realTarget);
  return realTarget;
}

/**
 * Resolve a session-relative or absolute path for write: parent directories must exist and resolve under workspace.
 * 
 * Accepts both:
 * - Relative paths (resolved relative to workspace root)
 * - Absolute paths (validated to be within workspace root)
 */
export function resolvePathForWrite(workspaceRoot: string, userPath: string): string {
  const { rootReal, joined } = logicalPathUnderRoot(workspaceRoot, userPath);
  ensureWriteParentContained(rootReal, joined);
  return joined;
}
