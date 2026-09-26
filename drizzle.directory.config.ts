import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle-directory",
  schema: "./packages/database/src/directory/schema.ts",
  dialect: "postgresql",
});
