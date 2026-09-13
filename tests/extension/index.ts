import * as assert from "node:assert/strict";
import * as vscode from "vscode";

async function eventually<T>(read: () => T | undefined, message: string): Promise<T> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension("gopdsdk.gopdsdk");
  assert.ok(extension, "extension is installed in the test host");
  await extension.activate();
  assert.equal(vscode.workspace.workspaceFolders?.length, 2, "multi-root fixture opened");

  const documents: vscode.TextDocument[] = [];
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder.uri, "game.go"));
    documents.push(document);
    await vscode.window.showTextDocument(document);
    const diagnostic = await eventually(
      () => vscode.languages.getDiagnostics(document.uri).find((item) => item.source === "gopdsdk"),
      `diagnostic was not published for ${folder.name}`,
    );
    const code = diagnostic.code;
    assert.equal(typeof code === "object" ? code.value : code, "fixture-rule");
    assert.equal(diagnostic.relatedInformation?.[0]?.message, "related declaration");
    assert.equal(typeof code === "object" ? code.target.toString() : "", "https://example.invalid/rules/fixture-rule");
  }

  const document = documents[0]!;
  const actions = await vscode.commands.executeCommand<(vscode.CodeAction | vscode.Command)[]>(
    "vscode.executeCodeActionProvider", document.uri, new vscode.Range(1, 0, 1, 2), vscode.CodeActionKind.QuickFix.value,
  );
  assert.ok(!actions?.some((action) => action.title === "Unsafe command"));
  const action = actions?.find((candidate) => candidate.title === "Apply analyzer safe fix") as vscode.CodeAction | undefined;
  assert.ok(action, "analyzer safe fix is available");
  assert.ok(action.edit && await vscode.workspace.applyEdit(action.edit));
  assert.match(document.getText(), /var fixed = true/);
  const editor = await vscode.window.showTextDocument(document);
  assert.ok(await editor.edit((builder) => builder.insert(new vscode.Position(0, 0), "// newest\n")));
  assert.ok(await document.save());

  await vscode.commands.executeCommand("gopdsdk.showRuleHelp", "fixture-rule");
  assert.equal(vscode.window.activeTextEditor?.document.languageId, "markdown");
  assert.match(vscode.window.activeTextEditor?.document.getText() ?? "", /fixture summary/);
  await vscode.commands.executeCommand("gopdsdk.refreshDiagnostics");

  const commands = await vscode.commands.getCommands(true);
  for (const command of ["gopdsdk.restartServer", "gopdsdk.refreshDiagnostics", "gopdsdk.showRuleHelp", "gopdsdk.troubleshoot", "gopdsdk.buildSimulator", "gopdsdk.runSimulator", "gopdsdk.selectTarget"]) {
    assert.ok(commands.includes(command), `${command} is registered`);
  }

  const tasks = await vscode.tasks.fetchTasks({ type: "gopdsdk" });
  assert.equal(tasks.filter((task) => task.definition.command === "build").length, 2);
  assert.equal(tasks.filter((task) => task.definition.command === "run").length, 2);
}
