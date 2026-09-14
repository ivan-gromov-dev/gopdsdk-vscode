# Changelog

## 1.1.0 — 2026-09-14

- add explicit Data Disk mount and safe-eject commands to the command palette
  and Playdate Workspace view;
- track Data Disk as a distinct device state and return to connected only after
  the CLI confirms USB reconnection;
- require the versioned `gopdsdk-device-disk/v1` tooling contract.

All notable changes to the gopdsdk Visual Studio Code extension are documented
here. The project uses distinct patch versions for Marketplace pre-release and
stable builds because the Marketplace does not accept SemVer pre-release labels.

## Unreleased

## 1.0.2 — 2026-09-14

- make physical connection optional for Workspace and Project Health refresh,
  require installed toolchain components instead, and project per-workspace
  `unchecked`, `checking`, `connected`, `disconnected`, or `error` state after
  an explicit connection check or device run;

## 1.0.1 — 2026-09-14

- remove the CLI-only `shared` target from editor settings and selectors, and
  normalize stale persisted values to `both`;
- replace the static Playdate action list with an accessible workspace summary
  for the selected root, target, compatible analyzer protocol, Playdate SDK,
  project health, explicit USB connection, and Problems-view diagnostic counts;
- add explicit refresh and multi-root selection while retaining focused
  Simulator, device, analyzer, health, and user-requested log actions;
- add unit coverage for empty, loading, ready, and error states plus action
  routing, and Extension Host registration coverage for the new commands;
  fixture evidence does not establish SDK, Simulator, USB, or device readiness.

## 0.5.0 — 2026-09-14

- add an explicit USB device-connection status and cancellable device build,
  install, and launch commands with structured progress and typed failures;
- add user-requested `crashlog` and `errorlog` retrieval in read-only virtual
  documents, with explicit log actions offered after failed device runs;
- add strict v1 device-contract fixtures and running-process cancellation
  coverage plus Windows Extension Host command-registration evidence;
  physical-device acceptance remains an external evidence gate;

## 0.4.0 — 2026-09-14

- add repository-backed target/profile configuration and exact-version rule
  browsing with enable, exclude, severity, and help actions;
- add reason-required inline diagnostic suppression with stale-document
  rejection;
- add adoption-baseline create, update, inspect, and validation commands backed
  by the versioned gopdsdk contracts;
- add a structured comparison of shared, Simulator, and device findings with
  folder-local execution for multi-root workspaces;
- allow slow VS Code archive transfers up to two minutes between received
  chunks in Extension Host, reliability, and installation test runners;

The analyzer-administration commands require a `gopdsdk` build that provides
`gopdsdk rules --format json`, `gopdsdk check --format json`, and deterministic
`gopdsdk baseline create|update|validate` using their v1 schemas. These tooling
contracts landed after the `gopdsdk` v1.1.0 tag; release validation must record
the exact compatible `gopdsdk` version or commit. Existing LSP diagnostics and
Simulator workflows remain available independently when their own negotiated
contracts are supported.

## 0.3.0 — 2026-09-14

- add a structured Project Health report, focused remediation, and a guided
  `gopdsdk init` project-creation flow with post-open Simulator launch;

## 0.2.0 — 2026-09-14

- always run shared SDK-contract diagnostics and expose only `simulator`,
  `device`, and `both` as configurable platform targets;
- add cancellable Simulator build/run tasks backed by structured `gopdsdk`
  results and progress events, build diagnostics, target status, and focused
  command-palette and Playdate-view actions;

## 0.1.0 — 2026-09-11

- discover and compatibility-probe `gopdsdk lsp` per workspace folder;
- configure analyzer targets, compatibility floors, rule selection, baselines,
  changed files, severity overrides, and explicit deep analysis;
- display diagnostics, related locations, versioned rule help, and
  analyzer-provided edit-only safe fixes alongside `gopls`;
- recover across configuration, workspace, and server lifecycle changes;
- add cross-platform process, Extension Host, and reliability coverage;
- add reproducible VSIX packaging, SPDX SBOMs, dependency review, and signed
  GitHub build provenance.
