import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { discoverExecutable } from "./executable";
import { decodeConnectionProbe, decodeDoctor, HealthCheck, healthMarkdown, initArguments } from "./health";
import { probeServer } from "./probe";

const pendingProjectKey = "gopdsdk.pendingCreatedProject";
let remediationChecks: HealthCheck[] = [];

function folder(): vscode.WorkspaceFolder | undefined { return vscode.workspace.workspaceFolders?.[0]; }

async function executable(root?: vscode.WorkspaceFolder): Promise<string> {
  const config = vscode.workspace.getConfiguration("gopdsdk", root?.uri);
  return (await discoverExecutable({ configured: config.get<string>("executable", ""), workspaceFolders: root ? [root.uri.fsPath] : [], pathValue: process.env.PATH, pathExt: process.env.PATHEXT })).command;
}

function run(command: string, args: string[], cwd: string, token?: vscode.CancellationToken): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    const cancel = token?.onCancellationRequested(() => child.kill());
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); if (stdout.length > 1024 * 1024) child.kill(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.once("error", () => reject(new Error("Could not start gopdsdk.")));
    child.once("exit", (code) => { cancel?.dispose(); code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `gopdsdk exited with code ${code}.`)); });
  });
}

async function showHealth(): Promise<void> {
  const root = folder();
  if (!root) { void vscode.window.showWarningMessage("Open a Playdate workspace first."); return; }
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Checking gopdsdk project health", cancellable: true }, async (_, token) => {
    try {
      const command = await executable(root);
      const [doctorText, connectionText, server] = await Promise.all([
        run(command, ["doctor", "--format", "json", "--probe"], root.uri.fsPath, token),
        run(command, ["probe", "connection", "--format", "json"], root.uri.fsPath, token),
        probeServer({ command, args: vscode.workspace.getConfiguration("gopdsdk", root.uri).get<string[]>("arguments", ["lsp"]), cwd: root.uri.fsPath }),
      ]);
      const entries = await Promise.all(["go.mod", "pdxinfo", ".gopdsdk-check.json"].map(async (name) => [name, await fs.stat(path.join(root.uri.fsPath, name)).then((item) => item.isFile(), () => false)] as const));
      const report = decodeDoctor(doctorText); const connection = decodeConnectionProbe(connectionText);
      remediationChecks = [...report.checks, connection].filter((check) => check.status !== "ready");
      const document = await vscode.workspace.openTextDocument({ language: "markdown", content: healthMarkdown(report, connection, Object.fromEntries(entries), path.basename(command), server.analyzerProtocol) });
      await vscode.window.showTextDocument(document, { preview: true });
    } catch (error) { if (!token.isCancellationRequested) void vscode.window.showErrorMessage(error instanceof Error ? error.message : "Project health check failed."); }
  });
}

async function remediateHealth(): Promise<void> {
  if (remediationChecks.length === 0) { void vscode.window.showInformationMessage("Run Project Health first; no unresolved checks are currently recorded."); return; }
  const selected = await vscode.window.showQuickPick(remediationChecks.map((check) => ({ label: check.id, description: check.remediation?.action ?? check.failureCategory ?? check.status, check })), { placeHolder: "Select a Project Health issue" });
  if (!selected) return;
  const remediation = selected.check.remediation;
  if (remediation?.action === "configure-sdk-path") {
    void vscode.window.showInformationMessage(`Configure ${remediation.value ?? "PLAYDATE_SDK_PATH"}, then run Project Health again.`, "Show Output").then((choice) => { if (choice === "Show Output") void vscode.commands.executeCommand("gopdsdk.showOutput"); });
  } else if (remediation?.action === "run-doctor-probe" || remediation?.action === "run-connection-probe") {
    await showHealth();
  } else {
    await vscode.commands.executeCommand("gopdsdk.troubleshoot");
  }
}

async function ask(prompt: string, value?: string, validateInput?: (text: string) => string | undefined): Promise<string | undefined> {
  return vscode.window.showInputBox({ prompt, value, ignoreFocusOut: true, validateInput });
}

async function createProject(context: vscode.ExtensionContext): Promise<void> {
  const parents = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: "Select parent folder" });
  if (!parents?.[0]) return;
  const name = await ask("Project name"); if (!name) return;
  const module = await ask("Go module path", `example.com/${name.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`); if (!module) return;
  const author = await ask("Author"); if (!author) return;
  const bundleID = await ask("Reverse-DNS Playdate bundle ID", `com.example.${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`, (text) => /^[A-Za-z0-9]+(?:\.[A-Za-z0-9-]+)+$/.test(text) ? undefined : "Use a reverse-DNS identifier such as com.example.game."); if (!bundleID) return;
  const directory = path.join(parents[0].fsPath, name);
  try {
    const command = await executable();
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Creating ${name}`, cancellable: true }, (_, token) => run(command, initArguments({ directory, module, name, author, bundleID }), parents[0]!.fsPath, token));
    await context.globalState.update(pendingProjectKey, directory);
    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(directory), false);
  } catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : "Could not create project."); }
}

export function registerProjectWorkflow(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand("gopdsdk.showProjectHealth", showHealth), vscode.commands.registerCommand("gopdsdk.remediateProjectHealth", remediateHealth), vscode.commands.registerCommand("gopdsdk.createProject", () => createProject(context)));
  const pending = context.globalState.get<string>(pendingProjectKey);
  if (pending && folder()?.uri.fsPath === pending) {
    void context.globalState.update(pendingProjectKey, undefined);
    void vscode.window.showInformationMessage("Playdate project created.", "Run in Simulator").then((choice) => { if (choice === "Run in Simulator") void vscode.commands.executeCommand("gopdsdk.runSimulator"); });
  }
}
