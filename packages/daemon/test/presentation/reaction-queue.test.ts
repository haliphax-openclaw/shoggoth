import { describe, it, beforeEach } from "vitest";
import assert from "node:assert";
import { ReactionQueue, type QueuedReaction } from "../../src/presentation/reaction-queue";

function makeReaction(overrides: Partial<QueuedReaction> = {}): QueuedReaction {
  return {
    messageId: "msg-1",
    channelId: "ch-1",
    userId: "user-1",
    emoji: { id: null, name: "👍" },
    receivedAt: Date.now(),
    ...overrides,
  };
}

describe("ReactionQueue", () => {
  let queue: ReactionQueue;

  beforeEach(() => {
    queue = new ReactionQueue();
  });

  it("trackMessage + isInFlight", () => {
    assert.equal(queue.isInFlight("s1", "msg-1"), false);
    queue.trackMessage("s1", "msg-1");
    assert.equal(queue.isInFlight("s1", "msg-1"), true);
    assert.equal(queue.isInFlight("s1", "msg-2"), false);
    assert.equal(queue.isInFlight("s2", "msg-1"), false);
  });

  it("enqueue + drain returns queued reactions", () => {
    queue.trackMessage("s1", "msg-1");
    const r1 = makeReaction({ messageId: "msg-1" });
    const r2 = makeReaction({ messageId: "msg-1", emoji: { id: null, name: "👎" } });
    queue.enqueue("s1", r1);
    queue.enqueue("s1", r2);
    const drained = queue.drain("s1");
    assert.equal(drained.length, 2);
    assert.strictEqual(drained[0], r1);
    assert.strictEqual(drained[1], r2);
  });

  it("discard clears everything", () => {
    queue.trackMessage("s1", "msg-1");
    queue.enqueue("s1", makeReaction());
    queue.discard("s1");
    assert.equal(queue.isInFlight("s1", "msg-1"), false);
    assert.equal(queue.drain("s1").length, 0);
  });

  it("drain clears tracking", () => {
    queue.trackMessage("s1", "msg-1");
    queue.enqueue("s1", makeReaction());
    queue.drain("s1");
    assert.equal(queue.isInFlight("s1", "msg-1"), false);
    // Second drain returns empty
    assert.equal(queue.drain("s1").length, 0);
  });

  it("multiple sessions are isolated", () => {
    queue.trackMessage("s1", "msg-1");
    queue.trackMessage("s2", "msg-2");
    const r1 = makeReaction({ messageId: "msg-1" });
    const r2 = makeReaction({ messageId: "msg-2", userId: "user-2" });
    queue.enqueue("s1", r1);
    queue.enqueue("s2", r2);

    const drained1 = queue.drain("s1");
    assert.equal(drained1.length, 1);
    assert.strictEqual(drained1[0], r1);

    // s2 still intact
    assert.equal(queue.isInFlight("s2", "msg-2"), true);
    const drained2 = queue.drain("s2");
    assert.equal(drained2.length, 1);
    assert.strictEqual(drained2[0], r2);
  });
});
