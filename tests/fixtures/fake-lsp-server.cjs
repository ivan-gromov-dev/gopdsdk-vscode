"use strict";

const fs = require("node:fs");

const scenario = process.argv[2] || "valid";
const reliabilityLog = process.argv[3];
const crashMarker = process.argv[4];
let changeCount = 0;

function record(event, fields = {}) {
  if (!reliabilityLog) return;
  fs.appendFileSync(reliabilityLog, `${JSON.stringify({ event, time: Date.now(), pid: process.pid, ...fields })}\n`);
}
if (scenario === "crash") {
  process.stderr.write("TOKEN=must-not-leak\n");
  process.exit(7);
}
if (scenario === "clean-exit") process.exit(0);

let input = Buffer.alloc(0);

function send(message) {
  const body = Buffer.from(JSON.stringify(message));
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function publish(document) {
  send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: diagnostic(document.uri, document.version) });
  record("diagnostic", { uri: document.uri, version: document.version });
}

function initializeResult() {
  const result = {
    serverInfo: { name: "gopdsdk analyzer", version: scenario === "old" ? "v0" : "v1" },
    capabilities: {
      textDocumentSync: { openClose: true, change: 1 },
      diagnosticProvider: { identifier: "gopdsdk" },
      codeActionProvider: { codeActionKinds: scenario === "incompatible" ? [] : ["quickfix"] },
    },
  };
  return result;
}

function diagnostic(uri, version) {
  return {
    uri, version, diagnostics: [{
      range: { start: { line: 1, character: 0 }, end: { line: 1, character: 2 } },
      severity: 2, code: "fixture-rule", codeDescription: { href: "https://example.invalid/rules/fixture-rule" },
      source: "gopdsdk", message: `fixture diagnostic${version === undefined ? "" : ` v${version}`}`,
      relatedInformation: [{ location: { uri, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } } }, message: "related declaration" }],
      data: { rule: "fixture-rule", target: "device" },
    }],
  };
}

process.stdin.on("data", (chunk) => {
  if (scenario === "timeout") return;
  input = Buffer.concat([input, chunk]);
  for (;;) {
    const headerEnd = input.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const match = /^Content-Length:\s*(\d+)$/im.exec(input.subarray(0, headerEnd).toString("ascii"));
    if (!match) process.exit(8);
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    if (input.length < bodyStart + length) return;
    const message = JSON.parse(input.subarray(bodyStart, bodyStart + length).toString("utf8"));
    input = input.subarray(bodyStart + length);
    if (message.method === "initialize") {
      record("initialize");
      if (scenario === "malformed") process.stdout.write("Wrong: 2\r\n\r\n{}");
      else send({ jsonrpc: "2.0", id: message.id, result: initializeResult() });
    } else if (message.method === "shutdown") {
      send({ jsonrpc: "2.0", id: message.id, result: null });
    } else if ((scenario === "diagnostic-ux" || scenario === "reliability") && message.method === "textDocument/didOpen") {
      const document = message.params.textDocument;
      publish(document);
    } else if ((scenario === "diagnostic-ux" || scenario === "reliability") && message.method === "textDocument/didChange") {
      const document = message.params.textDocument;
      changeCount++;
      if (scenario === "reliability" && changeCount === 1 && crashMarker && !fs.existsSync(crashMarker)) {
        fs.writeFileSync(crashMarker, "crashed\n");
        record("crash", { version: document.version });
        process.exit(71);
      }
      publish(document);
      if (document.version > 1) setTimeout(() => {
        send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: diagnostic(document.uri, document.version - 1) });
      }, 75);
    } else if ((scenario === "diagnostic-ux" || scenario === "reliability") && message.method === "textDocument/didClose") {
      send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri: message.params.textDocument.uri, diagnostics: [] } });
    } else if ((scenario === "diagnostic-ux" || scenario === "reliability") && message.method === "textDocument/diagnostic") {
      send({ jsonrpc: "2.0", id: message.id, result: { kind: "full", items: diagnostic(message.params.textDocument.uri).diagnostics } });
    } else if ((scenario === "diagnostic-ux" || scenario === "reliability") && message.method === "textDocument/codeAction") {
      const uri = message.params.textDocument.uri;
      const sourceDiagnostic = diagnostic(uri).diagnostics[0];
      send({ jsonrpc: "2.0", id: message.id, result: [
        { title: "Apply analyzer safe fix", kind: "quickfix", diagnostics: [sourceDiagnostic], edit: { changes: { [uri]: [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 2 } }, newText: "var fixed = true" }] } } },
        { title: "Unsafe command", kind: "quickfix", diagnostics: [sourceDiagnostic], command: { title: "unsafe", command: "fixture.unsafe" } },
        { title: "Unrelated refactor", kind: "refactor", edit: { changes: {} } },
      ] });
    } else if ((scenario === "diagnostic-ux" || scenario === "reliability") && message.method === "gopdsdk/ruleHelp") {
      send({ jsonrpc: "2.0", id: message.id, result: { rule: { id: "fixture-rule", family: "fixture", summary: "fixture summary", defaultSeverity: "warning", confidence: "proven", safeFixPolicy: "replace fixture safely" }, documentation: "https://example.invalid/rules/fixture-rule" } });
    } else if (message.method === "$/cancelRequest") {
      record("cancel", { id: message.params?.id });
    } else if (message.method === "exit") {
      record("exit");
      process.exit(0);
    }
  }
});
