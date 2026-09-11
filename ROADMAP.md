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
- [x] guarded pre-release and stable Marketplace packaging workflow;
- [x] install, upgrade, downgrade, and uninstall checks plus minimum/current VS
  Code and analyzer-protocol compatibility matrices;
- [ ] capture real product screenshots and complete reviewed pre-release, then
  stable Marketplace publication.

The 256×256 Marketplace icon is a mechanically resized copy of the canonical
gopdsdk logo. Synthetic UI is not accepted as product evidence. Publishing
remains an explicit manual operation after a distinct version/channel validation
step; CI contains no Marketplace credential.

Exit criterion: VS Code, GoLand, and CLI expose equivalent rule identifiers,
diagnostics, and safe fixes without analysis rules in editor clients.

## M6 — Simulator workflow

Status: planned. This is the next functional scope after Marketplace
pre-release validation.

- build the active application for Simulator;
- build and launch it in Playdate Simulator;
- expose the active Simulator/device analysis target in the status bar;
- contribute cancellable VS Code tasks with visible progress and output;
- convert structured build failures with source locations into VS Code
  diagnostics;
- offer focused build/run actions from the command palette and Playdate view.

The client must invoke `gopdsdk build` and `gopdsdk run`; it must not reproduce
build plans, SDK discovery, packaging, or launch policy. Initial delivery may
use terminal-backed tasks. Rich progress, artifact discovery, and reliable
build diagnostics require a stable machine-readable CLI result from gopdsdk.

Verification: Extension Host coverage with deterministic command fixtures,
plus manual SDK-integration smoke tests that build and launch an external game
in the official Simulator on every claimed host platform.

## M7 — Project health and creation

Status: planned.

- present gopdsdk, analyzer-protocol, Playdate SDK, Simulator, device-toolchain,
  USB connection, module, manifest, and analyzer-configuration readiness in one
  Project Health surface;
- attach focused remediation actions to failed checks;
- create a new game through a guided wrapper around `gopdsdk init`, then open
  the generated workspace and offer its first Simulator run;
- keep raw troubleshooting output available for support.

The health view consumes `gopdsdk doctor` and the relevant `gopdsdk probe`
commands. A stable structured doctor/probe report is required before the view
may classify individual checks or attach remediation actions; parsing prose is
not an accepted integration contract. The project wizard may ship against the
existing structured command arguments, provided success and the created path
can be identified without parsing incidental log text.

Verification: unit and Extension Host tests for every health state and wizard
cancel/failure path; SDK, Simulator, USB, and device readiness claims require
their corresponding external evidence rather than fixture results.

## M8 — Analyzer configuration UX

Status: planned.

- select the analysis target and profile without opening raw settings;
- browse rules by category, inspect exact-version help, enable or exclude rules,
  and override severities;
- add an inline suppression with a required reason from a diagnostic;
- create, update, inspect, and validate adoption baselines;
- compare shared, Simulator, and device findings for the same workspace.

The extension may edit `.gopdsdk-check.json` and analyzer-owned suppression
comments, but it must not embed rule semantics or maintain a second rule
catalog. Rule browsing requires an analyzer-provided versioned catalog API.
Baseline creation and update require an owned gopdsdk operation with a stable
schema and deterministic stale-entry behavior. Existing LSP configuration,
diagnostics, rule help, and safe edits remain the source of truth.

Verification: round-trip configuration fixtures, stale-document rejection,
multi-root isolation, and parity with equivalent `gopdsdk check` results.

## M9 — Device workflow and logs

Status: planned after the Simulator workflow.

- show explicit device connection state without treating executable discovery
  as connectivity;
- build, install, and run the active application on a connected Playdate;
- expose `crashlog` and `errorlog` in read-only editor documents;
- report build, connection, deployment, and launch as distinct progress stages;
- offer log inspection after a failed run only through an explicit user action
  or opt-in setting.

The client delegates to `gopdsdk build device`, `gopdsdk run device`,
`gopdsdk probe connection`, `gopdsdk crashlog`, and `gopdsdk errorlog`.
Reliable connection state, staged progress, and typed failures require stable
machine-readable command results from gopdsdk. Device logs remain user-requested
evidence and must not be read silently by activation or background polling.

Verification: command-fixture and cancellation coverage first, followed by
separately labeled device-build, USB, and physical-device acceptance. Simulator
or Extension Host tests do not establish device readiness.

## M10 — Playdate workspace view

Status: planned after the underlying actions are stable.

Add a Playdate activity-bar view that summarizes the active project, selected
target, gopdsdk and Playdate SDK versions, health state, device connection,
build/run actions, logs, and diagnostic counts. The view is a projection of the
M6–M9 contracts, not an independent implementation of discovery, analysis, or
device behavior.

Verification: multi-root selection, refresh, accessibility, empty/loading/error
states, command routing, and consistency with the status bar and Problems view.

## Required gopdsdk contracts

The first terminal-backed Simulator build/run slice and a basic `gopdsdk init`
wizard can be implemented with the current CLI. The complete roadmap requires
compatible additions to gopdsdk before the corresponding rich UI is considered
stable:

- versioned JSON results for build, run, doctor, Simulator/device probes, USB
  connection, device deployment, and log retrieval;
- structured source locations, artifact paths, typed failure categories, and
  cancellable progress events where those concepts apply;
- a versioned analyzer rule-catalog endpoint rather than a catalog copied into
  the extension;
- deterministic baseline create/update/validate operations;
- explicit capability negotiation so older gopdsdk releases degrade to the
  supported subset instead of being parsed heuristically.

These are tooling-contract additions, not changes to the native public
`playdate` API. Each new contract must be implemented and versioned in gopdsdk
before the VS Code client depends on it.
