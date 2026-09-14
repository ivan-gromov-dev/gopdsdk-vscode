# Changelog

All notable changes to the gopdsdk Visual Studio Code extension are documented
here. The project uses distinct patch versions for Marketplace pre-release and
stable builds because the Marketplace does not accept SemVer pre-release labels.

## Unreleased

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
