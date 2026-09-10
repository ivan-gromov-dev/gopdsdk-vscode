"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, "..");
  const server = path.join(extensionDevelopmentPath, "tests", "fixtures", "fake-lsp-server.cjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gopdsdk-vscode-"));
  const folders = ["root-a", "root-b"];
  for (const folder of folders) {
    const directory = path.join(root, folder);
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, "go.mod"), `module example.invalid/${folder}\n\ngo 1.23\n`);
    fs.writeFileSync(path.join(directory, "game.go"), "package game\n\ngo f()\n");
  }
  const workspace = path.join(root, "fixture.code-workspace");
  fs.writeFileSync(workspace, JSON.stringify({
    folders: folders.map((folder) => ({ path: folder })),
    settings: { "gopdsdk.executable": process.execPath, "gopdsdk.arguments": [server, "diagnostic-ux"] },
  }));
  try {
    await runTests({
      version: "1.95.3",
      extensionDevelopmentPath,
      extensionTestsPath: path.join(extensionDevelopmentPath, "dist-tests", "tests", "extension", "index.js"),
      launchArgs: [workspace, "--disable-extensions"],
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
