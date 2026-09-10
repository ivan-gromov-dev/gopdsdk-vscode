import * as vscode from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions, Trace } from "vscode-languageclient/node";

let client: LanguageClient | undefined;
let output: vscode.OutputChannel | undefined;

function traceLevel(value: string): Trace {
  if (value === "messages") return Trace.Messages;
  if (value === "verbose") return Trace.Verbose;
  return Trace.Off;
}

function createClient(): LanguageClient {
  const config = vscode.workspace.getConfiguration("gopdsdk");
  const command = config.get<string>("executable", "gopdsdk");
  const args = config.get<string[]>("arguments", ["lsp"]);
  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const server: ServerOptions = { command, args, options: cwd ? { cwd } : undefined };
  const options: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "go" }, { scheme: "untitled", language: "go" }],
    synchronize: {
      configurationSection: "gopdsdk",
      fileEvents: vscode.workspace.createFileSystemWatcher("**/{go.mod,pdxinfo}"),
    },
    outputChannel: output,
  };
  const next = new LanguageClient("gopdsdk", "gopdsdk Language Server", server, options);
  void next.setTrace(traceLevel(config.get<string>("trace.server", "off")));
  return next;
}

async function startClient(): Promise<void> {
  if (client) return;
  client = createClient();
  try {
    await client.start();
  } catch (error: unknown) {
    client = undefined;
    output?.show(true);
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`gopdsdk language server could not start: ${message}`);
  }
}

async function stopClient(): Promise<void> {
  const current = client;
  client = undefined;
  if (current) await current.stop();
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  output = vscode.window.createOutputChannel("gopdsdk", { log: true });
  context.subscriptions.push(output);
  context.subscriptions.push(
    vscode.commands.registerCommand("gopdsdk.restartServer", async () => {
      await stopClient();
      await startClient();
    }),
    vscode.commands.registerCommand("gopdsdk.showOutput", () => output?.show()),
  );
  await startClient();
}

export async function deactivate(): Promise<void> {
  await stopClient();
}
