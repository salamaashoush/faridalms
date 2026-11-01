/**
 * Provisions, creates and migrates a cell and its directory. This is the
 * entry the production image runs, so it never imports the seed and offers
 * nothing that drops or overwrites data.
 */
import { migrate, MIGRATIONS } from "@faridalms/database/migrate";
import {
  createCellDatabase,
  createDirectoryDatabase,
  grantCellConnect,
  LOGIN_ROLES,
  provisionRoles,
} from "@faridalms/database/provision";
import { presentVariables } from "@faridalms/domain/environment";
import { isHostname } from "@faridalms/domain/hosts";
import { SQL } from "bun";
import * as v from "valibot";

export interface CellDatabases {
  adminUrl: string;
  cell: string;
  directory: string;
  rolePassword?: string;
}

const databaseName = v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_]*$/));

/** The admin login, pointed at another database of the same cluster. */
export function adminUrlFor(target: CellDatabases, name: string) {
  const url = new URL(target.adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

export async function provision(admin: SQL, target: CellDatabases) {
  const password = target.rolePassword;
  await provisionRoles(
    admin,
    password
      ? Object.fromEntries(LOGIN_ROLES.map((role) => [role, password]))
      : {},
  );
}

/**
 * Creates the cell and directory databases that do not exist yet, and lets
 * every login connect to an existing cell.
 */
export async function createMissing(admin: SQL, target: CellDatabases) {
  const exists = async (name: string) =>
    (await admin`select 1 from pg_database where datname = ${name}`).length > 0;
  if (!(await exists(target.cell)))
    await createCellDatabase(admin, target.cell);
  else await grantCellConnect(admin, target.cell);
  if (!(await exists(target.directory)))
    await createDirectoryDatabase(admin, target.directory);
}

export async function migrateAll(target: CellDatabases) {
  const cell = await migrate(adminUrlFor(target, target.cell), {
    folder: MIGRATIONS.cell,
    owner: "cell_owner",
  });
  const directory = await migrate(adminUrlFor(target, target.directory), {
    folder: MIGRATIONS.directory,
    owner: "directory_owner",
  });
  console.info(
    `Applied ${cell.applied.length} cell and ${directory.applied.length} directory migrations.`,
  );
}

/** This server's cell as the directory lists it. */
export interface CellRecord {
  id: string;
  jurisdiction: string;
  provider: string;
  region: string;
  appHost: string;
  apiBaseUrl: string;
}

/**
 * Lists the cell in the directory as open, so schools can be created on it.
 * A row already there is left as it is: its id is fixed once data exists,
 * and an operator may have closed it on purpose.
 */
export async function registerCell(target: CellDatabases, cell: CellRecord) {
  const directory = new SQL(adminUrlFor(target, target.directory));
  try {
    const [added] = await directory`
      insert into cells (id, jurisdiction, provider, region, app_host, api_base_url, state)
      values (${cell.id}, ${cell.jurisdiction}, ${cell.provider}, ${cell.region},
        ${cell.appHost}, ${cell.apiBaseUrl}, 'open')
      on conflict (id) do nothing
      returning id`;
    if (added) {
      console.info(`Registered cell ${cell.id} for ${cell.appHost}.`);
      return;
    }
    const [held] = await directory`
      select app_host, state from cells where id = ${cell.id}`;
    if (held && held.app_host !== cell.appHost)
      console.warn(
        `Cell ${cell.id} is registered for ${held.app_host}, not ${cell.appHost}; it was left as it is.`,
      );
  } finally {
    await directory.close();
  }
}

if (import.meta.main) {
  const config = v.parse(
    v.pipe(
      v.object({
        DATABASE_ADMIN_URL: v.pipe(v.string(), v.url()),
        CELL_DATABASE: v.optional(databaseName, "cell"),
        DIRECTORY_DATABASE: v.optional(databaseName, "directory"),
        CELL_ROLE_PASSWORD: v.optional(v.pipe(v.string(), v.minLength(16))),
        // Set together, the cell lists itself in the directory once migrated.
        CELL_ID: v.optional(
          v.pipe(v.string(), v.regex(/^[a-z]{2}-[0-9]{1,2}$/)),
        ),
        PORTAL_DOMAIN: v.optional(v.pipe(v.string(), v.check(isHostname))),
        CELL_JURISDICTION: v.optional(
          v.pipe(v.string(), v.toUpperCase(), v.regex(/^[A-Z]{2}$/)),
        ),
        CELL_PROVIDER: v.optional(
          v.pipe(v.string(), v.minLength(1), v.maxLength(40)),
          "self-hosted",
        ),
        CELL_REGION: v.optional(
          v.pipe(v.string(), v.minLength(1), v.maxLength(60)),
          "default",
        ),
        CELL_API_URL: v.optional(
          v.pipe(v.string(), v.url()),
          "http://api:3001",
        ),
      }),
      v.check(
        (value) =>
          !(value.CELL_ID && value.PORTAL_DOMAIN) ||
          value.CELL_JURISDICTION !== undefined,
        "Set CELL_JURISDICTION, the two-letter country the data is kept in, with CELL_ID and PORTAL_DOMAIN",
      ),
    ),
    presentVariables(process.env),
  );
  const cell: CellRecord | null =
    config.CELL_ID && config.PORTAL_DOMAIN && config.CELL_JURISDICTION
      ? {
          id: config.CELL_ID,
          jurisdiction: config.CELL_JURISDICTION,
          provider: config.CELL_PROVIDER,
          region: config.CELL_REGION,
          appHost: config.PORTAL_DOMAIN.toLowerCase(),
          apiBaseUrl: config.CELL_API_URL,
        }
      : null;
  const target: CellDatabases = {
    adminUrl: config.DATABASE_ADMIN_URL,
    cell: config.CELL_DATABASE,
    directory: config.DIRECTORY_DATABASE,
    rolePassword: config.CELL_ROLE_PASSWORD,
  };
  const command = process.argv[2] ?? "migrate";
  const admin = new SQL(target.adminUrl);
  try {
    if (command === "provision") await provision(admin, target);
    else if (command === "create") {
      await provision(admin, target);
      await createMissing(admin, target);
      await migrateAll(target);
      if (cell) await registerCell(target, cell);
    } else if (command === "migrate") {
      await migrateAll(target);
      if (cell) await registerCell(target, cell);
    } else {
      console.error("Usage: bun scripts/migrate.ts provision|create|migrate");
      process.exitCode = 1;
    }
  } finally {
    await admin.close();
  }
}
