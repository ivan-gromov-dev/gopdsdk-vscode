import * as assert from "node:assert/strict";
import { test } from "node:test";
import { analyzerConfigurationChanged, analyzerSettings, ConfigurationReader } from "../../src/configuration";

function configuration(values: Record<string, unknown>): ConfigurationReader {
  return { get<T>(section: string, defaultValue: T): T { return (values[section] as T | undefined) ?? defaultValue; } };
}

test("builds the complete analyzer payload with safe defaults", () => {
  assert.deepEqual(analyzerSettings(configuration({})), {
    target: "both", gopdsdkFloor: "", playdateSDK: "", rules: [], categories: [], excludeRules: [],
    severities: {}, baseline: "", changedFiles: [], deep: false,
  });
});

test("preserves analyzer selectors while removing empty list entries", () => {
  assert.deepEqual(analyzerSettings(configuration({
    target: "device", gopdsdkFloor: " v1.2.3 ", playdateSDK: " 3.1.1 ", rules: ["ownership", " "],
    categories: ["performance"], excludeRules: ["device-goroutine"],
    severities: { ownership: "information" }, baseline: " .gopdsdk-baseline.json ",
    changedFiles: ["game.go", ""], deep: true,
  })), {
    target: "device", gopdsdkFloor: "v1.2.3", playdateSDK: "3.1.1", rules: ["ownership"], categories: ["performance"],
    excludeRules: ["device-goroutine"], severities: { ownership: "information" },
    baseline: ".gopdsdk-baseline.json", changedFiles: ["game.go"], deep: true,
  });
});

test("distinguishes hot analyzer settings from launch settings", () => {
  assert.equal(analyzerConfigurationChanged((section) => section === "gopdsdk.deep"), true);
  assert.equal(analyzerConfigurationChanged((section) => section === "gopdsdk.executable"), false);
});
