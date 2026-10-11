import { openCell } from "@faridalms/database/context";
import { localKek } from "@faridalms/database/crypto";
import {
  openDirectory,
  openDirectorySync,
} from "@faridalms/database/directory/client";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "./app";
import { createJavaScriptRunner, createPythonRunner } from "./coding/run";
import { createKeyRing } from "./core/keys";
import { env } from "./env";
import { createFilesHost, linkKey } from "./files/links";
import { createMakeCode } from "./files/makecode";
import { createScanner } from "./files/scan";
import { DiskFileStore, PUBLIC_KEY, S3FileStore } from "./files/store";
import { createStudio } from "./files/studio";
import { startFileUpkeep } from "./files/upkeep";
import { streamLinkKey } from "./media/streams";
import { createProvider } from "./notifications/providers";
import { startDelivery } from "./notifications/scheduler";

const cell = openCell(
  {
    app: env.CELL_APP_URL,
    site: env.CELL_SITE_URL,
    worker: env.CELL_WORKER_URL,
    retention: env.CELL_RETENTION_URL,
  },
  env.CELL_POOL_SIZE,
);
const directory = openDirectory(env.DIRECTORY_URL);
const kek = localKek(
  new Uint8Array(Buffer.from(env.CELL_KEK, "base64")),
  `local:${env.CELL_ID}`,
);
function bucket(name: string | undefined) {
  return new Bun.S3Client({
    bucket: name,
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  });
}
const stores =
  env.FILE_STORAGE === "s3"
    ? {
        files: new S3FileStore(bucket(env.FILE_BUCKET)),
        publicMedia: new S3FileStore(
          bucket(env.PUBLIC_MEDIA_BUCKET),
          PUBLIC_KEY,
        ),
      }
    : {
        files: new DiskFileStore(env.FILE_STORAGE_DIR),
        publicMedia: new DiskFileStore(
          join(env.FILE_STORAGE_DIR, "public-media"),
          PUBLIC_KEY,
        ),
      };
const cellSecret = new Uint8Array(Buffer.from(env.CELL_SECRET, "base64"));
const filesPort = env.FILES_PORT ?? env.API_PORT + 2;
const filesOrigin = (
  env.FILES_ORIGIN ?? `http://127.0.0.1:${filesPort}`
).replace(/\/$/, "");
const filesServer = Bun.serve({
  port: filesPort,
  fetch: createFilesHost({
    files: stores.files,
    key: linkKey(cellSecret),
    origin: filesOrigin,
    libraries: fileURLToPath(new URL("../vendor", import.meta.url)),
    studio: createStudio({
      page: fileURLToPath(new URL("../studio", import.meta.url)),
      scratch:
        env.SCRATCH_DIR ??
        fileURLToPath(new URL("../vendor/scratch", import.meta.url)),
      sourceUrl: env.SOURCE_URL ?? null,
    }),
    makecode: createMakeCode({
      editor:
        env.MAKECODE_DIR ??
        fileURLToPath(new URL("../vendor/makecode/editor", import.meta.url)),
    }),
  }),
});
const gateways = {
  email: createProvider(env.EMAIL_WEBHOOK_URL, env.NOTIFY_WEBHOOK_TOKEN),
  sms: createProvider(env.SMS_WEBHOOK_URL, env.NOTIFY_WEBHOOK_TOKEN),
};
const server = Bun.serve({
  port: env.API_PORT,
  // Uploads stream through the raw file route; everything else stays small.
  maxRequestBodySize: env.MAX_UPLOAD_BYTES + 1024 * 1024,
  fetch: createApp({
    cell,
    directory,
    keys: createKeyRing(kek, env.CELL_ID),
    cellId: env.CELL_ID,
    cellSecret,
    ...stores,
    filesOrigin,
    linkKey: linkKey(cellSecret),
    mediaOrigin: env.MEDIA_ORIGIN?.replace(/\/$/, "") ?? null,
    mediaCaptions:
      env.MEDIA_ORIGIN !== undefined && env.MEDIA_CAPTIONS === "on",
    streamLinkKey: streamLinkKey(cellSecret),
    scanner: createScanner(env.CLAMD_ADDRESS),
    runners: {
      python: createPythonRunner(
        env.PYTHON_DIR ?? join(process.cwd(), "vendor", "python"),
      ),
      javascript: createJavaScriptRunner(),
    },
    maxUploadBytes: env.MAX_UPLOAD_BYTES,
    channels: {
      email: Boolean(env.EMAIL_WEBHOOK_URL),
      sms: Boolean(env.SMS_WEBHOOK_URL),
    },
    mail: gateways.email,
  }),
});
console.info(
  `Farida LMS API listening on port ${server.port}, files on ${filesServer.port}`,
);

const stopDelivery =
  env.CELL_WORKER_URL && (gateways.email || gateways.sms)
    ? startDelivery({
        cell,
        directory,
        cellId: env.CELL_ID,
        gateways,
        intervalMs: 30_000,
      })
    : null;

const directorySync = env.DIRECTORY_SYNC_URL
  ? openDirectorySync(env.DIRECTORY_SYNC_URL)
  : null;
// Sweeps and reports write as the worker, so they run only where it can log in.
const stopUpkeep = env.CELL_WORKER_URL
  ? startFileUpkeep({
      cell,
      directory,
      sync: directorySync,
      cellId: env.CELL_ID,
      store: stores.files,
      sweepMs: env.FILE_SWEEP_MS,
      reportMs: env.USAGE_REPORT_MS,
    })
  : null;

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await server.stop();
  await filesServer.stop();
  await stopDelivery?.();
  await stopUpkeep?.();
  await directorySync?.close();
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
