import {
  attachable,
  fileExtension,
  mediaTypeFor,
  nameFor,
  safeFilename,
} from "@faridalms/domain/file";
import { lookup } from "node:dns/promises";
import { createReadStream } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

/** Why a link could not be brought in, as the code the reader is given. */
export type LinkRefusal =
  | "media.link_address"
  | "media.link_unavailable"
  | "media.link_too_large"
  | "media.link_type"
  | "media.link_slow";

export class LinkError extends Error {
  constructor(public readonly code: LinkRefusal) {
    super(code);
  }
}

const v4 = (address: string) =>
  address.split(".").reduce((value, part) => value * 256 + Number(part), 0);

/** IPv4 blocks no request from the server may reach, as `[first address, prefix length]`. */
const PRIVATE_V4: readonly [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  // Link-local, where cloud metadata services answer (169.254.169.254).
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function privateV4(address: string): boolean {
  const value = v4(address);
  return PRIVATE_V4.some(([first, bits]) => {
    const size = 2 ** (32 - bits);
    const start = v4(first);
    return value >= start && value < start + size;
  });
}

/** An IPv6 address as its eight 16-bit groups, with an IPv4 tail read as two. */
function groupsOf(address: string): number[] | null {
  let text = address.toLowerCase().split("%")[0] ?? "";
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)?.[1];
  if (tail) {
    const value = v4(tail);
    text = `${text.slice(0, -tail.length)}${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  }
  const [head = "", rest] = text.split("::");
  const front = head ? head.split(":") : [];
  const back = rest === undefined ? [] : rest ? rest.split(":") : [];
  const missing = 8 - front.length - back.length;
  if (rest === undefined ? missing !== 0 : missing < 0) return null;
  const groups = [...front, ...Array<string>(missing).fill("0"), ...back].map(
    (group) => Number.parseInt(group, 16),
  );
  return groups.length === 8 && groups.every((group) => group >= 0)
    ? groups
    : null;
}

const embeddedV4 = (groups: number[], from: number) =>
  [
    (groups[from] ?? 0) >> 8,
    (groups[from] ?? 0) & 0xff,
    (groups[from + 1] ?? 0) >> 8,
    (groups[from + 1] ?? 0) & 0xff,
  ].join(".");

function privateV6(address: string): boolean {
  const groups = groupsOf(address);
  if (!groups) return true;
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = groups;
  const leadingZeroes = a === 0 && b === 0 && c === 0 && d === 0 && e === 0;
  // Unspecified, loopback and the retired IPv4-compatible form.
  if (leadingZeroes && f === 0) return true;
  // IPv4-mapped: judged as the IPv4 address it carries.
  if (leadingZeroes && f === 0xffff) return privateV4(embeddedV4(groups, 6));
  // NAT64 carries an IPv4 address in its last 32 bits.
  if (a === 0x64 && b === 0xff9b && c === 0 && d === 0 && e === 0 && f === 0)
    return privateV4(embeddedV4(groups, 6));
  // 6to4 carries one in its second and third groups.
  if (a === 0x2002) return privateV4(embeddedV4(groups, 1));
  return (
    (a & 0xfe00) === 0xfc00 || // unique local, where some clouds keep metadata
    (a & 0xffc0) === 0xfe80 || // link-local
    (a & 0xffc0) === 0xfec0 || // site-local
    (a & 0xff00) === 0xff00 || // multicast
    (a === 0x2001 && b === 0) || // Teredo, an IPv4 address in disguise
    (a === 0x2001 && b === 0x0db8) || // documentation
    (a === 0x0100 && b === 0 && c === 0 && d === 0) // discard
  );
}

/**
 * Whether an address is one a request from the server must never reach:
 * the server itself, the school's private network, link-local and
 * metadata services, and addresses set aside for no one.
 */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address.split("%")[0] ?? "");
  if (family === 4) return privateV4(address);
  if (family === 6) return privateV6(address);
  return true;
}

/**
 * Whether an address names the server or a private network outright, by a
 * literal address or a local name, before any lookup is made.
 */
export function namesPrivateHost(link: URL): boolean {
  const host = link.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  return isIP(host) !== 0 && isPrivateAddress(host);
}

/** The ports a link may name; a service on any other is not for the web. */
const PORTS = new Set(["", "80", "443"]);

export type Resolve = (host: string) => Promise<string[]>;

const resolveHost: Resolve = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map(
    (answer) => answer.address,
  );

/**
 * Where a link may be fetched from: an http or https address on the
 * standard ports, without credentials, whose host resolves only to public
 * addresses. Answers the address to connect to, so the request goes where
 * the check looked rather than wherever a second lookup points.
 */
export async function publicTarget(
  link: URL,
  resolve: Resolve = resolveHost,
): Promise<string> {
  if (
    (link.protocol !== "http:" && link.protocol !== "https:") ||
    link.username ||
    link.password ||
    !PORTS.has(link.port)
  )
    throw new LinkError("media.link_address");
  const host = link.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  if (isIP(host)) addresses = [host];
  else {
    try {
      addresses = await resolve(host);
    } catch {
      throw new LinkError("media.link_unavailable");
    }
  }
  const [first] = addresses;
  if (!first || addresses.some(isPrivateAddress))
    throw new LinkError("media.link_address");
  return first;
}

/** The name a fetched file is kept under: its own, or one its type gives it. */
export function linkedName(
  link: URL,
  disposition: string | null,
  mediaType: string,
): string | null {
  const given =
    /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? "")?.[1] ??
    /filename="?([^";]+)"?/i.exec(disposition ?? "")?.[1] ??
    link.pathname.split("/").findLast(Boolean) ??
    "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(given);
  } catch {
    decoded = given;
  }
  const name = safeFilename(decoded || link.hostname);
  if (attachable(name) && mediaTypeFor(name)) return name;
  const extension = fileExtension(name);
  const stem = extension ? name.slice(0, -extension.length - 1) : name;
  const named = nameFor(stem || "file", mediaType.split(";")[0]?.trim() ?? "");
  return named && attachable(named) ? named : null;
}

export interface FetchedLink {
  name: string;
  mediaType: string;
  sizeBytes: number;
  /** The bytes, read back from where they were set down as they came. */
  body: () => ReadableStream<Uint8Array>;
  /** Removes the bytes, once they are taken or refused. */
  discard: () => Promise<void>;
}

/**
 * Sets an answer's bytes down on disk as they come, so a large file never
 * sits whole in memory, and stops past `maxBytes`.
 */
async function spool(
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ path: string; size: number; discard: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "farida-link-"));
  const discard = () => rm(dir, { recursive: true, force: true });
  const path = join(dir, "body");
  const handle = await open(path, "w");
  let size = 0;
  try {
    for await (const chunk of body) {
      size += chunk.byteLength;
      if (size > maxBytes) throw new LinkError("media.link_too_large");
      await handle.write(chunk);
    }
  } catch (error) {
    await handle.close();
    await discard();
    if (error instanceof LinkError) throw error;
    throw new LinkError(
      signal.aborted ? "media.link_slow" : "media.link_unavailable",
    );
  }
  await handle.close();
  return { path, size, discard };
}

const REDIRECTS = 5;

/**
 * Fetches a file from the web for the school, as a browser would but with
 * none of the server's reach: each address, the first and every redirect,
 * is checked before it is asked, the request is pinned to the address the
 * check approved, and the answer is cut off past `timeoutMs` or the most
 * `maxBytes` allows a file of its type. The bytes are still to be checked
 * as any upload is, and discarded by the caller once they have been.
 */
export async function fetchLink(
  url: string,
  limits: { maxBytes: (mediaType: string) => number; timeoutMs: number },
  resolve: Resolve = resolveHost,
): Promise<FetchedLink> {
  const signal = AbortSignal.timeout(limits.timeoutMs);
  let link = new URL(url);
  for (let hop = 0; hop <= REDIRECTS; hop += 1) {
    const address = await publicTarget(link, resolve);
    const pinned = new URL(link);
    pinned.hostname = address.includes(":") ? `[${address}]` : address;
    let response: Response;
    try {
      response = await fetch(pinned, {
        redirect: "manual",
        signal,
        headers: {
          host: link.host,
          accept: "*/*",
          "user-agent": "FaridaLMS-MediaImport/1.0",
        },
        ...(link.protocol === "https:"
          ? { tls: { serverName: link.hostname } }
          : {}),
      });
    } catch {
      throw new LinkError(
        signal.aborted ? "media.link_slow" : "media.link_unavailable",
      );
    }
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      link = new URL(location, link);
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new LinkError("media.link_unavailable");
    }
    const given = response.headers.get("content-type") ?? "";
    const name = linkedName(
      link,
      response.headers.get("content-disposition"),
      given,
    );
    if (!name) {
      await response.body.cancel();
      throw new LinkError("media.link_type");
    }
    const mediaType = mediaTypeFor(name) ?? given;
    const most = limits.maxBytes(mediaType);
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > most) {
      await response.body.cancel();
      throw new LinkError("media.link_too_large");
    }
    const kept = await spool(response.body, most, signal);
    if (kept.size === 0) {
      await kept.discard();
      throw new LinkError("media.link_unavailable");
    }
    return {
      name,
      mediaType,
      sizeBytes: kept.size,
      body: () =>
        Readable.toWeb(
          createReadStream(kept.path),
        ) as unknown as ReadableStream<Uint8Array>,
      discard: kept.discard,
    };
  }
  throw new LinkError("media.link_unavailable");
}
