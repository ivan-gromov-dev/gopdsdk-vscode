export type WorkspaceStateKind = "empty" | "loading" | "ready" | "error";

export interface WorkspaceSnapshot {
  state: WorkspaceStateKind;
  folder?: string;
  target?: string;
  gopdsdk?: string;
  sdk?: string;
  health?: string;
  device?: string;
  diagnostics?: { errors: number; warnings: number; information: number };
  error?: string;
}

export interface WorkspaceNode {
  label: string;
  description?: string;
  icon: string;
  command?: string;
  group?: "summary" | "actions" | "logs";
}

const actions: WorkspaceNode[] = [
  { label: "Project Health", icon: "pulse", command: "gopdsdk.showProjectHealth", group: "actions" },
  { label: "Fix Project Health Issue", icon: "wrench", command: "gopdsdk.remediateProjectHealth", group: "actions" },
  { label: "Create Playdate Project", icon: "new-folder", command: "gopdsdk.createProject", group: "actions" },
  { label: "Configure Analyzer", icon: "settings-gear", command: "gopdsdk.configureAnalyzer", group: "actions" },
  { label: "Browse Analyzer Rules", icon: "list-tree", command: "gopdsdk.browseRules", group: "actions" },
  { label: "Compare Analysis Targets", icon: "diff", command: "gopdsdk.compareTargets", group: "actions" },
  { label: "Build for Simulator", icon: "tools", command: "gopdsdk.buildSimulator", group: "actions" },
  { label: "Build and Run in Simulator", icon: "play", command: "gopdsdk.runSimulator", group: "actions" },
  { label: "Check Device Connection", icon: "plug", command: "gopdsdk.checkDeviceConnection", group: "actions" },
  { label: "Build for Device", icon: "tools", command: "gopdsdk.buildDevice", group: "actions" },
  { label: "Build and Run on Device", icon: "device-mobile", command: "gopdsdk.runDevice", group: "actions" },
  { label: "Open Device Crash Log", icon: "error", command: "gopdsdk.showCrashLog", group: "logs" },
  { label: "Open Device Error Log", icon: "output", command: "gopdsdk.showErrorLog", group: "logs" },
];

export function workspaceNodes(snapshot: WorkspaceSnapshot): WorkspaceNode[] {
  if (snapshot.state === "empty") return [{ label: "Open a Playdate workspace", icon: "folder-opened", group: "summary" }];
  if (snapshot.state === "loading") return [{ label: "Refreshing Playdate workspace…", icon: "loading~spin", group: "summary" }];
  if (snapshot.state === "error") return [
    { label: "Workspace refresh failed", description: snapshot.error, icon: "error", group: "summary" },
    { label: "Refresh", icon: "refresh", command: "gopdsdk.refreshWorkspaceView", group: "actions" },
  ];
  const counts = snapshot.diagnostics ?? { errors: 0, warnings: 0, information: 0 };
  return [
    { label: "Workspace", description: snapshot.folder, icon: "root-folder", command: "gopdsdk.selectWorkspace", group: "summary" },
    { label: "Target", description: snapshot.target, icon: "target", command: "gopdsdk.selectTarget", group: "summary" },
    { label: "gopdsdk", description: snapshot.gopdsdk, icon: "terminal", group: "summary" },
    { label: "Playdate SDK", description: snapshot.sdk, icon: "package", group: "summary" },
    { label: "Project Health", description: snapshot.health, icon: snapshot.health === "ready" ? "pass" : "warning", command: "gopdsdk.showProjectHealth", group: "summary" },
    { label: "Device", description: snapshot.device, icon: snapshot.device === "connected" ? "device-mobile" : "debug-disconnect", command: "gopdsdk.checkDeviceConnection", group: "summary" },
    { label: "Diagnostics", description: `${counts.errors} errors, ${counts.warnings} warnings, ${counts.information} info`, icon: "issues", command: "workbench.action.problems.focus", group: "summary" },
    { label: "Refresh", icon: "refresh", command: "gopdsdk.refreshWorkspaceView", group: "actions" },
    ...actions,
  ];
}
