import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { analyzerRule } from "./diagnostics";
import { AnalyzerProfile, BaselineResult, comparisonMarkdown, decodeBaselineResult, decodeCheckReport, decodeRepositoryConfiguration, decodeRuleCatalog, encodeRepositoryConfiguration, RepositoryAnalyzerConfiguration, RuleSeverity, suppressionInsertion } from "./analyzerUx";
import { discoverExecutable } from "./executable";

function activeFolder(resource?: vscode.Uri): vscode.WorkspaceFolder | undefined {
  if (resource) return vscode.workspace.getWorkspaceFolder(resource);
  const active = vscode.window.activeTextEditor?.document.uri;
  return active ? vscode.workspace.getWorkspaceFolder(active) : vscode.workspace.workspaceFolders?.[0];
}

async function commandFor(folder: vscode.WorkspaceFolder): Promise<string> {
  const configuration = vscode.workspace.getConfiguration("gopdsdk", folder.uri);
  return (await discoverExecutable({ configured: configuration.get<string>("executable", ""), workspaceFolders: [folder.uri.fsPath], pathValue: process.env.PATH, pathExt: process.env.PATHEXT })).command;
}

function run(command: string, args: string[], cwd: string, token?: vscode.CancellationToken): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = ""; let settled = false;
    const cancel = token?.onCancellationRequested(() => child.kill());
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); if (stdout.length > 16 * 1024 * 1024) child.kill(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.once("error", () => { if (!settled) { settled = true; cancel?.dispose(); reject(new Error("Could not start gopdsdk.")); } });
    child.once("exit", (code) => { if (settled) return; settled = true; cancel?.dispose(); code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `gopdsdk exited with code ${code}.`)); });
  });
}

function folderOrWarn(resource?: vscode.Uri): vscode.WorkspaceFolder | undefined {
  const folder = activeFolder(resource);
  if (!folder) void vscode.window.showWarningMessage("Open a Playdate workspace first.");
  return folder;
}

async function readRepositoryConfiguration(folder: vscode.WorkspaceFolder): Promise<{ document: vscode.TextDocument; value: RepositoryAnalyzerConfiguration }> {
  const uri = vscode.Uri.joinPath(folder.uri, ".gopdsdk-check.json");
  try { await vscode.workspace.fs.stat(uri); } catch { await vscode.workspace.fs.writeFile(uri, Buffer.from('{\n  "schema": "gopdsdk-check-config/v1"\n}\n')); }
  const document = await vscode.workspace.openTextDocument(uri);
  return { document, value: decodeRepositoryConfiguration(document.getText()) };
}

async function writeRepositoryConfiguration(document: vscode.TextDocument, value: RepositoryAnalyzerConfiguration, expectedVersion: number): Promise<void> {
  if (document.version !== expectedVersion) throw new Error(".gopdsdk-check.json changed while it was being edited. Try again.");
  const edit = new vscode.WorkspaceEdit();
  const last = document.lineAt(document.lineCount - 1).range.end;
  edit.replace(document.uri, new vscode.Range(new vscode.Position(0, 0), last), encodeRepositoryConfiguration(value));
  if (!await vscode.workspace.applyEdit(edit)) throw new Error("Could not update .gopdsdk-check.json.");
  await document.save();
}

async function synchronizeLSPConfiguration(folder: vscode.WorkspaceFolder, value: RepositoryAnalyzerConfiguration, profile: AnalyzerProfile, catalogRuleIDs?: string[]): Promise<void> {
  const configuration = vscode.workspace.getConfiguration("gopdsdk", folder.uri);
  const configuredRules = Array.isArray(value.rules) ? value.rules.filter((item): item is string => typeof item === "string") : [];
  const rules = profile === "experimental" && catalogRuleIDs ? catalogRuleIDs : configuredRules;
  const updates: Array<[string, unknown]> = [
    ["target", typeof value.target === "string" ? value.target : "both"], ["rules", rules],
    ["categories", Array.isArray(value.categories) ? value.categories : []], ["excludeRules", Array.isArray(value.excludeRules) ? value.excludeRules : []],
    ["severities", typeof value.severities === "object" && value.severities !== null ? value.severities : {}],
    ["baseline", typeof value.baseline === "string" ? value.baseline : ""], ["changedFiles", Array.isArray(value.changedFiles) ? value.changedFiles : []],
    ["deep", profile === "deep"],
  ];
  for (const [name, setting] of updates) await configuration.update(name, setting, vscode.ConfigurationTarget.WorkspaceFolder);
}

