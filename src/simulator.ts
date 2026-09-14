import { spawn, ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as vscode from "vscode";
import { discoverExecutable } from "./executable";
import { decodeProgress, decodeWorkflowResult, stageLabel, WorkflowCommand, workflowArguments, WorkflowResult } from "./workflow";

const taskType = "gopdsdk";

interface WorkflowTaskDefinition extends vscode.TaskDefinition { command: WorkflowCommand; }

function folderFor(resource?: vscode.Uri): vscode.WorkspaceFolder | undefined {
  if (resource) return vscode.workspace.getWorkspaceFolder(resource);
  const active = vscode.window.activeTextEditor?.document.uri;
  return active ? vscode.workspace.getWorkspaceFolder(active) : vscode.workspace.workspaceFolders?.[0];
}

async function executable(folder: vscode.WorkspaceFolder): Promise<string> {
  const config = vscode.workspace.getConfiguration("gopdsdk", folder.uri);
  return (await discoverExecutable({
    configured: config.get<string>("executable", ""), workspaceFolders: [folder.uri.fsPath],
    pathValue: process.env.PATH, pathExt: process.env.PATHEXT,
  })).command;
}

class WorkflowTerminal implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly closeEmitter = new vscode.EventEmitter<number>();
  private child: ChildProcess | undefined;
  readonly onDidWrite = this.writeEmitter.event;
  readonly onDidClose = this.closeEmitter.event;

  constructor(private readonly command: WorkflowCommand, private readonly folder: vscode.WorkspaceFolder, private readonly diagnostics: vscode.DiagnosticCollection) {}

  async open(): Promise<void> {
    try {
      const command = await executable(this.folder);
      const args = workflowArguments(this.command);
      this.writeEmitter.fire(`> ${path.basename(command)} ${args.join(" ")}\r\n`);
      this.diagnostics.clear();
      this.child = spawn(command, args, { cwd: this.folder.uri.fsPath, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let lastSequence = 0;
      this.child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
      this.child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
        const lines = stderr.split(/\r?\n/); stderr = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          try {
            const event = decodeProgress(line, this.command);
            if (!event || event.sequence <= lastSequence) throw new Error("Out-of-order gopdsdk progress event.");
            lastSequence = event.sequence;
            this.writeEmitter.fire(`${stageLabel(event.stage)}…\r\n`);
          } catch (error) { this.writeEmitter.fire(`${error instanceof Error ? error.message : "Invalid progress output."}\r\n`); }
        }
      });
      this.child.once("error", () => { this.writeEmitter.fire("Could not start gopdsdk. Check gopdsdk.executable.\r\n"); this.closeEmitter.fire(1); });
      this.child.once("exit", (code) => this.finish(stdout, code ?? 1));
    } catch (error) {
      this.writeEmitter.fire(`${error instanceof Error ? error.message : "Could not start gopdsdk."}\r\n`);
      this.closeEmitter.fire(1);
    }
  }

  close(): void {
    if (this.child && this.child.exitCode === null) {
      this.writeEmitter.fire("Cancelling…\r\n");
      this.child.kill();
    }
  }

  private finish(stdout: string, exitCode: number): void {
    try {
      const result = decodeWorkflowResult(stdout, this.command);
      if (result.failure) {
        this.publishDiagnostics(result);
        this.writeEmitter.fire(`gopdsdk ${this.command} failed: ${result.failure.category}.\r\n`);
        this.closeEmitter.fire(exitCode || 1);
        return;
      }
      this.writeEmitter.fire(`${this.command === "build" ? "Built" : "Launched"} ${result.package}.\r\nArtifact: ${result.artifact}\r\n`);
      this.closeEmitter.fire(0);
    } catch (error) {
      this.writeEmitter.fire(`${error instanceof Error ? error.message : "Invalid gopdsdk result."}\r\n`);
      this.closeEmitter.fire(exitCode || 1);
    }
  }

  private publishDiagnostics(result: WorkflowResult): void {
    const byURI = new Map<string, { uri: vscode.Uri; values: vscode.Diagnostic[] }>();
    for (const location of result.failure?.locations ?? []) {
      const uri = vscode.Uri.joinPath(this.folder.uri, ...location.path.split("/"));
      const key = uri.toString();
      const entry = byURI.get(key) ?? { uri, values: [] };
      const start = new vscode.Position(location.line - 1, location.column - 1);
      const diagnostic = new vscode.Diagnostic(new vscode.Range(start, start), `gopdsdk ${this.command}: ${result.failure?.category}`, vscode.DiagnosticSeverity.Error);
      diagnostic.source = "gopdsdk build";
      entry.values.push(diagnostic); byURI.set(key, entry);
    }
    this.diagnostics.set([...byURI.values()].map((entry) => [entry.uri, entry.values]));
    if (byURI.size > 0) void vscode.commands.executeCommand("workbench.action.problems.focus");
  }
}

