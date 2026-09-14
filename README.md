# gopdsdk for Visual Studio Code

Thin Visual Studio Code integration for `gopdsdk`. The extension runs
`gopdsdk lsp` beside `gopls`, presents Playdate-specific diagnostics and safe
quick fixes, and drives Simulator and physical-device workflows through the CLI.

`gopls` continues to own completion, navigation, formatting, refactoring, and
general Go diagnostics. This extension contains no analysis rules: `gopdsdk`
remains the single source of truth.

![gopdsdk extension icon](assets/icon.png)

## Status

This repository contains the TypeScript client. It starts the language server
for Go workspaces and provides diagnostic refresh, restart, rule-help,
troubleshooting, and Simulator workflow commands. Cancellable `gopdsdk` tasks
show structured build progress; compiler source locations are published in the
Problems view. The status bar shows the active analysis target, and the
Playdate activity view summarizes the selected workspace root, target,
compatible analyzer protocol, installed toolchain health, optional last-checked
USB state, and gopdsdk
diagnostic counts while providing focused build, run, log, health, project, and
analyzer actions. It supports explicit multi-root selection and refresh. The
analyzer UX
uses the installed binary's exact-version catalog and structured check and
baseline contracts; the extension does not carry a second rule catalog.
Workspace and Project Health refresh never require or automatically probe a
physical device. Device commands verify USB separately from tool discovery,
build/install/launch through structured CLI results, and open crash and error
logs as read-only virtual documents only when explicitly requested.
Explicit commands enter Data Disk mode or safely eject it and wait for the
device to return to the connected USB state.
Before startup it discovers the executable, performs a bounded LSP handshake,
and requires analyzer protocol `v1` with diagnostics and safe-fix capabilities.
Analyzer-provided edit-only quick fixes are accepted; command-based or unrelated
actions are rejected by the client. Release automation is tracked in
[ROADMAP.md](ROADMAP.md).

## Requirements

- Visual Studio Code 1.95 or newer;
- `gopdsdk` with the `lsp` command in a workspace `tools`/`bin` directory or on
  `PATH`, or an explicit `gopdsdk.executable` setting;
- for the 0.4 analyzer-administration commands, a `gopdsdk` build providing the
  v1 rule-catalog, structured-check, and baseline-administration contracts
  documented below (these contracts postdate the `gopdsdk` v1.1.0 tag);
- for the 0.5 device commands, a `gopdsdk` build providing the v1 device build,
  run, connection-probe, progress, and device-log contracts;
- the VS Code Go extension for normal Go language features.

## Development

```text
npm install
npm run compile
npm test
npm run test:reliability
```

Open this repository in VS Code and press `F5`. In the Extension Development
Host, open a Go module that uses gopdsdk. Troubleshooting output is available in
the **gopdsdk** output channel.

Commands:

- `gopdsdk: Restart Language Server`
- `gopdsdk: Refresh Diagnostics`
- `gopdsdk: Show Rule Help`
- `gopdsdk: Troubleshoot`
- `gopdsdk: Show Language Server Output`
- `gopdsdk: Build for Simulator`
- `gopdsdk: Build and Run in Simulator`
- `gopdsdk: Check Device Connection`
- `gopdsdk: Build for Device`
- `gopdsdk: Build, Install, and Run on Device`
- `gopdsdk: Mount Device Data Disk`
- `gopdsdk: Safely Eject Device Data Disk`
- `gopdsdk: Open Device Crash Log`
- `gopdsdk: Open Device Error Log`
- `gopdsdk: Select Analysis Target`
- `gopdsdk: Show Project Health`
- `gopdsdk: Fix Project Health Issue`
- `gopdsdk: Create Playdate Project`
- `gopdsdk: Configure Analyzer Target and Profile`
- `gopdsdk: Browse Analyzer Rules`
- `gopdsdk: Suppress Diagnostic with Reason`
- `gopdsdk: Create Adoption Baseline`
- `gopdsdk: Update Adoption Baseline`
- `gopdsdk: Inspect Adoption Baseline`
- `gopdsdk: Validate Adoption Baseline`
- `gopdsdk: Compare Shared, Simulator, and Device Findings`

