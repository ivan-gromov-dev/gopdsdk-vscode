"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, "..");
  const server = path.join(extensionDevelopmentPath, "tests", "fixtures", "fake-lsp-server.cjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gopdsdk-vscode-reliability-"));
  const folders = ["root-a", "root-b", "root-c"];
  const filesPerFolder = 200;
  for (const folder of folders) {
    const directory = path.join(root, folder);
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, "go.mod"), `module example.invalid/${folder}\n\ngo 1.23\n`);
    fs.writeFileSync(path.join(directory, "game.go"), "package game\n\ngo f()\n");
    for (let index = 0; index < filesPerFolder; index++) {
      fs.writeFileSync(path.join(directory, `system_${index}.go`), `package game\n\nfunc system${index}() int { return ${index} }\n`);
    }
  }
  const workspace = path.join(root, "fixture.code-workspace");
  const log = path.join(root, "server.ndjson");
  const marker = path.join(root, "crashed.marker");
  fs.writeFileSync(workspace, JSON.stringify({
    folders: folders.slice(0, 2).map((folder) => ({ path: folder })),
    settings: { "gopdsdk.executable": process.execPath, "gopdsdk.arguments": [server, "reliability", log, marker] },
  }));
  const previous = {
    extra: process.env.GOPDSDK_STRESS_EXTRA_FOLDER,
    log: process.env.GOPDSDK_STRESS_LOG,
    count: process.env.GOPDSDK_STRESS_FILE_COUNT,
  };
  process.env.GOPDSDK_STRESS_EXTRA_FOLDER = path.join(root, "root-c");
  process.env.GOPDSDK_STRESS_LOG = log;
  process.env.GOPDSDK_STRESS_FILE_COUNT = String(filesPerFolder * folders.length + folders.length);
  try {
    await runTests({
      version: "1.95.3",
      timeout: 120_000,
      extensionDevelopmentPath,
      extensionTestsPath: path.join(extensionDevelopmentPath, "dist-tests", "tests", "reliability", "index.js"),
      launchArgs: [workspace, "--disable-extensions"],
    });
  } finally {
    if (previous.extra === undefined) delete process.env.GOPDSDK_STRESS_EXTRA_FOLDER; else process.env.GOPDSDK_STRESS_EXTRA_FOLDER = previous.extra;
    if (previous.log === undefined) delete process.env.GOPDSDK_STRESS_LOG; else process.env.GOPDSDK_STRESS_LOG = previous.log;
    if (previous.count === undefined) delete process.env.GOPDSDK_STRESS_FILE_COUNT; else process.env.GOPDSDK_STRESS_FILE_COUNT = previous.count;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
