# Privacy

The extension does not collect telemetry, create user accounts, or send source
code to the extension publisher.

It starts the locally configured `gopdsdk lsp` executable and exchanges Language
Server Protocol messages with that local process. Workspace source, paths,
settings, and diagnostics are therefore visible to the executable selected by
the user. Users are responsible for trusting that executable and any behavior it
implements. The extension's output channel avoids printing command arguments,
environment variables, source content, and server standard error during the
compatibility probe.

Visual Studio Code, installed extensions, operating systems, package registries,
and Marketplace services have their own privacy practices outside this project's
control.
