/**
 * Builds a throwaway cell and directory, seeds them, runs Playwright against
 * the production build, and drops both databases however the run ends.
 */
import { openOwner } from "@faridalms/database/context";
import { localKek } from "@faridalms/database/crypto";
import { registerTenants } from "@faridalms/database/directory/seed";
import { migrate } from "@faridalms/database/migrate";
import {
  createCellDatabase,
  createDirectoryDatabase,
  dropDatabase,
  LOGIN_ROLES,
  provisionRoles,
} from "@faridalms/database/provision";
import { seedCell } from "@faridalms/database/seed";
import { SQL } from "bun";
import { randomBytes } from "node:crypto";

const adminUrl =
  process.env.DATABASE_ADMIN_URL ??
  "postgres://farida:farida@127.0.0.1:5433/postgres";
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const cellName = `cell_e2e_${suffix}`;
const directoryName = `directory_e2e_${suffix}`;
const password =
  process.env.CELL_ROLE_PASSWORD ?? randomBytes(24).toString("hex");
const kek = randomBytes(32);
const cellId = "eg-1";
const webPort = "3200";
const apiPort = "3201";
const collabPort = "3202";

const urlFor = (name: string, role?: string) => {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  if (role) {
    url.username = role;
    url.password = password;
  }
  return url.toString();
};

const admin = new SQL(adminUrl);
let exitCode = 1;
try {
  await provisionRoles(
    admin,
    Object.fromEntries(LOGIN_ROLES.map((role) => [role, password])),
  );
  await createCellDatabase(admin, cellName);
  await createDirectoryDatabase(admin, directoryName);
  await migrate(urlFor(cellName), { folder: "drizzle", owner: "cell_owner" });
  await migrate(urlFor(directoryName), {
    folder: "drizzle-directory",
    owner: "directory_owner",
  });
  const owner = openOwner(urlFor(cellName));
  const directory = new SQL(urlFor(directoryName, "directory_admin"));
  try {
    const tenants = await seedCell(owner, {
      kek: localKek(new Uint8Array(kek), `local:${cellId}`),
      cell: cellId,
    });
    await registerTenants(directory, tenants, {
      id: cellId,
      appHost: "localhost",
      apiBaseUrl: `http://127.0.0.1:${apiPort}`,
    });
  } finally {
    await owner.close();
    await directory.close();
  }
  const runner = Bun.spawn(
    [
      "bun",
      "run",
      "playwright",
      "test",
      "--config=playwright.config.ts",
      ...process.argv.slice(2),
    ],
    {
      env: {
        ...process.env,
        CELL_APP_URL: urlFor(cellName, "app"),
        CELL_SITE_URL: urlFor(cellName, "site"),
        CELL_WORKER_URL: urlFor(cellName, "worker"),
        CELL_RETENTION_URL: urlFor(cellName, "retention"),
        CELL_COLLAB_URL: urlFor(cellName, "collab"),
        DIRECTORY_URL: urlFor(directoryName, "directory_reader"),
        DIRECTORY_SYNC_URL: urlFor(directoryName, "directory_sync"),
        // Every *.localhost name reaches the gate's servers on loopback.
        PORTAL_DOMAIN: "localhost",
        SITES_DOMAIN: "site.localhost",
        CELL_ID: cellId,
        CELL_KEK: kek.toString("base64"),
        CELL_SECRET: randomBytes(32).toString("base64"),
        E2E_WEB_PORT: webPort,
        E2E_API_PORT: apiPort,
        E2E_COLLAB_PORT: collabPort,
      },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  process.on("SIGINT", () => runner.kill("SIGINT"));
  process.on("SIGTERM", () => runner.kill("SIGTERM"));
  exitCode = await runner.exited;
} finally {
  await dropDatabase(admin, cellName);
  await dropDatabase(admin, directoryName);
  await admin.close();
}
process.exit(exitCode);
