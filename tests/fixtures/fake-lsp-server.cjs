"use strict";

const scenario = process.argv[2] || "valid";
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
      if (scenario === "malformed") process.stdout.write("Wrong: 2\r\n\r\n{}");
      else send({ jsonrpc: "2.0", id: message.id, result: initializeResult() });
    } else if (message.method === "shutdown") {
      send({ jsonrpc: "2.0", id: message.id, result: null });
    } else if (message.method === "exit") {
      process.exit(0);
    }
  }
});
