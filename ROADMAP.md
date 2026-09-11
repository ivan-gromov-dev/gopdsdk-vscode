# Development roadmap

This roadmap turns the stable `gopdsdk lsp` editor API into a thin VS Code
client. Building a VSIX is packaging evidence, not live editor evidence.

## M0 — Scaffold

Status: complete; dependency installation and build verification remain.

- TypeScript entry point and build scripts;
- `vscode-languageclient` stdio transport;
- Go document selector, restart command, output channel, and basic settings;
- Extension Development Host configuration.

## M1 — Executable contract

Status: complete; cross-platform CI verification remains.

- [x] discover the executable from an explicit setting, workspace tools, then PATH;
- [x] probe version and LSP capabilities before startup;
- [x] explain missing or incompatible binaries;
- [x] restart cleanly after configuration changes and redact sensitive logs.

Verification: unit and process tests on Windows, macOS, and Linux.

CI runs the build plus both test levels on their applicable platform matrix;
the required `CI Success` job passes only when every preceding job passes.

## M2 — Analyzer configuration

Status: complete; diagnostic parity depends on the selected server honoring the
corresponding analyzer-protocol fields.

- [x] expose target, SDK floor, rules/categories, severity, baseline, changed-file
  mode, and explicit deep-analysis opt-in;
- [x] support folder-specific settings in multi-root workspaces;
- [x] update configuration without restart when supported.

Verification: diagnostic parity with equivalent `gopdsdk check` runs.

## M3 — Diagnostic UX

Status: complete; cross-platform CI confirmation remains.

- [x] validate push/pull diagnostics, related locations, and rule help;
- [x] preview and apply only analyzer-provided safe fixes;
- [x] add refresh, restart, and troubleshooting actions;
- [x] verify graceful coexistence with `gopls`.

Verification: Extension Host tests for edit/save/close, stale versions,
clearing, cancellation, quick fixes, and multi-root workspaces.

The client relies on standard LSP cancellation and document lifecycle handling,
clears its diagnostic collection when VS Code closes a document, and owns no Go
language features. The Extension Host fixture covers multi-root push/pull
diagnostics, related locations, versioned rule help, stale-version rejection,
safe-edit application, and command registration beside any other Go provider.

## M4 — Reliability

Status: complete; cross-platform CI and manual desktop smoke confirmation remain.

- [x] stress rapid edits, folder changes, reloads, and server crashes;
- [x] measure activation, incremental latency, memory, and cancellation on a
  commercially realistic game;
- [x] keep deep analysis off by default until external evidence supports it.

Verification: automated stress sessions and manual smoke checks on all three
desktop platforms, labeled as editor-integration evidence.

The deterministic Extension Host session creates a 603-file, three-module game,
performs 40 rapid edits, forces one analyzer crash and recovery, adds and removes
a workspace folder, and queues six server reloads. It records activation,
incremental recovery, RSS growth, and observed LSP cancellations as structured
editor-integration evidence. CI runs the session on Windows, macOS, and Linux;
manual smoke results must name their host platform and must not be described as
SDK, Simulator, USB, or physical-device evidence.

## M5 — Distribution

Status: implementation complete; real screenshots, hosted attestations, and
Marketplace publication require external release evidence.

- [x] icon, changelog, privacy, security, support, and release policies;
- [x] signed CI provenance, dependency review, SBOM, and minimal VSIX artifacts;
- [x] guarded pre-release and stable Marketplace publication workflow;
- [x] install, upgrade, downgrade, and uninstall checks plus minimum/current VS
  Code and analyzer-protocol compatibility matrices;
- [ ] capture real product screenshots and complete reviewed pre-release, then
  stable Marketplace publication.

The 256×256 Marketplace icon is a mechanically resized copy of the canonical
gopdsdk logo. Synthetic UI is not accepted as product evidence. Publishing
remains an explicit operation gated by the `vscode-marketplace` environment and
a distinct version/channel validation step.

Exit criterion: VS Code, GoLand, and CLI expose equivalent rule identifiers,
diagnostics, and safe fixes without analysis rules in editor clients.

## Later IDE tooling

Build, Simulator/device run, logs, deployment, and debugging are separate
features using structured gopdsdk CLI contracts and separate evidence gates.
