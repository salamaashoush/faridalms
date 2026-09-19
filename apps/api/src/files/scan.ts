import type { Socket } from "node:net";

import { connect } from "node:net";

export type ScanVerdict = { clean: true } | { clean: false; signature: string };

export interface FileScanner {
  scan(body: ReadableStream<Uint8Array>): Promise<ScanVerdict>;
}

export class ScanUnavailableError extends Error {}

function write(socket: Socket, data: Uint8Array | string) {
  return new Promise<void>((resolve, reject) => {
    const flushed = socket.write(data, (error) => {
      if (error) reject(error);
    });
    if (flushed) resolve();
    else socket.once("drain", resolve);
  });
}

/** The single NUL-terminated line clamd answers a stream with. */
export function parseClamdReply(reply: string): ScanVerdict {
  const line = reply.split("\0")[0]?.trim() ?? "";
  if (line === "stream: OK") return { clean: true };
  const found = /^stream: (.+) FOUND$/.exec(line);
  if (found?.[1]) return { clean: false, signature: found[1] };
  throw new ScanUnavailableError(line || "empty reply");
}

/**
 * clamd's INSTREAM command over TCP: the command, then chunks each prefixed
 * with a four-byte big-endian length, then a zero length. clamd's
 * StreamMaxLength must be at least MAX_UPLOAD_BYTES or large files come back
 * as errors, which the upload route treats as the scanner being unavailable.
 */
export class ClamdScanner implements FileScanner {
  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 30_000,
  ) {}

  scan(body: ReadableStream<Uint8Array>): Promise<ScanVerdict> {
    return new Promise((resolve, reject) => {
      const socket = connect(this.port, this.host);
      const reply: Buffer[] = [];
      let settled = false;
      const settle = (outcome: () => void) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        outcome();
      };
      const unavailable = (reason: unknown) =>
        settle(() =>
          reject(
            reason instanceof ScanUnavailableError
              ? reason
              : new ScanUnavailableError(
                  reason instanceof Error ? reason.message : String(reason),
                ),
          ),
        );
      const answer = () => {
        const text = Buffer.concat(reply).toString("utf8");
        try {
          const verdict = parseClamdReply(text);
          settle(() => resolve(verdict));
        } catch (error) {
          unavailable(error);
        }
      };
      socket.setTimeout(this.timeoutMs, () => unavailable("timeout"));
      socket.on("error", unavailable);
      socket.on("data", (chunk: Buffer | string) => {
        const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        reply.push(bytes);
        if (bytes.includes(0)) answer();
      });
      socket.on("end", answer);
      socket.on("connect", () => {
        this.send(socket, body).catch(unavailable);
      });
    });
  }

  private async send(socket: Socket, body: ReadableStream<Uint8Array>) {
    await write(socket, "zINSTREAM\0");
    for await (const chunk of body) {
      if (chunk.byteLength === 0) continue;
      const length = Buffer.alloc(4);
      length.writeUInt32BE(chunk.byteLength);
      await write(socket, length);
      await write(socket, chunk);
    }
    await write(socket, Buffer.alloc(4));
  }
}

/** A scanner for `host:port`, or none when the address is unset. */
export function createScanner(address: string | undefined): FileScanner | null {
  if (!address) return null;
  const separator = address.lastIndexOf(":");
  const host = address.slice(0, separator);
  const port = Number(address.slice(separator + 1));
  if (separator <= 0 || !Number.isInteger(port) || port <= 0)
    throw new Error(`CLAMD_ADDRESS must be host:port, got ${address}`);
  return new ClamdScanner(host, port);
}
