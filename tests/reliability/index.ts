import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as vscode from "vscode";

async function eventually<T>(read: () => T | undefined, message: string, timeout = 15_000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

function diagnosticVersion(uri: vscode.Uri): number | undefined {
  const item = vscode.languages.getDiagnostics(uri).find((candidate) => candidate.source === "gopdsdk");
  const match = / v(\d+)$/.exec(item?.message ?? "");
  return match ? Number(match[1]) : undefined;
}

function reliabilityEvents(): Array<{ event: string }> {
  const logPath = process.env.GOPDSDK_STRESS_LOG;
  if (!logPath || !fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean)
    .map((line) => JSON.parse(line) as { event: string });
}

export async function run(): Promise<void> {
  const started = performance.now();
  const baselineRSS = process.memoryUsage().rss;
  const extension = vscode.extensions.getExtension("gopdsdk.gopdsdk");
  assert.ok(extension, "extension is installed in the test host");
  await extension.activate();
  const activationMs = performance.now() - started;
  assert.ok(activationMs < 15_000, `activation took ${activationMs.toFixed(0)} ms`);

  const first = vscode.workspace.workspaceFolders?.[0];
  assert.ok(first, "stress workspace opened");
  const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(first.uri, "game.go"));
  const editor = await vscode.window.showTextDocument(document);
  await eventually(() => diagnosticVersion(document.uri), "initial diagnostic was not published");

  for (let index = 0; index < 40; index++) {
    assert.ok(await editor.edit((builder) => builder.insert(new vscode.Position(0, 0), `// edit ${index}\n`)));
  }
  await eventually(
    () => reliabilityEvents().some((event) => event.event === "crash") ? true : undefined,
    "fixture server did not crash after rapid edits",
  );
  await eventually(
    () => {
      const events = reliabilityEvents();
      const crash = events.findIndex((event) => event.event === "crash");
      return crash >= 0 && events.slice(crash + 1).some((event) => event.event === "initialize") ? true : undefined;
    },
    "language client did not restart after the forced server crash",
  );
  const incrementalStarted = performance.now();
  const recoveredEditor = await vscode.window.showTextDocument(document);
  assert.ok(await recoveredEditor.edit((builder) => builder.insert(new vscode.Position(0, 0), "// recovery edit\n")));
  const recoveredVersion = await eventually(
    () => {
      const version = diagnosticVersion(document.uri);
      return version === document.version ? version : undefined;
    },
    "diagnostics did not recover after the forced server crash",
  );
  const incrementalMs = performance.now() - incrementalStarted;
  assert.equal(recoveredVersion, document.version);
  assert.ok(incrementalMs < 10_000, `incremental recovery took ${incrementalMs.toFixed(0)} ms`);

  const extraPath = process.env.GOPDSDK_STRESS_EXTRA_FOLDER;
  assert.ok(extraPath, "extra folder path is configured");
  const added = vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length ?? 0, 0, {
    uri: vscode.Uri.file(extraPath), name: "root-c",
  });
  assert.equal(added, true, "extra workspace folder was added");
  const extraDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(`${extraPath}/game.go`));
  await vscode.window.showTextDocument(extraDocument);
  await eventually(() => diagnosticVersion(extraDocument.uri), "diagnostic was not published after folder addition");
  assert.equal(vscode.workspace.updateWorkspaceFolders((vscode.workspace.workspaceFolders?.length ?? 1) - 1, 1), true);

  await Promise.all(Array.from({ length: 6 }, () => vscode.commands.executeCommand("gopdsdk.restartServer")));
  await vscode.window.showTextDocument(document);
  await eventually(() => diagnosticVersion(document.uri), "diagnostic was not republished after restart stress");

  const rssGrowthBytes = process.memoryUsage().rss - baselineRSS;
  assert.ok(rssGrowthBytes < 256 * 1024 * 1024, `RSS grew by ${(rssGrowthBytes / 1024 / 1024).toFixed(1)} MiB`);
  const logPath = process.env.GOPDSDK_STRESS_LOG;
  assert.ok(logPath && fs.existsSync(logPath), "server event log exists");
  const events = reliabilityEvents();
  assert.ok(events.some((event) => event.event === "crash"), "fixture server crash was exercised");
  assert.ok(events.filter((event) => event.event === "initialize").length >= 8, "server reloads were exercised");

  console.log(JSON.stringify({
    evidence: "editor-integration",
    workloadFiles: Number(process.env.GOPDSDK_STRESS_FILE_COUNT),
    rapidEdits: 40,
    activationMs: Math.round(activationMs),
    incrementalRecoveryMs: Math.round(incrementalMs),
    rssGrowthMiB: Number((rssGrowthBytes / 1024 / 1024).toFixed(1)),
    cancellationsObserved: events.filter((event) => event.event === "cancel").length,
  }));
}
