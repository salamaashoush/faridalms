import { createControlDatabase } from "@faridalms/database/control";

import { createApp } from "./app";
import { env } from "./env";
import { TenantPools } from "./tenancy";

const control = createControlDatabase(env.CONTROL_DATABASE_URL);
const pools = new TenantPools(env.MAX_TENANT_POOLS, env.TENANT_POOL_SIZE);
const server = Bun.serve({
  port: env.API_PORT,
  maxRequestBodySize: 1024 * 1024,
  fetch: createApp({ control, pools }),
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
