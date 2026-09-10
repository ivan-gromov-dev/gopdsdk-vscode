import { spawn } from "node:child_process";

export const supportedAnalyzerProtocol = "v1";

const maximumMessageBytes = 1024 * 1024;

export type ProbeFailure = "spawn" | "exit" | "timeout" | "protocol" | "incompatible";

export class ServerProbeError extends Error {
  constructor(readonly failure: ProbeFailure, message: string) {
    super(message);
    this.name = "ServerProbeError";
  }
}

export interface ServerProbeOptions {
  command: string;
  args: readonly string[];
  cwd?: string;
  timeoutMs?: number;
}

export interface ServerProbeResult {
  analyzerProtocol: string;
}

interface JsonRpcResponse {
  id?: number;
  result?: unknown;
  error?: unknown;
}

export class LspFrameDecoder {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): JsonRpcResponse[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > maximumMessageBytes) {
      throw new ServerProbeError("protocol", "gopdsdk returned an oversized LSP response.");
    }

    const messages: JsonRpcResponse[] = [];
    for (;;) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return messages;
      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const match = /^Content-Length:\s*(\d+)$/im.exec(header);
      if (!match?.[1]) throw new ServerProbeError("protocol", "gopdsdk returned a malformed LSP response.");
      const length = Number(match[1]);
      if (!Number.isSafeInteger(length) || length < 0 || length > maximumMessageBytes) {
        throw new ServerProbeError("protocol", "gopdsdk returned an invalid LSP response length.");
      }
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + length) return messages;
      const body = this.buffer.subarray(bodyStart, bodyStart + length);
      this.buffer = this.buffer.subarray(bodyStart + length);
      try {
        messages.push(JSON.parse(body.toString("utf8")) as JsonRpcResponse);
      } catch {
        throw new ServerProbeError("protocol", "gopdsdk returned invalid LSP JSON.");
      }
    }
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

export function validateInitializeResult(value: unknown): ServerProbeResult {
  const result = object(value);
  const serverInfo = object(result?.serverInfo);
  const analyzerProtocol = typeof serverInfo?.version === "string" ? serverInfo.version : "";
  if (serverInfo?.name !== "gopdsdk analyzer" || !/^v\d+$/.test(analyzerProtocol)) {
    throw new ServerProbeError(
      "incompatible",
      "The selected executable is not a compatible gopdsdk language server. Update gopdsdk or select another executable.",
    );
  }
  if (analyzerProtocol !== supportedAnalyzerProtocol) {
    throw new ServerProbeError(
      "incompatible",
      `gopdsdk uses analyzer protocol ${analyzerProtocol}; this extension requires ${supportedAnalyzerProtocol}. Update gopdsdk or select a compatible executable.`,
    );
  }

  const capabilities = object(result?.capabilities);
  const diagnostics = object(capabilities?.diagnosticProvider);
  const codeActions = object(capabilities?.codeActionProvider);
  const actionKinds = Array.isArray(codeActions?.codeActionKinds) ? codeActions.codeActionKinds : [];
  if (!capabilities?.textDocumentSync || diagnostics?.identifier !== "gopdsdk" || !actionKinds.includes("quickfix")) {
    throw new ServerProbeError(
      "incompatible",
      "The selected gopdsdk does not provide the required diagnostics and safe-fix LSP capabilities. Update gopdsdk.",
    );
  }
  return { analyzerProtocol };
}

function frame(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"), body]);
}

export function probeServer(options: ServerProbeOptions): Promise<ServerProbeResult> {
  const timeoutMs = options.timeoutMs ?? 5000;
  return new Promise((resolve, reject) => {
    const child = spawn(options.command, [...options.args], {
      cwd: options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const decoder = new LspFrameDecoder();
    let result: ServerProbeResult | undefined;
    let settled = false;
    let shutdownSent = false;

    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.removeAllListeners();
      child.stderr.removeAllListeners();
      if (error) reject(error);
      else if (result) resolve(result);
      else reject(new ServerProbeError("exit", "gopdsdk exited before completing its compatibility probe. Check gopdsdk.arguments and update gopdsdk."));
    };
    const stop = (error: Error): void => {
      child.kill();
      finish(error);
    };
    const timer = setTimeout(() => {
      stop(new ServerProbeError("timeout", `gopdsdk did not answer the LSP compatibility probe within ${timeoutMs} ms.`));
    }, timeoutMs);

    child.once("error", () => {
      finish(new ServerProbeError("spawn", "The selected gopdsdk executable could not be started. Check gopdsdk.executable."));
    });
    child.once("exit", (code) => {
      if (result && shutdownSent && code === 0) finish();
      else finish(new ServerProbeError("exit", "gopdsdk exited before completing its compatibility probe. Check gopdsdk.arguments and update gopdsdk."));
    });
    child.stderr.on("data", () => {
      // Probe stderr may contain workspace paths or environment data. Never copy it to extension logs.
    });
    child.stdin.on("error", () => {
      // Process exit/error handlers provide the stable, redacted failure.
    });
    child.stdout.on("data", (chunk: Buffer) => {
      try {
        for (const message of decoder.push(chunk)) {
          if (message.id === 1) {
            if (message.error) throw new ServerProbeError("protocol", "gopdsdk rejected the LSP initialize request.");
            result = validateInitializeResult(message.result);
            shutdownSent = true;
            child.stdin.write(frame({ jsonrpc: "2.0", id: 2, method: "shutdown", params: null }));
          } else if (message.id === 2 && shutdownSent) {
            if (message.error) throw new ServerProbeError("protocol", "gopdsdk rejected the LSP shutdown request.");
            child.stdin.end(frame({ jsonrpc: "2.0", method: "exit", params: null }));
          }
        }
      } catch (error: unknown) {
        stop(error instanceof Error ? error : new ServerProbeError("protocol", "gopdsdk returned an invalid LSP response."));
      }
    });
    child.stdin.write(frame({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { processId: null, clientInfo: { name: "gopdsdk-vscode-probe" }, capabilities: {}, rootUri: null },
    }));
  });
}
