export type DeviceCommand = "build device" | "run device" | "probe connection" | "crashlog" | "errorlog";

export interface DeviceFailure { category: string; }
export interface DeviceResult {
  command: DeviceCommand;
  package?: string;
  artifact?: string;
  deployment?: string;
  execution?: string;
  connected?: boolean;
  evidenceLevel?: string;
  log?: { kind: string; path: string; content: string };
  failure?: DeviceFailure;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

export function deviceArguments(command: DeviceCommand): string[] {
  if (command === "build device") return ["build", "device", "--format", "json", "--progress", "."];
  if (command === "run device") return ["run", "device", "--format", "json", "--progress", "."];
  if (command === "probe connection") return ["probe", "connection", "--format", "json"];
  return [command, "--format", "json", "--progress"];
}

export function decodeDeviceProgress(line: string, expected: DeviceCommand): { sequence: number; stage: string } | undefined {
  let parsed: unknown;
  try { parsed = JSON.parse(line); } catch { return undefined; }
  const event = object(parsed);
  if (event?.schema !== "gopdsdk-progress/v1") throw new Error("Unsupported gopdsdk progress schema.");
  if (event.command !== expected || !Number.isSafeInteger(event.sequence) || (event.sequence as number) < 1 || typeof event.stage !== "string" || !event.stage) {
    throw new Error("Invalid gopdsdk device progress event.");
  }
  return { sequence: event.sequence as number, stage: event.stage };
}

export function decodeDeviceResult(text: string, expected: DeviceCommand): DeviceResult {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("gopdsdk returned invalid structured device output."); }
  const envelope = object(parsed);
  if (envelope?.schema !== "gopdsdk-tooling-result/v1") throw new Error("Unsupported gopdsdk tooling result schema. Update gopdsdk.");
  if (envelope.command !== expected) throw new Error("gopdsdk returned a result for another command.");
  if (envelope.ok === false) {
    const failure = object(envelope.failure);
    if (typeof failure?.category !== "string" || !failure.category || envelope.result !== undefined) throw new Error("Invalid gopdsdk device failure.");
    return { command: expected, failure: { category: failure.category } };
  }
  if (envelope.ok !== true || envelope.failure !== undefined) throw new Error("Invalid gopdsdk device result.");
  const result = object(envelope.result);
  if (expected === "probe connection") {
    if (result?.schema !== "gopdsdk-probe/v1" || result.probe !== "connection" || result.discovered !== true || result.ready !== true || result.evidenceLevel !== "usb") throw new Error("Incompatible device connection result. Update gopdsdk.");
    return { command: expected, connected: true, evidenceLevel: "usb" };
  }
  if (expected === "build device" || expected === "run device") {
    const schema = expected === "build device" ? "gopdsdk-build/v1" : "gopdsdk-run/v1";
    if (result?.schema !== schema || result.target !== "device" || typeof result.package !== "string" || !result.package) throw new Error("Incompatible device workflow result. Update gopdsdk.");
    if (expected === "build device" && (typeof result.artifact !== "string" || !result.artifact)) throw new Error("Invalid device artifact result.");
    if (expected === "run device" && (result.deployment !== "installed" || result.execution !== "launched")) throw new Error("Invalid device deployment result.");
    return { command: expected, package: result.package, artifact: result.artifact as string | undefined, deployment: result.deployment as string | undefined, execution: result.execution as string | undefined };
  }
  if (result?.schema !== "gopdsdk-device-log/v1") throw new Error("Incompatible device log result. Update gopdsdk.");
  const metadata = object(result.metadata); const content = object(result.content);
  if (typeof metadata?.kind !== "string" || typeof metadata.path !== "string" || !Number.isSafeInteger(metadata.byteCount) || content?.encoding !== "base64" || typeof content.data !== "string") throw new Error("Invalid device log result.");
  const bytes = Buffer.from(content.data, "base64");
  if (bytes.byteLength !== metadata.byteCount || bytes.toString("base64") !== content.data) throw new Error("Invalid device log content.");
  return { command: expected, log: { kind: metadata.kind, path: metadata.path, content: bytes.toString("utf8") } };
}

export function deviceStageLabel(stage: string): string {
  return ({ planning: "Planning", compilation: "Compiling", packaging: "Packaging", connection: "Checking connection", deployment: "Deploying", launch: "Launching on Playdate", retrieval: "Reading device log", cleanup: "Cleaning up" } as Record<string, string>)[stage] ?? stage;
}

export function cancelChild(child: Pick<ChildProcess, "exitCode" | "kill">): boolean {
  return child.exitCode === null ? child.kill() : false;
}
import type { ChildProcess } from "node:child_process";
