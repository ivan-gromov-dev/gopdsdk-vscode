import { spawn } from "node:child_process";
import * as path from "node:path";
import * as vscode from "vscode";
import { discoverExecutable } from "./executable";
import { decodeDoctor, toolchainSummary } from "./health";
import { probeServer } from "./probe";
import { WorkspaceNode, workspaceNodes, WorkspaceSnapshot } from "./workspaceViewModel";
import { deviceConnections } from "./deviceConnectionState";

function run(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); if (stdout.length > 1024 * 1024) child.kill(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.once("error", () => reject(new Error("Could not start gopdsdk.")));
    child.once("exit", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `gopdsdk exited with code ${code}.`)));
  });
}

class WorkspaceItem extends vscode.TreeItem {
  constructor(node: WorkspaceNode) {
    super(node.label, vscode.TreeItemCollapsibleState.None);
    this.description = node.description;
    this.iconPath = new vscode.ThemeIcon(node.icon);
    this.contextValue = node.group;
    if (node.command) this.command = { command: node.command, title: node.label };
    this.accessibilityInformation = { label: [node.label, node.description].filter(Boolean).join(": ") };
  }
}

export function registerWorkspaceView(context: vscode.ExtensionContext): void {
  const changed = new vscode.EventEmitter<void>();
  let selected = vscode.workspace.workspaceFolders?.[0];
  let snapshot: WorkspaceSnapshot = selected ? { state: "loading", folder: selected.name } : { state: "empty" };
  const provider: vscode.TreeDataProvider<WorkspaceItem> = {
    onDidChangeTreeData: changed.event,
    getTreeItem: (item) => item,
    getChildren: () => workspaceNodes(snapshot).map((node) => new WorkspaceItem(node)),
  };
  const diagnosticCounts = (): NonNullable<WorkspaceSnapshot["diagnostics"]> => {
    const diagnostics = vscode.languages.getDiagnostics().filter(([uri]) => vscode.workspace.getWorkspaceFolder(uri)?.uri.toString() === selected?.uri.toString()).flatMap(([, values]) => values).filter((item) => item.source === "gopdsdk");
    return {
      errors: diagnostics.filter((item) => item.severity === vscode.DiagnosticSeverity.Error).length,
      warnings: diagnostics.filter((item) => item.severity === vscode.DiagnosticSeverity.Warning).length,
      information: diagnostics.filter((item) => item.severity === vscode.DiagnosticSeverity.Information || item.severity === vscode.DiagnosticSeverity.Hint).length,
    };
  };
  const refresh = async (): Promise<void> => {
    selected = selected && vscode.workspace.getWorkspaceFolder(selected.uri) ? selected : vscode.workspace.workspaceFolders?.[0];
    if (!selected) { snapshot = { state: "empty" }; changed.fire(); return; }
    snapshot = { state: "loading", folder: selected.name }; changed.fire();
    try {
      const config = vscode.workspace.getConfiguration("gopdsdk", selected.uri);
      const binary = (await discoverExecutable({ configured: config.get<string>("executable", ""), workspaceFolders: [selected.uri.fsPath], pathValue: process.env.PATH, pathExt: process.env.PATHEXT })).command;
      const [doctorText, server] = await Promise.all([
        run(binary, ["doctor", "--format", "json"], selected.uri.fsPath),
        probeServer({ command: binary, args: config.get<string[]>("arguments", ["lsp"]), cwd: selected.uri.fsPath }),
      ]);
      const doctor = decodeDoctor(doctorText);
      snapshot = {
        state: "ready", folder: selected.name, target: config.get<string>("target", "both"),
        gopdsdk: `${path.basename(binary)} (analyzer ${server.analyzerProtocol})`, sdk: doctor.sdk?.version ?? "not found",
        health: toolchainSummary(doctor),
        device: deviceConnections.get(selected.uri.toString()),
        diagnostics: diagnosticCounts(),
      };
    } catch (error) { snapshot = { state: "error", folder: selected.name, error: error instanceof Error ? error.message : "Unknown error" }; }
    changed.fire();
  };
  context.subscriptions.push(changed, vscode.window.registerTreeDataProvider("gopdsdk.playdate", provider),
    vscode.commands.registerCommand("gopdsdk.refreshWorkspaceView", refresh),
    vscode.commands.registerCommand("gopdsdk.selectWorkspace", async () => {
      const folders = vscode.workspace.workspaceFolders ?? [];
      const choice = await vscode.window.showQuickPick(folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })), { placeHolder: "Select the active Playdate workspace" });
      if (choice) { selected = choice.folder; await refresh(); }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(refresh), vscode.window.onDidChangeActiveTextEditor((editor) => {
      const folder = editor && vscode.workspace.getWorkspaceFolder(editor.document.uri); if (folder && folder.uri.toString() !== selected?.uri.toString()) { selected = folder; void refresh(); }
    }), deviceConnections.subscribe((key, state) => { if (snapshot.state === "ready" && selected?.uri.toString() === key) { snapshot = { ...snapshot, device: state }; changed.fire(); } }),
    vscode.languages.onDidChangeDiagnostics(() => { if (snapshot.state === "ready") { snapshot = { ...snapshot, diagnostics: diagnosticCounts() }; changed.fire(); } }));
  void refresh();
}
