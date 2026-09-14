import * as path from "node:path";

export type AnalyzerProfile = "default" | "experimental" | "deep";
export type RuleSeverity = "error" | "warning" | "performance" | "information";

export interface AnalyzerRuleCatalogEntry {
  id: string;
  family: string;
  summary: string;
  defaultSeverity: RuleSeverity;
  confidence: string;
  targets: string[];
  experimental: boolean;
  suppressible: boolean;
  safeFixPolicy: string;
}

export interface AnalyzerCatalog { schema: "gopdsdk-analyzer-contracts/v1"; rules: AnalyzerRuleCatalogEntry[]; }

export interface CheckDiagnostic {
  rule: string;
  category: string;
  severity: RuleSeverity;
  target: "shared" | "simulator" | "device";
  message: string;
  primary: { path: string; start: { line: number; column: number }; end: { line: number; column: number } };
}

export interface CheckReport {
  schema: "gopdsdk-check/v1";
  analyzerVersion: string;
  sdkVersion: string;
  diagnostics: CheckDiagnostic[];
}

export interface BaselineResult {
  schema: "gopdsdk-baseline-result/v1";
  operation: "create" | "update" | "validate";
  path: string;
  entries: number;
  staleEntries: unknown[];
}

export type RepositoryAnalyzerConfiguration = Record<string, unknown> & { schema: "gopdsdk-check-config/v1" };

export function decodeRepositoryConfiguration(text: string): RepositoryAnalyzerConfiguration {
  let value: unknown; try { value = JSON.parse(text); } catch { throw new Error(".gopdsdk-check.json is not valid JSON."); }
  const config = record(value);
  if (config?.schema !== "gopdsdk-check-config/v1") throw new Error(".gopdsdk-check.json uses an unsupported schema.");
  return config as RepositoryAnalyzerConfiguration;
}

export function encodeRepositoryConfiguration(value: RepositoryAnalyzerConfiguration): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function envelope(text: string, command: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("gopdsdk returned invalid structured output."); }
  const item = record(value);
  if (item?.schema !== "gopdsdk-tooling-result/v1") throw new Error("Unsupported gopdsdk tooling result schema. Update gopdsdk.");
  if (item.command !== command || item.ok !== true || !record(item.result)) throw new Error(`gopdsdk returned an invalid ${command} result.`);
  return record(item.result)!;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;
}

export function decodeRuleCatalog(text: string): AnalyzerCatalog {
  const result = envelope(text, "rules");
  if (result.schema !== "gopdsdk-analyzer-contracts/v1" || !Array.isArray(result.rules)) throw new Error("Unsupported analyzer catalog schema. Update gopdsdk.");
  const rules = result.rules.map((value): AnalyzerRuleCatalogEntry => {
    const rule = record(value); const targets = stringArray(rule?.targets);
    const severity = rule?.defaultSeverity;
    if (typeof rule?.id !== "string" || typeof rule.family !== "string" || typeof rule.summary !== "string" ||
      !["error", "warning", "performance", "information"].includes(String(severity)) || typeof rule.confidence !== "string" ||
      !targets || typeof rule.suppressible !== "boolean" || typeof rule.safeFixPolicy !== "string") throw new Error("gopdsdk returned an invalid analyzer catalog.");
    return { id: rule.id, family: rule.family, summary: rule.summary, defaultSeverity: severity as RuleSeverity,
      confidence: rule.confidence, targets, experimental: rule.experimental === true, suppressible: rule.suppressible, safeFixPolicy: rule.safeFixPolicy };
  });
  return { schema: "gopdsdk-analyzer-contracts/v1", rules };
}

function validRelativePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !path.posix.isAbsolute(value) && !value.includes("\\") && !value.includes(":") && value !== ".." && !value.startsWith("../");
}

