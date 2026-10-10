import { describe, expect, it } from "vitest";

import type { Reply, Send } from "./upload";

import { RETRY_WAITS, transfer } from "./upload";

const fine: Reply = { status: 204, code: null, part: null };
const file = new Blob([new Uint8Array(25)]);

/** A server that answers from a script, keeping what it was sent. */
function server(script: (call: number, url: string) => Reply | "dropped") {
  const calls: { method: string; url: string; bytes: number }[] = [];
  const send: Send = (method, url, body, onProgress) => {
    calls.push({ method, url, bytes: body?.size ?? 0 });
    const answer = script(calls.length - 1, url);
    if (answer === "dropped") return Promise.reject(new Error("file.failed"));
    onProgress(body?.size ?? 0);
    return Promise.resolve(answer);
  };
  const waits: number[] = [];
  const wait = (ms: number) => {
    waits.push(ms);
    return Promise.resolve();
  };
  return { calls, waits, send, wait };
}

describe("sending a file", () => {
  it("sends a small file in one piece", async () => {
    const { calls, send, wait } = server(() => fine);
    await transfer({ url: "/files/1", file, partBytes: 100, send, wait });
    expect(calls).toEqual([{ method: "PUT", url: "/files/1", bytes: 25 }]);
  });

  it("sends a large file in parts, then asks for them to be joined", async () => {
    const { calls, send, wait } = server(() => fine);
    const progress: number[] = [];
    await transfer(
      { url: "/files/1", file, partBytes: 10, send, wait },
      { onProgress: (share) => progress.push(share) },
    );
    expect(calls).toEqual([
      { method: "PUT", url: "/files/1/parts/0", bytes: 10 },
      { method: "PUT", url: "/files/1/parts/1", bytes: 10 },
      { method: "PUT", url: "/files/1/parts/2", bytes: 5 },
      { method: "POST", url: "/files/1/parts", bytes: 0 },
    ]);
    expect(progress.at(-1)).toBe(1);
    expect(progress).toEqual(progress.toSorted((a, b) => a - b));
  });

  it("sends a part the network dropped again, and only that part", async () => {
    const { calls, waits, send, wait } = server((call) =>
      call === 1 || call === 2 ? "dropped" : fine,
    );
    await transfer({ url: "/files/1", file, partBytes: 10, send, wait });
    expect(calls.map((call) => call.url)).toEqual([
      "/files/1/parts/0",
      "/files/1/parts/1",
      "/files/1/parts/1",
      "/files/1/parts/1",
      "/files/1/parts/2",
      "/files/1/parts",
    ]);
    expect(waits).toEqual(RETRY_WAITS.slice(0, 2));
  });

  it("tries a busy proxy again but takes the server's refusal as final", async () => {
    const busy = server((call) =>
      call === 0 ? { status: 502, code: null, part: null } : fine,
    );
    await transfer({ url: "/files/1", file, send: busy.send, wait: busy.wait });
    expect(busy.calls).toHaveLength(2);

    const refusing = server(() => ({
      status: 422,
      code: "file.infected",
      part: null,
    }));
    await expect(
      transfer({
        url: "/files/1",
        file,
        send: refusing.send,
        wait: refusing.wait,
      }),
    ).rejects.toThrow("file.infected");
    expect(refusing.calls).toHaveLength(1);
  });

  it("gives up when the network stays down", async () => {
    const { calls, send, wait } = server(() => "dropped");
    await expect(
      transfer({ url: "/files/1", file, send, wait }),
    ).rejects.toThrow("file.failed");
    expect(calls).toHaveLength(RETRY_WAITS.length + 1);
  });

  it("sends a part the server did not keep, then asks again", async () => {
    let asked = 0;
    const { calls, send, wait } = server((_call, url) => {
      if (!url.endsWith("/parts")) return fine;
      asked += 1;
      return asked === 1
        ? { status: 409, code: "file.part_missing", part: 1 }
        : { status: 200, code: null, part: null };
    });
    await transfer({ url: "/files/1", file, partBytes: 10, send, wait });
    expect(calls.slice(3).map((call) => call.url)).toEqual([
      "/files/1/parts",
      "/files/1/parts/1",
      "/files/1/parts",
    ]);
  });

  it("stops at once when the upload is called off", async () => {
    const stop = new AbortController();
    const { calls, send, wait } = server((call) => {
      if (call === 0) stop.abort();
      return fine;
    });
    await expect(
      transfer(
        { url: "/files/1", file, partBytes: 10, send, wait },
        { signal: stop.signal },
      ),
    ).rejects.toThrow("file.aborted");
    expect(calls).toHaveLength(1);
  });
});
