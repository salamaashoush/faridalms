/**
 * Provisions, creates and migrates a cell and its directory. This is the
 * entry the production image runs, so it never imports the seed and offers
 * nothing that drops or overwrites data.
 */
import { migrate } from "@faridalms/database/migrate";
import {
  createCellDatabase,
  createDirectoryDatabase,
  grantCellConnect,
  LOGIN_ROLES,
  provisionRoles,
} from "@faridalms/database/provision";
import { presentVariables } from "@faridalms/domain/environment";
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
    folder: "drizzle",
    owner: "cell_owner",
  });
  const directory = await migrate(adminUrlFor(target, target.directory), {
    folder: "drizzle-directory",
    owner: "directory_owner",
  });
  console.info(
    `Applied ${cell.applied.length} cell and ${directory.applied.length} directory migrations.`,
  );
}

if (import.meta.main) {
  const config = v.parse(
    v.object({
      DATABASE_ADMIN_URL: v.pipe(v.string(), v.url()),
      CELL_DATABASE: v.optional(databaseName, "cell"),
      DIRECTORY_DATABASE: v.optional(databaseName, "directory"),
      CELL_ROLE_PASSWORD: v.optional(v.pipe(v.string(), v.minLength(16))),
    }),
    presentVariables(process.env),
  );
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
    } else if (command === "migrate") await migrateAll(target);
    else {
      console.error("Usage: bun scripts/migrate.ts provision|create|migrate");
      process.exitCode = 1;
    }
  } finally {
    await admin.close();
  }
}
