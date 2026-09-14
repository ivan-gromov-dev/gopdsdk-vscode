import * as assert from "node:assert/strict";
import test from "node:test";
import { workspaceNodes } from "../../src/workspaceViewModel";

test("renders accessible empty, loading, and error states", () => {
  assert.match(workspaceNodes({ state: "empty" })[0]!.label, /Open/);
  assert.match(workspaceNodes({ state: "loading" })[0]!.icon, /spin/);
  assert.equal(workspaceNodes({ state: "error", error: "fixture" })[1]!.command, "gopdsdk.refreshWorkspaceView");
});

test("projects workspace state and routes every stable action", () => {
  const nodes = workspaceNodes({ state: "ready", folder: "game", target: "both", gopdsdk: "gopdsdk (analyzer v1)", sdk: "3.1.1", health: "ready", device: "connected", diagnostics: { errors: 1, warnings: 2, information: 3 } });
  assert.equal(nodes.find((item) => item.label === "Workspace")?.description, "game");
  assert.equal(nodes.find((item) => item.label === "Diagnostics")?.description, "1 errors, 2 warnings, 3 info");
  for (const command of ["gopdsdk.showProjectHealth", "gopdsdk.remediateProjectHealth", "gopdsdk.createProject", "gopdsdk.configureAnalyzer", "gopdsdk.browseRules", "gopdsdk.compareTargets", "gopdsdk.buildSimulator", "gopdsdk.runSimulator", "gopdsdk.buildDevice", "gopdsdk.runDevice", "gopdsdk.showCrashLog", "gopdsdk.showErrorLog"]) {
    assert.ok(nodes.some((item) => item.command === command), command);
  }
});

test("renders optional device connection states without failing workspace health", () => {
  for (const state of ["unchecked", "checking", "disconnected", "error"] as const) {
    const device = workspaceNodes({ state: "ready", folder: "game", health: "toolchain installed", device: state }).find((item) => item.label === "Device");
    assert.equal(device?.description, state);
  }
});
