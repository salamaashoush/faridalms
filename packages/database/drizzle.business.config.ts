import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./packages/database/migrations/business",
  schema: "./packages/database/src/business/schema.ts",
  dialect: "postgresql",
});
