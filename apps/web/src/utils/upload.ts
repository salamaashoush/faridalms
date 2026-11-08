/** What the server said to one request of an upload. */
export interface Reply {
  status: number;
  /** The server's code for a refusal, such as `file.infected`. */
  code: string | null;
  /** The part an upload was found to be missing. */
  part: number | null;
}

/** Sends one request of an upload; rejects only when the network failed. */
export type Send = (
  method: "PUT" | "POST",
  url: string,
  body: Blob | null,
  onProgress: (sentBytes: number) => void,
) => Promise<Reply>;

export interface TransferOptions {
  signal?: AbortSignal | undefined;
  /** How much has been sent, from 0 to 1. */
  onProgress?: ((progress: number) => void) | undefined;
}

/** How long to wait before each new try of a request the network dropped. */
export const RETRY_WAITS = [1000, 2000, 4000, 8000, 16_000];

/** Answers a proxy or a busy server gives that a later try may not. */
const PASSING = new Set([408, 429, 500, 502, 503, 504]);

const ok = (reply: Reply) => reply.status >= 200 && reply.status < 300;
const refused = (reply: Reply) => new Error(reply.code ?? "file.failed");

/**
 * Sends a file to `url`. A file larger than `partBytes` goes in parts of
 * that size, each to `url/parts/n`, and is joined by a last request to
 * `url/parts`; a part the network drops is sent again after a wait, so a
 * poor connection costs one part and not the upload. A refusal rejects with
 * the server's code.
 */
export async function transfer(
  input: {
    url: string;
    file: Blob;
    partBytes?: number | undefined;
    send: Send;
    /** Waits before a new try; rejects when the upload is called off. */
    wait: (ms: number) => Promise<void>;
    /** Parts the server already holds, from an upload begun before a reload. */
    held?: ReadonlySet<number> | undefined;
  },
  options: TransferOptions = {},
): Promise<void> {
  const { url, file, send, wait } = input;
  const held = input.held ?? new Set<number>();
  const size = file.size;
  const report = (sent: number) =>
    options.onProgress?.(size > 0 ? Math.min(1, sent / size) : 1);
  const persistent = async (
    method: "PUT" | "POST",
    target: string,
    body: Blob | null,
    before: number,
    tries = 0,
  ): Promise<Reply> => {
    if (options.signal?.aborted) throw new Error("file.aborted");
    const again = async () => {
      const delay = RETRY_WAITS[tries];
      if (delay === undefined) return null;
      await wait(delay);
      return persistent(method, target, body, before, tries + 1);
    };
    let reply: Reply;
    try {
      reply = await send(method, target, body, (sent) => report(before + sent));
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "file.failed")
        throw error;
      const retried = await again();
      if (!retried) throw error;
      return retried;
    }
    // A refusal with a code is the server's answer; only a bare failure
    // on the way is worth another try.
    if (PASSING.has(reply.status) && reply.code === null)
      return (await again()) ?? reply;
    return reply;
  };

  if (!input.partBytes || size <= input.partBytes) {
    const reply = await persistent("PUT", url, file, 0);
    if (!ok(reply)) throw refused(reply);
    return;
  }
  const partBytes = input.partBytes;
  const count = Math.ceil(size / partBytes);
  const sendPart = async (part: number) => {
    const from = part * partBytes;
    const reply = await persistent(
      "PUT",
      `${url}/parts/${part}`,
      file.slice(from, from + partBytes),
      from,
    );
    if (!ok(reply)) throw refused(reply);
  };
  const sendFrom = async (part: number): Promise<void> => {
    if (part >= count) return;
    if (held.has(part)) {
      report(Math.min(size, (part + 1) * partBytes));
      return sendFrom(part + 1);
    }
    await sendPart(part);
    await sendFrom(part + 1);
  };
  await sendFrom(0);
  // The server names a part it did not keep; each may be asked for once.
  const finish = async (asked: number): Promise<void> => {
    const reply = await persistent("POST", `${url}/parts`, null, size);
    if (ok(reply)) return;
    if (
      reply.code !== "file.part_missing" ||
      reply.part === null ||
      reply.part >= count ||
      asked >= count
    )
      throw refused(reply);
    await sendPart(reply.part);
    await finish(asked + 1);
  };
  await finish(0);
}

/**
 * One request with XMLHttpRequest, the one browser API that reports upload
 * progress.
 */
function exchange(mediaType: string, signal: AbortSignal | undefined): Send {
  return (method, url, body, onProgress) =>
    new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open(method, url);
      if (body) request.setRequestHeader("content-type", mediaType);
      request.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) onProgress(event.loaded);
      });
      request.addEventListener("load", () => {
        let code: string | null = null;
        let part: number | null = null;
        try {
          const answer = JSON.parse(request.responseText) as {
            code?: unknown;
            part?: unknown;
          };
          if (typeof answer.code === "string") code = answer.code;
          if (typeof answer.part === "number") part = answer.part;
        } catch {
          // Nothing to read, or the proxy answered with other than our JSON.
        }
        resolve({ status: request.status, code, part });
      });
      request.addEventListener("error", () => reject(new Error("file.failed")));
      request.addEventListener("abort", () =>
        reject(new Error("file.aborted")),
      );
      signal?.addEventListener("abort", () => request.abort());
      request.send(body);
    });
}

/**
 * Waits before a new try, or until the browser is back on the network when
 * it had gone off it, whichever is later; rejects when the upload is called
 * off.
 */
function pause(signal: AbortSignal | undefined) {
  return (ms: number) =>
    new Promise<void>((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timer);
        window.removeEventListener("online", back);
        reject(new Error("file.aborted"));
      };
      const done = () => {
        signal?.removeEventListener("abort", cancel);
        resolve();
      };
      const back = () => setTimeout(done, 500);
      const timer = setTimeout(() => {
        if (navigator.onLine) done();
        else window.addEventListener("online", back, { once: true });
      }, ms);
      signal?.addEventListener("abort", cancel, { once: true });
    });
}

/** How far an upload begun before a reload had got, as the server says. */
export type UploadState =
  | { state: "initiated"; parts: number[] }
  | { state: "ready" }
  | { state: "gone" };

/**
 * Asks the server how far an upload got: the parts it holds while it
 * waits, that it is already in, or that it is gone, as an upload left
 * for a day is.
 */
export async function uploadState(url: string): Promise<UploadState> {
  const response = await fetch(`${url}/parts`, {
    headers: { accept: "application/json" },
  });
  if (response.status === 404) return { state: "gone" };
  if (!response.ok) throw new Error("file.failed");
  const answer = (await response.json()) as {
    state?: unknown;
    parts?: unknown;
  };
  if (answer.state === "ready") return { state: "ready" };
  return {
    state: "initiated",
    parts: Array.isArray(answer.parts)
      ? answer.parts.filter((part): part is number => typeof part === "number")
      : [],
  };
}

/**
 * Sends a file from the browser; a refusal rejects with the server's code,
 * such as `file.infected`, so the caller can say why.
 */
export function sendFile(
  url: string,
  file: Blob,
  mediaType: string,
  options: TransferOptions = {},
  partBytes?: number,
  held?: ReadonlySet<number>,
): Promise<void> {
  return transfer(
    {
      url,
      file,
      partBytes,
      held,
      send: exchange(mediaType, options.signal),
      wait: pause(options.signal),
    },
    options,
  );
}
