import { describe, it, afterEach } from "vitest";
import assert from "node:assert";
import {
  registerSteerChannel,
  pushSteer,
  drainSteers,
  _resetAllChannels,
} from "../../src/sessions/steer-channel";

describe("steer-channel", () => {
  afterEach(() => {
    _resetAllChannels();
  });

  it("pushSteer returns false when no channel is registered", () => {
    assert.equal(pushSteer("sess-1", "hello"), false);
  });

  it("pushSteer returns true and drainSteers yields the message when channel is registered", () => {
    const { unregister } = registerSteerChannel("sess-1");
    assert.equal(pushSteer("sess-1", "steer me"), true);
    const msgs = drainSteers("sess-1");
    assert.deepStrictEqual(msgs, ["steer me"]);
    // drain again should be empty
    assert.deepStrictEqual(drainSteers("sess-1"), []);
    unregister();
  });

  it("accumulates multiple steer messages and drains all at once", () => {
    const { unregister } = registerSteerChannel("sess-1");
    pushSteer("sess-1", "a");
    pushSteer("sess-1", "b");
    pushSteer("sess-1", "c");
    assert.deepStrictEqual(drainSteers("sess-1"), ["a", "b", "c"]);
    unregister();
  });

  it("unregister clears the channel and pushSteer returns false after", () => {
    const { unregister } = registerSteerChannel("sess-1");
    unregister();
    assert.equal(pushSteer("sess-1", "too late"), false);
    assert.deepStrictEqual(drainSteers("sess-1"), []);
  });

  it("channels are independent per session", () => {
    const c1 = registerSteerChannel("sess-1");
    const c2 = registerSteerChannel("sess-2");
    pushSteer("sess-1", "for-1");
    pushSteer("sess-2", "for-2");
    assert.deepStrictEqual(drainSteers("sess-1"), ["for-1"]);
    assert.deepStrictEqual(drainSteers("sess-2"), ["for-2"]);
    c1.unregister();
    c2.unregister();
  });

  it("re-registering a session replaces the old channel", () => {
    const c1 = registerSteerChannel("sess-1");
    pushSteer("sess-1", "old");
    const c2 = registerSteerChannel("sess-1");
    // old messages are gone (new channel)
    assert.deepStrictEqual(drainSteers("sess-1"), []);
    pushSteer("sess-1", "new");
    assert.deepStrictEqual(drainSteers("sess-1"), ["new"]);
    c1.unregister(); // no-op since replaced
    // c2 should still work
    pushSteer("sess-1", "still works");
    assert.deepStrictEqual(drainSteers("sess-1"), ["still works"]);
    c2.unregister();
  });
});
