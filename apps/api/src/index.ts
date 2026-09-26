import { openCell } from "@faridalms/database/context";
import { localKek } from "@faridalms/database/crypto";
import { openDirectory } from "@faridalms/database/directory/client";

import { createApp } from "./app";
import { createKeyRing } from "./core/keys";
import { env } from "./env";
import { createScanner } from "./files/scan";
import { DiskFileStore } from "./files/store";

const cell = openCell(
  { app: env.CELL_APP_URL, site: env.CELL_SITE_URL },
  env.CELL_POOL_SIZE,
);
const directory = openDirectory(env.DIRECTORY_URL);
const kek = localKek(
  new Uint8Array(Buffer.from(env.CELL_KEK, "base64")),
  `local:${env.CELL_ID}`,
);
const server = Bun.serve({
  port: env.API_PORT,
  // Uploads stream through the raw file route; everything else stays small.
  maxRequestBodySize: env.MAX_UPLOAD_BYTES + 1024 * 1024,
  fetch: createApp({
    cell,
    directory,
    keys: createKeyRing(kek, env.CELL_ID),
    cellId: env.CELL_ID,
    cellSecret: new Uint8Array(Buffer.from(env.CELL_SECRET, "base64")),
    files: new DiskFileStore(env.FILE_STORAGE_DIR),
    scanner: createScanner(env.CLAMD_ADDRESS),
    maxUploadBytes: env.MAX_UPLOAD_BYTES,
  }),
});
console.info(`Farida LMS API listening on port ${server.port}`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await server.stop();
  await cell.close();
  await directory.close();
  process.exit(0);
}
process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
