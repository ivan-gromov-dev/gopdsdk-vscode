import * as assert from "node:assert/strict";
import test from "node:test";
import { decodeDoctor, healthMarkdown, initArguments, missingToolchain, projectAnswers, toolchainSummary } from "../../src/health";

const envelope = (command: string, result: unknown) => JSON.stringify({ schema: "gopdsdk-tooling-result/v1", command, ok: true, result });

test("decodes every doctor health state and renders evidence", () => {
  const report = decodeDoctor(envelope("doctor", {
    schema: "gopdsdk-doctor/v1", host: "linux/amd64", sdk: { path: "/sdk", version: "3.1.1" }, tools: ["go", "pdc", "simulator", "tinygo", "arm-none-eabi-gcc", "pdutil", "cc"].map((name) => ({ name, path: `/bin/${name}` })),
    checks: ["ready", "missing", "incompatible", "unverified"].map((status, index) => ({ id: `check-${index}`, discovered: index !== 1, status, evidenceLevel: "discovery", failureCategory: index ? "fixture" : undefined })),
  }));
  const markdown = healthMarkdown(report, "connected", { "go.mod": true, pdxinfo: false }, "gopdsdk", "v1");
  for (const status of ["ready", "missing", "incompatible", "unverified"]) assert.match(markdown, new RegExp(status));
  assert.match(markdown, /device-connection/); assert.match(markdown, /3\.1\.1/); assert.match(markdown, /Analyzer protocol: `v1`/);
  assert.equal(toolchainSummary(report), "toolchain installed"); assert.deepEqual(missingToolchain(report), []);
});

test("requires installed toolchain but keeps physical connection optional", () => {
  const report = decodeDoctor(envelope("doctor", { schema: "gopdsdk-doctor/v1", host: "windows/amd64", tools: [{ name: "go", path: "C:/go.exe" }], checks: [] }));
  assert.deepEqual(missingToolchain(report), ["pdc", "simulator", "tinygo", "arm-none-eabi-gcc", "pdutil", "C compiler"]);
  assert.match(toolchainSummary(report), /7 toolchain component/);
  const markdown = healthMarkdown(report, "unchecked", {}, "gopdsdk.exe", "v1");
  assert.match(markdown, /Required toolchain/); assert.match(markdown, /Optional physical connection/); assert.match(markdown, /unchecked/);
});

test("rejects unknown and malformed health contracts", () => {
  assert.throws(() => decodeDoctor("{}"), /unsupported result/);
  assert.throws(() => decodeDoctor(envelope("doctor", { schema: "gopdsdk-doctor/v2", host: "x", tools: [], checks: [] })), /unsupported report/);
});

test("constructs init arguments structurally and validates required fields", () => {
  assert.deepEqual(initArguments({ directory: "/tmp/game", module: "example.com/game", name: "Game", author: "Dev", bundleID: "com.example.game" }),
    ["init", "--module", "example.com/game", "--name", "Game", "--author", "Dev", "--bundle-id", "com.example.game", "/tmp/game"]);
  assert.throws(() => initArguments({ directory: "", module: "x", name: "x", author: "x", bundleID: "invalid" }), /required/);
  assert.equal(projectAnswers(["/tmp/game", undefined, "Game", "Dev", "com.example.game"]), undefined, "wizard cancellation is preserved");
  assert.throws(() => projectAnswers(["/tmp/game", "example.com/game", "Game", "Dev", "invalid"]), /required/, "wizard validation failure is reported");
});
