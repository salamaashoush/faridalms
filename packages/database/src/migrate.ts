import { SQL } from "bun";
import { readMigrationFiles } from "drizzle-orm/migrator";

/**
 * Each database's migrations, from the repository's root, which is also the
 * migrate image's working directory: its script is bundled, so the folders
 * cannot be found from the module's own location.
 */
export const MIGRATIONS = {
  cell: "packages/database/migrations/cell",
  directory: "packages/database/migrations/directory",
} as const;

export interface MigrationResult {
  applied: string[];
}

/**
 * Applies every pending migration in one transaction, as the schema owner,
 * with the lock timeout migrations are allowed. A failure leaves the database
 * exactly as it was.
 */
export async function migrate(
  url: string,
  options: { folder: string; owner: "cell_owner" | "directory_owner" },
): Promise<MigrationResult> {
  const client = new SQL({ url, max: 1 });
  try {
    const migrations = readMigrationFiles({ migrationsFolder: options.folder });
    return await client.begin(async (tx) => {
      await tx.unsafe(`set local role ${options.owner}`);
      await tx.unsafe("set local lock_timeout = '5s'");
      await tx.unsafe("create schema if not exists migrations");
      await tx.unsafe(
        "create table if not exists migrations.applied (name text primary key, hash text not null, applied_at timestamptz not null default statement_timestamp())",
      );
      await tx`select pg_advisory_xact_lock(hashtextextended('migrations', 0))`;
      const done = new Map<string, string>(
        (await tx`select name, hash from migrations.applied`).map(
          (row: { name: string; hash: string }) => [row.name, row.hash],
        ),
      );
      const applied: string[] = [];
      for (const migration of migrations) {
        const { name } = migration;
        const previous = done.get(name);
        if (previous !== undefined) {
          if (previous !== migration.hash)
            throw new Error(`Migration ${name} changed after it was applied`);
          continue;
        }
        for (const statement of migration.sql) {
          if (statement.trim()) await tx.unsafe(statement);
        }
        await tx`insert into migrations.applied (name, hash) values (${name}, ${migration.hash})`;
        applied.push(name);
      }
      return { applied };
    });
  } finally {
    await client.close();
  }
}
