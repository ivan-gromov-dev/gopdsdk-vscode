import * as vscode from "vscode";
import { DidChangeConfigurationNotification, LanguageClient, LanguageClientOptions, ServerOptions, Trace } from "vscode-languageclient/node";
import { analyzerConfigurationChanged, analyzerSettings } from "./configuration";
import { discoverExecutable, ExecutableNotFoundError } from "./executable";
import { SerialTaskQueue } from "./lifecycle";
import { probeServer, ServerProbeError } from "./probe";

const clients = new Map<string, LanguageClient>();
let output: vscode.OutputChannel | undefined;
let fileWatcher: vscode.FileSystemWatcher | undefined;
const lifecycle = new SerialTaskQueue();

function traceLevel(value: string): Trace {
  if (value === "messages") return Trace.Messages;
  if (value === "verbose") return Trace.Verbose;
  return Trace.Off;
}

function clientKey(folder: vscode.WorkspaceFolder | undefined): string {
  return folder?.uri.toString() ?? "untitled";
}

async function createClient(folder: vscode.WorkspaceFolder | undefined): Promise<LanguageClient> {
  const config = vscode.workspace.getConfiguration("gopdsdk", folder?.uri);
  const resolution = await discoverExecutable({
    configured: config.get<string>("executable", ""),
    workspaceFolders: folder ? [folder.uri.fsPath] : [],
    pathValue: process.env.PATH,
    pathExt: process.env.PATHEXT,
  });
  const args = config.get<string[]>("arguments", ["lsp"]);
  const cwd = folder?.uri.fsPath;
  const probe = await probeServer({ command: resolution.command, args, cwd });
  output?.appendLine(`Using ${resolution.source} executable with analyzer protocol ${probe.analyzerProtocol}.`);
  const server: ServerOptions = { command: resolution.command, args, options: cwd ? { cwd } : undefined };
  const options: LanguageClientOptions = {
    documentSelector: folder
      ? [{ scheme: "file", language: "go", pattern: `${folder.uri.fsPath.replaceAll("\\", "/")}/**/*.go` }]
      : [{ scheme: "untitled", language: "go" }],
    workspaceFolder: folder,
    initializationOptions: analyzerSettings(config),
    synchronize: {
      fileEvents: fileWatcher,
    },
    outputChannel: output,
  };
  const suffix = folder ? ` (${folder.name})` : "";
  const next = new LanguageClient(`gopdsdk-${folder?.index ?? "untitled"}`, `gopdsdk Language Server${suffix}`, server, options);
  void next.setTrace(traceLevel(config.get<string>("trace.server", "off")));
  return next;
}

async function startClient(): Promise<void> {
  if (clients.size > 0) return;
  try {
    const folders = vscode.workspace.workspaceFolders;
    const targets: Array<vscode.WorkspaceFolder | undefined> = folders && folders.length > 0 ? [...folders] : [undefined];
    for (const folder of targets) {
      const next = await createClient(folder);
      clients.set(clientKey(folder), next);
      await next.start();
    }
  } catch (error: unknown) {
    await stopClient();
    output?.show(true);
    const message = error instanceof ExecutableNotFoundError || error instanceof ServerProbeError
      ? error.message
      : "gopdsdk language server could not start after a successful compatibility probe.";
    output?.appendLine(`Startup failed (${error instanceof Error ? error.name : "unknown error"}).`);
    void vscode.window.showErrorMessage(message, "Open Settings").then((selection) => {
      if (selection === "Open Settings") void vscode.commands.executeCommand("workbench.action.openSettings", "gopdsdk.executable");
    });
  }
}

async function stopClient(): Promise<void> {
  const current = [...clients.values()];
  clients.clear();
  await Promise.all(current.map((item) => item.stop()));
}

async function updateAnalyzerConfiguration(): Promise<void> {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const current = clients.get(clientKey(folder));
    if (current) {
      await current.sendNotification(DidChangeConfigurationNotification.type, {
        settings: analyzerSettings(vscode.workspace.getConfiguration("gopdsdk", folder.uri)),
      });
    }
  }
  const untitled = clients.get(clientKey(undefined));
  if (untitled) {
    await untitled.sendNotification(DidChangeConfigurationNotification.type, {
      settings: analyzerSettings(vscode.workspace.getConfiguration("gopdsdk")),
    });
  }
}

function scheduleLifecycle(operation: () => Promise<void>): Promise<void> {
  return lifecycle.schedule(operation);
}

async function restartClient(): Promise<void> {
  await stopClient();
  await startClient();
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  output = vscode.window.createOutputChannel("gopdsdk", { log: true });
  fileWatcher = vscode.workspace.createFileSystemWatcher("**/{go.mod,pdxinfo}");
  context.subscriptions.push(output, fileWatcher);
  context.subscriptions.push(
    vscode.commands.registerCommand("gopdsdk.restartServer", () => scheduleLifecycle(restartClient)),
    vscode.commands.registerCommand("gopdsdk.showOutput", () => output?.show()),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("gopdsdk.executable") || event.affectsConfiguration("gopdsdk.arguments")) {
        await scheduleLifecycle(restartClient);
      } else if (analyzerConfigurationChanged((section) => event.affectsConfiguration(section))) {
        await scheduleLifecycle(updateAnalyzerConfiguration);
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => scheduleLifecycle(restartClient)),
  );
  await scheduleLifecycle(startClient);
}

export async function deactivate(): Promise<void> {
  await scheduleLifecycle(stopClient);
}
