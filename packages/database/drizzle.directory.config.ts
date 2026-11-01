import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./packages/database/migrations/directory",
  schema: "./packages/database/src/directory/schema.ts",
  dialect: "postgresql",
});