export function decodeCheckReport(text: string): CheckReport {
  let value: unknown; try { value = JSON.parse(text); } catch { throw new Error("gopdsdk returned an invalid check report."); }
  const report = record(value);
  if (report?.schema !== "gopdsdk-check/v1" || typeof report.analyzerVersion !== "string" || typeof report.sdkVersion !== "string" || !Array.isArray(report.diagnostics)) throw new Error("Unsupported gopdsdk check schema. Update gopdsdk.");
  const diagnostics = report.diagnostics.map((value): CheckDiagnostic => {
    const item = record(value); const primary = record(item?.primary); const start = record(primary?.start); const end = record(primary?.end);
    if (typeof item?.rule !== "string" || typeof item.category !== "string" || !["error", "warning", "performance", "information"].includes(String(item.severity)) ||
      !["shared", "simulator", "device"].includes(String(item.target)) || typeof item.message !== "string" || !primary || !start || !end || !validRelativePath(primary.path) ||
      !Number.isSafeInteger(start?.line) || (start?.line as number) < 1 || !Number.isSafeInteger(start?.column) || (start?.column as number) < 1 ||
      !Number.isSafeInteger(end?.line) || (end?.line as number) < 1 || !Number.isSafeInteger(end?.column) || (end?.column as number) < 1) throw new Error("gopdsdk returned an invalid check diagnostic.");
    return { rule: item.rule, category: item.category, severity: item.severity as RuleSeverity, target: item.target as CheckDiagnostic["target"], message: item.message,
      primary: { path: primary.path, start: { line: start.line as number, column: start.column as number }, end: { line: end.line as number, column: end.column as number } } };
  });
  return { schema: "gopdsdk-check/v1", analyzerVersion: report.analyzerVersion, sdkVersion: report.sdkVersion, diagnostics };
}

export function decodeBaselineResult(text: string, operation: BaselineResult["operation"]): BaselineResult {
  const result = envelope(text, `baseline ${operation}`);
  if (result.schema !== "gopdsdk-baseline-result/v1" || result.operation !== operation || typeof result.path !== "string" ||
    !Number.isSafeInteger(result.entries) || !Array.isArray(result.staleEntries)) throw new Error("Unsupported gopdsdk baseline result. Update gopdsdk.");
  return { schema: "gopdsdk-baseline-result/v1", operation, path: result.path, entries: result.entries as number, staleEntries: result.staleEntries };
}

export function suppressionInsertion(text: string, diagnosticLine: number, rule: string, reason: string, expectedVersion: number, actualVersion: number): { offset: number; text: string } {
  if (actualVersion !== expectedVersion) throw new Error("The document changed while the suppression reason was being entered. Try again.");
  const cleanReason = reason.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rule) || cleanReason.length === 0 || /[\r\n]/.test(cleanReason)) throw new Error("A single-line suppression reason is required.");
  const lines = text.split(/(?<=\n)/); const index = diagnosticLine - 1;
  if (index < 0 || index >= lines.length) throw new Error("The diagnostic location is stale.");
  const offset = lines.slice(0, index).reduce((sum, line) => sum + line.length, 0);
  const body = lines[index]!.replace(/[\r\n]+$/, ""); const indent = body.match(/^\s*/)?.[0] ?? "";
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  return { offset, text: `${indent}//gopdsdk:ignore ${rule} -- ${cleanReason}${eol}` };
}

export function comparisonMarkdown(reports: CheckReport[]): string {
  const distinct = new Map<string, CheckDiagnostic>();
  for (const item of reports.flatMap((report) => report.diagnostics)) distinct.set(`${item.target}\0${item.rule}\0${item.primary.path}\0${item.primary.start.line}\0${item.primary.start.column}\0${item.message}`, item);
  const rows = [...distinct.values()].sort((a, b) => a.primary.path.localeCompare(b.primary.path) || a.primary.start.line - b.primary.start.line || a.rule.localeCompare(b.rule) || a.target.localeCompare(b.target));
  const versions = [...new Set(reports.map((report) => `${report.analyzerVersion} / SDK ${report.sdkVersion}`))].join(", ");
  const lines = ["# gopdsdk target comparison", "", `Analyzer / SDK: \`${versions}\``, "", "| Target | Rule | Location | Severity | Finding |", "| --- | --- | --- | --- | --- |"]; 
  for (const item of rows) lines.push(`| ${item.target} | ${item.rule} | ${item.primary.path}:${item.primary.start.line}:${item.primary.start.column} | ${item.severity} | ${item.message.replaceAll("|", "\\|")} |`);
  if (rows.length === 0) lines.push("| — | — | — | — | No findings | ");
  return lines.join("\n");
}
