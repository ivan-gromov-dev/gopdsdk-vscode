import * as assert from "node:assert/strict";
import { test } from "node:test";
import { SerialTaskQueue } from "../../src/lifecycle";

test("serializes restart operations", async () => {
  const queue = new SerialTaskQueue();
  const events: string[] = [];
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });

  const first = queue.schedule(async () => {
    events.push("first:start");
    await gate;
    events.push("first:end");
  });
  const second = queue.schedule(async () => {
    events.push("second");
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["first:start"]);
  release?.();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first:start", "first:end", "second"]);
});

test("continues after a failed operation", async () => {
  const queue = new SerialTaskQueue();
  await assert.rejects(queue.schedule(async () => { throw new Error("expected"); }));
  let completed = false;
  await queue.schedule(async () => { completed = true; });
  assert.equal(completed, true);
});
