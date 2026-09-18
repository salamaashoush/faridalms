import { createDatabase } from "@faridalms/database";
import { createControlDatabase } from "@faridalms/database/control";
import { schools } from "@faridalms/database/control-schema";
import { SQL } from "bun";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import * as v from "valibot";

const config = v.parse(
  v.object({
    DATABASE_URL: v.pipe(v.string(), v.url()),
    CONTROL_DATABASE_URL: v.pipe(v.string(), v.url()),
  }),
  process.env,
);
const controlUrl = new URL(config.CONTROL_DATABASE_URL);
const databaseName = controlUrl.pathname.slice(1);
if (!/^[a-z][a-z0-9_]*$/.test(databaseName))
  throw new Error(
    "Control database name must contain lowercase letters, digits and underscores",
  );
const adminUrl = new URL(controlUrl);
adminUrl.pathname = "/postgres";
const admin = new SQL(adminUrl.toString());
try {
  const databases =
    await admin`select datname from pg_database where datname = ${databaseName}`;
  if (databases.length === 0)
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
} finally {
  await admin.close();
}
const control = createControlDatabase(config.CONTROL_DATABASE_URL);
const school = createDatabase(config.DATABASE_URL);
try {
  await migrate(control, { migrationsFolder: "drizzle-control" });
  await migrate(school, { migrationsFolder: "drizzle" });
  await control
    .insert(schools)
    .values({
      slug: "northwind",
      name: "Northwind School",
      databaseUrl: config.DATABASE_URL,
    })
    .onConflictDoNothing();
  console.info(
    "Migrations applied and the local school registered. Existing school records were preserved.",
  );
} finally {
  await school.$client.close();
  await control.$client.close();
}
