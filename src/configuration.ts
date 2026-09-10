export type AnalyzerTarget = "shared" | "simulator" | "device" | "both";
export type DiagnosticSeverity = "error" | "warning" | "performance" | "information";

export interface ConfigurationReader {
  get<T>(section: string, defaultValue: T): T;
}

export interface AnalyzerSettings {
  target: AnalyzerTarget;
  gopdsdkFloor: string;
  playdateSDK: string;
  rules: string[];
  categories: string[];
  excludeRules: string[];
  severities: Record<string, DiagnosticSeverity>;
  baseline: string;
  changedFiles: string[];
  deep: boolean;
}

function strings(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter((value) => value.length > 0);
}

export function analyzerSettings(configuration: ConfigurationReader): AnalyzerSettings {
  return {
    target: configuration.get<AnalyzerTarget>("target", "both"),
    gopdsdkFloor: configuration.get<string>("gopdsdkFloor", "").trim(),
    playdateSDK: configuration.get<string>("playdateSDK", "").trim(),
    rules: strings(configuration.get<string[]>("rules", [])),
    categories: strings(configuration.get<string[]>("categories", [])),
    excludeRules: strings(configuration.get<string[]>("excludeRules", [])),
    severities: configuration.get<Record<string, DiagnosticSeverity>>("severities", {}),
    baseline: configuration.get<string>("baseline", "").trim(),
    changedFiles: strings(configuration.get<string[]>("changedFiles", [])),
    deep: configuration.get<boolean>("deep", false),
  };
}

export function analyzerConfigurationChanged(affects: (section: string) => boolean): boolean {
  return ["target", "gopdsdkFloor", "playdateSDK", "rules", "categories", "excludeRules", "severities", "baseline", "changedFiles", "deep"]
    .some((name) => affects(`gopdsdk.${name}`));
}
