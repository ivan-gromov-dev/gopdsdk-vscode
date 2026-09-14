import { spawn } from "node:child_process";
import * as vscode from "vscode";
import { cancelChild, decodeDeviceProgress, decodeDeviceResult, deviceArguments, DeviceCommand, deviceStageLabel, DeviceResult } from "./deviceContracts";
import { discoverExecutable } from "./executable";
import { deviceConnections, DeviceConnectionState } from "./deviceConnectionState";

function folderFor(resource?: vscode.Uri): vscode.WorkspaceFolder | undefined {
  if (resource) return vscode.workspace.getWorkspaceFolder(resource);
  const active = vscode.window.activeTextEditor?.document.uri;
  return active ? vscode.workspace.getWorkspaceFolder(active) : vscode.workspace.workspaceFolders?.[0];
}

async function executable(folder: vscode.WorkspaceFolder): Promise<string> {
  const configured = vscode.workspace.getConfiguration("gopdsdk", folder.uri).get<string>("executable", "");
  return (await discoverExecutable({ configured, workspaceFolders: [folder.uri.fsPath], pathValue: process.env.PATH, pathExt: process.env.PATHEXT })).command;
}

function execute(command: DeviceCommand, folder: vscode.WorkspaceFolder, token: vscode.CancellationToken, progress: vscode.Progress<{ message?: string }>): Promise<DeviceResult> {
  return executable(folder).then((binary) => new Promise((resolve, reject) => {
    const child = spawn(binary, deviceArguments(command), { cwd: folder.uri.fsPath, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let lastSequence = 0; let settled = false;
    const finish = (error?: Error, result?: DeviceResult): void => { if (settled) return; settled = true; cancellation.dispose(); error ? reject(error) : resolve(result as DeviceResult); };
    const cancellation = token.onCancellationRequested(() => { cancelChild(child); });
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8"); const lines = stderr.split(/\r?\n/); stderr = lines.pop() ?? "";
      try {
        for (const line of lines) { if (!line) continue; const event = decodeDeviceProgress(line, command); if (!event) continue; if (event.sequence <= lastSequence) throw new Error("Out-of-order gopdsdk progress event."); lastSequence = event.sequence; progress.report({ message: deviceStageLabel(event.stage) }); }
      } catch (error) { cancelChild(child); finish(error instanceof Error ? error : new Error("Invalid gopdsdk progress output.")); }
    });
    child.once("error", () => finish(new Error("Could not start gopdsdk. Check gopdsdk.executable.")));
    child.once("exit", () => { try { finish(undefined, decodeDeviceResult(stdout, command)); } catch (error) { finish(error instanceof Error ? error : new Error("Invalid gopdsdk device result.")); } });
  }));
}

class DeviceLogProvider implements vscode.TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  private sequence = 0;
  provideTextDocumentContent(uri: vscode.Uri): string { return this.contents.get(uri.toString()) ?? ""; }
  uri(kind: string, content: string): vscode.Uri {
    const uri = vscode.Uri.from({ scheme: "gopdsdk-log", path: `/${kind}`, query: `read=${++this.sequence}` }); this.contents.set(uri.toString(), content); return uri;
  }
}

