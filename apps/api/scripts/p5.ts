/**
 * Fetches p5.js, the drawing library a web project may load, into
 * apps/api/vendor/p5: the file as published in the `p5` package, pinned by
 * version and checksum, with its licence beside it. The files host serves
 * it unchanged, so a student's sketch reaches no other server for it.
 *
 *   bun apps/api/scripts/p5.ts
 *
 * Install runs it, and it does nothing when the pinned version is there.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const VERSION = "2.3.4";
const SOURCE = `https://cdn.jsdelivr.net/npm/p5@${VERSION}`;
const FILES = [
  {
    from: "lib/p5.min.js",
    to: "p5.min.js",
    sha256: "bb8b82b97fcbcd5bb2d5475d1b6a3904f3ab4ed01b821134fd8f1e7710fce559",
  },
  {
    from: "license.txt",
    to: "LICENSE.txt",
    sha256: "eb2f25f8f165d5f20682c1ce7e99ce69144ecfd80fbed8c17dfd327ecd8b6cb6",
  },
];
const OUT = new URL("../vendor/p5/", import.meta.url).pathname;
const STAMP = join(OUT, "VERSION");

if (existsSync(STAMP) && readFileSync(STAMP, "utf8").trim() === VERSION)
  process.exit(0);

const fetched = await Promise.all(
  FILES.map(async (file) => {
    const response = await fetch(`${SOURCE}/${file.from}`);
    if (!response.ok)
      throw new Error(`${SOURCE}/${file.from} answered ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const sum = createHash("sha256").update(bytes).digest("hex");
    if (sum !== file.sha256)
      throw new Error(`p5 ${VERSION}: ${file.from} hashes to ${sum}`);
    return { to: file.to, bytes };
  }),
);

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await Promise.all(
  fetched.map((file) => writeFile(join(OUT, file.to), file.bytes)),
);
await writeFile(STAMP, `${VERSION}\n`);
console.log(`p5.js ${VERSION} in ${OUT}`);
