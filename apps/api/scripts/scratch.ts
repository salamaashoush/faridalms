/**
 * Fetches what the files host serves the coding studio from, into
 * apps/api/vendor/scratch: the Scratch editor as published in
 * `@scratch/scratch-gui`, pinned by version and checksum, and every sprite,
 * costume, backdrop and sound its library offers, so a running studio never
 * asks Scratch's servers for one. The studio serves the editor's bundle as it
 * is, so the package is unpacked here rather than installed with the
 * gigabyte of packages it was built from.
 *
 *   bun apps/api/scripts/scratch.ts
 *
 * Install runs it. It does nothing when the pinned editor is there, and
 * fetches only the library files that are missing.
 *
 * Scratch's asset service publishes no rate limits and answers from a CDN
 * cache; four requests at a time, backing off on 429, 5xx and a dropped
 * connection (honouring Retry-After), keeps this a polite one-off.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

const VERSION = "15.2.0";
const EDITOR = `https://registry.npmjs.org/@scratch/scratch-gui/-/scratch-gui-${VERSION}.tgz`;
const SHA512 =
  "ZjKknkK6Suh0qtfCgaKNUt2Ilz/j6pWdTn6+Brrb2NLn8iXviccLfiSezAFvXqFqWaOMjac0sMfe8JpKkkOPTg==";
const ASSETS = "https://cdn.assets.scratch.mit.edu/internalapi/asset";
const OUT = new URL("../vendor/scratch/", import.meta.url).pathname;
const STAMP = join(OUT, "VERSION");
const editor = join(OUT, "editor");
const library = join(OUT, "library");
const CONCURRENCY = 4;
const ATTEMPTS = 5;

async function fetchEditor(): Promise<void> {
  if (existsSync(STAMP) && readFileSync(STAMP, "utf8").trim() === VERSION)
    return;
  const response = await fetch(EDITOR);
  if (!response.ok) throw new Error(`${EDITOR} answered ${response.status}`);
  const tarball = new Uint8Array(await response.arrayBuffer());
  const sum = createHash("sha512").update(tarball).digest("base64");
  if (sum !== SHA512)
    throw new Error(`scratch-gui ${VERSION}: the tarball hashes to ${sum}`);

  const unpacked = join(OUT, "package");
  await rm(STAMP, { force: true });
  await rm(editor, { recursive: true, force: true });
  await rm(unpacked, { recursive: true, force: true });
  // The page loads the standalone bundle. Its source maps double the size,
  // and the other bundle and the type declarations are for building on the
  // editor as a package.
  await new Bun.Archive(tarball).extract(OUT, {
    glob: [
      "package/dist/**",
      "!**/*.map",
      "!package/dist/types/**",
      "!package/dist/scratch-gui.js*",
    ],
  });
  await rename(join(unpacked, "dist"), editor);
  await rm(unpacked, { recursive: true, force: true });
  await writeFile(STAMP, `${VERSION}\n`);
  console.log(`scratch-gui ${VERSION} in ${editor}`);
}

interface Asset {
  md5ext?: string;
  assetId?: string;
  dataFormat?: string;
}
interface Item extends Asset {
  costumes?: Asset[];
  sounds?: Asset[];
}

const fileOf = (asset: Asset) =>
  asset.md5ext ??
  (asset.assetId && asset.dataFormat
    ? `${asset.assetId}.${asset.dataFormat}`
    : null);

/** Every file the editor's library names, each named by its MD5. */
async function libraryFiles(): Promise<string[]> {
  const files = new Set<string>();
  for (const name of ["backdrops", "costumes", "sounds", "sprites"]) {
    const items = JSON.parse(
      await readFile(join(editor, "libraries", `${name}.json`), "utf8"),
    ) as Item[];
    for (const item of items)
      for (const asset of [
        item,
        ...(item.costumes ?? []),
        ...(item.sounds ?? []),
      ]) {
        const file = fileOf(asset);
        if (file && /^[0-9a-f]{32}\.[a-z0-9]+$/.test(file)) files.add(file);
      }
  }
  return [...files].toSorted();
}

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Keeps a file only when its bytes match the MD5 it is named by. */
async function fetchOne(file: string): Promise<void> {
  const target = join(library, file);
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${ASSETS}/${file}/get/`).catch(() => null);
    if (response?.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      const md5 = createHash("md5").update(bytes).digest("hex");
      if (md5 !== file.slice(0, 32))
        throw new Error(`${file}: the bytes hash to ${md5}`);
      await writeFile(`${target}.part`, bytes);
      await rename(`${target}.part`, target);
      return;
    }
    const retry =
      !response || response.status === 429 || response.status >= 500;
    if (!retry || attempt === ATTEMPTS)
      throw new Error(
        `${file}: ${response ? `HTTP ${response.status}` : "no answer"}`,
      );
    const after = Number(response?.headers.get("retry-after"));
    await pause(
      Number.isFinite(after) && after > 0 ? after * 1000 : 2 ** attempt * 500,
    );
  }
}

async function fetchLibrary(): Promise<void> {
  await mkdir(library, { recursive: true });
  const present = new Set(await readdir(library));
  const missing = (await libraryFiles()).filter((file) => !present.has(file));
  if (!missing.length) return;
  let next = 0;
  let done = 0;
  const failed: string[] = [];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < missing.length) {
        const file = missing[next++];
        if (!file) break;
        try {
          await fetchOne(file);
        } catch (error) {
          failed.push(error instanceof Error ? error.message : String(error));
        }
        done += 1;
        if (done % 100 === 0) console.log(`${done} of ${missing.length}`);
      }
    }),
  );
  if (failed.length) throw new Error(failed.join("\n"));
  console.log(`scratch library: ${missing.length} files into ${library}`);
}

await fetchEditor();
await fetchLibrary();
