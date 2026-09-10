# gopdsdk for Visual Studio Code

Thin Visual Studio Code integration for the `gopdsdk` analyzer. The extension
runs `gopdsdk lsp` beside `gopls` and presents Playdate-specific diagnostics,
rule help, related locations, and safe quick fixes.

`gopls` continues to own completion, navigation, formatting, refactoring, and
general Go diagnostics. This extension contains no analysis rules: `gopdsdk`
remains the single source of truth.

## Status

This repository contains the initial TypeScript client scaffold. It starts the
language server for Go workspaces and provides restart and output commands.
Before startup it discovers the executable, performs a bounded LSP handshake,
and requires analyzer protocol `v1` with diagnostics and safe-fix capabilities.
Complete analyzer configuration, editor-host tests, and release automation are
tracked in [ROADMAP.md](ROADMAP.md).

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
- `gopdsdk: Show Language Server Output`

Build a local VSIX with `npm run package`.

Unit tests live under `tests/unit`. Process-integration tests under
`tests/integration` exercise executable discovery against the real filesystem
on Windows, macOS, and Linux in CI. Extension Host coverage remains part of the
diagnostic UX milestone because it requires a real VS Code instance and LSP
fixture.

## Configuration

| Setting | Default | Meaning |
| --- | --- | --- |
| `gopdsdk.executable` | empty | Optional executable name on `PATH` or path. An empty value searches each workspace's `tools` and `bin` directories, then `PATH`. |
| `gopdsdk.arguments` | `["lsp"]` | Language-server arguments. |
| `gopdsdk.trace.server` | `off` | LSP traffic trace level. |

## Architecture

```text
VS Code Go files
    |-- gopls         general Go language services
    `-- gopdsdk lsp  Playdate diagnostics and safe fixes
```

## License

MIT. See [LICENSE](LICENSE).
