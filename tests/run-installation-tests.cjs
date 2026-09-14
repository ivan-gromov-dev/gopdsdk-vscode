"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } = require("@vscode/test-electron");
const manifest = require("../package.json");

const previousVSIX = path.resolve(process.argv[2] || "gopdsdk-previous.vsix");
const currentVSIX = path.resolve(process.argv[3] || "gopdsdk-current.vsix");

function run(cli, baseArgs, args) {
  const result = spawnSync(cli, [...baseArgs, ...args], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`VS Code CLI failed (${result.status}): ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

async function main() {
  assert.ok(fs.existsSync(previousVSIX), `missing previous VSIX: ${previousVSIX}`);
  assert.ok(fs.existsSync(currentVSIX), `missing current VSIX: ${currentVSIX}`);
  const executable = await downloadAndUnzipVSCode({ version: process.env.VSCODE_TEST_VERSION || "1.95.3", timeout: 120_000 });
  const [cli, ...baseArgs] = resolveCliArgsFromVSCodeExecutablePath(executable);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gopdsdk-vscode-install-"));
  const common = ["--user-data-dir", path.join(root, "user"), "--extensions-dir", path.join(root, "extensions")];
  const install = (vsix) => run(cli, baseArgs, [...common, "--install-extension", vsix, "--force"]);
  const installed = () => run(cli, baseArgs, [...common, "--list-extensions", "--show-versions"]);
  try {
    install(previousVSIX);
    assert.match(installed(), /^gopdsdk\.gopdsdk@0\.0\.1$/m, "previous version installed");
    install(currentVSIX);
    assert.doesNotMatch(installed(), /^gopdsdk\.gopdsdk@0\.0\.1$/m, "upgrade replaced previous version");
    assert.ok(installed().split(/\r?\n/).includes(`${manifest.publisher}.${manifest.name}@${manifest.version}`), "current version installed");
    install(previousVSIX);
    assert.match(installed(), /^gopdsdk\.gopdsdk@0\.0\.1$/m, "forced downgrade installed");
    run(cli, baseArgs, [...common, "--uninstall-extension", "gopdsdk.gopdsdk"]);
    assert.doesNotMatch(installed(), /^gopdsdk\.gopdsdk@/m, "extension uninstalled");
    console.log(JSON.stringify({ evidence: "editor-integration", install: true, upgrade: true, downgrade: true, uninstall: true }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
