import { describe, it, beforeEach, afterEach } from "vitest";
import assert from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ensureAgentWorkspaceLayout } from "../../src/workspaces/agent-workspace-layout";

describe("ensureAgentWorkspaceLayout", () => {
  let dir: string;
  let tmpl: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "shoggoth-ws-"));
    tmpl = mkdtempSync(join(tmpdir(), "shoggoth-tpl-"));
    writeFileSync(join(tmpl, "AGENTS.md"), "from-tpl", "utf8");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    rmSync(tmpl, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });

  it("creates skills/memory and copies missing template files", async () => {
    const creds = {
      uid: process.getuid?.() ?? 0,
      gid: process.getgid?.() ?? 0,
    };
    await ensureAgentWorkspaceLayout(dir, creds, { templateDir: tmpl });
    assert.ok(existsSync(join(dir, "skills")));
    assert.ok(existsSync(join(dir, "memory")));
    assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf8"), "from-tpl");
  });

  it("creates media/inbound directory for attachment downloads", async () => {
    const creds = {
      uid: process.getuid?.() ?? 0,
      gid: process.getgid?.() ?? 0,
    };
    await ensureAgentWorkspaceLayout(dir, creds, { templateDir: tmpl });
    assert.ok(
      existsSync(join(dir, "media", "inbound")),
      "media/inbound directory should be created by ensureAgentWorkspaceLayout",
    );
  });

  it("does not overwrite existing workspace markdown", async () => {
    const creds = {
      uid: process.getuid?.() ?? 0,
      gid: process.getgid?.() ?? 0,
    };
    writeFileSync(join(dir, "AGENTS.md"), "original", "utf8");
    await ensureAgentWorkspaceLayout(dir, creds, { templateDir: tmpl });
    assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf8"), "original");
  });
});