async function configureAnalyzer(resource?: vscode.Uri): Promise<void> {
  const folder = folderOrWarn(resource); if (!folder) return;
  const target = await vscode.window.showQuickPick(["both", "simulator", "device", "shared"], { placeHolder: "Select analysis target" }); if (!target) return;
  const profile = await vscode.window.showQuickPick(["default", "experimental", "deep"], { placeHolder: "Select analyzer profile" }) as AnalyzerProfile | undefined; if (!profile) return;
  const current = await readRepositoryConfiguration(folder); const version = current.document.version;
  current.value.target = target; current.value.profile = profile;
  await writeRepositoryConfiguration(current.document, current.value, version);
  const ruleIDs = profile === "experimental" ? (await catalog(folder)).rules.map((rule) => rule.id) : undefined;
  await synchronizeLSPConfiguration(folder, current.value, profile, ruleIDs);
  await vscode.commands.executeCommand("gopdsdk.refreshDiagnostics");
}

async function catalog(folder: vscode.WorkspaceFolder, token?: vscode.CancellationToken) {
  return decodeRuleCatalog(await run(await commandFor(folder), ["rules", "--format", "json"], folder.uri.fsPath, token));
}

async function browseRules(resource?: vscode.Uri): Promise<void> {
  const folder = folderOrWarn(resource); if (!folder) return;
  const rules = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Loading exact-version gopdsdk rules", cancellable: true }, async (_, token) => (await catalog(folder, token)).rules);
  const families = [...new Set(rules.map((rule) => rule.family))].sort();
  const family = await vscode.window.showQuickPick(["All categories", ...families], { placeHolder: "Select an analyzer rule category" }); if (!family) return;
  const visible = family === "All categories" ? rules : rules.filter((rule) => rule.family === family);
  const selected = await vscode.window.showQuickPick(visible.map((rule) => ({ label: rule.id, description: `${rule.family} · ${rule.defaultSeverity} · ${rule.targets.join(", ")}`, detail: rule.summary, rule })), { placeHolder: "Browse analyzer rules", matchOnDescription: true, matchOnDetail: true });
  if (!selected) return;
  const action = await vscode.window.showQuickPick(["Show exact-version help", "Enable rule", "Exclude rule", "Override severity"], { placeHolder: selected.label }); if (!action) return;
  if (action === "Show exact-version help") { await vscode.commands.executeCommand("gopdsdk.showRuleHelp", selected.label); return; }
  const current = await readRepositoryConfiguration(folder); const version = current.document.version;
  if (action === "Enable rule") { current.value.rules = [...new Set([...(Array.isArray(current.value.rules) ? current.value.rules.filter((item): item is string => typeof item === "string") : []), selected.label])].sort(); current.value.excludeRules = Array.isArray(current.value.excludeRules) ? current.value.excludeRules.filter((item) => item !== selected.label) : []; }
  if (action === "Exclude rule") { current.value.excludeRules = [...new Set([...(Array.isArray(current.value.excludeRules) ? current.value.excludeRules.filter((item): item is string => typeof item === "string") : []), selected.label])].sort(); current.value.rules = Array.isArray(current.value.rules) ? current.value.rules.filter((item) => item !== selected.label) : []; }
  if (action === "Override severity") {
    const severity = await vscode.window.showQuickPick(["error", "warning", "performance", "information"], { placeHolder: `Severity for ${selected.label}` }) as RuleSeverity | undefined; if (!severity) return;
    current.value.severities = { ...(typeof current.value.severities === "object" && current.value.severities !== null ? current.value.severities : {}), [selected.label]: severity };
  }
  await writeRepositoryConfiguration(current.document, current.value, version);
  const profile = current.value.profile === "experimental" || current.value.profile === "deep" ? current.value.profile : "default";
  await synchronizeLSPConfiguration(folder, current.value, profile, profile === "experimental" ? rules.map((rule) => rule.id) : undefined);
  await vscode.commands.executeCommand("gopdsdk.refreshDiagnostics");
}

async function diagnosticSelection(argument?: unknown): Promise<{ diagnostic: vscode.Diagnostic; uri: vscode.Uri } | undefined> {
  if (argument instanceof vscode.Diagnostic) {
    const uri = vscode.window.activeTextEditor?.document.uri; if (uri && analyzerRule(argument)) return { diagnostic: argument, uri };
  }
  const items = vscode.languages.getDiagnostics().flatMap(([uri, diagnostics]) => diagnostics.flatMap((diagnostic) => analyzerRule(diagnostic) ? [{ label: analyzerRule(diagnostic)!, description: diagnostic.message, diagnostic, uri }] : []));
  const selected = await vscode.window.showQuickPick(items, { placeHolder: "Select a gopdsdk diagnostic to suppress" });
  return selected ? { diagnostic: selected.diagnostic, uri: selected.uri } : undefined;
}

