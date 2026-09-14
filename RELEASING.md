# Releasing

Publishing is a separate, explicitly authorized operation. Preparing or tagging
a release does not authorize a Marketplace upload.

## Version channels

The Marketplace accepts only `major.minor.patch` extension versions. Never
reuse a version between pre-release and stable channels. Use `preview: true`
for pre-releases and `preview: false` for stable releases.

## Gates

1. Start from the exact clean commit intended for release.
2. Run `npm ci`, `npm test`, `npm run test:extension`, and
   `npm run test:reliability` on the supported desktop matrix.
3. Confirm minimum and current stable VS Code Extension Host jobs pass and the
   supported/current analyzer protocol fixtures pass.
4. Run `npm run package`, inspect `vsce ls`, install the VSIX into a disposable
   profile, then smoke activation, diagnostics, rule help, safe fixes, restart,
   upgrade, downgrade, and uninstall. Label this editor-integration evidence.
5. Review `CHANGELOG.md`, `PRIVACY.md`, `SUPPORT.md`, `SECURITY.md`, the icon,
   and real product screenshots. Do not publish synthetic UI as evidence.
6. Verify the SPDX SBOM and GitHub provenance attestation for the exact VSIX.

## Publication

Run the `Package Marketplace VSIX` workflow manually with `pre-release` first.
Download the resulting `gopdsdk-pre-release-<run-id>` artifact, verify its
attestations and SBOM, then upload the VSIX through the publisher management
page. CI never holds Marketplace credentials and never publishes automatically.

After Marketplace installation and upgrade checks succeed, increment to a
distinct stable version, set `preview` to `false`, repeat every gate, run the
workflow with `stable`, and manually upload that stable VSIX.

Record the Marketplace URL, immutable commit, VSIX SHA-256, CI run, attestation,
tested VS Code and `gopdsdk` versions, and platform-specific manual smoke results
in the release notes. Do not claim SDK, Simulator, USB, or physical-device
evidence from editor tests.