class WorkflowTaskProvider implements vscode.TaskProvider {
  constructor(private readonly diagnostics: vscode.DiagnosticCollection) {}
  provideTasks(): vscode.Task[] { return (vscode.workspace.workspaceFolders ?? []).flatMap((folder) => ([this.task(folder, "build"), this.task(folder, "run")])); }
  resolveTask(task: vscode.Task): vscode.Task | undefined {
    const command = task.definition.command;
    const folder = typeof task.scope === "object" && task.scope !== null && "uri" in task.scope ? task.scope as vscode.WorkspaceFolder : folderFor();
    return (command === "build" || command === "run") && folder ? this.task(folder, command) : undefined;
  }
  task(folder: vscode.WorkspaceFolder, command: WorkflowCommand): vscode.Task {
    const definition: WorkflowTaskDefinition = { type: taskType, command };
    const execution = new vscode.CustomExecution(async () => new WorkflowTerminal(command, folder, this.diagnostics));
    const task = new vscode.Task(definition, folder, `Simulator: ${command === "build" ? "Build" : "Build and Run"}`, "gopdsdk", execution);
    task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: true };
    task.problemMatchers = [];
    return task;
  }
}

export function registerSimulatorWorkflow(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("gopdsdk-build");
  const provider = new WorkflowTaskProvider(diagnostics);
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
  const updateStatus = (): void => {
    const folder = folderFor();
    const target = vscode.workspace.getConfiguration("gopdsdk", folder?.uri).get<string>("target", "both");
    status.text = `$(device-desktop) Playdate: ${target}`;
    status.tooltip = "Select the active gopdsdk analysis target";
    status.command = "gopdsdk.selectTarget";
    status.show();
  };
  const runTask = async (command: WorkflowCommand, resource?: vscode.Uri): Promise<void> => {
    const folder = folderFor(resource);
    if (!folder) { void vscode.window.showWarningMessage("Open a workspace folder containing a Playdate application first."); return; }
    await vscode.tasks.executeTask(provider.task(folder, command));
  };
  context.subscriptions.push(
    diagnostics, status, vscode.tasks.registerTaskProvider(taskType, provider),
    vscode.commands.registerCommand("gopdsdk.buildSimulator", (resource?: vscode.Uri) => runTask("build", resource)),
    vscode.commands.registerCommand("gopdsdk.runSimulator", (resource?: vscode.Uri) => runTask("run", resource)),
    vscode.commands.registerCommand("gopdsdk.selectTarget", async () => {
      const folder = folderFor(); if (!folder) return;
      const target = await vscode.window.showQuickPick(["shared", "simulator", "device", "both"], { placeHolder: "Select gopdsdk analysis target" });
      if (target) await vscode.workspace.getConfiguration("gopdsdk", folder.uri).update("target", target, vscode.ConfigurationTarget.WorkspaceFolder);
    }),
    vscode.window.onDidChangeActiveTextEditor(updateStatus),
    vscode.workspace.onDidChangeConfiguration((event) => { if (event.affectsConfiguration("gopdsdk.target")) updateStatus(); }),
  );
  updateStatus();
}
