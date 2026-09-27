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
import { seedCell, SEED_PASSWORD } from "@faridalms/database/seed";
import { SQL } from "bun";
import * as v from "valibot";

const config = v.parse(
  v.object({
    DATABASE_ADMIN_URL: v.optional(
      v.pipe(v.string(), v.url()),
      "postgres://northwind:northwind@127.0.0.1:5433/postgres",
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

async function provision(admin: SQL) {
  const password = config.CELL_ROLE_PASSWORD;
  await provisionRoles(
    admin,
    password
      ? Object.fromEntries(LOGIN_ROLES.map((role) => [role, password]))
      : {},
  );
}

async function migrateAll() {
  const cell = await migrate(databaseUrl(config.CELL_DATABASE), {
    folder: "drizzle",
    owner: "cell_owner",
  });
  const directory = await migrate(databaseUrl(config.DIRECTORY_DATABASE), {
    folder: "drizzle-directory",
    owner: "directory_owner",
  });
  console.info(
    `Applied ${cell.applied.length} cell and ${directory.applied.length} directory migrations.`,
  );
}

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
const admin = new SQL(config.DATABASE_ADMIN_URL);
try {
  if (command === "provision") await provision(admin);
  else if (command === "migrate") await migrateAll();
  else if (command === "seed") await seed();
  else if (command === "reset") {
    await provision(admin);
    await dropDatabase(admin, config.CELL_DATABASE);
    await dropDatabase(admin, config.DIRECTORY_DATABASE);
    await createCellDatabase(admin, config.CELL_DATABASE);
    await createDirectoryDatabase(admin, config.DIRECTORY_DATABASE);
    await migrateAll();
    await seed();
  } else {
    console.error("Usage: bun scripts/db.ts provision|migrate|seed|reset");
    process.exitCode = 1;
  }
} finally {
  await admin.close();
}
