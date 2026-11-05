/**
 * Fetches the Python the API marks code exercises with: CPython built for
 * WASI by one of its core developers, pinned by version and checksum, into
 * apps/api/vendor/python. It runs as WebAssembly with nothing but the memory
 * and files it is handed, so a student's program reaches no file, network
 * or process of the server.
 *
 *   bun apps/api/scripts/python-wasi.ts
 *
 * Install runs it, and it does nothing when the pinned version is there.
 */
import { unzipSync } from "fflate";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { download } from "./download";

const VERSION = "3.15.2";
const WASI_SDK = 33;
const SOURCE = `https://github.com/brettcannon/cpython-wasi-build/releases/download/v${VERSION}/python-${VERSION}-wasi_sdk-${WASI_SDK}.zip`;
const SHA256 =
  "b8a63559c56760bbdc310dedb74fd69d10bcbafae26b705bea0ad353ad256888";
const OUT = new URL("../vendor/python/", import.meta.url).pathname;
const STAMP = join(OUT, "VERSION");

if (existsSync(STAMP) && readFileSync(STAMP, "utf8").trim() === VERSION)
  process.exit(0);

const response = await download(SOURCE);
const zip = new Uint8Array(await response.arrayBuffer());
const sum = createHash("sha256").update(zip).digest("hex");
if (sum !== SHA256)
  throw new Error(`python ${VERSION}: the zip hashes to ${sum}`);

await rm(OUT, { recursive: true, force: true });
for (const [name, bytes] of Object.entries(unzipSync(zip))) {
  // Compiled caches are rebuilt from the sources and only add weight.
  if (name.endsWith("/") || name.includes("__pycache__/")) continue;
  const target = join(OUT, name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
await writeFile(STAMP, `${VERSION}\n`);
console.log(`python ${VERSION} for WASI in ${OUT}`);
