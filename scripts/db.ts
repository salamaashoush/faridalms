import { openOwner } from "@faridalms/database/context";
import { localKek } from "@faridalms/database/crypto";
import { registerTenants } from "@faridalms/database/directory/seed";
import {
  createCellDatabase,
  createDirectoryDatabase,
  dropDatabase,
} from "@faridalms/database/provision";
import { seedCell, SEED_PASSWORD } from "@faridalms/database/seed";
import { SQL } from "bun";
import * as v from "valibot";

import type { CellDatabases } from "./migrate";

import { createMissing, migrateAll, provision } from "./migrate";

const config = v.parse(
  v.object({
    DATABASE_ADMIN_URL: v.optional(
      v.pipe(v.string(), v.url()),
      "postgres://farida:farida@127.0.0.1:5433/postgres",
    ),
    CELL_DATABASE: v.optional(
      v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_]*$/)),
      "cell",
    ),
    DIRECTORY_DATABASE: v.optional(
      v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_]*$/)),
      "directory",
    ),
    CELL_ROLE_PASSWORD: v.optional(v.pipe(v.string(), v.minLength(16))),
    CELL_KEK: v.optional(v.pipe(v.string(), v.base64())),
    CELL_ID: v.optional(
      v.pipe(v.string(), v.regex(/^[a-z]{2}-[0-9]{1,2}$/)),
      "eg-1",
    ),
    CELL_APP_HOST: v.optional(v.string(), "localhost"),
  }),
  process.env,
);

const target: CellDatabases = {
  adminUrl: config.DATABASE_ADMIN_URL,
  cell: config.CELL_DATABASE,
  directory: config.DIRECTORY_DATABASE,
  rolePassword: config.CELL_ROLE_PASSWORD,
};

const databaseUrl = (name: string, role?: string) => {
  const url = new URL(config.DATABASE_ADMIN_URL);
  url.pathname = `/${name}`;
  if (role) {
    if (!config.CELL_ROLE_PASSWORD)
      throw new Error(
        "CELL_ROLE_PASSWORD is not set. Run bun install to bootstrap .env.",
      );
    url.username = role;
    url.password = config.CELL_ROLE_PASSWORD;
  }
  return url.toString();
};

async function seed() {
  if (!config.CELL_KEK)
    throw new Error("CELL_KEK is not set. Run bun install to bootstrap .env.");
  const kek = localKek(
    new Uint8Array(Buffer.from(config.CELL_KEK, "base64")),
    `local:${config.CELL_ID}`,
  );
  const owner = openOwner(databaseUrl(config.CELL_DATABASE));
  const directory = new SQL(
    databaseUrl(config.DIRECTORY_DATABASE, "directory_admin"),
  );
  try {
    const tenants = await seedCell(owner, { kek, cell: config.CELL_ID });
    await registerTenants(directory, tenants, {
      id: config.CELL_ID,
      appHost: config.CELL_APP_HOST,
      apiBaseUrl: "http://127.0.0.1:3001",
    });
    console.info(
      `Seeded ${tenants.length} tenants. Password for every login: ${SEED_PASSWORD}`,
    );
    for (const tenant of tenants) {
      console.info(
        `\n${tenant.spec.nameEn} (${tenant.schools.map((s) => s.slug).join(", ")})`,
      );
      const shown = new Set<string>();
      for (const login of tenant.logins)
        if (!shown.has(login.role) || login.role === "principal") {
          shown.add(login.role);
          console.info(`  ${login.role.padEnd(24)} ${login.loginName}`);
        }
    }
  } finally {
    await owner.close();
    await directory.close();
  }
}

const command = process.argv[2];
// Both drop or overwrite every school's records and set a known password on
// every seeded login. The production image runs scripts/migrate.ts instead.
if (
  (command === "reset" || command === "seed") &&
  process.env.NODE_ENV === "production"
) {
  console.error(`Refusing to ${command} with NODE_ENV=production.`);
  process.exit(1);
}
const admin = new SQL(config.DATABASE_ADMIN_URL);
try {
  if (command === "provision") await provision(admin, target);
  else if (command === "create") {
    await provision(admin, target);
    await createMissing(admin, target);
    await migrateAll(target);
  } else if (command === "migrate") await migrateAll(target);
  else if (command === "seed") await seed();
  else if (command === "reset") {
    await provision(admin, target);
    await dropDatabase(admin, config.CELL_DATABASE);
    await dropDatabase(admin, config.DIRECTORY_DATABASE);
    await createCellDatabase(admin, config.CELL_DATABASE);
    await createDirectoryDatabase(admin, config.DIRECTORY_DATABASE);
    await migrateAll(target);
    await seed();
  } else {
    console.error(
      "Usage: bun scripts/db.ts provision|create|migrate|seed|reset",
    );
    process.exitCode = 1;
  }
} finally {
  await admin.close();
}
