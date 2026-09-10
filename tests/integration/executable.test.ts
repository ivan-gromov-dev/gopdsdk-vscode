import * as assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { discoverExecutable, ExecutableNotFoundError } from "../../src/executable";
import { probeServer, ServerProbeError } from "../../src/probe";

const temporaryRoots: string[] = [];
const executeFile = promisify(execFile);

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gopdsdk-vscode-"));
  temporaryRoots.push(root);
  return root;
}

async function writeExecutable(file: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, process.platform === "win32" ? "@echo gopdsdk-test\r\n" : "#!/bin/sh\necho gopdsdk-test\n");
  if (process.platform !== "win32") await fs.chmod(file, 0o755);
}

function executableName(): string {
  return process.platform === "win32" ? "gopdsdk.cmd" : "gopdsdk";
}

test("discovers a real workspace executable before a real PATH executable", async () => {
  const root = await temporaryRoot();
  const workspace = path.join(root, "workspace");
  const pathDirectory = path.join(root, "path");
  const workspaceExecutable = path.join(workspace, "tools", executableName());
  await writeExecutable(workspaceExecutable);
  await writeExecutable(path.join(pathDirectory, executableName()));

  const result = await discoverExecutable({
    workspaceFolders: [workspace],
    pathValue: pathDirectory,
    pathExt: process.env.PATHEXT,
  });

  assert.deepEqual(result, { command: workspaceExecutable, source: "workspace" });
  const execution = await executeFile(result.command, { shell: process.platform === "win32" });
  assert.equal(execution.stdout.trim(), "gopdsdk-test");
});

test("discovers a real executable from PATH", async () => {
  const root = await temporaryRoot();
  const pathDirectory = path.join(root, "path");
  const executable = path.join(pathDirectory, executableName());
  await writeExecutable(executable);

  const result = await discoverExecutable({
    workspaceFolders: [path.join(root, "workspace")],
    pathValue: pathDirectory,
    pathExt: process.env.PATHEXT,
  });

  assert.deepEqual(result, { command: executable, source: "path" });
});

test("rejects a non-executable file on POSIX", { skip: process.platform === "win32" }, async () => {
  const root = await temporaryRoot();
  const file = path.join(root, "tools", "gopdsdk");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, "not executable\n", { mode: 0o644 });

  await assert.rejects(
    discoverExecutable({ workspaceFolders: [root], pathValue: "" }),
    ExecutableNotFoundError,
  );
});

function fakeServer(scenario: string, timeoutMs = 5000) {
  return probeServer({
    command: process.execPath,
    args: [path.resolve("tests", "fixtures", "fake-lsp-server.cjs"), scenario],
    timeoutMs,
  });
}

test("probes and cleanly shuts down a compatible LSP process", async () => {
  assert.deepEqual(await fakeServer("valid"), { analyzerProtocol: "v1" });
});

for (const scenario of ["old", "incompatible", "malformed"] as const) {
  test(`rejects the ${scenario} LSP process`, async () => {
    await assert.rejects(fakeServer(scenario), ServerProbeError);
  });
}

test("rejects crashing and prematurely exiting processes without leaking stderr", async () => {
  for (const scenario of ["crash", "clean-exit"]) {
    await assert.rejects(
      fakeServer(scenario),
      (error: unknown) => error instanceof ServerProbeError && !error.message.includes("must-not-leak"),
    );
  }
});

test("bounds a non-responsive LSP process", async () => {
  await assert.rejects(
    fakeServer("timeout", 1000),
    (error: unknown) => error instanceof ServerProbeError && error.failure === "timeout",
  );
});
