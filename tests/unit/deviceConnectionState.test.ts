import * as assert from "node:assert/strict";
import test from "node:test";
import { DeviceConnectionStore } from "../../src/deviceConnectionState";

test("keeps optional connection state per workspace and notifies explicit checks", () => {
  const store = new DeviceConnectionStore(); const events: string[] = [];
  const subscription = store.subscribe((key, state) => events.push(`${key}:${state}`));
  assert.equal(store.get("a"), "unchecked");
  store.set("a", "checking"); store.set("a", "disconnected"); store.set("b", "connected");
  subscription.dispose(); store.set("a", "error");
  assert.equal(store.get("a"), "error"); assert.equal(store.get("b"), "connected");
  assert.deepEqual(events, ["a:checking", "a:disconnected", "b:connected"]);
});
