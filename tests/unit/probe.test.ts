import * as assert from "node:assert/strict";
import { test } from "node:test";
import { LspFrameDecoder, ServerProbeError, validateInitializeResult } from "../../src/probe";

function compatibleResult(): Record<string, unknown> {
  return {
    serverInfo: { name: "gopdsdk analyzer", version: "v1" },
    capabilities: {
      textDocumentSync: { openClose: true, change: 1 },
      diagnosticProvider: { identifier: "gopdsdk" },
      codeActionProvider: { codeActionKinds: ["quickfix"] },
    },
  };
}

test("accepts the supported analyzer protocol and capabilities", () => {
  assert.deepEqual(validateInitializeResult(compatibleResult()), { analyzerProtocol: "v1" });
});

test("rejects an old analyzer protocol with an actionable error", () => {
  const result = compatibleResult();
  result.serverInfo = { name: "gopdsdk analyzer", version: "v0" };
  assert.throws(
    () => validateInitializeResult(result),
    (error: unknown) => error instanceof ServerProbeError && error.failure === "incompatible" && error.message.includes("requires v1"),
  );
});

test("rejects a server without safe quick fixes", () => {
  const result = compatibleResult();
  (result.capabilities as Record<string, unknown>).codeActionProvider = { codeActionKinds: [] };
  assert.throws(
    () => validateInitializeResult(result),
    (error: unknown) => error instanceof ServerProbeError && error.message.includes("required diagnostics and safe-fix"),
  );
});

test("decodes an LSP response delivered in multiple chunks", () => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: 1, result: compatibleResult() }));
  const frame = Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
  const decoder = new LspFrameDecoder();
  assert.deepEqual(decoder.push(frame.subarray(0, 12)), []);
  const messages = decoder.push(frame.subarray(12));
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.id, 1);
});

test("rejects malformed LSP framing", () => {
  const decoder = new LspFrameDecoder();
  assert.throws(
    () => decoder.push(Buffer.from("Wrong: 2\r\n\r\n{}")),
    (error: unknown) => error instanceof ServerProbeError && error.failure === "protocol",
  );
});
