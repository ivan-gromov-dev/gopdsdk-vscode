import * as assert from "node:assert/strict";
import { test } from "node:test";
import { analyzerRule, isAnalyzerSafeFix, ruleHelpMarkdown } from "../../src/diagnostics";

test("accepts only edit-only quick fixes tied to gopdsdk diagnostics", () => {
  const diagnostic = { source: "gopdsdk", code: "device-goroutine" };
  assert.equal(isAnalyzerSafeFix({ kind: "quickfix", edit: {}, diagnostics: [diagnostic] }), true);
  assert.equal(isAnalyzerSafeFix({ kind: "refactor", edit: {}, diagnostics: [diagnostic] }), false);
  assert.equal(isAnalyzerSafeFix({ kind: "quickfix", command: {}, edit: {}, diagnostics: [diagnostic] }), false);
  assert.equal(isAnalyzerSafeFix({ kind: "quickfix", edit: {}, diagnostics: [{ source: "gopls", code: "x" }] }), false);
  assert.equal(isAnalyzerSafeFix({ kind: "quickfix", diagnostics: [diagnostic] }), false);
});

test("extracts string rule codes, including LSP code objects", () => {
  assert.equal(analyzerRule({ source: "gopdsdk", code: { value: "ownership" } }), "ownership");
  assert.equal(analyzerRule({ source: "gopls", code: "ownership" }), undefined);
  assert.equal(analyzerRule({ source: "gopdsdk", code: 7 }), undefined);
});

test("renders validated rule help and rejects malformed responses", () => {
  const markdown = ruleHelpMarkdown({
    rule: { id: "ownership", summary: "ownership is ambiguous", family: "lifecycle", default: "warning", confidence: "proven", safeFixPolicy: "none" },
    documentation: "https://example.invalid/rules/ownership",
  });
  assert.match(markdown ?? "", /^# ownership/m);
  assert.match(markdown ?? "", /Versioned rule documentation/);
  assert.equal(ruleHelpMarkdown({ rule: { id: "ownership" } }), undefined);
});
