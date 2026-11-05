/**
 * Builds a throwaway cell, directory and business database, seeds them, runs
 * Playwright against the production builds of the portal and the operator
 * console, and drops the databases however the run ends.
 */
import { openOwner } from "@faridalms/database/context";
import { localKek } from "@faridalms/database/crypto";
import { registerTenants } from "@faridalms/database/directory/seed";
import { migrate, MIGRATIONS } from "@faridalms/database/migrate";
import {
  createBusinessDatabase,
  createCellDatabase,
  createDirectoryDatabase,
  dropDatabase,
  LOGIN_ROLES,
  provisionRoles,
} from "@faridalms/database/provision";
import { seedCell } from "@faridalms/database/seed";
import { SQL } from "bun";
import { randomBytes } from "node:crypto";

import { OIDC_CLIENT_ID, startOidcStandIn } from "./e2e-oidc";
import { startResendStandIn } from "./e2e-resend";

const adminUrl =
  process.env.DATABASE_ADMIN_URL ??
  "postgres://farida:farida@127.0.0.1:5433/postgres";
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const cellName = `cell_e2e_${suffix}`;
const directoryName = `directory_e2e_${suffix}`;
const businessName = `business_e2e_${suffix}`;
const password =
  process.env.CELL_ROLE_PASSWORD ?? randomBytes(24).toString("hex");
const kek = randomBytes(32);
const cellId = "eg-1";
const webPort = "3200";
const apiPort = "3201";
const collabPort = "3202";
// Resend's stand-in, which email is sent to and received mail read from.
const resendPort = "3207";
// The operator console, the identity provider it signs operators in with,
// and the cell's provisioner it calls.
const opsPort = "3206";
const oidcPort = "3208";
const provisionPort = process.env.PROVISION_PORT ?? "3205";
const webhookSecret = `whsec_${randomBytes(24).toString("base64")}`;

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
  await createBusinessDatabase(admin, businessName);
  await migrate(urlFor(cellName), {
    folder: MIGRATIONS.cell,
    owner: "cell_owner",
  });
  await migrate(urlFor(directoryName), {
    folder: MIGRATIONS.directory,
    owner: "directory_owner",
  });
  await migrate(urlFor(businessName), {
    folder: MIGRATIONS.business,
    owner: "business_owner",
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
  const resend = startResendStandIn(Number(resendPort));
  const oidc = await startOidcStandIn(Number(oidcPort));
  const provisionSecret = randomBytes(32).toString("base64");
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
        LOGIN_INDEX_KEY: randomBytes(32).toString("base64"),
        E2E_WEB_PORT: webPort,
        E2E_API_PORT: apiPort,
        E2E_COLLAB_PORT: collabPort,
        RESEND_API_KEY: "re_e2e",
        RESEND_API_URL: `http://127.0.0.1:${resendPort}`,
        EMAIL_FROM: "Farida <no-reply@mail.localhost>",
        INBOUND_EMAIL_DOMAIN: "reply.localhost",
        RESEND_WEBHOOK_SECRET: webhookSecret,
        E2E_RESEND_PORT: resendPort,
        // The cell's provisioner, for this run's cell alone.
        CELL_PROVISION_URL: urlFor(cellName, "provisioner"),
        PROVISION_SECRET: provisionSecret,
        PROVISION_PORT: provisionPort,
        // The operator console.
        E2E_OPS_PORT: opsPort,
        E2E_OIDC_PORT: oidcPort,
        OPS_DIRECTORY_URL: urlFor(directoryName, "directory_admin"),
        BUSINESS_DATABASE_URL: urlFor(businessName, "business_admin"),
        OPS_ORIGIN: `http://127.0.0.1:${opsPort}`,
        OPS_OIDC_ISSUER: `http://127.0.0.1:${oidcPort}`,
        OPS_OIDC_CLIENT_ID: OIDC_CLIENT_ID,
        OPS_OIDC_EMAILS:
          "salama@example.com,sales@example.com,finance@example.com,support@example.com",
        OPS_SESSION_SECRET: randomBytes(32).toString("base64"),
        PROVISION_URL: `http://127.0.0.1:${provisionPort}`,
        // The product site's demonstration requests, emailed to the stand-in
        // and sent to the console as leads, as the cells send them.
        PRODUCT_SITE: "on",
        PRODUCT_INBOX: "sales@example.com",
        INTAKE_URL: `http://127.0.0.1:${opsPort}/intake/leads`,
        INTAKE_SECRET: randomBytes(32).toString("base64"),
      },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  process.on("SIGINT", () => runner.kill("SIGINT"));
  process.on("SIGTERM", () => runner.kill("SIGTERM"));
  exitCode = await runner.exited;
  await resend.stop(true);
  await oidc.stop(true);
} finally {
  await dropDatabase(admin, cellName);
  await dropDatabase(admin, directoryName);
  await dropDatabase(admin, businessName);
  await admin.close();
}
process.exit(exitCode);
