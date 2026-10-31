/**
 * Builds a cell and a directory from empty databases, fails if drizzle-kit
 * would write a migration (schema and migrations disagree), then runs the
 * catalogue check, the source checks and the isolation and behaviour suites.
 * The throwaway databases are dropped however it ends.
 */
import { migrate } from "@faridalms/database/migrate";
import {
  createCellDatabase,
  createDirectoryDatabase,
  dropDatabase,
  LOGIN_ROLES,
  provisionRoles,
} from "@faridalms/database/provision";
import { SQL } from "bun";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const admin =
  process.env.DATABASE_ADMIN_URL ??
  "postgres://farida:farida@127.0.0.1:5433/postgres";
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const cellName = `cell_verify_${suffix}`;
const directoryName = `directory_verify_${suffix}`;
const urlOf = (name: string) => {
  const url = new URL(admin);
  url.pathname = `/${name}`;
  return url.toString();
};

async function run(command: string[]): Promise<number> {
  const child = Bun.spawn(command, {
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  return child.exited;
}

async function generateWritesNothing(config: {
  schema: string;
  out: string;
}): Promise<boolean> {
  const scratch = await mkdtemp(join(tmpdir(), "farida-verify-"));
  try {
    const out = join(scratch, "migrations");
    await cp(config.out, out, { recursive: true });
    const before = (await readdir(out)).length;
    const file = join(scratch, "drizzle.config.ts");
    await Bun.write(
      file,
      `export default ${JSON.stringify({ out, schema: resolve(config.schema), dialect: "postgresql" })};\n`,
    );
    const code = await run([
      "bun",
      "--bun",
      "drizzle-kit",
      "generate",
      "--config",
      file,
      "--name",
      "verify",
    ]);
    const after = (await readdir(out)).length;
    return code === 0 && after === before;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

const client = new SQL(admin);
const failures: string[] = [];
try {
  const password = process.env.CELL_ROLE_PASSWORD;
  await provisionRoles(
    client,
    password
      ? Object.fromEntries(LOGIN_ROLES.map((role) => [role, password]))
      : {},
  );
  await createCellDatabase(client, cellName);
  await createDirectoryDatabase(client, directoryName);
  await migrate(urlOf(cellName), { folder: "drizzle", owner: "cell_owner" });
  await migrate(urlOf(directoryName), {
    folder: "drizzle-directory",
    owner: "directory_owner",
  });
  console.info("Migrations apply to empty databases.");

  if (
    !(await generateWritesNothing({
      schema: "packages/database/src/tables/index.ts",
      out: "drizzle",
    }))
  )
    failures.push(
      "drizzle-kit would write a cell migration: the schema and drizzle/ disagree",
    );
  if (
    !(await generateWritesNothing({
      schema: "packages/database/src/directory/schema.ts",
      out: "drizzle-directory",
    }))
  )
    failures.push("drizzle-kit would write a directory migration");

  if ((await run(["bun", "scripts/check-rls.ts", urlOf(cellName)])) !== 0)
    failures.push("catalogue check");
  if ((await run(["bun", "scripts/check-sources.ts", urlOf(cellName)])) !== 0)
    failures.push("source checks");
  if (
    (await run([
      "bun",
      "test",
      "--preload",
      "./packages/database/test/setup.ts",
      "packages/database/test",
    ])) !== 0
  )
    failures.push("isolation and behaviour suites");
} finally {
  await dropDatabase(client, cellName);
  await dropDatabase(client, directoryName);
  await client.close();
}

if (failures.length > 0) {
  console.error(`db:verify failed: ${failures.join("; ")}`);
  process.exit(1);
}
console.info("db:verify passed.");
