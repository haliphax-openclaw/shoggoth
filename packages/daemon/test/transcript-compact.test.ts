import { describe, it } from "vitest";
import assert from "node:assert";
import Database from "better-sqlite3";
import { migrate, defaultMigrationsDir } from "../src/db/migrate";
import {
  loadSessionTranscript,
  replaceSessionTranscript,
  compactSessionTranscript,
  stripImageBlocksFromContent,
  stripImageBlocksForCompaction,
} from "../src/transcript-compact";
import { createSessionStore, getSessionContextSegmentId } from "../src/sessions/session-store";
import type { FailoverModelClient } from "@shoggoth/models";

describe("transcript-compact", () => {
  it("loads and replaces transcript rows", () => {
    const db = new Database(":memory:");
    migrate(db, defaultMigrationsDir());
    createSessionStore(db).create({
      id: "s1",
      workspacePath: "/tmp/w",
      status: "active",
    });
    const seg = getSessionContextSegmentId(db, "s1");
    db.prepare(
      `INSERT INTO transcript_messages (session_id, context_segment_id, seq, role, content) VALUES (?, ?, ?, ?, ?)`,
    ).run("s1", seg, 1, "user", "hello");

    const loaded = loadSessionTranscript(db, "s1", seg);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0]!.content, "hello");

    replaceSessionTranscript(db, "s1", seg, [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]);
    const again = loadSessionTranscript(db, "s1", seg);
    assert.equal(again.length, 2);
    assert.equal(again[1]!.content, "b");
    db.close();
  });

  it("round-trips tool_calls_json through load and replace", () => {
    const db = new Database(":memory:");
    migrate(db, defaultMigrationsDir());
    createSessionStore(db).create({
      id: "s1",
      workspacePath: "/tmp/w",
      status: "active",
    });
    const seg = getSessionContextSegmentId(db, "s1");

    const toolCallsJson = JSON.stringify([{ id: "tc1", name: "foo", argsJson: '{"x":1}' }]);
    db.prepare(
      `INSERT INTO transcript_messages (session_id, context_segment_id, seq, role, content, tool_calls_json) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("s1", seg, 1, "assistant", null, toolCallsJson);
    db.prepare(
      `INSERT INTO transcript_messages (session_id, context_segment_id, seq, role, content, tool_call_id) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("s1", seg, 2, "tool", "result", "tc1");

    const loaded = loadSessionTranscript(db, "s1", seg);
    assert.equal(loaded.length, 2);
    assert.equal(loaded[0]!.toolCalls?.length, 1);
    assert.equal(loaded[0]!.toolCalls![0]!.id, "tc1");
    assert.equal(loaded[0]!.toolCalls![0]!.name, "foo");
    assert.equal(loaded[0]!.toolCalls![0]!.arguments, '{"x":1}');

    // Replace and reload — tool_calls_json should survive
    replaceSessionTranscript(db, "s1", seg, loaded);
    const reloaded = loadSessionTranscript(db, "s1", seg);
    assert.equal(reloaded[0]!.toolCalls?.length, 1);
    assert.equal(reloaded[0]!.toolCalls![0]!.id, "tc1");
    assert.equal(reloaded[0]!.toolCalls![0]!.arguments, '{"x":1}');
    assert.equal(reloaded[1]!.toolCallId, "tc1");
    db.close();
  });

  it("compactSessionTranscript rewrites DB when over threshold", async () => {
    const db = new Database(":memory:");
    migrate(db, defaultMigrationsDir());
    createSessionStore(db).create({
      id: "s1",
      workspacePath: "/tmp/w",
      status: "active",
    });
    const seg = getSessionContextSegmentId(db, "s1");
    const big = "y".repeat(120);
    db.prepare(
      `INSERT INTO transcript_messages (session_id, context_segment_id, seq, role, content) VALUES (?, ?, ?, ?, ?)`,
    ).run("s1", seg, 1, "user", big);
    db.prepare(
      `INSERT INTO transcript_messages (session_id, context_segment_id, seq, role, content) VALUES (?, ?, ?, ?, ?)`,
    ).run("s1", seg, 2, "assistant", big);
    db.prepare(
      `INSERT INTO transcript_messages (session_id, context_segment_id, seq, role, content) VALUES (?, ?, ?, ?, ?)`,
    ).run("s1", seg, 3, "user", "tail");
    db.prepare(
      `INSERT INTO transcript_messages (session_id, context_segment_id, seq, role, content) VALUES (?, ?, ?, ?, ?)`,
    ).run("s1", seg, 4, "assistant", "end");

    const client: FailoverModelClient = {
      async complete() {
        return {
          content: "SUM",
          usedProviderId: "p",
          usedModel: "m",
          degraded: false,
        };
      },
    };

    const out = await compactSessionTranscript(db, "s1", { preserveRecentMessages: 2 }, client);

    assert.equal(out.compacted, true);
    const rows = loadSessionTranscript(db, "s1", seg);
    assert.equal(rows.length, 3);
    assert.ok(rows[0]!.content.includes("SUM"));
    assert.equal(rows[1]!.content, "tail");
    db.close();
  });

  describe("stripImageBlocksFromContent", () => {
    it("replaces base64 image blocks with [image omitted]", () => {
      const parts = JSON.stringify([
        { type: "text", text: "Look at this:" },
        {
          type: "image",
          mediaType: "image/png",
          base64: "iVBORw0KGgoAAAANS...",
        },
      ]);
      const result = stripImageBlocksFromContent(parts);
      const parsed = JSON.parse(result);
      assert.equal(parsed.length, 2);
      assert.deepStrictEqual(parsed[0], {
        type: "text",
        text: "Look at this:",
      });
      assert.deepStrictEqual(parsed[1], {
        type: "text",
        text: "[image omitted]",
      });
    });

    it("replaces URL-only image blocks with [image omitted]", () => {
      const parts = JSON.stringify([
        { type: "text", text: "Check this image" },
        {
          type: "image",
          mediaType: "image/jpeg",
          url: "https://cdn.example.com/photo.jpg",
        },
      ]);
      const result = stripImageBlocksFromContent(parts);
      const parsed = JSON.parse(result);
      assert.equal(parsed.length, 2);
      assert.deepStrictEqual(parsed[0], {
        type: "text",
        text: "Check this image",
      });
      assert.deepStrictEqual(parsed[1], {
        type: "text",
        text: "[image omitted]",
      });
    });

    it("leaves plain string content unchanged", () => {
      const plain = "Hello, this is a normal message.";
      assert.equal(stripImageBlocksFromContent(plain), plain);
    });

    it("leaves text-only ChatContentPart[] unchanged", () => {
      const parts = JSON.stringify([{ type: "text", text: "just text" }]);
      const result = stripImageBlocksFromContent(parts);
      const parsed = JSON.parse(result);
      assert.equal(parsed.length, 1);
      assert.deepStrictEqual(parsed[0], { type: "text", text: "just text" });
    });

    it("leaves non-ChatContentPart JSON arrays unchanged", () => {
      const arr = JSON.stringify([1, 2, 3]);
      assert.equal(stripImageBlocksFromContent(arr), arr);
    });

    it("leaves malformed JSON unchanged", () => {
      const bad = "[not valid json";
      assert.equal(stripImageBlocksFromContent(bad), bad);
    });
  });

  describe("stripImageBlocksForCompaction", () => {
    it("strips image blocks from messages with structured content", () => {
      const messages = [
        {
          role: "user" as const,
          content: JSON.stringify([
            { type: "text", text: "Describe this" },
            { type: "image", mediaType: "image/png", base64: "AAAA" },
          ]),
        },
        { role: "assistant" as const, content: "It looks like a cat." },
      ];
      const result = stripImageBlocksForCompaction(messages);
      assert.equal(result.length, 2);
      // User message should have image replaced
      const userParts = JSON.parse(result[0]!.content as string);
      assert.deepStrictEqual(userParts[1], {
        type: "text",
        text: "[image omitted]",
      });
      // Assistant message unchanged
      assert.equal(result[1]!.content, "It looks like a cat.");
    });

    it("does not mutate the original messages array", () => {
      const original = [
        {
          role: "user" as const,
          content: JSON.stringify([
            { type: "text", text: "hi" },
            { type: "image", mediaType: "image/png", base64: "BBBB" },
          ]),
        },
      ];
      const originalContent = original[0]!.content;
      stripImageBlocksForCompaction(original);
      assert.equal(original[0]!.content, originalContent);
    });
  });

  it("compactSessionTranscript strips image blocks before summarization", async () => {
    const db = new Database(":memory:");
    migrate(db, defaultMigrationsDir());
    createSessionStore(db).create({
      id: "s1",
      workspacePath: "/tmp/w",
      status: "active",
    });
    const seg = getSessionContextSegmentId(db, "s1");

    // Use a unique marker for the base64 payload so we can distinguish it from other content
    const base64Marker = "iVBORw0KGgoXYZFAKEBASE64PAYLOAD";
    const imageContent = JSON.stringify([
      { type: "text", text: "What is this?" },
      {
        type: "image",
        mediaType: "image/png",
        base64: base64Marker.repeat(10),
      },
    ]);
    db.prepare(
      `INSERT INTO transcript_messages (session_id, context_segment_id, seq, role, content) VALUES (?, ?, ?, ?, ?)`,
    ).run("s1", seg, 1, "user", imageContent);
    db.prepare(
      `INSERT INTO transcript_messages (session_id, context_segment_id, seq, role, content) VALUES (?, ?, ?, ?, ?)`,
    ).run("s1", seg, 2, "assistant", "z".repeat(200));
    db.prepare(
      `INSERT INTO transcript_messages (session_id, context_segment_id, seq, role, content) VALUES (?, ?, ?, ?, ?)`,
    ).run("s1", seg, 3, "user", "tail");
    db.prepare(
      `INSERT INTO transcript_messages (session_id, context_segment_id, seq, role, content) VALUES (?, ?, ?, ?, ?)`,
    ).run("s1", seg, 4, "assistant", "end");

    let capturedMessages: unknown[] | undefined;
    const client: FailoverModelClient = {
      async complete(input: { messages: readonly unknown[] }) {
        capturedMessages = [...input.messages];
        return {
          content: "SUM",
          usedProviderId: "p",
          usedModel: "m",
          degraded: false,
        };
      },
    };

    await compactSessionTranscript(db, "s1", { preserveRecentMessages: 2 }, client);

    // The summarizer should have received messages with image blocks stripped
    assert.ok(capturedMessages, "summarizer should have been called");
    const userMsg = capturedMessages[1] as { content: string };
    // The excerpt is built from m.content, so the serialized JSON should contain [image omitted]
    assert.ok(
      userMsg.content.includes("[image omitted]"),
      "image blocks should be replaced with [image omitted]",
    );
    assert.ok(
      !userMsg.content.includes(base64Marker),
      "base64 payload should not reach the summarizer",
    );
    db.close();
  });
});