async function addSuppression(argument?: unknown): Promise<void> {
  const selected = await diagnosticSelection(argument); if (!selected) return;
  const folder = folderOrWarn(selected.uri); if (!folder) return;
  const rule = analyzerRule(selected.diagnostic)!;
  const entry = (await catalog(folder)).rules.find((candidate) => candidate.id === rule);
  if (!entry?.suppressible) { void vscode.window.showWarningMessage(`Rule ${rule} cannot be suppressed.`); return; }
  const document = await vscode.workspace.openTextDocument(selected.uri); const version = document.version;
  const reason = await vscode.window.showInputBox({ prompt: `Reason for suppressing ${rule}`, ignoreFocusOut: true, validateInput: (value) => value.trim() && !/[\r\n]/.test(value) ? undefined : "A single-line reason is required." }); if (!reason) return;
  const insertion = suppressionInsertion(document.getText(), selected.diagnostic.range.start.line + 1, rule, reason, version, document.version);
  const edit = new vscode.WorkspaceEdit(); edit.insert(document.uri, document.positionAt(insertion.offset), insertion.text);
  if (!await vscode.workspace.applyEdit(edit)) throw new Error("Could not add the suppression.");
  await document.save();
}

async function checkReport(folder: vscode.WorkspaceFolder, target?: string, token?: vscode.CancellationToken): Promise<string> {
  const args = ["check", "--format", "json", "--fail-on", "none", "--baseline", ""]; if (target) args.push("--target", target);
  return run(await commandFor(folder), args, folder.uri.fsPath, token);
}

async function baseline(operation: BaselineResult["operation"], resource?: vscode.Uri): Promise<void> {
  const folder = folderOrWarn(resource); if (!folder) return;
  const config = await readRepositoryConfiguration(folder); const configured = typeof config.value.baseline === "string" ? config.value.baseline : ".gopdsdk-check-baseline.json";
  const baselinePath = await vscode.window.showInputBox({ prompt: "Workspace-relative baseline path", value: configured, validateInput: (value) => value.trim() ? undefined : "A path is required." }); if (!baselinePath) return;
  let reason: string | undefined;
  if (operation !== "validate") { reason = await vscode.window.showInputBox({ prompt: "Reason for newly adopted findings", value: "accepted migration debt", validateInput: (value) => value.trim() ? undefined : "A reason is required." }); if (!reason) return; }
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `${operation[0]!.toUpperCase()}${operation.slice(1)} gopdsdk baseline`, cancellable: true }, async (_, token) => {
    const reportName = `.gopdsdk-vscode-report-${process.pid}-${Date.now()}.json`; const reportPath = path.join(folder.uri.fsPath, reportName);
    try {
      await fs.writeFile(reportPath, await checkReport(folder, undefined, token), { flag: "wx" });
      const args = ["baseline", operation, "--input", reportName, "--output", baselinePath]; if (reason) args.push("--reason", reason.trim());
      const result = decodeBaselineResult(await run(await commandFor(folder), args, folder.uri.fsPath, token), operation);
      if (operation !== "validate" && config.value.baseline !== baselinePath) { const version = config.document.version; config.value.baseline = baselinePath; await writeRepositoryConfiguration(config.document, config.value, version); }
      void vscode.window.showInformationMessage(`${operation === "validate" ? "Validated" : "Wrote"} baseline with ${result.entries} entries; ${result.staleEntries.length} stale.`);
    } finally { await fs.unlink(reportPath).catch(() => undefined); }
  });
}

async function inspectBaseline(resource?: vscode.Uri): Promise<void> {
  const folder = folderOrWarn(resource); if (!folder) return;
  const config = await readRepositoryConfiguration(folder); const name = typeof config.value.baseline === "string" ? config.value.baseline : ".gopdsdk-check-baseline.json";
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder.uri, ...name.split("/"))), { preview: true });
}

async function compareTargets(resource?: vscode.Uri): Promise<void> {
  const folder = folderOrWarn(resource); if (!folder) return;
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Comparing shared, Simulator, and device findings", cancellable: true }, async (_, token) => {
    const reports = [];
    for (const target of ["shared", "simulator", "device"]) reports.push(decodeCheckReport(await checkReport(folder, target, token)));
    const document = await vscode.workspace.openTextDocument({ language: "markdown", content: comparisonMarkdown(reports) });
    await vscode.window.showTextDocument(document, { preview: true });
  });
}

function guarded(action: (...args: any[]) => Promise<void>): (...args: any[]) => Promise<void> {
  return async (...args: any[]) => { try { await action(...args); } catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : "gopdsdk analyzer operation failed."); } };
}

export function registerAnalyzerAdministration(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("gopdsdk.configureAnalyzer", guarded(configureAnalyzer)),
    vscode.commands.registerCommand("gopdsdk.browseRules", guarded(browseRules)),
    vscode.commands.registerCommand("gopdsdk.addSuppression", guarded(addSuppression)),
    vscode.commands.registerCommand("gopdsdk.createBaseline", guarded((resource?: vscode.Uri) => baseline("create", resource))),
    vscode.commands.registerCommand("gopdsdk.updateBaseline", guarded((resource?: vscode.Uri) => baseline("update", resource))),
    vscode.commands.registerCommand("gopdsdk.inspectBaseline", guarded(inspectBaseline)),
    vscode.commands.registerCommand("gopdsdk.validateBaseline", guarded((resource?: vscode.Uri) => baseline("validate", resource))),
    vscode.commands.registerCommand("gopdsdk.compareTargets", guarded(compareTargets)),
  );
}
