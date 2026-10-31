import type { SQL } from "bun";

export const RUNTIME_ROLES = [
  "app",
  "site",
  "integration",
  "worker",
  "collab",
  "cell_io",
  "retention",
] as const;
export type RuntimeRole = (typeof RUNTIME_ROLES)[number];

export const LOGIN_ROLES = [
  "migrator",
  "provisioner",
  ...RUNTIME_ROLES,
  "backup_dump",
  "directory_reader",
  "directory_admin",
  "directory_sync",
] as const;
export type LoginRole = (typeof LOGIN_ROLES)[number];

const ROLES: readonly { name: string; options: string }[] = [
  { name: "cell_owner", options: "nologin nobypassrls" },
  { name: "migrator", options: "login nobypassrls" },
  { name: "provisioner", options: "login nobypassrls" },
  { name: "app", options: "login nobypassrls" },
  { name: "site", options: "login nobypassrls" },
  { name: "integration", options: "login nobypassrls" },
  { name: "worker", options: "login nobypassrls" },
  { name: "collab", options: "login nobypassrls" },
  { name: "cell_io", options: "login nobypassrls" },
  { name: "retention", options: "login nobypassrls" },
  { name: "pgboss_owner", options: "nologin nobypassrls" },
  { name: "backup_dump", options: "login bypassrls" },
  { name: "break_glass", options: "nologin bypassrls" },
  { name: "directory_owner", options: "nologin nobypassrls" },
  { name: "directory_reader", options: "login nobypassrls" },
  { name: "directory_admin", options: "login nobypassrls" },
  { name: "directory_sync", options: "login nobypassrls" },
];

const SETTINGS: readonly [role: string, setting: string, value: string][] = [
  ["app", "statement_timeout", "5s"],
  ["app", "lock_timeout", "2s"],
  ["app", "idle_in_transaction_session_timeout", "10s"],
  ["app", "transaction_timeout", "30s"],
  ["site", "statement_timeout", "2s"],
  ["site", "transaction_timeout", "10s"],
  ["integration", "statement_timeout", "15s"],
  ["integration", "lock_timeout", "2s"],
  ["integration", "transaction_timeout", "30s"],
  ["worker", "statement_timeout", "60s"],
  ["worker", "lock_timeout", "5s"],
  ["worker", "transaction_timeout", "30s"],
  ["collab", "statement_timeout", "5s"],
  ["collab", "transaction_timeout", "30s"],
  ["retention", "transaction_timeout", "30s"],
  ["migrator", "lock_timeout", "5s"],
  // A new school's first administrator is emailed inside the transaction that
  // creates the school, so it stays open for one email gateway call.
  ["provisioner", "statement_timeout", "30s"],
  ["provisioner", "lock_timeout", "5s"],
  ["provisioner", "idle_in_transaction_session_timeout", "30s"],
  ["provisioner", "transaction_timeout", "60s"],
  ...[
    "migrator",
    "provisioner",
    ...RUNTIME_ROLES,
    "backup_dump",
    "directory_reader",
    "directory_admin",
    "directory_sync",
  ].map((role): [string, string, string] => [role, "timezone", "UTC"]),
];

const identifier = (name: string) => {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name))
    throw new Error(`Invalid identifier: ${name}`);
  return `"${name}"`;
};

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/**
 * Creates the cluster roles a cell needs and applies their settings. Roles are
 * cluster objects, so this is provisioning code rather than a migration. An
 * existing role keeps its password unless one is passed.
 */
export async function provisionRoles(
  admin: SQL,
  passwords: Partial<Record<LoginRole, string>> = {},
) {
  for (const role of ROLES) {
    const [existing] =
      await admin`select 1 from pg_roles where rolname = ${role.name}`;
    const password = passwords[role.name as LoginRole];
    const passwordClause = password ? ` password ${literal(password)}` : "";
    await admin.unsafe(
      existing
        ? `alter role ${identifier(role.name)} ${role.options}${passwordClause}`
        : `create role ${identifier(role.name)} ${role.options}${passwordClause}`,
    );
  }
  await admin.unsafe("grant cell_owner to migrator");
  await admin.unsafe("grant cell_owner to provisioner");
  for (const [role, setting, value] of SETTINGS)
    await admin.unsafe(
      `alter role ${identifier(role)} set ${setting} = ${literal(value)}`,
    );
}

/**
 * A cell database uses the builtin C.UTF-8 locale, which yields Arabic
 * trigrams where a `C` database does not, and belongs to `cell_owner`.
 */
export async function createCellDatabase(admin: SQL, name: string) {
  await admin.unsafe(
    `create database ${identifier(name)} owner cell_owner template template0 encoding 'UTF8' locale_provider builtin builtin_locale 'C.UTF-8'`,
  );
  await admin.unsafe(`revoke all on database ${identifier(name)} from public`);
  await grantCellConnect(admin, name);
}

/**
 * Lets every login a cell serves connect to it. Granting again is harmless,
 * so a cell created before a login existed gains it on the next deploy.
 */
export async function grantCellConnect(admin: SQL, name: string) {
  await admin.unsafe(
    `grant connect on database ${identifier(name)} to migrator, provisioner, ${RUNTIME_ROLES.join(", ")}, backup_dump`,
  );
}

export async function createDirectoryDatabase(admin: SQL, name: string) {
  await admin.unsafe(
    `create database ${identifier(name)} owner directory_owner template template0 encoding 'UTF8' locale_provider builtin builtin_locale 'C.UTF-8'`,
  );
  await admin.unsafe(`revoke all on database ${identifier(name)} from public`);
  await admin.unsafe(
    `grant connect on database ${identifier(name)} to migrator, directory_reader, directory_admin, directory_sync, backup_dump`,
  );
  await admin.unsafe("grant directory_owner to migrator");
}

export async function dropDatabase(admin: SQL, name: string) {
  await admin.unsafe(
    `drop database if exists ${identifier(name)} with (force)`,
  );
}