Build a local VSIX with `npm run package`.

Release preparation and evidence gates are documented in
[RELEASING.md](RELEASING.md). See [PRIVACY.md](PRIVACY.md),
[SUPPORT.md](SUPPORT.md), and [SECURITY.md](SECURITY.md) before installation or
reporting a problem.

Unit tests live under `tests/unit`. Process-integration tests under
`tests/integration` exercise executable discovery against the real filesystem
on Windows, macOS, and Linux in CI. Extension Host coverage uses a real VS Code
instance and deterministic LSP fixture for multi-root diagnostics, related
locations, rule help, stale versions, and safe quick fixes.
The reliability session uses a 603-file synthetic game workspace and emits a
JSON editor-integration evidence record containing activation time, incremental
crash-recovery latency, RSS growth, and the observed cancellation count. It also
exercises rapid edits, workspace-folder churn, a forced server crash, and queued
server restarts. CI runs both Extension Host suites on all three desktop
platforms; timings are regression guards, not SDK or hardware performance claims.

## Configuration

| Setting                                | Default   | Meaning                                                                                                                          |
| -------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `gopdsdk.executable`                   | empty     | Optional executable name on `PATH` or path. An empty value searches each workspace's `tools` and `bin` directories, then `PATH`. |
| `gopdsdk.arguments`                    | `["lsp"]` | Language-server arguments.                                                                                                       |
| `gopdsdk.target`                       | `both`    | Target (`simulator`, `device`, or `both`); every editor target includes shared SDK-contract analysis.                            |
| `gopdsdk.gopdsdkFloor`                 | empty     | Oldest supported gopdsdk release.                                                                                                |
| `gopdsdk.playdateSDK`                  | empty     | Official Playdate SDK compatibility version.                                                                                     |
| `gopdsdk.rules` / `gopdsdk.categories` | `[]`      | Optional rule or category selection.                                                                                             |
| `gopdsdk.excludeRules`                 | `[]`      | Rules excluded from analysis.                                                                                                    |
| `gopdsdk.severities`                   | `{}`      | Severity overrides keyed by rule or category.                                                                                    |
| `gopdsdk.baseline`                     | empty     | Workspace-relative adoption baseline path.                                                                                       |
| `gopdsdk.changedFiles`                 | `[]`      | Workspace-relative changed files; empty analyzes all files.                                                                      |
| `gopdsdk.deep`                         | `false`   | Explicitly enable higher-cost deep analysis.                                                                                     |
| `gopdsdk.trace.server`                 | `off`     | LSP traffic trace level.                                                                                                         |

Analyzer settings have resource scope, so each folder in a multi-root workspace
gets an independent language-server client. Changes are sent with
`workspace/didChangeConfiguration`; executable and argument changes still
restart the affected clients.

`Configure Analyzer Target and Profile` and the rule browser update the
workspace's `.gopdsdk-check.json`, preserving its other fields. The rule browser
groups the catalog returned by `gopdsdk rules --format json` and can enable or
exclude a rule, set its severity, or open version-matched help. From a gopdsdk
problem, `Suppress Diagnostic with Reason` inserts the analyzer-owned directive
only if the source document has not changed while the reason is entered.
Baseline commands generate a current structured check report and delegate all
creation, replacement, validation, and stale-entry decisions to `gopdsdk`.
If the selected executable does not provide one of these v1 contracts, the
command stops with an actionable compatibility error instead of parsing prose
or guessing a result.

## Architecture

```text
VS Code Go files
    |-- gopls         general Go language services
    `-- gopdsdk lsp  Playdate diagnostics and safe fixes
```

## License

MIT. See [LICENSE](LICENSE).
