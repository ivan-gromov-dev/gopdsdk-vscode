import * as assert from "node:assert/strict";
import { test } from "node:test";
import { comparisonMarkdown, decodeBaselineResult, decodeCheckReport, decodeRepositoryConfiguration, decodeRuleCatalog, encodeRepositoryConfiguration, suppressionInsertion } from "../../src/analyzerUx";

const envelope = (command: string, result: unknown): string => JSON.stringify({ schema: "gopdsdk-tooling-result/v1", command, ok: true, result });

test("decodes the analyzer-provided versioned catalog without embedding rule semantics", () => {
  const catalog = decodeRuleCatalog(envelope("rules", { schema: "gopdsdk-analyzer-contracts/v1", rules: [{ id: "device-goroutine", family: "device", summary: "no goroutines", defaultSeverity: "error", confidence: "proven", targets: ["device"], suppressible: true, safeFixPolicy: "none", future: true }] }));
  assert.equal(catalog.rules[0]?.id, "device-goroutine");
  assert.equal(catalog.rules[0]?.experimental, false);
  assert.throws(() => decodeRuleCatalog(envelope("rules", { schema: "gopdsdk-analyzer-contracts/v2", rules: [] })), /catalog schema/);
});

test("round-trips repository configuration while preserving other owned fields", () => {
  const config = decodeRepositoryConfiguration('{"schema":"gopdsdk-check-config/v1","tests":true,"target":"device"}');
  config.profile = "deep";
  assert.deepEqual(JSON.parse(encodeRepositoryConfiguration(config)), { schema: "gopdsdk-check-config/v1", tests: true, target: "device", profile: "deep" });
  assert.throws(() => decodeRepositoryConfiguration('{"schema":"gopdsdk-check-config/v2"}'), /unsupported schema/);
});

test("creates a reasoned suppression at the diagnostic line and rejects stale documents", () => {
  assert.deepEqual(suppressionInsertion("package game\r\n\tpanic(1)\r\n", 2, "device-panic-cleanup", " intentional terminal path ", 4, 4), {
    offset: 14, text: "\t//gopdsdk:ignore device-panic-cleanup -- intentional terminal path\r\n",
  });
  assert.throws(() => suppressionInsertion("package game\n", 1, "device-goroutine", "reason", 1, 2), /changed/);
  assert.throws(() => suppressionInsertion("package game\n", 1, "device-goroutine", " ", 1, 1), /reason/);
});

test("decodes baseline results and rejects schema drift", () => {
  const result = decodeBaselineResult(envelope("baseline validate", { schema: "gopdsdk-baseline-result/v1", operation: "validate", path: "baseline.json", entries: 2, staleEntries: [{ rule: "old" }] }), "validate");
  assert.equal(result.staleEntries.length, 1);
  assert.throws(() => decodeBaselineResult(envelope("baseline validate", { schema: "gopdsdk-baseline-result/v2", operation: "validate", path: "baseline.json", entries: 0, staleEntries: [] }), "validate"), /baseline result/);
});

test("renders deterministic target comparison from structured check reports", () => {
  const report = decodeCheckReport(JSON.stringify({ schema: "gopdsdk-check/v1", analyzerVersion: "v1", sdkVersion: "3.1.1", diagnostics: [{ rule: "device-goroutine", category: "device", severity: "error", target: "device", message: "goroutine", primary: { path: "game.go", start: { line: 2, column: 1 }, end: { line: 2, column: 3 } } }] }));
  assert.match(comparisonMarkdown([report]), /device \| device-goroutine \| game.go:2:1/);
  assert.throws(() => decodeCheckReport(JSON.stringify({ schema: "gopdsdk-check/v2", analyzerVersion: "v1", sdkVersion: "3", diagnostics: [] })), /check schema/);
});
