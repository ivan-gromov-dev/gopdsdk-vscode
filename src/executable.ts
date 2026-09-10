import * as fs from "node:fs/promises";
import * as path from "node:path";

export type ExecutableSource = "setting" | "workspace" | "path";

export interface ExecutableResolution {
  command: string;
  source: ExecutableSource;
}

export interface ExecutableDiscoveryOptions {
  configured?: string;
  workspaceFolders: readonly string[];
  pathValue?: string;
  pathExt?: string;
  platform?: NodeJS.Platform;
  isFile?: (candidate: string) => Promise<boolean>;
}

export class ExecutableNotFoundError extends Error {
  constructor(configured?: string) {
    const detail = configured?.trim()
      ? "the configured gopdsdk executable was not found"
      : "no gopdsdk executable was found in workspace tools or PATH";
    super(`${detail}. Set gopdsdk.executable to an executable path.`);
    this.name = "ExecutableNotFoundError";
  }
}

const workspaceDirectories = ["tools", "bin"] as const;

async function defaultIsFile(candidate: string): Promise<boolean> {
  try {
    if (!(await fs.stat(candidate)).isFile()) return false;
    if (process.platform !== "win32") await fs.access(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function executableNames(platform: NodeJS.Platform, pathExt?: string): string[] {
  if (platform !== "win32") return ["gopdsdk"];
  const extensions = (pathExt || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean);
  return ["gopdsdk", ...extensions.map((extension) => `gopdsdk${extension}`)];
}

function isPath(value: string): boolean {
  return path.isAbsolute(value) || value.includes("/") || value.includes("\\");
}

async function firstFile(candidates: readonly string[], isFile: (candidate: string) => Promise<boolean>): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (await isFile(candidate)) return path.resolve(candidate);
  }
  return undefined;
}

function pathCandidates(command: string, options: ExecutableDiscoveryOptions): string[] {
  const platform = options.platform ?? process.platform;
  const names = platform === "win32" && path.extname(command) === ""
    ? [command, ...executableNames(platform, options.pathExt).slice(1).map((name) => command + path.extname(name))]
    : [command];
  return (options.pathValue ?? "")
    .split(path.delimiter)
    .filter(Boolean)
    .flatMap((directory) => names.map((name) => path.join(directory, name)));
}

export async function discoverExecutable(options: ExecutableDiscoveryOptions): Promise<ExecutableResolution> {
  const isFile = options.isFile ?? defaultIsFile;
  const configured = options.configured?.trim();
  if (configured) {
    const candidates = isPath(configured) ? [configured] : pathCandidates(configured, options);
    const command = await firstFile(candidates, isFile);
    if (!command) throw new ExecutableNotFoundError(configured);
    return { command, source: "setting" };
  }

  const names = executableNames(options.platform ?? process.platform, options.pathExt);
  const workspaceCandidates = options.workspaceFolders.flatMap((folder) =>
    workspaceDirectories.flatMap((directory) => names.map((name) => path.join(folder, directory, name))),
  );
  const workspaceCommand = await firstFile(workspaceCandidates, isFile);
  if (workspaceCommand) return { command: workspaceCommand, source: "workspace" };

  const pathCommand = await firstFile(pathCandidates("gopdsdk", options), isFile);
  if (pathCommand) return { command: pathCommand, source: "path" };
  throw new ExecutableNotFoundError();
}
