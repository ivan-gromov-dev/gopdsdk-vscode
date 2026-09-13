import * as assert from "node:assert/strict";
import { test } from "node:test";
import { decodeProgress, decodeWorkflowResult, stageLabel, workflowArguments } from "../../src/workflow";

test("constructs structured cancellable workflow arguments", () => {
  assert.deepEqual(workflowArguments("build"), ["build", "--format", "json", "--progress", "."]);
  assert.deepEqual(workflowArguments("run"), ["run", "--format", "json", "--progress", "."]);
});

test("decodes build and run successes", () => {
  const build = decodeWorkflowResult(JSON.stringify({ schema: "gopdsdk-tooling-result/v1", command: "build", ok: true, result: { schema: "gopdsdk-build/v1", target: "simulator", package: "example/game", artifact: "C:/game.pdx", future: true } }), "build");
  assert.equal(build.artifact, "C:/game.pdx");
  const run = decodeWorkflowResult(JSON.stringify({ schema: "gopdsdk-tooling-result/v1", command: "run", ok: true, result: { schema: "gopdsdk-run/v1", target: "simulator", package: "example/game", artifact: "/tmp/game.pdx", pid: 42 } }), "run");
  assert.equal(run.pid, 42);
});

test("decodes safe failure locations and drops unsafe ones", () => {
  const result = decodeWorkflowResult(JSON.stringify({ schema: "gopdsdk-tooling-result/v1", command: "build", ok: false, failure: { category: "compilation-failed", locations: [
    { path: "game/main.go", line: 3, column: 5 }, { path: "../secret.go", line: 1, column: 1 }, { path: "C:\\secret.go", line: 1, column: 1 },
  ] } }), "build");
  assert.deepEqual(result.failure?.locations, [{ path: "game/main.go", line: 3, column: 5 }]);
});

test("rejects incompatible schemas and malformed run results", () => {
  assert.throws(() => decodeWorkflowResult('{"schema":"gopdsdk-tooling-result/v2"}', "build"), /Update gopdsdk/);
  assert.throws(() => decodeWorkflowResult(JSON.stringify({ schema: "gopdsdk-tooling-result/v1", command: "run", ok: true, result: { schema: "gopdsdk-run/v1", target: "simulator", package: "game", artifact: "/game.pdx", pid: 0 } }), "run"), /process ID/);
});

test("decodes progress and labels known stages", () => {
  assert.deepEqual(decodeProgress('{"schema":"gopdsdk-progress/v1","command":"run","sequence":2,"stage":"launch"}', "run"), { sequence: 2, stage: "launch" });
  assert.equal(stageLabel("compilation"), "Compiling");
  assert.equal(stageLabel("future-stage"), "future-stage");
  assert.throws(() => decodeProgress('{"schema":"gopdsdk-progress/v2","command":"run","sequence":1,"stage":"launch"}', "run"), /schema/);
});
