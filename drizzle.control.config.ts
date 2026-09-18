import { defineConfig } from "drizzle-kit";

const url = process.env.CONTROL_DATABASE_URL;
if (!url) throw new Error("CONTROL_DATABASE_URL is required");
export default defineConfig({
  out: "./drizzle-control",
  schema: "./packages/database/src/control-schema.ts",
  dialect: "postgresql",
  dbCredentials: { url },
});
