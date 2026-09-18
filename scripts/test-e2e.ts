import { createDatabase } from "@faridalms/database";
import { createControlDatabase } from "@faridalms/database/control";
import { schools } from "@faridalms/database/control-schema";
import { SQL } from "bun";
import { migrate } from "drizzle-orm/bun-sql/migrator";

const base = new URL(
  process.env.DATABASE_URL ?? "postgres://northwind:northwind@127.0.0.1:5433/faridalms",
);
base.pathname = "/postgres";
const admin = new SQL(base.toString());
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
const controlName = `northwind_test_control_${suffix}`;
async function database(name: string) {
  if (!/^northwind_test_[a-z0-9_]+$/.test(name))
    throw new Error("Invalid test database name");
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
}
const controlUrl = await database(controlName);
const control = createControlDatabase(controlUrl);
await migrate(control, { migrationsFolder: "drizzle-control" });
for (const slug of ["northwind", "acme"]) {
  const url = await database(`northwind_test_${slug}_${suffix}`);
  const db = createDatabase(url);
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.$client.close();
  const seed = Bun.spawn(["bun", "scripts/seed.ts"], {
    env: { ...process.env, DATABASE_URL: url },
    stdout: "ignore",
    stderr: "inherit",
  });
  if ((await seed.exited) !== 0) throw new Error(`Seed failed for ${slug}`);
  await control.insert(schools).values({
    slug,
    name: slug === "northwind" ? "Northwind School" : "Acme School",
    databaseUrl: url,
  });
}
await control.$client.close();
await admin.close();
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
      CONTROL_DATABASE_URL: controlUrl,
      BACKEND_URL: "http://127.0.0.1:3001",
      API_PORT: "3001",
    },
    stdout: "inherit",
    stderr: "inherit",
  },
);
process.on("SIGINT", () => runner.kill("SIGINT"));
process.on("SIGTERM", () => runner.kill("SIGTERM"));
process.exit(await runner.exited);
