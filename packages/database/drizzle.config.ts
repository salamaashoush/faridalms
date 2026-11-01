import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./packages/database/migrations/cell",
  schema: "./packages/database/src/tables/index.ts",
  dialect: "postgresql",
});
