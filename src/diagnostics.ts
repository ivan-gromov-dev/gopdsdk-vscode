export interface AnalyzerDiagnosticLike {
  source?: string;
  code?: string | number | { value: string | number };
}

export interface AnalyzerCodeActionLike {
  kind?: string | { value: string };
  command?: unknown;
  edit?: unknown;
  diagnostics?: readonly AnalyzerDiagnosticLike[];
}

export function analyzerRule(diagnostic: AnalyzerDiagnosticLike): string | undefined {
  if (diagnostic.source !== "gopdsdk") return undefined;
  const code = typeof diagnostic.code === "object" ? diagnostic.code.value : diagnostic.code;
  return typeof code === "string" && code.length > 0 ? code : undefined;
}

export function isAnalyzerSafeFix(action: AnalyzerCodeActionLike): boolean {
  const kind = typeof action.kind === "object" ? action.kind.value : action.kind;
  return kind === "quickfix"
    && action.edit !== undefined
    && action.command === undefined
    && action.diagnostics?.some((diagnostic) => analyzerRule(diagnostic) !== undefined) === true;
}

export function ruleHelpMarkdown(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const response = value as Record<string, unknown>;
  const rule = response.rule;
  if (typeof rule !== "object" || rule === null) return undefined;
  const metadata = rule as Record<string, unknown>;
  const id = typeof metadata.id === "string" ? metadata.id : undefined;
  const summary = typeof metadata.summary === "string" ? metadata.summary : undefined;
  if (!id || !summary) return undefined;
  const details = [
    ["Category", metadata.family],
    ["Default severity", metadata.defaultSeverity ?? metadata.default],
    ["Confidence", metadata.confidence],
    ["Safe fix", metadata.safeFixPolicy],
  ].filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0);
  const documentation = typeof response.documentation === "string" ? response.documentation : undefined;
  const lines = [`# ${id}`, "", summary, ""];
  for (const [label, detail] of details) lines.push(`- **${label}:** ${detail}`);
  if (documentation) lines.push("", `[Versioned rule documentation](${documentation})`);
  return lines.join("\n");
}
