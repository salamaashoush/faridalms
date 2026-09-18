import { createControlDatabase } from "@faridalms/database/control";

import { createApp } from "./app";
import { env } from "./env";
import { DiskFileStore } from "./files/store";
import { TenantPools } from "./tenancy";

const control = createControlDatabase(env.CONTROL_DATABASE_URL);
const pools = new TenantPools(env.MAX_TENANT_POOLS, env.TENANT_POOL_SIZE);
const files = new DiskFileStore(env.FILE_STORAGE_DIR);
const server = Bun.serve({
  port: env.API_PORT,
  // Uploads stream through the raw file route; everything else stays small.
  maxRequestBodySize: env.MAX_UPLOAD_BYTES + 1024 * 1024,
  fetch: createApp({
    control,
    pools,
    files,
    maxUploadBytes: env.MAX_UPLOAD_BYTES,
  }),
});
console.info(`Farida LMS API listening on port ${server.port}`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await server.stop();
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
