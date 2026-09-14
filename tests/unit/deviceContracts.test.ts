import * as assert from "node:assert/strict";
import { test } from "node:test";
import { cancelChild, decodeDeviceProgress, decodeDeviceResult, deviceArguments, deviceStageLabel } from "../../src/deviceContracts";

const envelope = (command: string, result: unknown): string => JSON.stringify({ schema: "gopdsdk-tooling-result/v1", command, ok: true, result });

test("constructs device commands without shell strings", () => {
  assert.deepEqual(deviceArguments("build device"), ["build", "device", "--format", "json", "--progress", "."]);
  assert.deepEqual(deviceArguments("run device"), ["run", "device", "--format", "json", "--progress", "."]);
  assert.deepEqual(deviceArguments("probe connection"), ["probe", "connection", "--format", "json"]);
  assert.deepEqual(deviceArguments("crashlog"), ["crashlog", "--format", "json", "--progress"]);
  assert.deepEqual(deviceArguments("device disk mount"), ["device", "disk", "mount", "--format", "json", "--progress"]);
  assert.deepEqual(deviceArguments("device disk unmount"), ["device", "disk", "unmount", "--format", "json", "--progress"]);
});

test("decodes device disk mode transitions", () => {
  assert.equal(decodeDeviceResult(envelope("device disk mount", { schema: "gopdsdk-device-disk/v1", mode: "disk", mountPath: "F:/" }), "device disk mount").mode, "disk");
  assert.equal(decodeDeviceResult(envelope("device disk unmount", { schema: "gopdsdk-device-disk/v1", mode: "connected" }), "device disk unmount").mode, "connected");
});

test("decodes USB connection without confusing discovery with connectivity", () => {
  const connected = decodeDeviceResult(envelope("probe connection", { schema: "gopdsdk-probe/v1", probe: "connection", discovered: true, ready: true, evidenceLevel: "usb", values: [] }), "probe connection");
  assert.equal(connected.connected, true); assert.equal(connected.evidenceLevel, "usb");
  assert.throws(() => decodeDeviceResult(envelope("probe connection", { schema: "gopdsdk-probe/v1", probe: "connection", discovered: true, ready: false, evidenceLevel: "tool-discovery" }), "probe connection"), /connection/);
});

test("decodes device build, deployment, and typed failures", () => {
  assert.equal(decodeDeviceResult(envelope("build device", { schema: "gopdsdk-build/v1", target: "device", package: "game", artifact: "C:/game.pdx" }), "build device").artifact, "C:/game.pdx");
  assert.equal(decodeDeviceResult(envelope("run device", { schema: "gopdsdk-run/v1", target: "device", package: "game", deployment: "installed", execution: "launched" }), "run device").execution, "launched");
  assert.equal(decodeDeviceResult(JSON.stringify({ schema: "gopdsdk-tooling-result/v1", command: "run device", ok: false, failure: { category: "deployment-failed" } }), "run device").failure?.category, "deployment-failed");
});

test("decodes exact device log bytes", () => {
  const content = "panic: boom\n"; const data = Buffer.from(content).toString("base64");
  const result = decodeDeviceResult(envelope("crashlog", { schema: "gopdsdk-device-log/v1", metadata: { kind: "crashlog.txt", path: "F:/crashlog.txt", byteCount: Buffer.byteLength(content) }, content: { encoding: "base64", data } }), "crashlog");
  assert.equal(result.log?.content, content);
  assert.throws(() => decodeDeviceResult(envelope("crashlog", { schema: "gopdsdk-device-log/v1", metadata: { kind: "crashlog.txt", path: "F:/crashlog.txt", byteCount: 999 }, content: { encoding: "base64", data } }), "crashlog"), /content/);
});

test("validates ordered device progress stages", () => {
  assert.deepEqual(decodeDeviceProgress('{"schema":"gopdsdk-progress/v1","command":"run device","sequence":4,"stage":"deployment"}', "run device"), { sequence: 4, stage: "deployment" });
  assert.equal(deviceStageLabel("connection"), "Checking connection"); assert.equal(deviceStageLabel("launch"), "Launching on Playdate");
  assert.throws(() => decodeDeviceProgress('{"schema":"gopdsdk-progress/v1","command":"build device","sequence":1,"stage":"planning"}', "run device"), /progress/);
});

test("cancellation only terminates a running device command", () => {
  let kills = 0;
  assert.equal(cancelChild({ exitCode: null, kill: () => { kills++; return true; } }), true);
  assert.equal(cancelChild({ exitCode: 0, kill: () => { kills++; return true; } }), false);
  assert.equal(kills, 1);
});
