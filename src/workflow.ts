import * as path from "node:path";

export type WorkflowCommand = "build" | "run";

export interface SourceLocation {
  path: string;
  line: number;
  column: number;
}

export interface WorkflowFailure {
  category: string;
  locations: SourceLocation[];
}

export interface WorkflowResult {
  command: WorkflowCommand;
  artifact?: string;
  package?: string;
  pid?: number;
  failure?: WorkflowFailure;
}

export interface ProgressEvent {
  sequence: number;
  stage: string;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function commandName(value: unknown): WorkflowCommand | undefined {
  return value === "build" || value === "run" ? value : undefined;
}

export function workflowArguments(command: WorkflowCommand): string[] {
  return [command, "--format", "json", "--progress", "."];
}

export function decodeProgress(line: string, expectedCommand: WorkflowCommand): ProgressEvent | undefined {
  let value: unknown;
  try { value = JSON.parse(line); } catch { return undefined; }
  const event = object(value);
  if (event?.schema !== "gopdsdk-progress/v1") throw new Error("Unsupported gopdsdk progress schema.");
  if (event.command !== expectedCommand || !Number.isSafeInteger(event.sequence) || (event.sequence as number) < 1 || typeof event.stage !== "string" || event.stage.length === 0) {
    throw new Error("Invalid gopdsdk progress event.");
  }
  return { sequence: event.sequence as number, stage: event.stage };
}

function sourceLocation(value: unknown): SourceLocation | undefined {
  const item = object(value);
  if (typeof item?.path !== "string" || path.posix.isAbsolute(item.path) || item.path.includes("\\") || item.path.includes(":") || item.path === ".." || item.path.startsWith("../")) return undefined;
  if (!Number.isSafeInteger(item.line) || (item.line as number) < 1 || !Number.isSafeInteger(item.column) || (item.column as number) < 1) return undefined;
  return { path: item.path, line: item.line as number, column: item.column as number };
}

export function decodeWorkflowResult(text: string, expectedCommand: WorkflowCommand): WorkflowResult {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("gopdsdk returned invalid structured output."); }
  const envelope = object(value);
  const command = commandName(envelope?.command);
  if (envelope?.schema !== "gopdsdk-tooling-result/v1") throw new Error("Unsupported gopdsdk tooling result schema. Update gopdsdk.");
  if (command !== expectedCommand) throw new Error("gopdsdk returned a result for another command.");
  if (envelope.ok === true) {
    const result = object(envelope.result);
    const schema = expectedCommand === "build" ? "gopdsdk-build/v1" : "gopdsdk-run/v1";
    if (result?.schema !== schema || result.target !== "simulator" || typeof result.package !== "string" || typeof result.artifact !== "string") {
      throw new Error("gopdsdk returned an incompatible workflow result. Update gopdsdk.");
    }
    if (expectedCommand === "run" && (!Number.isSafeInteger(result.pid) || (result.pid as number) < 1)) throw new Error("gopdsdk returned an invalid Simulator process ID.");
    return { command, artifact: result.artifact, package: result.package, pid: expectedCommand === "run" ? result.pid as number : undefined };
  }
  const failure = object(envelope?.failure);
  if (envelope.ok !== false || typeof failure?.category !== "string" || failure.category.length === 0 || envelope.result !== undefined) {
    throw new Error("gopdsdk returned an invalid workflow failure.");
  }
  const locations = Array.isArray(failure.locations) ? failure.locations.map(sourceLocation).filter((item): item is SourceLocation => item !== undefined) : [];
  return { command, failure: { category: failure.category, locations } };
}

export function stageLabel(stage: string): string {
  const labels: Record<string, string> = { planning: "Planning", compilation: "Compiling", packaging: "Packaging", launch: "Launching Simulator", cleanup: "Cleaning up" };
  return labels[stage] ?? stage;
}
