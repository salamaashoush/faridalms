import { unzipSync } from "fflate";

/** The most a package may unpack to, so a small file cannot fill the page's memory. */
const MOST_BYTES = 200 * 1024 * 1024;
const MOST_FILES = 5000;

/** A package's files by their paths, or a lone file as a package of one. */
export function unpackZip(
  name: string,
  bytes: Uint8Array,
): Map<string, Uint8Array> {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let total = 0;
    let count = 0;
    const files = unzipSync(bytes, {
      filter: (entry) => {
        total += entry.originalSize;
        count += 1;
        if (total > MOST_BYTES || count > MOST_FILES)
          throw new Error("too large");
        return !entry.name.endsWith("/");
      },
    });
    return new Map(Object.entries(files));
  }
  return new Map([[name, bytes]]);
}

const decoder = new TextDecoder();

/** A package file read as XML, or none when it is not well formed. */
export function xmlOf(bytes: Uint8Array | undefined): Document | null {
  if (!bytes) return null;
  const document = new DOMParser().parseFromString(
    decoder.decode(bytes),
    "application/xml",
  );
  return document.getElementsByTagName("parsererror").length > 0
    ? null
    : document;
}
