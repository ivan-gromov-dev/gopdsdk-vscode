export type HealthStatus = "ready" | "missing" | "incompatible" | "unverified";

export interface HealthCheck {
  id: string;
  discovered: boolean;
  status: HealthStatus;
  evidenceLevel: string;
  failureCategory?: string;
  remediation?: { action: string; value?: string };
}

export interface DoctorReport {
  host: string;
  sdk?: { path: string; version: string };
  tools: Array<{ name: string; path: string; version?: string }>;
  checks: HealthCheck[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

export function decodeToolingResult(text: string, command: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error(`gopdsdk ${command} returned invalid JSON.`); }
  const envelope = record(value);
  if (envelope?.schema !== "gopdsdk-tooling-result/v1" || envelope.command !== command || typeof envelope.ok !== "boolean") {
    throw new Error(`gopdsdk ${command} returned an unsupported result.`);
  }
  if (!envelope.ok) {
    const failure = record(envelope.failure);
    throw new Error(`gopdsdk ${command} failed: ${typeof failure?.category === "string" ? failure.category : "unknown"}.`);
  }
  const result = record(envelope.result);
  if (!result) throw new Error(`gopdsdk ${command} returned an empty result.`);
  return result;
}

export function decodeDoctor(text: string): DoctorReport {
  const value = decodeToolingResult(text, "doctor");
  if (value.schema !== "gopdsdk-doctor/v1" || typeof value.host !== "string" || !Array.isArray(value.tools) || !Array.isArray(value.checks)) {
    throw new Error("gopdsdk doctor returned an unsupported report.");
  }
  const statuses = new Set(["ready", "missing", "incompatible", "unverified"]);
  const checks = value.checks.map((item) => {
    const check = record(item);
    if (!check || typeof check.id !== "string" || typeof check.discovered !== "boolean" || typeof check.status !== "string" ||
        !statuses.has(check.status) || typeof check.evidenceLevel !== "string") throw new Error("gopdsdk doctor returned an invalid check.");
    return check as unknown as HealthCheck;
  });
  return { host: value.host, sdk: record(value.sdk) as DoctorReport["sdk"], tools: value.tools as DoctorReport["tools"], checks };
}

export function decodeConnectionProbe(text: string): HealthCheck {
  const value = decodeToolingResult(text, "probe");
  if (value.schema !== "gopdsdk-probe/v1" || value.probe !== "connection" || typeof value.discovered !== "boolean" || typeof value.ready !== "boolean") {
    throw new Error("gopdsdk connection probe returned an unsupported report.");
  }
  return {
    id: "device-connection", discovered: value.discovered, status: value.ready ? "ready" : value.discovered ? "unverified" : "missing",
    evidenceLevel: typeof value.evidenceLevel === "string" ? value.evidenceLevel : "discovery",
  };
}

const icons: Record<HealthStatus, string> = { ready: "✅", missing: "❌", incompatible: "❌", unverified: "⚠️" };

export function healthMarkdown(report: DoctorReport, connection: HealthCheck, files: Record<string, boolean>, executable: string, analyzerProtocol: string): string {
  const checks = [...report.checks, connection];
  const lines = ["# gopdsdk Project Health", "", `Host: \`${report.host}\``, `gopdsdk: \`${executable}\``, `Analyzer protocol: \`${analyzerProtocol}\``,
    `Playdate SDK: ${report.sdk ? `\`${report.sdk.version}\`` : "not discovered"}`, "", "## Readiness", ""];
  for (const check of checks) lines.push(`- ${icons[check.status]} **${check.id}** — ${check.status} (${check.evidenceLevel})${check.failureCategory ? `; ${check.failureCategory}` : ""}`);
  lines.push("", "## Workspace contracts", "");
  for (const [name, present] of Object.entries(files)) lines.push(`- ${present ? "✅" : "⚪"} \`${name}\` — ${present ? "present" : "not present"}`);
  lines.push("", "_Tool readiness comes only from versioned gopdsdk reports. File entries report presence, not semantic validity._", "");
  return lines.join("\n");
}

export interface ProjectAnswers { directory: string; module: string; name: string; author: string; bundleID: string; }

export function projectAnswers(values: readonly (string | undefined)[]): ProjectAnswers | undefined {
  if (values.some((value) => value === undefined)) return undefined;
  const [directory, module, name, author, bundleID] = values as string[];
  const result = { directory: directory!, module: module!, name: name!, author: author!, bundleID: bundleID! };
  initArguments(result);
  return result;
}

export function initArguments(value: ProjectAnswers): string[] {
  if (!value.directory.trim() || !value.module.trim() || !value.name.trim() || !value.author.trim() || !/^[A-Za-z0-9]+(?:\.[A-Za-z0-9-]+)+$/.test(value.bundleID.trim())) {
    throw new Error("Project directory, module, name, author, and a reverse-DNS bundle ID are required.");
  }
  return ["init", "--module", value.module.trim(), "--name", value.name.trim(), "--author", value.author.trim(), "--bundle-id", value.bundleID.trim(), value.directory];
}