export function registerDeviceWorkflow(context: vscode.ExtensionContext): void {
  const logs = new DeviceLogProvider();
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 89);
  const updateStatus = (state: DeviceConnectionState): void => {
    const icon = state === "connected" ? "device-mobile" : state === "disk" ? "database" : state === "checking" ? "loading~spin" : state === "error" ? "error" : "debug-disconnect";
    status.text = `$(${icon}) Playdate device: ${state}`;
    status.tooltip = state === "unchecked" ? "Connection is optional; click to check the physical Playdate USB connection" : `Last explicit connection check: ${state}`;
    status.command = "gopdsdk.checkDeviceConnection"; status.show();
  };
  updateStatus("unchecked");
  const run = async (command: DeviceCommand, resource?: vscode.Uri): Promise<DeviceResult | undefined> => {
    const folder = folderFor(resource); if (!folder) { void vscode.window.showWarningMessage("Open a workspace folder containing a Playdate application first."); return; }
    try {
      const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `gopdsdk: ${command}`, cancellable: true }, (progress, token) => execute(command, folder, token, progress));
      if (result.failure) {
        if (command === "probe connection" && result.failure.category === "not-connected") return result;
        const actions = command === "run device" ? ["Open Crash Log", "Open Error Log"] : [];
        void vscode.window.showErrorMessage(`gopdsdk ${command} failed: ${result.failure.category}.`, ...actions).then((choice) => {
          if (choice === "Open Crash Log") void vscode.commands.executeCommand("gopdsdk.showCrashLog", resource);
          if (choice === "Open Error Log") void vscode.commands.executeCommand("gopdsdk.showErrorLog", resource);
        });
        return result;
      }
      return result;
    } catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : `gopdsdk ${command} failed.`); return; }
  };
  const check = async (resource?: vscode.Uri): Promise<void> => {
    const folder = folderFor(resource); if (!folder) { void vscode.window.showWarningMessage("Open a workspace folder containing a Playdate application first."); return; }
    const key = folder.uri.toString(); deviceConnections.set(key, "checking"); updateStatus("checking");
    const result = await run("probe connection", resource);
    if (!result) { deviceConnections.set(key, "error"); updateStatus("error"); return; }
    if (result.failure) {
      const state: DeviceConnectionState = result.failure.category === "not-connected" ? "disconnected" : "error";
      deviceConnections.set(key, state); updateStatus(state); return;
    }
    deviceConnections.set(key, "connected"); updateStatus("connected");
    void vscode.window.showInformationMessage("Playdate is connected and unlocked (USB evidence).");
  };
  const workflow = async (command: "build device" | "run device", resource?: vscode.Uri): Promise<void> => {
    if (command === "run device") {
      const folder = folderFor(resource); if (!folder) { void vscode.window.showWarningMessage("Open a workspace folder containing a Playdate application first."); return; }
      const key = folder.uri.toString(); deviceConnections.set(key, "checking"); updateStatus("checking");
      const connection = await run("probe connection", resource);
      if (!connection || connection.failure) {
        const state: DeviceConnectionState = connection?.failure?.category === "not-connected" ? "disconnected" : "error";
        deviceConnections.set(key, state); updateStatus(state); return;
      }
      deviceConnections.set(key, "connected"); updateStatus("connected");
    }
    const result = await run(command, resource); if (!result || result.failure) return;
    const message = command === "build device" ? `Built ${result.package}. Artifact: ${result.artifact}` : `Installed and launched ${result.package} on Playdate.`;
    void vscode.window.showInformationMessage(message);
  };
  const showLog = async (command: "crashlog" | "errorlog", resource?: vscode.Uri): Promise<void> => {
    const result = await run(command, resource); if (!result?.log || result.failure) return;
    const folder = folderFor(resource); if (folder) { deviceConnections.set(folder.uri.toString(), "disk"); updateStatus("disk"); }
    const document = await vscode.workspace.openTextDocument(logs.uri(result.log.kind, result.log.content));
    await vscode.window.showTextDocument(document, { preview: true });
  };
  const diskMode = async (operation: "mount" | "unmount", resource?: vscode.Uri): Promise<void> => {
    const folder = folderFor(resource); if (!folder) { void vscode.window.showWarningMessage("Open a workspace folder containing a Playdate application first."); return; }
    const key = folder.uri.toString(); deviceConnections.set(key, "checking"); updateStatus("checking");
    const result = await run(`device disk ${operation}`, resource);
    if (!result || result.failure) { const state: DeviceConnectionState = result?.failure?.category === "not-connected" ? "disconnected" : "error"; deviceConnections.set(key, state); updateStatus(state); return; }
    const state: DeviceConnectionState = result.mode === "disk" ? "disk" : "connected"; deviceConnections.set(key, state); updateStatus(state);
    void vscode.window.showInformationMessage(operation === "mount" ? `Playdate Data Disk mounted at ${result.mountPath}.` : "Playdate safely ejected and connected over USB.");
  };
  context.subscriptions.push(status, deviceConnections.subscribe((key, state) => { if (folderFor()?.uri.toString() === key) updateStatus(state); }),
    vscode.window.onDidChangeActiveTextEditor(() => { const folder = folderFor(); updateStatus(folder ? deviceConnections.get(folder.uri.toString()) : "unchecked"); }),
    vscode.workspace.registerTextDocumentContentProvider("gopdsdk-log", logs),
    vscode.commands.registerCommand("gopdsdk.checkDeviceConnection", check),
    vscode.commands.registerCommand("gopdsdk.buildDevice", (resource?: vscode.Uri) => workflow("build device", resource)),
    vscode.commands.registerCommand("gopdsdk.runDevice", (resource?: vscode.Uri) => workflow("run device", resource)),
    vscode.commands.registerCommand("gopdsdk.mountDeviceDisk", (resource?: vscode.Uri) => diskMode("mount", resource)),
    vscode.commands.registerCommand("gopdsdk.unmountDeviceDisk", (resource?: vscode.Uri) => diskMode("unmount", resource)),
    vscode.commands.registerCommand("gopdsdk.showCrashLog", (resource?: vscode.Uri) => showLog("crashlog", resource)),
    vscode.commands.registerCommand("gopdsdk.showErrorLog", (resource?: vscode.Uri) => showLog("errorlog", resource)));
}
