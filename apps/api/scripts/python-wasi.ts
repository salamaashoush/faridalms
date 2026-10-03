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

const VERSION = "3.14.7";
const SOURCE = `https://github.com/brettcannon/cpython-wasi-build/releases/download/v${VERSION}/python-${VERSION}-wasi_sdk-24.zip`;
const SHA256 =
  "2e064d3fb8172471d39d741348efa722349c40b96301f69968dff714999c584b";
const OUT = new URL("../vendor/python/", import.meta.url).pathname;
const STAMP = join(OUT, "VERSION");

if (existsSync(STAMP) && readFileSync(STAMP, "utf8").trim() === VERSION)
  process.exit(0);

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`${SOURCE} answered ${response.status}`);
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
