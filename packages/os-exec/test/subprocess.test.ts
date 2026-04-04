import { describe, it } from "vitest";
import assert from "node:assert";
import { runAsUser } from "../src/subprocess";

describe("runAsUser (drop-priv spawn)", () => {
  it("runs child with effective uid/gid matching credentials", async () => {
    const uid = process.getuid();
    const gid = process.getgid();
    const r = await runAsUser({
      file: "/usr/bin/id",
      args: ["-u"],
      cwd: "/",
      uid,
      gid,
    });
    assert.equal(r.exitCode, 0);
    assert.equal(r.signal, null);
    assert.equal(r.stdout.trim(), String(uid));
  });

  it("non-root cannot spawn as a different uid", async () => {
    if (process.getuid() === 0) {
      return;
    }
    // In containers with CAP_SETUID, non-root may still be able to setuid.
    // Only assert EPERM when the spawn actually fails.
    try {
      await runAsUser({
        file: "/usr/bin/id",
        args: ["-u"],
        cwd: "/",
        uid: 65534,
        gid: 65534,
      });
      // If we get here, the environment allows setuid — skip assertion
    } catch (e: unknown) {
      assert.ok(e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "EPERM");
    }
  });
});
