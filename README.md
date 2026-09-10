# gopdsdk for Visual Studio Code

Thin Visual Studio Code integration for the `gopdsdk` analyzer. The extension
runs `gopdsdk lsp` beside `gopls` and presents Playdate-specific diagnostics,
rule help, related locations, and safe quick fixes.

`gopls` continues to own completion, navigation, formatting, refactoring, and
general Go diagnostics. This extension contains no analysis rules: `gopdsdk`
remains the single source of truth.

## Status

This repository contains the TypeScript client. It starts the language server
for Go workspaces and provides diagnostic refresh, restart, rule-help,
troubleshooting, and output commands.
Before startup it discovers the executable, performs a bounded LSP handshake,
and requires analyzer protocol `v1` with diagnostics and safe-fix capabilities.
Analyzer-provided edit-only quick fixes are accepted; command-based or unrelated
actions are rejected by the client. Release automation is tracked in
[ROADMAP.md](ROADMAP.md).

## Requirements

- Visual Studio Code 1.95 or newer;
- `gopdsdk` with the `lsp` command in a workspace `tools`/`bin` directory or on
  `PATH`, or an explicit `gopdsdk.executable` setting;
- the VS Code Go extension for normal Go language features.

## Development

```text
npm install
npm run compile
npm test
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

Build a local VSIX with `npm run package`.

Unit tests live under `tests/unit`. Process-integration tests under
`tests/integration` exercise executable discovery against the real filesystem
on Windows, macOS, and Linux in CI. Extension Host coverage uses a real VS Code
instance and deterministic LSP fixture for multi-root diagnostics, related
locations, rule help, stale versions, and safe quick fixes.

## Configuration

| Setting | Default | Meaning |
| --- | --- | --- |
| `gopdsdk.executable` | empty | Optional executable name on `PATH` or path. An empty value searches each workspace's `tools` and `bin` directories, then `PATH`. |
| `gopdsdk.arguments` | `["lsp"]` | Language-server arguments. |
| `gopdsdk.target` | `both` | Analysis target for the workspace folder. |
| `gopdsdk.gopdsdkFloor` | empty | Oldest supported gopdsdk release. |
| `gopdsdk.playdateSDK` | empty | Official Playdate SDK compatibility version. |
| `gopdsdk.rules` / `gopdsdk.categories` | `[]` | Optional rule or category selection. |
| `gopdsdk.excludeRules` | `[]` | Rules excluded from analysis. |
| `gopdsdk.severities` | `{}` | Severity overrides keyed by rule or category. |
| `gopdsdk.baseline` | empty | Workspace-relative adoption baseline path. |
| `gopdsdk.changedFiles` | `[]` | Workspace-relative changed files; empty analyzes all files. |
| `gopdsdk.deep` | `false` | Explicitly enable higher-cost deep analysis. |
| `gopdsdk.trace.server` | `off` | LSP traffic trace level. |

Analyzer settings have resource scope, so each folder in a multi-root workspace
gets an independent language-server client. Changes are sent with
`workspace/didChangeConfiguration`; executable and argument changes still
restart the affected clients.

## Architecture

```text
VS Code Go files
    |-- gopls         general Go language services
    `-- gopdsdk lsp  Playdate diagnostics and safe fixes
```

## License

MIT. See [LICENSE](LICENSE).
