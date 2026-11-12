/**
 * Rewrites the generated part of a database's baseline in place: drizzle-kit
 * writes the `tables` migration from the declarations again, from empty, and
 * every hand-written topic migration keeps its words and its place. drizzle-kit
 * cannot regenerate a migration that later ones follow, so the whole chain is
 * made again in a scratch folder and copied back under the same names.
 *
 *   bun run db:baseline [cell|directory|business ...]
 */
import { MIGRATIONS } from "@faridalms/database/migrate";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCHEMAS = {
  cell: "packages/database/src/tables/index.ts",
  directory: "packages/database/src/directory/schema.ts",
  business: "packages/database/src/business/schema.ts",
} as const;
type Database = keyof typeof SCHEMAS;

const GENERATED = "tables";

const nameOf = (folder: string) => folder.slice(folder.indexOf("_") + 1);

async function drizzleKit(config: string, args: string[]) {
  const child = Bun.spawn(
    ["bun", "--bun", "drizzle-kit", "generate", "--config", config, ...args],
    { stdout: "ignore", stderr: "inherit" },
  );
  if ((await child.exited) !== 0)
    throw new Error(`drizzle-kit generate ${args.join(" ")} failed`);
}

/** Folders are ordered by their timestamp, which has a resolution of a second. */
async function nextSecond() {
  const now = Date.now();
  await Bun.sleep(1000 - (now % 1000) + 10);
}

async function rebuild(database: Database) {
  const folder = MIGRATIONS[database];
  const folders = (await readdir(folder)).toSorted();
  if (!folders.some((name) => nameOf(name) === GENERATED))
    throw new Error(`${folder} has no ${GENERATED} migration`);
  const scratch = await mkdtemp(join(tmpdir(), "farida-baseline-"));
  try {
    const out = join(scratch, "migrations");
    const config = join(scratch, "drizzle.config.ts");
    await Bun.write(
      config,
      `export default ${JSON.stringify({ out, schema: resolve(SCHEMAS[database]), dialect: "postgresql" })};\n`,
    );
    const remake = async (name: string) => {
      await nextSecond();
      const generated = nameOf(name) === GENERATED;
      await drizzleKit(
        config,
        generated
          ? ["--name", GENERATED]
          : ["--custom", "--name", nameOf(name)],
      );
      const made = (await readdir(out)).toSorted().at(-1);
      if (!made || nameOf(made) !== nameOf(name))
        throw new Error(`drizzle-kit did not write ${nameOf(name)}`);
      if (!generated)
        await cp(
          join(folder, name, "migration.sql"),
          join(out, made, "migration.sql"),
        );
    };
    // Each migration's snapshot follows the one before it.
    for (const name of folders) await remake(name);
    const made = (await readdir(out)).toSorted();
    const tables = (list: string[]) =>
      list.find((name) => nameOf(name) === GENERATED) ?? "";
    const before = await Bun.file(
      join(folder, tables(folders), "migration.sql"),
    ).text();
    const after = await Bun.file(
      join(out, tables(made), "migration.sql"),
    ).text();
    if (before === after) {
      console.info(`${database}: the tables migration is unchanged.`);
      return;
    }
    await Promise.all(
      folders.flatMap((name, index) => {
        const source = made[index];
        if (!source) throw new Error(`${nameOf(name)} was not made again`);
        return ["migration.sql", "snapshot.json"].map((file) =>
          cp(join(out, source, file), join(folder, name, file)),
        );
      }),
    );
    console.info(`${database}: the tables migration was written again.`);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

const asked = process.argv.slice(2);
const databases = (asked.length > 0 ? asked : Object.keys(SCHEMAS)).map(
  (name) => {
    if (!(name in SCHEMAS)) throw new Error(`Unknown database: ${name}`);
    return name as Database;
  },
);
await Promise.all(databases.map(rebuild));
