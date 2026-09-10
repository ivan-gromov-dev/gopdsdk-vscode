import * as vscode from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions, Trace } from "vscode-languageclient/node";
import { discoverExecutable, ExecutableNotFoundError } from "./executable";
import { SerialTaskQueue } from "./lifecycle";
import { probeServer, ServerProbeError } from "./probe";

let client: LanguageClient | undefined;
let output: vscode.OutputChannel | undefined;
let fileWatcher: vscode.FileSystemWatcher | undefined;
const lifecycle = new SerialTaskQueue();

function traceLevel(value: string): Trace {
  if (value === "messages") return Trace.Messages;
  if (value === "verbose") return Trace.Verbose;
  return Trace.Off;
}

async function createClient(): Promise<LanguageClient> {
  const config = vscode.workspace.getConfiguration("gopdsdk");
  const resolution = await discoverExecutable({
    configured: config.get<string>("executable", ""),
    workspaceFolders: vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [],
    pathValue: process.env.PATH,
    pathExt: process.env.PATHEXT,
  });
  const args = config.get<string[]>("arguments", ["lsp"]);
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const probe = await probeServer({ command: resolution.command, args, cwd });
  output?.appendLine(`Using ${resolution.source} executable with analyzer protocol ${probe.analyzerProtocol}.`);
  const server: ServerOptions = { command: resolution.command, args, options: cwd ? { cwd } : undefined };
  const options: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "go" }, { scheme: "untitled", language: "go" }],
    synchronize: {
      configurationSection: "gopdsdk",
      fileEvents: fileWatcher,
    },
    outputChannel: output,
  };
  const next = new LanguageClient("gopdsdk", "gopdsdk Language Server", server, options);
  void next.setTrace(traceLevel(config.get<string>("trace.server", "off")));
  return next;
}

async function startClient(): Promise<void> {
  if (client) return;
  try {
    client = await createClient();
    await client.start();
  } catch (error: unknown) {
    client = undefined;
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
  const current = client;
  client = undefined;
  if (current) await current.stop();
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
      if (!event.affectsConfiguration("gopdsdk.executable") && !event.affectsConfiguration("gopdsdk.arguments")) return;
      await scheduleLifecycle(restartClient);
    }),
  );
  await scheduleLifecycle(startClient);
}

export async function deactivate(): Promise<void> {
  await scheduleLifecycle(stopClient);
}
