import { describe, it, beforeEach, afterEach } from "vitest";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  PathEscapeError,
  resolvePathForRead,
  resolvePathForWrite,
} from "../src/workspace-path";

describe("workspace path allowlist", () => {
  let ws: string;

  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), "shoggoth-ws-"));
  });

  afterEach(() => {
    rmSync(ws, { recursive: true, force: true });
  });

  describe("relative paths", () => {
    it("resolves a file inside workspace for read", () => {
      mkdirSync(join(ws, "sub"), { recursive: true });
      writeFileSync(join(ws, "sub/hello.txt"), "hi");
      const p = resolvePathForRead(ws, "sub/hello.txt");
      assert.ok(p.endsWith("hello.txt"));
    });

    it("rejects traversal outside workspace", () => {
      writeFileSync(join(ws, "a.txt"), "x");
      assert.throws(() => resolvePathForRead(ws, ".."), PathEscapeError);
      assert.throws(() => resolvePathForRead(ws, "../../.."), PathEscapeError);
    });

    it("resolvePathForWrite rejects traversal and allows new file under workspace", () => {
      mkdirSync(join(ws, "d"), { recursive: true });
      const p = resolvePathForWrite(ws, "d/new.txt");
      assert.ok(p.includes("d"));
      assert.ok(p.endsWith("new.txt"));
      assert.throws(() => resolvePathForWrite(ws, "../../../tmp/x"), PathEscapeError);
    });

    it("rejects symlink escape to outside path on read", () => {
      const outside = mkdtempSync(join(tmpdir(), "shoggoth-out-"));
      try {
        writeFileSync(join(outside, "secret"), "nope");
        symlinkSync(join(outside, "secret"), join(ws, "link"));
        assert.throws(() => resolvePathForRead(ws, "link"), PathEscapeError);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  describe("absolute paths", () => {
    it("accepts absolute paths within workspace for read", () => {
      mkdirSync(join(ws, "sub"), { recursive: true });
      writeFileSync(join(ws, "sub/hello.txt"), "hi");
      const absPath = resolve(ws, "sub/hello.txt");
      const p = resolvePathForRead(ws, absPath);
      assert.ok(p.endsWith("hello.txt"));
    });

    it("accepts absolute paths within workspace for write", () => {
      mkdirSync(join(ws, "d"), { recursive: true });
      const absPath = resolve(ws, "d/new.txt");
      const p = resolvePathForWrite(ws, absPath);
      assert.ok(p.includes("d"));
      assert.ok(p.endsWith("new.txt"));
    });

    it("rejects absolute paths outside workspace for read", () => {
      const outside = mkdtempSync(join(tmpdir(), "shoggoth-out-"));
      try {
        writeFileSync(join(outside, "secret"), "nope");
        assert.throws(() => resolvePathForRead(ws, join(outside, "secret")), PathEscapeError);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });

    it("rejects absolute paths outside workspace for write", () => {
      const outside = mkdtempSync(join(tmpdir(), "shoggoth-out-"));
      try {
        assert.throws(() => resolvePathForWrite(ws, join(outside, "new.txt")), PathEscapeError);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });

    it("rejects absolute symlink escape to outside path on read", () => {
      const outside = mkdtempSync(join(tmpdir(), "shoggoth-out-"));
      try {
        writeFileSync(join(outside, "secret"), "nope");
        symlinkSync(join(outside, "secret"), join(ws, "link"));
        const absLink = resolve(ws, "link");
        assert.throws(() => resolvePathForRead(ws, absLink), PathEscapeError);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });
  });

  describe("NUL byte rejection", () => {
    it("rejects paths with NUL bytes", () => {
      assert.throws(() => resolvePathForRead(ws, "file\0name"), PathEscapeError);
      assert.throws(() => resolvePathForWrite(ws, "file\0name"), PathEscapeError);
    });
  });
});
