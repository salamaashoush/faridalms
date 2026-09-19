import type { AddressInfo } from "node:net";

import { createServer } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { ClamdScanner, parseClamdReply, ScanUnavailableError } from "./scan";

const EICAR =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

function stream(...parts: string[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts)
        controller.enqueue(new TextEncoder().encode(part));
      controller.close();
    },
  });
}

/** A stand-in clamd that checks the framing and answers like the real one. */
function fakeClamd(answer: (payload: string) => string | null) {
  const server = createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer | string) => {
      buffer = Buffer.concat([
        buffer,
        typeof chunk === "string" ? Buffer.from(chunk) : chunk,
      ]);
      const command = "zINSTREAM\0";
      if (buffer.length < command.length) return;
      expect(buffer.subarray(0, command.length).toString()).toBe(command);
      let offset = command.length;
      const payload: Buffer[] = [];
      while (offset + 4 <= buffer.length) {
        const size = buffer.readUInt32BE(offset);
        if (size === 0) {
          const reply = answer(Buffer.concat(payload).toString());
          if (reply === null) socket.destroy();
          else socket.end(`${reply}\0`);
          return;
        }
        if (offset + 4 + size > buffer.length) return;
        payload.push(buffer.subarray(offset + 4, offset + 4 + size));
        offset += 4 + size;
      }
    });
  });
  return new Promise<{ port: number; close: () => void }>((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({
        port: (server.address() as AddressInfo).port,
        close: () => server.close(),
      }),
    );
  });
}

let close: (() => void) | undefined;
afterEach(() => close?.());

describe("parseClamdReply", () => {
  it("reads clean, infected and error replies", () => {
    expect(parseClamdReply("stream: OK\0")).toEqual({ clean: true });
    expect(parseClamdReply("stream: Eicar-Test-Signature FOUND\0")).toEqual({
      clean: false,
      signature: "Eicar-Test-Signature",
    });
    expect(() =>
      parseClamdReply("INSTREAM size limit exceeded. ERROR\0"),
    ).toThrow(ScanUnavailableError);
  });
});

describe("ClamdScanner", () => {
  it("frames the stream in length-prefixed chunks and reports what clamd found", async () => {
    const server = await fakeClamd((payload) =>
      payload.includes("EICAR")
        ? "stream: Eicar-Test-Signature FOUND"
        : "stream: OK",
    );
    close = server.close;
    const scanner = new ClamdScanner("127.0.0.1", server.port);
    await expect(
      scanner.scan(stream("%PDF-1.4 ", "worksheet")),
    ).resolves.toEqual({
      clean: true,
    });
    await expect(
      scanner.scan(stream(EICAR.slice(0, 20), EICAR.slice(20))),
    ).resolves.toEqual({
      clean: false,
      signature: "Eicar-Test-Signature",
    });
  });

  it("treats a dropped connection or a refused port as unavailable", async () => {
    const server = await fakeClamd(() => null);
    close = server.close;
    await expect(
      new ClamdScanner("127.0.0.1", server.port).scan(stream("text")),
    ).rejects.toBeInstanceOf(ScanUnavailableError);
    await expect(
      new ClamdScanner("127.0.0.1", 1).scan(stream("text")),
    ).rejects.toBeInstanceOf(ScanUnavailableError);
  });
});
