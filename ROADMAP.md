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

- expose target, SDK floor, rules/categories, severity, baseline, changed-file
  mode, and explicit deep-analysis opt-in;
- support folder-specific settings in multi-root workspaces;
- update configuration without restart when supported.

Verification: diagnostic parity with equivalent `gopdsdk check` runs.

## M3 — Diagnostic UX

- validate push/pull diagnostics, related locations, and rule help;
- preview and apply only analyzer-provided safe fixes;
- add refresh, restart, and troubleshooting actions;
- verify graceful coexistence with `gopls`.

Verification: Extension Host tests for edit/save/close, stale versions,
clearing, cancellation, quick fixes, and multi-root workspaces.

## M4 — Reliability

- stress rapid edits, folder changes, reloads, and server crashes;
- measure activation, incremental latency, memory, and cancellation on a
  commercially realistic game;
- keep deep analysis off by default until external evidence supports it.

Verification: automated stress sessions and manual smoke checks on all three
desktop platforms, labeled as editor-integration evidence.

## M5 — Distribution

- icons, screenshots, changelog, privacy and support policies;
- signed CI builds, dependency review, SBOM, and VSIX artifacts;
- pre-release, then stable Marketplace publication;
- upgrade/downgrade checks across supported VS Code and gopdsdk versions.

Exit criterion: VS Code, GoLand, and CLI expose equivalent rule identifiers,
diagnostics, and safe fixes without analysis rules in editor clients.

## Later IDE tooling

Build, Simulator/device run, logs, deployment, and debugging are separate
features using structured gopdsdk CLI contracts and separate evidence gates.
