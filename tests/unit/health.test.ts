import * as assert from "node:assert/strict";
import test from "node:test";
import { decodeConnectionProbe, decodeDoctor, healthMarkdown, initArguments, projectAnswers } from "../../src/health";

const envelope = (command: string, result: unknown) => JSON.stringify({ schema: "gopdsdk-tooling-result/v1", command, ok: true, result });

test("decodes every doctor health state and renders evidence", () => {
  const report = decodeDoctor(envelope("doctor", {
    schema: "gopdsdk-doctor/v1", host: "linux/amd64", sdk: { path: "/sdk", version: "3.1.1" }, tools: [],
    checks: ["ready", "missing", "incompatible", "unverified"].map((status, index) => ({ id: `check-${index}`, discovered: index !== 1, status, evidenceLevel: "discovery", failureCategory: index ? "fixture" : undefined })),
  }));
  const connection = decodeConnectionProbe(envelope("probe", { schema: "gopdsdk-probe/v1", probe: "connection", discovered: true, ready: true, evidenceLevel: "usb" }));
  const markdown = healthMarkdown(report, connection, { "go.mod": true, pdxinfo: false }, "gopdsdk", "v1");
  for (const status of ["ready", "missing", "incompatible", "unverified"]) assert.match(markdown, new RegExp(status));
  assert.match(markdown, /device-connection/); assert.match(markdown, /3\.1\.1/); assert.match(markdown, /Analyzer protocol: `v1`/);
});

test("rejects unknown and malformed health contracts", () => {
  assert.throws(() => decodeDoctor("{}"), /unsupported result/);
  assert.throws(() => decodeDoctor(envelope("doctor", { schema: "gopdsdk-doctor/v2", host: "x", tools: [], checks: [] })), /unsupported report/);
  assert.throws(() => decodeConnectionProbe(envelope("probe", { schema: "gopdsdk-probe/v1", probe: "simulator" })), /unsupported report/);
});

test("constructs init arguments structurally and validates required fields", () => {
  assert.deepEqual(initArguments({ directory: "/tmp/game", module: "example.com/game", name: "Game", author: "Dev", bundleID: "com.example.game" }),
    ["init", "--module", "example.com/game", "--name", "Game", "--author", "Dev", "--bundle-id", "com.example.game", "/tmp/game"]);
  assert.throws(() => initArguments({ directory: "", module: "x", name: "x", author: "x", bundleID: "invalid" }), /required/);
  assert.equal(projectAnswers(["/tmp/game", undefined, "Game", "Dev", "com.example.game"]), undefined, "wizard cancellation is preserved");
  assert.throws(() => projectAnswers(["/tmp/game", "example.com/game", "Game", "Dev", "invalid"]), /required/, "wizard validation failure is reported");
});
