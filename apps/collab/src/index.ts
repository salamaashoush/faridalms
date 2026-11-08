import { openCollab } from "@faridalms/database/context";

import { env } from "./env";
import { createCollab, serve } from "./server";

const collab = openCollab(env.CELL_COLLAB_URL);
const cellSecret = new Uint8Array(Buffer.from(env.CELL_SECRET, "base64"));
const hocuspocus = createCollab({ collab, cellSecret });
const server = serve(hocuspocus, env.COLLAB_PORT, cellSecret);
console.info(`Farida LMS collaboration listening on port ${server.port}`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await server.stop();
  hocuspocus.closeConnections();
  await collab.close();
  process.exit(0);
}
process.on("SIGTERM", () => {
  void shutdown();
});
process.on("SIGINT", () => {
  void shutdown();
});
