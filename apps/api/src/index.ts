import { createControlDatabase } from "@faridalms/database/control";

import { createApp } from "./app";
import { env } from "./env";
import { createScanner } from "./files/scan";
import { DiskFileStore } from "./files/store";
import { FileSweeper } from "./files/sweep";
import { createProvider } from "./notifications/providers";
import { NotificationWorker } from "./notifications/worker";
import { TenantPools } from "./tenancy";

const control = createControlDatabase(env.CONTROL_DATABASE_URL);
const pools = new TenantPools(env.MAX_TENANT_POOLS, env.TENANT_POOL_SIZE);
const files = new DiskFileStore(env.FILE_STORAGE_DIR);
const worker = new NotificationWorker(
  control,
  pools,
  {
    email: createProvider(env.EMAIL_PROVIDER_URL, env.EMAIL_PROVIDER_TOKEN),
    sms: createProvider(env.SMS_PROVIDER_URL, env.SMS_PROVIDER_TOKEN),
  },
  env.NOTIFICATION_POLL_MS,
  env.NOTIFICATION_RETRY_BASE_MS,
);
worker.start();
const scanner = createScanner(env.CLAMD_ADDRESS);
const sweeper = new FileSweeper(control, pools, files, env.FILE_SWEEP_MS);
sweeper.start();
const server = Bun.serve({
  port: env.API_PORT,
  // Uploads stream through the raw file route; everything else stays small.
  maxRequestBodySize: env.MAX_UPLOAD_BYTES + 1024 * 1024,
  fetch: createApp({
    control,
    pools,
    files,
    scanner,
    maxUploadBytes: env.MAX_UPLOAD_BYTES,
  }),
});
console.info(`Farida LMS API listening on port ${server.port}`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await server.stop();
  await worker.stop();
  await sweeper.stop();
  await pools.close();
  await control.$client.close();
  process.exit(0);
}
process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
