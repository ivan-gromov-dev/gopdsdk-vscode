import * as assert from "node:assert/strict";
import { test } from "node:test";
import * as path from "node:path";
import { discoverExecutable, ExecutableNotFoundError } from "../../src/executable";

function fakeFiles(...files: string[]): (candidate: string) => Promise<boolean> {
  const normalized = new Set(files.map((file) => path.resolve(file)));
  return async (candidate) => normalized.has(path.resolve(candidate));
}

test("configured executable takes precedence over workspace and PATH", async () => {
  const configured = path.resolve("configured", "gopdsdk");
  const result = await discoverExecutable({
    configured,
    workspaceFolders: [path.resolve("workspace")],
    pathValue: path.resolve("path"),
    platform: "linux",
    isFile: fakeFiles(configured, path.resolve("workspace", "tools", "gopdsdk"), path.resolve("path", "gopdsdk")),
  });
  assert.deepEqual(result, { command: configured, source: "setting" });
});

test("configured command name is resolved only through PATH", async () => {
  const executable = path.resolve("path", "custom-gopdsdk");
  const result = await discoverExecutable({
    configured: "custom-gopdsdk",
    workspaceFolders: [path.resolve("workspace")],
    pathValue: path.resolve("path"),
    platform: "linux",
    isFile: fakeFiles(executable, path.resolve("workspace", "tools", "custom-gopdsdk")),
  });
  assert.deepEqual(result, { command: executable, source: "setting" });
});

test("workspace tools are searched by folder order before PATH", async () => {
  const secondWorkspaceTool = path.resolve("second", "tools", "gopdsdk");
  const result = await discoverExecutable({
    workspaceFolders: [path.resolve("first"), path.resolve("second")],
    pathValue: path.resolve("path"),
    platform: "linux",
    isFile: fakeFiles(secondWorkspaceTool, path.resolve("path", "gopdsdk")),
  });
  assert.deepEqual(result, { command: secondWorkspaceTool, source: "workspace" });
});

test("Windows discovery honors PATHEXT", async () => {
  const executable = path.resolve("path", "gopdsdk.exe");
  const result = await discoverExecutable({
    workspaceFolders: [],
    pathValue: path.resolve("path"),
    pathExt: ".EXE;.CMD",
    platform: "win32",
    isFile: fakeFiles(executable),
  });
  assert.deepEqual(result, { command: executable, source: "path" });
});

test("missing configured executable produces actionable error", async () => {
  await assert.rejects(
    discoverExecutable({ configured: "missing", workspaceFolders: [], pathValue: "", isFile: async () => false }),
    (error: unknown) => error instanceof ExecutableNotFoundError && error.message.includes("gopdsdk.executable"),
  );
});
