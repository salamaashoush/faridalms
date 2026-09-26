import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./packages/database/src/tables/index.ts",
  dialect: "postgresql",
});
